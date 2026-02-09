import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, Clock, Trash2, User, Calendar,
  FileArchive, Loader2,
} from "lucide-react";

function fmtDateTime(d: Date | string | number | null): string {
  if (!d) return "-";
  const dt = typeof d === "number" ? new Date(d) : new Date(d);
  return dt.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function durStr(s: number | null, e: number | null): string {
  if (!s || !e) return "-";
  const ms = e - s;
  if (ms < 0) return "-";
  if (ms < 60000) return Math.round(ms / 1000) + "s";
  if (ms < 3600000) {
    return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
  }
  return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m";
}

interface ZipBatchProps {
  batch: {
    jobId: string;
    fileName: string;
    status: string;
    totalEntries: number;
    processedEntries: number;
    uploadedToS3: number;
    skippedDuplicates: number;
    failed: number;
    errors: string | null;
    startedAt: number;
    completedAt: number | null;
    userName?: string | null;
    userEmail?: string | null;
    createdAt?: Date | string | null;
  };
}

export default function ZipBatchCard({ batch }: ZipBatchProps) {
  const rate = batch.totalEntries > 0
    ? Math.round((batch.uploadedToS3 / batch.totalEntries) * 100)
    : 0;

  const statusEl = batch.status === "complete" ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  ) : batch.status === "error" ? (
    <XCircle className="h-3.5 w-3.5 text-red-500" />
  ) : (
    <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />
  );

  const statusText = batch.status === "complete"
    ? "Complete"
    : batch.status === "error"
      ? "Error"
      : "Processing...";

  const statusColor = batch.status === "complete"
    ? "text-green-500"
    : batch.status === "error"
      ? "text-red-500"
      : "text-yellow-500";

  return (
    <div className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <FileArchive className="h-4 w-4 text-purple-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate max-w-[200px]">{batch.fileName}</p>
              <Badge variant="outline" className="text-purple-500 border-purple-500/30 bg-purple-500/5 text-[10px] px-1.5 py-0">
                ZIP Batch
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {batch.userName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {batch.userName}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtDateTime(batch.startedAt)}
              </span>
              <span>{batch.totalEntries} entries</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              {statusEl}
              <span className={statusColor}>{statusText}</span>
              {batch.completedAt && (
                <span className="ml-2">
                  Duration: {durStr(batch.startedAt, batch.completedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {batch.uploadedToS3 > 0 && (
            <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {batch.uploadedToS3} uploaded
            </Badge>
          )}
          {batch.skippedDuplicates > 0 && (
            <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/5 text-xs">
              <Trash2 className="h-3 w-3 mr-1" />
              {batch.skippedDuplicates} dupes
            </Badge>
          )}
          {batch.failed > 0 && (
            <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/5 text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              {batch.failed} failed
            </Badge>
          )}
          {(batch.status === "extracting" || batch.status === "processing") && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/5 text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {batch.processedEntries}/{batch.totalEntries}
            </Badge>
          )}
          <div className="ml-2">
            <div className="flex items-center gap-1">
              <div
                className="h-1.5 rounded-full bg-purple-500"
                style={{ width: `${Math.max(rate * 0.6, 2)}px` }}
              />
              <span className="text-xs font-medium">{rate}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
