import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload as UploadIcon,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image,
  FileType,
  FileArchive,
  RefreshCw,
  Timer,
  Clock,
  Trash2,
} from "lucide-react";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A file the user has picked but not yet sent to the server. */
interface StagedFile {
  file: File;
  preview?: string;
  isZip: boolean;
}

/** Tracks one upload that is currently in-flight (uploading bytes to server). */
interface ActiveUpload {
  fileName: string;
  phase: "uploading" | "extracting";
  /** 0-100 for chunked uploads, undefined for regular uploads */
  progress?: number;
  chunksUploaded?: number;
  totalChunks?: number;
}

/** A document ID we just created — we'll poll the DB for its real status. */
interface TrackedDocument {
  documentId: number;
  fileName: string;
  /** When we first started tracking (for ETA) */
  trackedAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatETA(ms: number): string {
  if (ms <= 0) return "Almost done…";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `~${s}s remaining`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `~${m}m ${rs}s remaining` : `~${m}m remaining`;
  const h = Math.floor(m / 60);
  return `~${h}h ${m % 60}m remaining`;
}

function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.split(",")[1];
      if (!b64) return reject(new Error("base64 conversion failed"));
      resolve(b64);
    };
    reader.onerror = reject;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Upload() {
  const { user } = useAuth();

  // ── Local state ──
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [tracked, setTracked] = useState<TrackedDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tick every second so ETA countdowns update
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (tracked.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tracked.length]);

  // ── tRPC mutations ──
  const uploadMutation = trpc.documents.upload.useMutation();
  const bulkUploadMutation = trpc.documents.bulkUpload.useMutation();
  const zipUploadMutation = trpc.documents.uploadZip.useMutation();
  const initChunkedMutation = trpc.documents.initChunkedUpload.useMutation();
  const uploadChunkMutation = trpc.documents.uploadChunk.useMutation();
  const finalizeMutation = trpc.documents.finalizeChunkedUpload.useMutation();
  const reprocessMutation = trpc.documents.reprocess.useMutation();
  const utils = trpc.useUtils();

  // ── Poll the *real* backend status for tracked document IDs ──
  const trackedIds = useMemo(() => tracked.map((t) => t.documentId), [tracked]);

  const { data: docStatuses } = trpc.documents.getStatuses.useQuery(
    { documentIds: trackedIds },
    {
      enabled: trackedIds.length > 0,
      refetchInterval: trackedIds.length > 0 ? 3000 : false,
    }
  );

  // ── Processing stats for ETA ──
  const { data: procStats } = trpc.dashboard.processingStats.useQuery(undefined, {
    enabled: trackedIds.length > 0,
    refetchInterval: trackedIds.length > 0 ? 8000 : false,
  });

  // ── Derive real statuses from backend data ──
  const resolvedDocs = useMemo(() => {
    if (!docStatuses) return [];
    return tracked.map((t) => {
      const backend = docStatuses.find((d) => d?.id === t.documentId);
      return {
        ...t,
        backendStatus: backend?.status ?? "pending",
        error: backend?.error ?? undefined,
      };
    });
  }, [tracked, docStatuses]);

  // Count terminal documents and auto-remove from tracked after they're done
  const terminalIds = useMemo(
    () =>
      new Set(
        resolvedDocs
          .filter((d) => ["completed", "failed", "discarded"].includes(d.backendStatus))
          .map((d) => d.documentId)
      ),
    [resolvedDocs]
  );

  // Show toasts for newly completed / failed
  const prevTerminalRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const prev = prevTerminalRef.current;
    let newCompleted = 0;
    let newFailed = 0;
    let newDiscarded = 0;

    for (const d of resolvedDocs) {
      if (prev.has(d.documentId)) continue;
      if (d.backendStatus === "completed") newCompleted++;
      else if (d.backendStatus === "failed") newFailed++;
      else if (d.backendStatus === "discarded") newDiscarded++;
    }

    if (newCompleted > 0) {
      toast.success(`${newCompleted} document${newCompleted > 1 ? "s" : ""} processed successfully`);
      utils.dashboard.stats.invalidate();
      utils.patients.search.invalidate();
    }
    if (newFailed > 0) toast.error(`${newFailed} document${newFailed > 1 ? "s" : ""} failed`);
    if (newDiscarded > 0) toast.info(`${newDiscarded} document${newDiscarded > 1 ? "s" : ""} discarded (no test results)`);

    prevTerminalRef.current = terminalIds;
  }, [terminalIds, resolvedDocs, utils]);

  // ── Staging helpers ──

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf", "application/zip", "application/x-zip-compressed"];
    const next: StagedFile[] = [];

    for (const file of Array.from(fileList)) {
      const isZip =
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed" ||
        file.name.toLowerCase().endsWith(".zip");
      const maxMB = isZip ? 200 : 20;

      if (!allowed.includes(file.type) && !isZip) {
        toast.error(`${file.name}: unsupported type`);
        continue;
      }
      if (file.size > maxMB * 1024 * 1024) {
        toast.error(`${file.name}: exceeds ${maxMB} MB limit`);
        continue;
      }

      next.push({
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        isZip,
      });
    }

    setStaged((prev) => [...prev, ...next]);
  }, []);

  const removeStaged = (idx: number) => {
    setStaged((prev) => {
      const copy = [...prev];
      if (copy[idx].preview) URL.revokeObjectURL(copy[idx].preview!);
      copy.splice(idx, 1);
      return copy;
    });
  };

  // ── Upload logic ──

  const CHUNK_SIZE = 5 * 1024 * 1024;
  const CHUNKED_THRESHOLD = 50 * 1024 * 1024;

  const uploadAll = async () => {
    if (staged.length === 0) return;
    setIsUploading(true);

    const zips = staged.filter((s) => s.isZip);
    const regular = staged.filter((s) => !s.isZip);

    // Clear staged immediately so user can't double-submit
    setStaged([]);

    try {
      // ── ZIP files ──
      for (const z of zips) {
        const uploadName = z.file.name;
        try {
          if (z.file.size > CHUNKED_THRESHOLD) {
            // Chunked upload
            const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
            const totalChunks = Math.ceil(z.file.size / CHUNK_SIZE);

            setActiveUploads((prev) => [
              ...prev,
              { fileName: uploadName, phase: "uploading", progress: 0, chunksUploaded: 0, totalChunks },
            ]);

            await initChunkedMutation.mutateAsync({
              uploadId,
              fileName: uploadName,
              totalChunks,
              totalSize: z.file.size,
            });

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, z.file.size);
              const chunk = z.file.slice(start, end);
              const chunkB64 = await fileToBase64(new File([chunk], "chunk"));

              await uploadChunkMutation.mutateAsync({ uploadId, chunkIndex: i, chunkData: chunkB64 });

              setActiveUploads((prev) =>
                prev.map((u) =>
                  u.fileName === uploadName
                    ? { ...u, progress: Math.round(((i + 1) / totalChunks) * 100), chunksUploaded: i + 1 }
                    : u
                )
              );
            }

            // Extracting phase
            setActiveUploads((prev) =>
              prev.map((u) => (u.fileName === uploadName ? { ...u, phase: "extracting", progress: undefined } : u))
            );

            const result = await finalizeMutation.mutateAsync({ uploadId });

            // Track all created documents
            const newTracked: TrackedDocument[] = result.results
              .filter((r) => r.success && r.documentId)
              .map((r) => ({ documentId: r.documentId!, fileName: r.fileName, trackedAt: Date.now() }));

            setTracked((prev) => [...prev, ...newTracked]);
            setActiveUploads((prev) => prev.filter((u) => u.fileName !== uploadName));

            toast.success(`ZIP: ${result.successful}/${result.total} files uploaded`);
            if (result.failed > 0) toast.error(`${result.failed} files from ZIP failed`);
          } else {
            // Small ZIP — regular upload
            setActiveUploads((prev) => [...prev, { fileName: uploadName, phase: "uploading" }]);

            const b64 = await fileToBase64(z.file);

            setActiveUploads((prev) =>
              prev.map((u) => (u.fileName === uploadName ? { ...u, phase: "extracting" } : u))
            );

            const result = await zipUploadMutation.mutateAsync({
              fileName: uploadName,
              fileData: b64,
              fileSize: z.file.size,
            });

            const newTracked: TrackedDocument[] = result.results
              .filter((r) => r.success && r.documentId)
              .map((r) => ({ documentId: r.documentId!, fileName: r.fileName, trackedAt: Date.now() }));

            setTracked((prev) => [...prev, ...newTracked]);
            setActiveUploads((prev) => prev.filter((u) => u.fileName !== uploadName));

            toast.success(`ZIP: ${result.successful}/${result.total} files uploaded`);
          }
        } catch (err) {
          setActiveUploads((prev) => prev.filter((u) => u.fileName !== uploadName));
          toast.error(`Failed to upload ${uploadName}: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      // ── Regular files ──
      if (regular.length > 0) {
        // Show all as uploading
        setActiveUploads((prev) => [
          ...prev,
          ...regular.map((f) => ({ fileName: f.file.name, phase: "uploading" as const })),
        ]);

        if (regular.length === 1) {
          const f = regular[0];
          try {
            const b64 = await fileToBase64(f.file);
            const result = await uploadMutation.mutateAsync({
              fileName: f.file.name,
              fileData: b64,
              mimeType: f.file.type,
              fileSize: f.file.size,
            });

            setTracked((prev) => [
              ...prev,
              { documentId: result.documentId, fileName: f.file.name, trackedAt: Date.now() },
            ]);
            toast.success("File uploaded — processing started");
          } catch (err) {
            toast.error(`Upload failed: ${err instanceof Error ? err.message : "unknown"}`);
          }
          setActiveUploads((prev) => prev.filter((u) => u.fileName !== f.file.name));
        } else {
          // Bulk upload
          try {
            const filesData = await Promise.all(
              regular.map(async (f) => ({
                fileName: f.file.name,
                fileData: await fileToBase64(f.file),
                mimeType: f.file.type,
                fileSize: f.file.size,
              }))
            );

            const result = await bulkUploadMutation.mutateAsync({ files: filesData });

            const newTracked: TrackedDocument[] = result.results
              .filter((r) => r.success && r.documentId)
              .map((r) => ({ documentId: r.documentId!, fileName: r.fileName, trackedAt: Date.now() }));

            setTracked((prev) => [...prev, ...newTracked]);
            toast.success(`Uploaded ${result.successful}/${result.total} files`);
            if (result.failed > 0) toast.error(`${result.failed} files failed to upload`);
          } catch (err) {
            toast.error(`Bulk upload failed: ${err instanceof Error ? err.message : "unknown"}`);
          }
          setActiveUploads((prev) =>
            prev.filter((u) => !regular.some((f) => f.file.name === u.fileName))
          );
        }
      }

      // Invalidate recent docs
      utils.documents.recent.invalidate();
      utils.dashboard.stats.invalidate();
    } finally {
      setIsUploading(false);
    }
  };

  // ── ETA calculation ──

  const avgTime = procStats?.avgProcessingTime ?? 15000;

  function getETA(trackedAt: number): string {
    const elapsed = now - trackedAt;
    const remaining = avgTime - elapsed;
    return formatETA(remaining);
  }

  // ── Counts ──
  const processingDocs = resolvedDocs.filter(
    (d) => d.backendStatus === "pending" || d.backendStatus === "processing"
  );
  const completedDocs = resolvedDocs.filter((d) => d.backendStatus === "completed");
  const failedDocs = resolvedDocs.filter((d) => d.backendStatus === "failed");
  const discardedDocs = resolvedDocs.filter((d) => d.backendStatus === "discarded");

  const clearFinished = () => {
    setTracked((prev) => prev.filter((t) => !terminalIds.has(t.documentId)));
  };

  // ── Drag & drop ──
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  // ── Render helpers ──

  const fileIcon = (f: StagedFile) => {
    if (f.isZip) return <FileArchive className="h-8 w-8 text-yellow-400" />;
    if (f.file.type === "application/pdf") return <FileType className="h-8 w-8 text-red-400" />;
    return <Image className="h-8 w-8 text-blue-400" />;
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="border-yellow-500/40 text-yellow-400">
            <Clock className="mr-1 h-3 w-3" />
            Queued
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-400 border-blue-600/30">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      case "discarded":
        return (
          <Badge variant="secondary" className="border-orange-500/30 text-orange-400">
            <AlertCircle className="mr-1 h-3 w-3" />
            Discarded
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Reports</h1>
        <p className="text-muted-foreground">
          Upload virology laboratory reports for automatic processing and data extraction.
        </p>
      </div>

      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>
            Drag and drop files or click to browse. Supports JPEG, PNG, PDF, and ZIP archives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,application/pdf,.zip"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />
            <UploadIcon
              className={`h-12 w-12 mx-auto mb-4 transition-colors ${
                isDragging ? "text-primary" : "text-muted-foreground"
              }`}
            />
            <p className="text-lg font-medium mb-1">
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-sm text-muted-foreground">or click to browse your computer</p>
            <p className="text-xs text-muted-foreground mt-2">
              JPEG, PNG, PDF (max 20 MB) · ZIP archives (max 200 MB)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Staged files (not yet uploaded) ── */}
      {staged.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Ready to Upload ({staged.length})</CardTitle>
              <CardDescription>These files will be sent to the server for processing.</CardDescription>
            </div>
            <Button onClick={uploadAll} disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Upload All ({staged.length})
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staged.map((s, i) => (
                <div key={`staged-${i}`} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-background flex items-center justify-center">
                    {s.preview ? (
                      <img src={s.preview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      fileIcon(s)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(s.file.size / 1024 / 1024).toFixed(2)} MB
                      {s.isZip && " · ZIP archive"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeStaged(i)} disabled={isUploading}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Active uploads (bytes in flight) ── */}
      {activeUploads.length > 0 && (
        <Card className="border-blue-600/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              Uploading to Server
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeUploads.map((u) => (
                <div key={u.fileName} className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{u.fileName}</p>
                    <Badge variant="secondary">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      {u.phase === "uploading" ? "Uploading" : "Extracting ZIP"}
                    </Badge>
                  </div>
                  {u.phase === "uploading" && u.progress !== undefined && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {u.chunksUploaded ?? 0}/{u.totalChunks ?? "?"} chunks
                        </span>
                        <span>{u.progress}%</span>
                      </div>
                      <Progress value={u.progress} className="h-2" />
                    </div>
                  )}
                  {u.phase === "extracting" && (
                    <div className="text-xs text-muted-foreground">
                      Extracting and uploading files from ZIP archive…
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tracked documents (backend is processing) ── */}
      {resolvedDocs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Processing Status</CardTitle>
              <CardDescription>
                {processingDocs.length > 0 && `${processingDocs.length} processing`}
                {completedDocs.length > 0 && ` · ${completedDocs.length} completed`}
                {failedDocs.length > 0 && ` · ${failedDocs.length} failed`}
                {discardedDocs.length > 0 && ` · ${discardedDocs.length} discarded`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {processingDocs.length > 0 && (
                <Badge variant="outline" className="text-blue-400 border-blue-600/30">
                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                  Auto-refreshing
                </Badge>
              )}
              {terminalIds.size > 0 && (
                <Button variant="outline" size="sm" onClick={clearFinished}>
                  <Trash2 className="mr-2 h-3 w-3" />
                  Clear Finished
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resolvedDocs.map((d) => {
                const isActive = d.backendStatus === "pending" || d.backendStatus === "processing";
                return (
                  <div
                    key={d.documentId}
                    className={`flex items-center gap-4 p-3 rounded-lg ${
                      isActive ? "bg-blue-600/5 border border-blue-600/20" : "bg-muted/50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{d.fileName}</p>
                      {d.error && (
                        <p className="text-xs text-destructive mt-0.5 truncate">{d.error}</p>
                      )}
                      {/* ETA for active documents */}
                      {isActive && (
                        <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {getETA(d.trackedAt)}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {statusBadge(d.backendStatus)}

                      {(d.backendStatus === "failed" || d.backendStatus === "discarded") && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reprocessMutation.isPending}
                          onClick={() => {
                            reprocessMutation.mutate(
                              { documentId: d.documentId },
                              {
                                onSuccess: () => {
                                  // Reset trackedAt so ETA restarts
                                  setTracked((prev) =>
                                    prev.map((t) =>
                                      t.documentId === d.documentId ? { ...t, trackedAt: Date.now() } : t
                                    )
                                  );
                                  toast.success("Queued for reprocessing");
                                },
                                onError: (err) => toast.error(err.message),
                              }
                            );
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Global ETA banner ── */}
      {processingDocs.length > 0 && (
        <Card className="border-blue-600/30 bg-blue-600/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                <div>
                  <p className="font-medium text-blue-400">
                    Processing {processingDocs.length} Document{processingDocs.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Status updates every 3 seconds from the server.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Estimated time</p>
                <p className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  {formatETA(
                    processingDocs.reduce((sum, d) => {
                      const remaining = avgTime - (now - d.trackedAt);
                      return sum + Math.max(remaining, 0);
                    }, 0)
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Instructions ── */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Supported Formats</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• JPEG images (.jpg, .jpeg)</li>
                <li>• PNG images (.png)</li>
                <li>• PDF documents (.pdf)</li>
                <li>• ZIP archives (.zip) containing images/PDFs</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Extracted Data</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Patient Civil ID &amp; Name</li>
                <li>• Date of Birth &amp; Nationality</li>
                <li>• Test Type &amp; Results</li>
                <li>• Viral Load &amp; Accession Date</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Processing Notes</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Documents without test results are discarded</li>
                <li>• Duplicate tests are automatically skipped</li>
                <li>• Status is polled directly from the database</li>
                <li>• Processing typically takes 10–30 seconds per file</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
