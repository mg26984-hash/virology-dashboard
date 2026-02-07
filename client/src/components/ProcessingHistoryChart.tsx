import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
] as const;

export default function ProcessingHistoryChart() {
  const [days, setDays] = useState(14);
  const { data, isLoading } = trpc.dashboard.processingHistory.useQuery({ days });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((row: { date: string; completed: number; failed: number; discarded: number; total: number }) => ({
      date: new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Completed: Number(row.completed),
      Failed: Number(row.failed),
      Discarded: Number(row.discarded),
    }));
  }, [data]);

  const totals = useMemo(() => {
    if (!chartData.length) return { completed: 0, failed: 0, discarded: 0 };
    return chartData.reduce(
      (acc: { completed: number; failed: number; discarded: number }, row: { Completed: number; Failed: number; Discarded: number }) => ({
        completed: acc.completed + row.Completed,
        failed: acc.failed + row.Failed,
        discarded: acc.discarded + row.Discarded,
      }),
      { completed: 0, failed: 0, discarded: 0 }
    );
  }, [chartData]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Processing History</CardTitle>
              <CardDescription>
                Documents processed per day ({totals.completed} completed, {totals.discarded} discarded, {totals.failed} failed)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.days}
                variant={days === opt.days ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setDays(opt.days)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[250px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
            <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No processing data for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.2 0.01 250)",
                  border: "1px solid oklch(0.3 0.01 250)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "oklch(0.9 0 0)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
              />
              <Bar
                dataKey="Completed"
                stackId="a"
                fill="oklch(0.65 0.18 160)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Discarded"
                stackId="a"
                fill="oklch(0.6 0.1 250)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Failed"
                stackId="a"
                fill="oklch(0.6 0.2 25)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart
>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
