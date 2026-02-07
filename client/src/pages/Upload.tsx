import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload as UploadIcon, X, CheckCircle2, AlertCircle, Loader2, Image,
  FileType, FileArchive, FolderOpen, RefreshCw, Timer, Clock, Trash2, Ban, XCircle,
  MessageCircle, Smartphone, Download, FolderUp, Shield, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import JSZip from "jszip";

interface StagedFile {
  file: File;
  preview?: string;
  isZip: boolean;
  folderName?: string;
}

interface TrackedDocument {
  documentId: number;
  fileName: string;
  trackedAt: number;
}

interface ServerBatchProgress {
  batchId: string;
  total: number;
  uploaded: number;
  processing: number;
  processed: number;
  failed: number;
  skippedDuplicates: number;
  status: "uploading" | "processing" | "complete" | "error";
  errors: string[];
  startedAt: number;
  documentIds: number[];
}

async function readEntriesRecursively(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => {
      (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([]));
    });
  }
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    const readBatch = (): Promise<void> =>
      new Promise((resolve) => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) return resolve();
          for (const child of entries) {
            files.push(...(await readEntriesRecursively(child)));
          }
          await readBatch();
          resolve();
        }, () => resolve());
      });
    await readBatch();
    return files;
  }
  return [];
}

function formatETA(ms: number): string {
  if (ms <= 0) return "Almost done...";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return "~" + s + "s remaining";
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? "~" + m + "m " + rs + "s remaining" : "~" + m + "m remaining";
  const h = Math.floor(m / 60);
  return "~" + h + "h " + (m % 60) + "m remaining";
}

