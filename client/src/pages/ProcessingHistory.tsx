import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Clock, AlertTriangle, Trash2, User, Calendar,
  HardDrive, TrendingUp,
} from "lucide-react";
import { useState, useMemo } from "react";

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

function fmtDateTime(d: Date | string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function duration(start: Date | string | null, end: Date | string | null): string {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "-";
  if (ms < 60000) return Math.round(ms / 1000) + "s";
  if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
  return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m";
}

export default function ProcessingHistory() {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { data, isLoading } = trpc.documents.uploadHistory.useQuery(
    { limit: pageSize, offset: page * pageSize },
    { refetchInterval: 30000 }
  );

  const batches = data?.batches || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Summary stats
  const summary = useMemo(() => {
    if (!batches.length) return null;
    return {
      totalFiles: batches.reduce((s, b) => s + b.totalFiles, 0),
      totalCompleted: batches.reduce((s, b) => s + b.completedFiles, 0),
      totalFailed: batches.reduce((s, b) => s + b.failedFiles, 0),
      totalDiscarded: batches.reduce((s, b) => s + b.discardedFiles, 0),
      totalSize: batches.reduce((s, b) => s + b.totalSize, 0),
    };
  }, [batches]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Processing History
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload batches grouped by user and date with processing statistics
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Files (page)</span>
              </div>
              <p className="text-2xl font-bold mt-1">{summary.totalFiles.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Completed</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-green-500">{summary.totalCompleted.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Failed</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-red-500">{summary.totalFailed.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Size</span>
              </div>
              <p className="text-2xl font-bold mt-1">{fmtSize(summary.totalSize)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Batch list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Upload Batches</CardTitle>
            <span className="text-xs text-muted-foreground">{total} total batches</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No upload history found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch: any, idx: number) => (
                <div
                  key={`${batch.uploadedBy}-${batch.uploadDate}-${idx}`}
                  className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{batch.uploaderName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {fmtDate(batch.uploadDate)}
                          </span>
                          <span>{batch.totalFiles} files</span>
                          <span>{fmtSize(batch.totalSize)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <span>Duration: {duration(batch.firstUpload, batch.lastProcessed)}</span>
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
                      {(batch.pendingFiles > 0 || batch.processingFiles > 0) && (
                        <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/5 text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {batch.pendingFiles + batch.processingFiles}
                        </Badge>
                      )}
                      {batch.discardedFiles > 0 && (
                        <Badge variant="outline" className="text-muted-foreground border-muted text-xs">
                          <Trash2 className="h-3 w-3 mr-1" />
                          {batch.discardedFiles}
                        </Badge>
                      )}
                      <div className="ml-2">
                        <div className="flex items-center gap-1">
                          <div
                            className="h-1.5 rounded-full bg-green-500"
                            style={{ width: `${Math.max(batch.successRate * 0.6, 2)}px` }}
                          />
                          <span className="text-xs font-medium">
                            {batch.successRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
