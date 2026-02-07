import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, RefreshCw, ChevronDown, ChevronUp, Loader2, AlertCircle, Clock, XCircle, RotateCcw, Gauge, Timer } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";

function fmtSize(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function timeAgo(d: Date | string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

type QItem = {
  id: number; fileName: string; fileSize: number | null; mimeType: string | null;
  processingStatus: string | null; processingError: string | null;
  createdAt: Date; updatedAt: Date; uploadedByName: string | null; uploadedByEmail: string | null;
};

function QueueRow({ item, onCancel, onRetry, cp, rp }: {
  item: QItem; onCancel: (id: number) => void; onRetry: (id: number) => void; cp: boolean; rp: boolean;
}) {
  const isPr = item.processingStatus === "processing";
  const isF = item.processingStatus === "failed";
  const bg = isPr ? "bg-blue-500/5 border-blue-500/20" : isF ? "bg-red-500/5 border-red-500/20" : "bg-yellow-500/5 border-yellow-500/20";
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${bg}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {isPr ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          : isF ? <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          : <Clock className="h-4 w-4 text-yellow-500 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            <span className="text-muted-foreground">#{item.id}</span>{" "}{item.fileName}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {item.uploadedByName && <span>{item.uploadedByName}</span>}
            <span>{timeAgo(item.createdAt)}</span>
            {item.fileSize ? <span>{fmtSize(item.fileSize)}</span> : null}
          </div>
          {isF && item.processingError && (
            <p className="text-xs text-red-400 mt-1 truncate max-w-[300px]">{item.processingError}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <Badge variant={isPr ? "default" : isF ? "destructive" : "outline"} className="text-xs">
          {item.processingStatus}
        </Badge>
        {isF && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Retry"
            onClick={() => onRetry(item.id)} disabled={rp}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        {(item.processingStatus === "pending" || isPr) && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
            title="Cancel" onClick={() => onCancel(item.id)} disabled={cp}>
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProcessingQueue() {
  const [expanded, setExpanded] = useState(true);
  const utils = trpc.useUtils();
  const { data: queueData } = trpc.documents.processingQueue.useQuery(
    { limit: 50 },
    { refetchInterval: (query) => {
        const d = query.state.data;
        return d && (d.counts.pending > 0 || d.counts.processing > 0) ? 3000 : 15000;
      },
    }
  );
  const cancelDoc = trpc.documents.cancelProcessing.useMutation({
    onSuccess: () => { toast.success("Document cancelled"); utils.documents.processingQueue.invalidate(); utils.dashboard.stats.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reprocessDoc = trpc.documents.reprocess.useMutation({
    onSuccess: () => { toast.success("Queued for reprocessing"); utils.documents.processingQueue.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const lastStaleRef = useRef(0);
  const staleReset = (queueData as any)?.staleReset || 0;

  useEffect(() => {
    if (staleReset > 0 && staleReset !== lastStaleRef.current) {
      toast.info(`Auto-recovered ${staleReset} stale document${staleReset > 1 ? 's' : ''} (stuck >10min) back to pending`);
      lastStaleRef.current = staleReset;
    }
  }, [staleReset]);

  if (!queueData) return null;
  const { counts, items, speed } = queueData as any;
  const totalActive = counts.pending + counts.processing + counts.failed;
  if (totalActive === 0) return null;
  const totalAll = counts.completed + counts.pending + counts.processing + counts.failed + counts.discarded;
  const isLive = counts.pending > 0 || counts.processing > 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Zap className="h-5 w-5 text-primary" />
              {counts.processing > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />}
            </div>
            <div>
              <CardTitle className="text-base">Processing Queue</CardTitle>
              <CardDescription className="text-xs">
                {counts.processing > 0 && <span className="text-green-500 font-medium">{counts.processing} processing</span>}
                {counts.processing > 0 && counts.pending > 0 && " \u00b7 "}
                {counts.pending > 0 && <span className="text-yellow-500 font-medium">{counts.pending} pending</span>}
                {(counts.processing > 0 || counts.pending > 0) && counts.failed > 0 && " \u00b7 "}
                {counts.failed > 0 && <span className="text-red-500 font-medium">{counts.failed} failed</span>}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLive && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" />Live</div>}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {totalAll > 0 && (
            <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-4 bg-muted">
              {counts.completed > 0 && <div className="bg-green-500 transition-all duration-700" style={{ width: `${(counts.completed / totalAll) * 100}%` }} />}
              {counts.processing > 0 && <div className="bg-blue-500 animate-pulse transition-all duration-700" style={{ width: `${(counts.processing / totalAll) * 100}%` }} />}
              {counts.pending > 0 && <div className="bg-yellow-500 transition-all duration-700" style={{ width: `${(counts.pending / totalAll) * 100}%` }} />}
              {counts.failed > 0 && <div className="bg-red-500 transition-all duration-700" style={{ width: `${(counts.failed / totalAll) * 100}%` }} />}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mb-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> Completed ({counts.completed.toLocaleString()})</div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" /> Processing ({counts.processing.toLocaleString()})</div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500 inline-block" /> Pending ({counts.pending.toLocaleString()})</div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> Failed ({counts.failed.toLocaleString()})</div>
          </div>
          {speed && speed.docsPerMinute > 0 && (
            <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{speed.docsPerMinute} docs/min</p>
                  <p className="text-[10px] text-muted-foreground">Processing speed</p>
                </div>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {speed.estimatedMinutesRemaining !== null
                      ? speed.estimatedMinutesRemaining < 60
                        ? `~${speed.estimatedMinutesRemaining} min`
                        : `~${Math.floor(speed.estimatedMinutesRemaining / 60)}h ${speed.estimatedMinutesRemaining % 60}m`
                      : "Calculating..."}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{speed.totalRemaining} remaining</p>
                </div>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{speed.completedLast5Min} in 5m</span>
                <span className="text-muted-foreground/50">|</span>
                <span>{speed.completedLast30Min} in 30m</span>
                <span className="text-muted-foreground/50">|</span>
                <span>{speed.completedLast60Min} in 1h</span>
              </div>
            </div>
          )}
          {speed && speed.docsPerMinute === 0 && isLive && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-xs text-muted-foreground">
              <Gauge className="h-4 w-4 text-yellow-500" />
              <span>Waiting for processing to start... Speed data will appear once documents begin completing.</span>
            </div>
          )}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {items.map((item: any) => (
              <QueueRow key={item.id} item={item as QItem}
                onCancel={(id) => cancelDoc.mutate({ documentId: id })}
                onRetry={(id) => reprocessDoc.mutate({ documentId: id })}
                cp={cancelDoc.isPending} rp={reprocessDoc.isPending} />
            ))}
            {items.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">Queue is empty</div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