export default function Upload() {
  const { user } = useAuth();
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [tracked, setTracked] = useState<TrackedDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [batchProgress, setBatchProgress] = useState<ServerBatchProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(Date.now());
  const [whatsappGuideOpen, setWhatsappGuideOpen] = useState(() => {
    try { return localStorage.getItem("whatsapp-guide-collapsed") !== "true"; } catch { return true; }
  });
  const toggleWhatsappGuide = useCallback(() => {
    setWhatsappGuideOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("whatsapp-guide-collapsed", next ? "false" : "true"); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (tracked.length === 0 && !batchProgress) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tracked.length, batchProgress]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const reprocessMutation = trpc.documents.reprocess.useMutation();
  const cancelMutation = trpc.documents.cancelProcessing.useMutation();
  const cancelBatchMutation = trpc.documents.cancelBatch.useMutation();
  const utils = trpc.useUtils();

  const trackedIds = useMemo(() => tracked.map((t) => t.documentId), [tracked]);

  const { data: docStatuses } = trpc.documents.getStatuses.useQuery(
    { documentIds: trackedIds },
    { enabled: trackedIds.length > 0, refetchInterval: trackedIds.length > 0 ? 3000 : false }
  );

  const { data: procStats } = trpc.dashboard.processingStats.useQuery(undefined, {
    enabled: trackedIds.length > 0, refetchInterval: trackedIds.length > 0 ? 8000 : false,
  });

  const resolvedDocs = useMemo(() => {
    if (!docStatuses) return [];
    return tracked.map((t) => {
      const backend = docStatuses.find((d) => d?.id === t.documentId);
      return { ...t, backendStatus: backend?.status ?? "pending", error: backend?.error ?? undefined };
    });
  }, [tracked, docStatuses]);

  const terminalIds = useMemo(
    () => new Set(resolvedDocs.filter((d) => ["completed", "failed", "discarded"].includes(d.backendStatus)).map((d) => d.documentId)),
    [resolvedDocs]
  );

  const prevTerminalRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const prev = prevTerminalRef.current;
    let newCompleted = 0, newFailed = 0, newDiscarded = 0;
    for (const d of resolvedDocs) {
      if (prev.has(d.documentId)) continue;
      if (d.backendStatus === "completed") newCompleted++;
      else if (d.backendStatus === "failed") newFailed++;
      else if (d.backendStatus === "discarded") newDiscarded++;
    }
    if (newCompleted > 0) { toast.success(newCompleted + " document(s) processed successfully"); utils.dashboard.stats.invalidate(); utils.patients.search.invalidate(); }
    if (newFailed > 0) toast.error(newFailed + " document(s) failed");
    if (newDiscarded > 0) toast.info(newDiscarded + " document(s) discarded (no test results)");
    prevTerminalRef.current = terminalIds;
  }, [terminalIds, resolvedDocs, utils]);

  // ── Staging helpers ──
  const addFiles = useCallback((fileList: FileList | File[], folderName?: string) => {
    const allowedExts = [".jpg", ".jpeg", ".png", ".pdf", ".zip"];
    const next: StagedFile[] = [];
    let skipped = 0;
    for (const file of Array.from(fileList)) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      const isZip = file.type === "application/zip" || file.type === "application/x-zip-compressed" || ext === ".zip";
      const maxMB = isZip ? 500 : 20;
      if (!allowedExts.includes(ext)) { skipped++; continue; }
      if (file.size > maxMB * 1024 * 1024) { toast.error(file.name + ": exceeds " + maxMB + " MB limit"); continue; }
      let mime = file.type;
      if (!mime) {
        if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".png") mime = "image/png";
        else if (ext === ".pdf") mime = "application/pdf";
        else if (ext === ".zip") mime = "application/zip";
      }
      const finalFile = mime !== file.type ? new File([file], file.name, { type: mime }) : file;
      next.push({ file: finalFile, preview: mime.startsWith("image/") ? URL.createObjectURL(finalFile) : undefined, isZip, folderName });
    }
    if (next.length > 0) {
      setStaged((prev) => [...prev, ...next]);
      if (folderName) toast.success("Added " + next.length + " file(s) from folder '" + folderName + "'");
    }
    if (skipped > 0 && folderName) toast.info("Skipped " + skipped + " unsupported file(s) in '" + folderName + "'");
  }, []);

  const removeStaged = (idx: number) => {
    setStaged((prev) => { const copy = [...prev]; if (copy[idx].preview) URL.revokeObjectURL(copy[idx].preview!); copy.splice(idx, 1); return copy; });
  };

  // ── Poll server-side batch progress ──
  const startPolling = useCallback((batchId: string, startedAt: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/upload/progress/" + batchId, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const progress: ServerBatchProgress = { batchId, startedAt, ...data };
        setBatchProgress(progress);

        if (data.status === "complete" || data.status === "error") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          // Add all document IDs to tracked
          if (data.documentIds && data.documentIds.length > 0) {
            const newTracked: TrackedDocument[] = data.documentIds.map((id: number) => ({
              documentId: id, fileName: "File #" + id, trackedAt: Date.now(),
            }));
            setTracked((prev) => [...prev, ...newTracked]);
          }
          if (data.status === "complete") {
            toast.success("Batch complete: " + data.processed + "/" + data.total + " files processed");
            if (data.failed > 0) toast.error(data.failed + " files failed");
          } else {
            toast.error("Batch processing encountered errors");
          }
          // Clear progress after a short delay so user sees the final state
          setTimeout(() => setBatchProgress(null), 3000);
          setIsUploading(false);
          utils.documents.recent.invalidate();
          utils.dashboard.stats.invalidate();
        }
      } catch (e) {
        // Silently retry on next interval
      }
    }, 1500);
  }, [utils]);

  // ── Client-side ZIP extraction helper ──
  const extractZipFiles = async (zipFile: File): Promise<File[]> => {
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
    const zip = await JSZip.loadAsync(zipFile);
    const entries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false;
      const fileName = name.split("/").pop() || "";
      if (fileName.startsWith(".") || name.includes("__MACOSX")) return false;
      const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
      return allowedExtensions.includes(ext);
    });

    const extracted: File[] = [];
    for (let i = 0; i < entries.length; i++) {
      const [name, entry] = entries[i];
      const fileName = name.split("/").pop() || name;
      setExtractionProgress({ current: i + 1, total: entries.length, fileName: zipFile.name });
      const blob = await entry.async("blob");
      const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
      let mimeType = "application/octet-stream";
      if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".png") mimeType = "image/png";
      else if (ext === ".pdf") mimeType = "application/pdf";
      extracted.push(new File([blob], fileName, { type: mimeType }));
    }
    setExtractionProgress(null);
    return extracted;
  };

  // ── Upload logic using multipart HTTP with client-side ZIP extraction ──
  const uploadAll = async () => {
    if (staged.length === 0) return;
    setIsUploading(true);

    const zips = staged.filter((s) => s.isZip);
    const regular = staged.filter((s) => !s.isZip);
    setStaged([]);

    try {
      // ── ZIP files: extract client-side and merge into regular files ──
      const allFiles: File[] = regular.map((s) => s.file);
      for (const z of zips) {
        try {
          toast.info("Extracting " + z.file.name + "...");
          const extracted = await extractZipFiles(z.file);
          if (extracted.length === 0) {
            toast.error(z.file.name + ": No valid files found (JPEG, PNG, PDF only)");
            continue;
          }
          toast.success(z.file.name + ": extracted " + extracted.length + " files");
          allFiles.push(...extracted);
        } catch (err) {
          toast.error("Failed to extract " + z.file.name + ": " + (err instanceof Error ? err.message : "Invalid ZIP"));
        }
      }

      // ── Upload all files (regular + extracted from ZIPs) via /api/upload/files ──
      if (allFiles.length > 0) {
        try {
          // Split into batches of 10 files to keep each request under proxy size limits
          const BATCH_SIZE = 10;
          for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            const batch = allFiles.slice(i, i + BATCH_SIZE);
            const formData = new FormData();
            for (const f of batch) {
              formData.append("files", f);
            }

            const startedAt = Date.now();
            setBatchProgress({
              batchId: "files-uploading", total: allFiles.length, uploaded: i,
              processing: 0, processed: 0, failed: 0, skippedDuplicates: 0, status: "uploading",
              errors: [], startedAt, documentIds: [],
            });

            const res = await fetch("/api/upload/files", {
              method: "POST",
              body: formData,
              credentials: "include",
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "Upload failed" }));
              throw new Error(err.error || "Upload failed with status " + res.status);
            }

            const result = await res.json();

            if (i + BATCH_SIZE >= allFiles.length) {
              // Last batch — start polling
              toast.success(result.total + " files uploaded. Processing...");
              startPolling(result.batchId, startedAt);
            } else {
              toast.info("Batch " + Math.floor(i / BATCH_SIZE + 1) + " uploaded (" + (i + batch.length) + "/" + allFiles.length + ")")
            }
          }
        } catch (err) {
          toast.error("Bulk upload failed: " + (err instanceof Error ? err.message : "unknown error"));
          setIsUploading(false);
          setBatchProgress(null);
        }
      }

      if (allFiles.length === 0) {
        setIsUploading(false);
      }
    } catch (err) {
      setIsUploading(false);
      setBatchProgress(null);
    }
  };

  // ── ETA ──
  const avgTime = procStats?.avgProcessingTime ?? 15000;
  function getETA(trackedAt: number): string {
    const elapsed = now - trackedAt;
    return formatETA(avgTime - elapsed);
  }

  const processingDocs = resolvedDocs.filter((d) => d.backendStatus === "pending" || d.backendStatus === "processing");
  const completedDocs = resolvedDocs.filter((d) => d.backendStatus === "completed");
  const failedDocs = resolvedDocs.filter((d) => d.backendStatus === "failed");
  const discardedDocs = resolvedDocs.filter((d) => d.backendStatus === "discarded");
  const clearFinished = () => setTracked((prev) => prev.filter((t) => !terminalIds.has(t.documentId)));

  // ── Drag & drop ──
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    const regularFiles: File[] = [];
    if (items && items.length > 0) {
      const entries: { entry: FileSystemEntry }[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push({ entry });
      }
      for (const { entry } of entries) {
        if (entry.isDirectory) {
          const folderFiles = await readEntriesRecursively(entry);
          if (folderFiles.length > 0) addFiles(folderFiles, entry.name);
          else toast.info('Folder "' + entry.name + '" contained no supported files');
        } else if (entry.isFile) {
          const file = await new Promise<File | null>((resolve) => {
            (entry as FileSystemFileEntry).file((f) => resolve(f), () => resolve(null));
          });
          if (file) regularFiles.push(file);
        }
      }
      if (regularFiles.length > 0) addFiles(regularFiles);
    } else {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const fileIcon = (f: StagedFile) => {
    if (f.isZip) return <FileArchive className="h-8 w-8 text-yellow-400" />;
    if (f.file.type === "application/pdf") return <FileType className="h-8 w-8 text-red-400" />;
    return <Image className="h-8 w-8 text-blue-400" />;
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="border-yellow-500/40 text-yellow-400"><Clock className="mr-1 h-3 w-3" />Queued</Badge>;
      case "processing": return <Badge variant="secondary" className="bg-blue-600/20 text-blue-400 border-blue-600/30"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>;
      case "completed": return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>;
      case "failed": return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Failed</Badge>;
      case "discarded": return <Badge variant="secondary" className="border-orange-500/30 text-orange-400"><AlertCircle className="mr-1 h-3 w-3" />Discarded</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ── JSX ──
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Reports</h1>
        <p className="text-muted-foreground">Upload virology laboratory reports for automatic processing and data extraction.</p>
      </div>

      {/* WhatsApp Export Guide (Collapsible) */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="cursor-pointer select-none" onClick={toggleWhatsappGuide}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663030645861/YnzcKgmdmodlaxDG.jpeg"
                alt="OTC Virology 2026"
                className="h-10 w-10 rounded-xl object-cover"
              />
              <div>
                <CardTitle>Upload WhatsApp Export</CardTitle>
                <CardDescription>
                  {whatsappGuideOpen
                    ? "Export from the OTC Virology 2026 group — duplicates are automatically skipped"
                    : "Click to see step-by-step instructions for WhatsApp chat export"}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={(e) => { e.stopPropagation(); toggleWhatsappGuide(); }}>
              {whatsappGuideOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {whatsappGuideOpen && <CardContent className="space-y-6">
          {/* Step-by-step guide */}
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex gap-4 items-start p-4 rounded-lg bg-background/60 border border-border/50">
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Open OTC Virology 2026 on your WhatsApp</p>
                <p className="text-xs text-muted-foreground mt-1">Find and open the <strong>OTC virology 2026</strong> group chat on your phone</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4 items-start p-4 rounded-lg bg-background/60 border border-border/50">
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Tap the three-dot menu → More</p>
                <p className="text-xs text-muted-foreground mt-1">In the top-right corner, tap <strong>⋮</strong> (three dots), then tap <strong>More</strong></p>
                <img
                  src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663030645861/HmZNRYpaWaMhxEWn.png"
                  alt="WhatsApp three-dot menu showing More option"
                  className="mt-3 rounded-lg border border-border/50 max-w-[200px] shadow-md"
                />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4 items-start p-4 rounded-lg bg-background/60 border border-border/50">
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                <span className="text-sm font-bold text-primary">3</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Tap "Export chat"</p>
                <p className="text-xs text-muted-foreground mt-1">From the submenu, select <strong>Export chat</strong></p>
                <img
                  src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663030645861/xykfuJtrcUHWKfPc.png"
                  alt="WhatsApp submenu showing Export chat option"
                  className="mt-3 rounded-lg border border-border/50 max-w-[200px] shadow-md"
                />
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4 items-start p-4 rounded-lg bg-background/60 border border-border/50">
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                <span className="text-sm font-bold text-primary">4</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Choose "Attach Media"</p>
                <p className="text-xs text-muted-foreground mt-1">When prompted, select <strong>Attach Media</strong> to include all images in the export</p>
                <img
                  src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663030645861/SWwOSiwixBsijxJy.png"
                  alt="WhatsApp Export Chat dialog with Attach Media option"
                  className="mt-3 rounded-lg border border-border/50 max-w-[200px] shadow-md"
                />
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4 items-start p-4 rounded-lg bg-background/60 border border-border/50">
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                <span className="text-sm font-bold text-primary">5</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Save the ZIP and drop it below</p>
                <p className="text-xs text-muted-foreground mt-1">Save the exported <strong>.zip</strong> file to your computer, then drag it into the upload area below</p>
              </div>
            </div>
          </div>

          {/* Safe to re-upload banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
            <Shield className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Safe to re-upload anytime</p>
              <p className="text-xs text-muted-foreground mt-0.5">Every file is fingerprinted with SHA-256. If you export the same chat again, previously processed images are automatically skipped — only new ones are processed. You'll see a "duplicates skipped" count during upload.</p>
            </div>
          </div>
        </CardContent>}
      </Card>

      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>Drag and drop files or click to browse. Supports JPEG, PNG, PDF, and ZIP archives.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onClick={() => fileInputRef.current?.click()}
            className={"relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 " + (isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50")}
          >
            <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,application/pdf,.zip" onChange={(e) => e.target.files && addFiles(e.target.files)} className="hidden" />
            <UploadIcon className={"h-12 w-12 mx-auto mb-4 transition-colors " + (isDragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-lg font-medium mb-1">{isDragging ? "Drop files or folders here" : "Drag & drop files or folders here"}</p>
            <p className="text-sm text-muted-foreground">or click to browse your computer</p>
            <p className="text-xs text-muted-foreground mt-2">JPEG, PNG, PDF (max 20 MB) &middot; ZIP archives (max 500 MB, extracted in browser) &middot; Folders with images/PDFs</p>
          </div>
        </CardContent>
      </Card>

      {/* Staged files */}
      {staged.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Ready to Upload ({staged.length})</CardTitle>
              <CardDescription>These files will be sent to the server for processing.</CardDescription>
            </div>
            <Button onClick={uploadAll} disabled={isUploading}>
              {isUploading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>) : (<><UploadIcon className="mr-2 h-4 w-4" />Upload All ({staged.length})</>)}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {staged.map((s, i) => (
                <div key={"staged-" + i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-background flex items-center justify-center">
                    {s.preview ? <img src={s.preview} alt="" className="w-full h-full object-cover" /> : fileIcon(s)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(s.file.size / 1024 / 1024).toFixed(2)} MB
                      {s.isZip && " \u00b7 ZIP archive"}
                      {s.folderName && <span className="inline-flex items-center gap-1 ml-2 text-xs text-muted-foreground"><FolderOpen className="h-3 w-3" />{s.folderName}</span>}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeStaged(i)} disabled={isUploading}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ZIP extraction progress */}
      {extractionProgress && (
        <Card className="border-yellow-500/30">
          <CardContent className="py-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                  <span className="font-medium">Extracting {extractionProgress.fileName}...</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {extractionProgress.current} / {extractionProgress.total}
                </span>
              </div>
              <Progress value={(extractionProgress.current / extractionProgress.total) * 100} className="h-3" />
              <p className="text-xs text-muted-foreground">Extracting files from ZIP archive in your browser. No upload yet.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server-side batch progress */}
      {batchProgress && (
        <Card className="border-primary/30">
          <CardContent className="py-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">
                    {batchProgress.status === "uploading" ? "Uploading to Server..." :
                     batchProgress.status === "processing" ? "Processing Files..." :
                     batchProgress.status === "complete" ? "Complete!" : "Error"}
                  </span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {batchProgress.processed + batchProgress.failed} / {batchProgress.total}
                </span>
              </div>
              <Progress value={batchProgress.total > 0 ? ((batchProgress.processed + batchProgress.failed) / batchProgress.total) * 100 : 0} className="h-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="text-blue-400">{batchProgress.uploaded} uploaded to S3</span>
                  <span className="text-green-400">{batchProgress.processed} processed</span>
                  {batchProgress.skippedDuplicates > 0 && <span className="text-yellow-400">{batchProgress.skippedDuplicates} duplicates skipped</span>}
                  {batchProgress.failed > 0 && <span className="text-destructive">{batchProgress.failed} failed</span>}
                </div>
                <span>
                  {(() => {
                    const elapsed = (Date.now() - batchProgress.startedAt) / 1000;
                    const done = batchProgress.processed + batchProgress.failed;
                    if (done === 0) return "Estimating...";
                    const rate = done / elapsed;
                    const remaining = (batchProgress.total - done) / rate;
                    if (remaining < 60) return "~" + Math.ceil(remaining) + "s remaining";
                    return "~" + Math.ceil(remaining / 60) + "m remaining";
                  })()}
                </span>
              </div>
              {batchProgress.errors.length > 0 && (
                <div className="mt-2 text-xs text-destructive max-h-20 overflow-y-auto">
                  {batchProgress.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                  {batchProgress.errors.length > 5 && <p>...and {batchProgress.errors.length - 5} more errors</p>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tracked documents (backend is processing) */}
      {resolvedDocs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Processing Status</CardTitle>
              <CardDescription>
                {processingDocs.length > 0 && processingDocs.length + " processing"}
                {completedDocs.length > 0 && " \u00b7 " + completedDocs.length + " completed"}
                {failedDocs.length > 0 && " \u00b7 " + failedDocs.length + " failed"}
                {discardedDocs.length > 0 && " \u00b7 " + discardedDocs.length + " discarded"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {processingDocs.length > 0 && (
                <>
                  <Badge variant="outline" className="text-blue-400 border-blue-600/30"><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Auto-refreshing</Badge>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={cancelBatchMutation.isPending}
                    onClick={() => {
                      const ids = processingDocs.map((d) => d.documentId);
                      cancelBatchMutation.mutate({ documentIds: ids }, {
                        onSuccess: (result) => { toast.success(result.message); utils.documents.getStatuses.invalidate(); },
                        onError: (err) => toast.error(err.message),
                      });
                    }}>
                    {cancelBatchMutation.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Ban className="mr-2 h-3 w-3" />}
                    Cancel All ({processingDocs.length})
                  </Button>
                </>
              )}
              {terminalIds.size > 0 && (
                <Button variant="outline" size="sm" onClick={clearFinished}><Trash2 className="mr-2 h-3 w-3" />Clear Finished</Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {resolvedDocs.map((d) => {
                const isActive = d.backendStatus === "pending" || d.backendStatus === "processing";
                return (
                  <div key={d.documentId} className={"flex items-center gap-4 p-3 rounded-lg " + (isActive ? "bg-blue-600/5 border border-blue-600/20" : "bg-muted/50")}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{d.fileName}</p>
                      {d.error && <p className="text-xs text-destructive mt-0.5 truncate">{d.error}</p>}
                      {isActive && <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1"><Timer className="h-3 w-3" />{getETA(d.trackedAt)}</p>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {statusBadge(d.backendStatus)}
                      {isActive && (
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate({ documentId: d.documentId }, { onSuccess: () => { toast.success("Cancelled: " + d.fileName); utils.documents.getStatuses.invalidate(); }, onError: (err) => toast.error(err.message) })}>
                          <XCircle className="h-3 w-3 mr-1" />Cancel
                        </Button>
                      )}
                      {(d.backendStatus === "failed" || d.backendStatus === "discarded") && (
                        <Button variant="outline" size="sm" disabled={reprocessMutation.isPending}
                          onClick={() => reprocessMutation.mutate({ documentId: d.documentId }, { onSuccess: () => { setTracked((prev) => prev.map((t) => t.documentId === d.documentId ? { ...t, trackedAt: Date.now() } : t)); toast.success("Queued for reprocessing"); }, onError: (err) => toast.error(err.message) })}>
                          <RefreshCw className="h-3 w-3 mr-1" />Retry
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

      {/* Global ETA banner */}
      {processingDocs.length > 0 && (
        <Card className="border-blue-600/30 bg-blue-600/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                <div>
                  <p className="font-medium text-blue-400">Processing {processingDocs.length} Document{processingDocs.length > 1 ? "s" : ""}</p>
                  <p className="text-sm text-muted-foreground">Status updates every 3 seconds from the server.</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Estimated time</p>
                <p className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  {formatETA(processingDocs.reduce((sum, d) => sum + Math.max(avgTime - (now - d.trackedAt), 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader><CardTitle>Processing Information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Supported Formats</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>&bull; JPEG images (.jpg, .jpeg)</li>
                <li>&bull; PNG images (.png)</li>
                <li>&bull; PDF documents (.pdf)</li>
                <li>&bull; ZIP archives (.zip) up to 500 MB</li>
                <li>&bull; Folders (drag &amp; drop entire folders)</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Extracted Data</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>&bull; Patient Civil ID &amp; Name</li>
                <li>&bull; Date of Birth &amp; Nationality</li>
                <li>&bull; Test Type &amp; Results</li>
                <li>&bull; Viral Load &amp; Accession Date</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Processing Notes</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>&bull; Documents without test results are discarded</li>
                <li>&bull; Duplicate tests are automatically skipped</li>
                <li>&bull; Status is polled directly from the server</li>
                <li>&bull; Processing typically takes 10-30 seconds per file</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
