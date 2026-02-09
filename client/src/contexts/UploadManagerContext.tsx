import { createContext, useContext, useCallback, useRef, useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ── Types ──

export interface ServerBatchProgress {
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

export interface LargeZipProgress {
  jobId: string;
  fileName: string;
  status: "uploading" | "extracting" | "processing" | "complete" | "error";
  totalEntries: number;
  processedEntries: number;
  uploadedToS3: number;
  skippedDuplicates: number;
  failed: number;
  documentIds: number[];
  errors: string[];
  startedAt: number;
  completedAt?: number;
  // Chunked upload fields (client-side only)
  chunksTotal?: number;
  chunksSent?: number;
  uploadPhase?: "chunking" | "reassembling" | "server-processing";
  // Speed tracking fields
  bytesSent?: number;
  totalBytes?: number;
  speedMBps?: number;
  etaSeconds?: number;
}

export interface TrackedDocument {
  documentId: number;
  fileName: string;
  trackedAt: number;
}

interface UploadManagerContextValue {
  // Large ZIP upload
  largeZipProgress: LargeZipProgress | null;
  uploadLargeZip: (zipFile: File) => Promise<void>;
  isUploadingLargeZip: boolean;

  // Batch upload (regular files)
  batchProgress: ServerBatchProgress | null;
  startBatchPolling: (batchId: string, startedAt: number) => void;

  // Tracked documents
  tracked: TrackedDocument[];
  addTracked: (docs: TrackedDocument[]) => void;
  clearFinished: (terminalIds: Set<number>) => void;

  // Shared upload state
  isUploading: boolean;
  setIsUploading: (v: boolean) => void;
}

const UploadManagerContext = createContext<UploadManagerContextValue | null>(null);

export function useUploadManager() {
  const ctx = useContext(UploadManagerContext);
  if (!ctx) throw new Error("useUploadManager must be used within UploadManagerProvider");
  return ctx;
}

// ── Provider ──

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── State ──
  const [largeZipProgress, setLargeZipProgress] = useState<LargeZipProgress | null>(null);
  const [batchProgress, setBatchProgress] = useState<ServerBatchProgress | null>(null);
  const [tracked, setTracked] = useState<TrackedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const largeZipPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (largeZipPollRef.current) clearInterval(largeZipPollRef.current);
    };
  }, []);

  // ── Restore active large ZIP jobs from DB on load (survives refresh) ──
  const { data: activeBatches } = trpc.documents.activeBatches.useQuery(undefined, {
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!activeBatches || activeBatches.length === 0) return;
    const batch = activeBatches[0];
    if (!largeZipProgress && !largeZipPollRef.current) {
      setLargeZipProgress({
        jobId: batch.jobId,
        fileName: batch.fileName,
        status: batch.status as LargeZipProgress["status"],
        totalEntries: batch.totalEntries,
        processedEntries: batch.processedEntries,
        uploadedToS3: batch.uploadedToS3,
        skippedDuplicates: batch.skippedDuplicates,
        failed: batch.failed,
        documentIds: [],
        errors: batch.errors ? JSON.parse(batch.errors) : [],
        startedAt: batch.startedAt,
        completedAt: batch.completedAt ?? undefined,
      });
      startLargeZipPolling(batch.jobId);
    }
  }, [activeBatches]);

  // ── Poll large ZIP processing progress ──
  const startLargeZipPolling = useCallback((jobId: string) => {
    if (largeZipPollRef.current) clearInterval(largeZipPollRef.current);

    largeZipPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/upload/zip/large/progress/" + jobId);
        if (!res.ok) return;
        const data: LargeZipProgress = await res.json();
        setLargeZipProgress(data);

        if (data.status === "complete" || data.status === "error") {
          if (largeZipPollRef.current) { clearInterval(largeZipPollRef.current); largeZipPollRef.current = null; }

          if (data.status === "complete") {
            toast.success(
              `ZIP processing complete: ${data.uploadedToS3} files uploaded, ` +
              `${data.skippedDuplicates} duplicates skipped` +
              (data.failed > 0 ? `, ${data.failed} failed` : "")
            );
          } else {
            toast.error("ZIP processing encountered errors: " + (data.errors?.[0] || "Unknown error"));
          }

          setTimeout(() => setLargeZipProgress(null), 5000);
          setIsUploading(false);
          utils.documents.recent.invalidate();
          utils.dashboard.stats.invalidate();
        }
      } catch {
        // Silently retry on next interval
      }
    }, 2000);
  }, [utils]);

  // ── Poll server-side batch progress ──
  const startBatchPolling = useCallback((batchId: string, startedAt: number) => {
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
          setTimeout(() => setBatchProgress(null), 3000);
          setIsUploading(false);
          utils.documents.recent.invalidate();
          utils.dashboard.stats.invalidate();
        }
      } catch {
        // Silently retry on next interval
      }
    }, 1500);
  }, [utils]);

  // ── Large ZIP upload (chunked) ──
  const uploadLargeZip = useCallback(async (zipFile: File) => {
    const sizeMB = Math.round(zipFile.size / 1024 / 1024);
    const CHUNK_SIZE = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(zipFile.size / CHUNK_SIZE);

    toast.info(`Uploading large ZIP (${sizeMB}MB) in ${totalChunks} chunks...`);

    const uploadStartTime = Date.now();
    setLargeZipProgress({
      jobId: "",
      fileName: zipFile.name,
      status: "uploading",
      totalEntries: 0,
      processedEntries: 0,
      uploadedToS3: 0,
      skippedDuplicates: 0,
      failed: 0,
      documentIds: [],
      errors: [],
      startedAt: uploadStartTime,
      chunksTotal: totalChunks,
      chunksSent: 0,
      uploadPhase: "chunking",
      bytesSent: 0,
      totalBytes: zipFile.size,
      speedMBps: 0,
      etaSeconds: 0,
    });

    try {
      // Step 1: Initialize chunked upload session
      const initRes = await fetch("/api/upload/zip/chunked/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName: zipFile.name,
          totalSize: zipFile.size,
          totalChunks,
        }),
      });

      if (!initRes.ok) {
        const errText = await initRes.text().catch(() => "");
        let errorMsg = `HTTP ${initRes.status}`;
        try {
          const parsed = JSON.parse(errText);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = errText.length < 200 ? `HTTP ${initRes.status}: ${errText.substring(0, 100)}` : `HTTP ${initRes.status}`;
        }
        throw new Error(errorMsg || "Failed to initialize chunked upload");
      }

      const { uploadId } = await initRes.json();

      // Step 2: Upload each chunk with retry logic
      const MAX_RETRIES = 5;
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, zipFile.size);
        const chunkBlob = zipFile.slice(start, end);

        let lastError = "";
        let success = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            if (attempt > 1) {
              setLargeZipProgress((prev) => prev ? {
                ...prev,
                errors: [`Retrying chunk ${i + 1}/${totalChunks} (attempt ${attempt}/${MAX_RETRIES})...`],
              } : prev);
              toast.info(`Retrying chunk ${i + 1}/${totalChunks} (attempt ${attempt}/${MAX_RETRIES})...`);
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }

            const chunkForm = new FormData();
            chunkForm.append("chunk", chunkBlob, `chunk-${i}`);

            const chunkRes = await fetch(
              `/api/upload/zip/chunked/chunk?uploadId=${uploadId}&chunkIndex=${i}`,
              {
                method: "POST",
                body: chunkForm,
                credentials: "include",
              }
            );

            if (!chunkRes.ok) {
              const statusText = `HTTP ${chunkRes.status}`;
              const err = await chunkRes.text().catch(() => "");
              let errorMsg = "";
              try {
                const parsed = JSON.parse(err);
                errorMsg = parsed.error || statusText;
              } catch {
                errorMsg = err.length < 200 ? `${statusText}: ${err.substring(0, 100)}` : statusText;
              }
              lastError = errorMsg || `Chunk ${i + 1}/${totalChunks} failed (${statusText})`;
              continue;
            }

            success = true;
            break;
          } catch (e) {
            lastError = e instanceof Error ? e.message : "Network error";
          }
        }

        if (!success) {
          throw new Error(`Chunk ${i + 1}/${totalChunks} failed after ${MAX_RETRIES} attempts: ${lastError}`);
        }

        const bytesSentSoFar = end;
        const elapsedSec = (Date.now() - uploadStartTime) / 1000;
        const speedMBps = elapsedSec > 0 ? (bytesSentSoFar / 1024 / 1024) / elapsedSec : 0;
        const remainingBytes = zipFile.size - bytesSentSoFar;
        const etaSeconds = speedMBps > 0 ? (remainingBytes / 1024 / 1024) / speedMBps : 0;

        setLargeZipProgress((prev) => prev ? {
          ...prev,
          chunksSent: i + 1,
          errors: [],
          bytesSent: bytesSentSoFar,
          speedMBps: Math.round(speedMBps * 100) / 100,
          etaSeconds: Math.round(etaSeconds),
        } : prev);
      }

      // Step 3: Finalize
      setLargeZipProgress((prev) => prev ? {
        ...prev,
        uploadPhase: "reassembling",
      } : prev);

      toast.info("All chunks uploaded. Reassembling ZIP on server...");

      const finalizeRes = await fetch("/api/upload/zip/chunked/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uploadId }),
      });

      if (!finalizeRes.ok) {
        const err = await finalizeRes.json().catch(() => ({ error: "Finalize failed" }));
        throw new Error(err.error || "Failed to finalize chunked upload");
      }

      const result = await finalizeRes.json();
      const sizeMsg = result.fileSizeMB ? ` (${result.fileSizeMB}MB)` : "";
      toast.success(`All chunks received${sizeMsg}. Server is downloading, reassembling, and processing in background...`);

      setLargeZipProgress((prev) => prev ? {
        ...prev,
        jobId: result.jobId,
        uploadPhase: "server-processing",
        status: "extracting",
      } : prev);

      startLargeZipPolling(result.jobId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "unknown error";
      toast.error("Large ZIP upload failed: " + errorMsg);
      setLargeZipProgress((prev) => prev ? {
        ...prev,
        status: "error",
        errors: [errorMsg],
      } : prev);
      setTimeout(() => setLargeZipProgress(null), 5000);
      setIsUploading(false);
    }
  }, [startLargeZipPolling]);

  // ── Tracked documents helpers ──
  const addTracked = useCallback((docs: TrackedDocument[]) => {
    setTracked((prev) => [...prev, ...docs]);
  }, []);

  const clearFinished = useCallback((terminalIds: Set<number>) => {
    setTracked((prev) => prev.filter((t) => !terminalIds.has(t.documentId)));
  }, []);

  const isUploadingLargeZip = !!largeZipProgress && largeZipProgress.status === "uploading";

  const value: UploadManagerContextValue = {
    largeZipProgress,
    uploadLargeZip,
    isUploadingLargeZip,
    batchProgress,
    startBatchPolling,
    tracked,
    addTracked,
    clearFinished,
    isUploading,
    setIsUploading,
  };

  return (
    <UploadManagerContext.Provider value={value}>
      {children}
    </UploadManagerContext.Provider>
  );
}
