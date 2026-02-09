import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ZipBatchCard from "@/components/ZipBatchCard";
import {
  History, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Clock, Trash2, User, Calendar,
  HardDrive, TrendingUp, FileArchive, Loader2,
} from "lucide-react";

function fmtSize(b: number | null): string {
  if (!b) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

interface Props {
  batches: any[];
  zipBatches: any[];
  summary: any;
  isLoading: boolean;
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  total: number;
}

export default function ProcessingHistoryUI({
  batches, zipBatches, summary, isLoading,
  page, setPage, totalPages, total,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Processing History
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload batches grouped by user and date
          </p>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard icon={<HardDrive className="h-4 w-4 text-muted-foreground" />} label="Total Files" value={summary.totalFiles} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Completed" value={summary.totalCompleted} color="text-green-500" />
          <SummaryCard icon={<XCircle className="h-4 w-4 text-red-500" />} label="Failed" value={summary.totalFailed} color="text-red-500" />
          <SummaryCard icon={<TrendingUp className="h-4 w-4 text-primary" />} label="Total Size" value={fmtSize(summary.totalSize)} />
          <SummaryCard icon={<FileArchive className="h-4 w-4 text-purple-500" />} label="ZIP Batches" value={summary.totalZipBatches} color="text-purple-500" />
        </div>
      )}

      {/* Large ZIP Batch History */}
      {zipBatches.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-purple-500" />
              Large ZIP Batch Jobs
            </h3>
            <div className="space-y-2">
              {zipBatches.map((b: any) => (
                <ZipBatchCard key={b.jobId} batch={b} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regular upload batches */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : batches.length === 0 && zipBatches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <History className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No upload history yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((batch: any, idx: number) => (
            <UploadBatchRow key={idx} batch={batch} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} ({total} batches)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: any; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={"text-2xl font-bold mt-1 " + (color || "")}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  );
}

function UploadBatchRow({ batch }: { batch: any }) {
  return (
    <div className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <HardDrive className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">
                {fmtDate(batch.uploadDate)}
              </p>
              <span className="text-xs text-muted-foreground">
                {batch.totalFiles} files
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {batch.uploaderName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {batch.uploaderName}
                </span>
              )}
              <span>{fmtSize(batch.totalSize)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {batch.completedFiles > 0 && (
            <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {batch.completedFiles}
            </Badge>
          )}
          {batch.failedFiles > 0 && (
            <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/5 text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              {batch.failedFiles}
            </Badge>
          )}
          {batch.discardedFiles > 0 && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/5 text-xs">
              <Trash2 className="h-3 w-3 mr-1" />
              {batch.discardedFiles}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
