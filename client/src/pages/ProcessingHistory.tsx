import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ZipBatchCard from "@/components/ZipBatchCard";
import PHView from "@/components/ProcessingHistoryUI";
import {
  History, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Clock, Trash2, User, Calendar,
  HardDrive, TrendingUp, FileArchive, Loader2,
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

export default function ProcessingHistory() {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { data, isLoading } = trpc.documents.uploadHistory.useQuery(
    { limit: pageSize, offset: page * pageSize },
    { refetchInterval: 30000 }
  );

  const { data: batchData } = trpc.documents.batchHistory.useQuery(
    { limit: 20 },
    { refetchInterval: 15000 }
  );

  const batches = data?.batches || [];
  const zipBatches = batchData || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const summary = useMemo(() => {
    if (!batches.length && !zipBatches.length) return null;
    const tf = batches.reduce((s: number, b: any) => s + b.totalFiles, 0);
    const zu = zipBatches.reduce((s: number, b: any) => s + b.uploadedToS3, 0);
    const tc = batches.reduce((s: number, b: any) => s + b.completedFiles, 0);
    const fl = batches.reduce((s: number, b: any) => s + b.failedFiles, 0);
    const zf = zipBatches.reduce((s: number, b: any) => s + b.failed, 0);
    const td = batches.reduce((s: number, b: any) => s + b.discardedFiles, 0);
    const ts = batches.reduce((s: number, b: any) => s + b.totalSize, 0);
    return {
      totalFiles: tf + zu, totalCompleted: tc,
      totalFailed: fl + zf, totalDiscarded: td,
      totalSize: ts, totalZipBatches: zipBatches.length,
    };
  }, [batches, zipBatches]);

  return (
    <PHView
      batches={batches}
      zipBatches={zipBatches}
      summary={summary}
      isLoading={isLoading}
      page={page}
      setPage={setPage}
      totalPages={totalPages}
      total={total}
    />
  );
}
