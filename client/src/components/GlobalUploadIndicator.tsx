import { useUploadManager } from "@/contexts/UploadManagerContext";
import { Progress } from "@/components/ui/progress";
import { FileArchive, Loader2, CheckCircle2, AlertCircle, X, ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

/**
 * Floating upload progress indicator that appears at the bottom-right of the screen
 * when an upload is in progress. Visible from any page.
 */
export default function GlobalUploadIndicator() {
  const { largeZipProgress, batchProgress, isUploading } = useUploadManager();
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Nothing to show
  if (!largeZipProgress && !batchProgress && !isUploading) return null;
  if (dismissed) return null;

  // Reset dismissed when a new upload starts
  const hasActive = !!largeZipProgress || !!batchProgress;

  // Determine what to show
  const showLargeZip = !!largeZipProgress;
  const showBatch = !!batchProgress && !showLargeZip;

  // Calculate progress percentage
  let progressPct = 0;
  let statusText = "";
  let isComplete = false;
  let isError = false;
  let fileName = "";

  if (showLargeZip && largeZipProgress) {
    fileName = largeZipProgress.fileName;
    isComplete = largeZipProgress.status === "complete";
    isError = largeZipProgress.status === "error";

    if (largeZipProgress.status === "uploading" && largeZipProgress.chunksTotal) {
      progressPct = ((largeZipProgress.chunksSent || 0) / largeZipProgress.chunksTotal) * 100;
      if (largeZipProgress.uploadPhase === "chunking") {
        statusText = `Uploading chunks ${largeZipProgress.chunksSent || 0}/${largeZipProgress.chunksTotal}`;
        if (largeZipProgress.speedMBps && largeZipProgress.speedMBps > 0) {
          statusText += ` \u00b7 ${largeZipProgress.speedMBps.toFixed(1)} MB/s`;
        }
        if (largeZipProgress.etaSeconds && largeZipProgress.etaSeconds > 0) {
          const eta = largeZipProgress.etaSeconds;
          statusText += ` \u00b7 ${eta < 60 ? `~${Math.ceil(eta)}s` : `~${Math.ceil(eta / 60)}m`} left`;
        }
      } else if (largeZipProgress.uploadPhase === "reassembling") {
        statusText = "Reassembling on server...";
        progressPct = 100;
      }
    } else if (largeZipProgress.status === "extracting") {
      statusText = "Server extracting ZIP...";
      progressPct = largeZipProgress.totalEntries > 0
        ? (largeZipProgress.processedEntries / largeZipProgress.totalEntries) * 100
        : 10;
    } else if (largeZipProgress.status === "processing") {
      statusText = `Processing ${largeZipProgress.processedEntries}/${largeZipProgress.totalEntries}`;
      progressPct = largeZipProgress.totalEntries > 0
        ? (largeZipProgress.processedEntries / largeZipProgress.totalEntries) * 100
        : 50;
    } else if (isComplete) {
      statusText = `Complete! ${largeZipProgress.uploadedToS3} files processed`;
      progressPct = 100;
    } else if (isError) {
      statusText = "Error: " + (largeZipProgress.errors?.[0] || "Unknown");
      progressPct = 0;
    }
  } else if (showBatch && batchProgress) {
    fileName = "Batch upload";
    isComplete = batchProgress.status === "complete";
    isError = batchProgress.status === "error";
    progressPct = batchProgress.total > 0
      ? ((batchProgress.processed + batchProgress.failed) / batchProgress.total) * 100
      : 0;
    statusText = batchProgress.status === "uploading"
      ? "Uploading..."
      : batchProgress.status === "processing"
      ? `Processing ${batchProgress.processed}/${batchProgress.total}`
      : isComplete
      ? `Complete! ${batchProgress.processed} processed`
      : "Error";
  }

  // Allow dismissing completed/error states
  const canDismiss = isComplete || isError;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 shadow-2xl rounded-xl border border-border bg-card text-card-foreground overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Header bar — always visible */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setMinimized(!minimized)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : isError ? (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            {isComplete ? "Upload Complete" : isError ? "Upload Error" : "Uploading..."}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canDismiss && (
            <button
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <button className="p-1 rounded hover:bg-muted transition-colors">
            {minimized ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Progress bar — always visible even when minimized */}
      <div className="px-3 pb-1">
        <Progress value={progressPct} className="h-1.5" />
      </div>

      {/* Expanded details */}
      {!minimized && (
        <div className="px-3 pb-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileArchive className="h-3 w-3 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
          <p className="text-xs text-muted-foreground">{statusText}</p>
          {/* Link to upload page for full details */}
          <Link href="/upload" className="text-xs text-primary hover:underline">
            View full details →
          </Link>
        </div>
      )}
    </div>
  );
}
