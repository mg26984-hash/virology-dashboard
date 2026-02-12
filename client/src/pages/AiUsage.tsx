import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { Activity, Cpu, DollarSign, TrendingDown, Zap, Server, AlertTriangle, FileWarning, Wifi, Key } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GEMINI_COLOR = "oklch(0.65 0.18 175)";
const PLATFORM_COLOR = "oklch(0.6 0.15 30)";
const UNKNOWN_COLOR = "oklch(0.5 0.05 250)";

function UpdateApiKeyButton() {
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const updateKey = trpc.aiUsage.updateApiKey.useMutation();
  const testConnection = trpc.aiUsage.testConnection.useMutation();

  const handleUpdate = async () => {
    if (!newKey.trim()) {
      toast.error("API key is required");
      return;
    }

    if (!newKey.startsWith("AIzaSy")) {
      toast.error("Invalid Gemini API key format", {
        description: "Key should start with 'AIzaSy'",
      });
      return;
    }

    try {
      // Update the key
      await updateKey.mutateAsync({ apiKey: newKey });
      
      // Test the new key
      const result = await testConnection.mutateAsync();
      
      if (result.success) {
        toast.success("API Key Updated Successfully", {
          description: `Tested in ${result.responseTimeMs}ms - Key is working`,
        });
        setOpen(false);
        setNewKey("");
      } else {
        toast.error("API Key Updated but Test Failed", {
          description: result.error || "The key was saved but may not be working",
        });
      }
    } catch (error: any) {
      toast.error("Failed to Update API Key", {
        description: error.message || "Unknown error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Key className="h-3.5 w-3.5 mr-1.5" />
          Update API Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Gemini API Key</DialogTitle>
          <DialogDescription>
            Enter your new Gemini API key. The key will be validated before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="AIzaSy..."
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              disabled={updateKey.isPending || testConnection.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Google AI Studio
              </a>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setNewKey("");
            }}
            disabled={updateKey.isPending || testConnection.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updateKey.isPending || testConnection.isPending}
          >
            {updateKey.isPending || testConnection.isPending ? "Updating..." : "Update & Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyQuotaInfo() {
  const { data: quota } = trpc.aiUsage.getQuota.useQuery(undefined, {
    refetchInterval: 60000, // Refresh every minute
  });
  const { data: keyMeta } = trpc.aiUsage.getKeyMetadata.useQuery();

  if (!keyMeta) return null;

  const lastUpdated = keyMeta.lastUpdated
    ? new Date(keyMeta.lastUpdated).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-sm text-muted-foreground border-t pt-4">
      <div className="flex items-center gap-2">
        <Key className="h-3.5 w-3.5" />
        <span>
          API Key: ****{keyMeta.lastFourChars}
        </span>
        <span className="text-xs">•</span>
        <span className="text-xs">Updated {lastUpdated}</span>
      </div>
      {quota?.success && quota.remainingRequests !== undefined && (
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" />
          <span>
            Quota: {quota.remainingRequests.toLocaleString()}
            {quota.totalRequests && ` / ${quota.totalRequests.toLocaleString()}`} remaining
          </span>
          {quota.resetTime && (
            <>
              <span className="text-xs">•</span>
              <span className="text-xs">Resets {new Date(quota.resetTime).toLocaleTimeString()}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TestConnectionButton() {
  const testConnection = trpc.aiUsage.testConnection.useMutation();

  const handleTest = async () => {
    try {
      const result = await testConnection.mutateAsync();
      
      if (result.success) {
        toast.success(`Gemini API Connected`, {
          description: `Response time: ${result.responseTimeMs}ms | Model: ${result.model}`,
        });
      } else {
        toast.error(`Gemini API Failed`, {
          description: result.error || 'Unknown error',
        });
      }
    } catch (error: any) {
      toast.error(`Connection Test Failed`, {
        description: error.message || 'Unknown error',
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleTest}
      disabled={testConnection.isPending}
      className="shrink-0"
    >
      <Wifi className="h-3.5 w-3.5 mr-1.5" />
      {testConnection.isPending ? 'Testing...' : 'Test Connection'}
    </Button>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  loading,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
        </p>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <TrendingDown className="h-3 w-3 text-emerald-500" />
            <span className="text-xs text-emerald-500 font-medium">
              {trend.value}% {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderPieChart({ gemini, platform, unknown }: { gemini: number; platform: number; unknown: number }) {
  const data = useMemo(() => {
    const items = [];
    if (gemini > 0) items.push({ name: "Gemini", value: gemini, color: GEMINI_COLOR });
    if (platform > 0) items.push({ name: "Platform LLM", value: platform, color: PLATFORM_COLOR });
    if (unknown > 0) items.push({ name: "Unknown", value: unknown, color: UNKNOWN_COLOR });
    return items;
  }, [gemini, platform, unknown]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data yet. Upload documents to see provider distribution.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.2 0.02 260)",
            border: "1px solid oklch(0.3 0.02 260)",
            borderRadius: "8px",
            color: "oklch(0.9 0 0)",
          }}
          formatter={(value: number) => [`${value} documents`, ""]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DailyUsageChart({ data }: { data: Array<{ date: string; gemini: number; platform: number; unknown: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No daily data available yet.
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    date: d.date.slice(5), // Show MM-DD
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.2 0.02 260)",
            border: "1px solid oklch(0.3 0.02 260)",
            borderRadius: "8px",
            color: "oklch(0.9 0 0)",
          }}
        />
        <Area
          type="monotone"
          dataKey="gemini"
          stackId="1"
          stroke={GEMINI_COLOR}
          fill={GEMINI_COLOR}
          fillOpacity={0.6}
          name="Gemini"
        />
        <Area
          type="monotone"
          dataKey="platform"
          stackId="1"
          stroke={PLATFORM_COLOR}
          fill={PLATFORM_COLOR}
          fillOpacity={0.6}
          name="Platform LLM"
        />
        {data.some(d => d.unknown > 0) && (
          <Area
            type="monotone"
            dataKey="unknown"
            stackId="1"
            stroke={UNKNOWN_COLOR}
            fill={UNKNOWN_COLOR}
            fillOpacity={0.4}
            name="Unknown"
          />
        )}
        <Legend />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function WeeklyUsageChart({ data }: { data: Array<{ week: string; weekStart: string; gemini: number; platform: number; unknown: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No weekly data available yet.
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    label: d.weekStart.slice(5), // Show MM-DD
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260)" />
        <XAxis
          dataKey="label"
          tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.2 0.02 260)",
            border: "1px solid oklch(0.3 0.02 260)",
            borderRadius: "8px",
            color: "oklch(0.9 0 0)",
          }}
        />
        <Bar dataKey="gemini" stackId="a" fill={GEMINI_COLOR} name="Gemini" radius={[0, 0, 0, 0]} />
        <Bar dataKey="platform" stackId="a" fill={PLATFORM_COLOR} name="Platform LLM" radius={[4, 4, 0, 0]} />
        <Legend />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CostSavingsCard({ loading, data }: {
  loading: boolean;
  data?: {
    gemini: number;
    platform: number;
    unknown: number;
    total: number;
    platformCost: number;
    geminiCost: number;
    totalIfAllPlatform: number;
    actualCost: number;
    savings: number;
    savingsPercent: number;
  };
}) {
  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-500" />
          Estimated Cost Savings
        </CardTitle>
        <CardDescription>
          Rough estimates based on ~$0.01/doc (platform) vs ~$0.001/doc (Gemini)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">If all Platform</p>
            <p className="text-lg font-semibold text-red-400">${data.totalIfAllPlatform.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Actual Cost</p>
            <p className="text-lg font-semibold">${data.actualCost.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">You Saved</p>
            <p className="text-lg font-semibold text-emerald-500">${data.savings.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Savings Rate</p>
            <p className="text-lg font-semibold text-emerald-500">{data.savingsPercent}%</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: GEMINI_COLOR }} />
              Gemini: {data.gemini} docs (${data.geminiCost.toFixed(2)})
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLOR }} />
              Platform: {data.platform} docs (${data.platformCost.toFixed(2)})
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AiUsage() {
  const [timeRange, setTimeRange] = useState<"30" | "60" | "90">("30");

  const { data: summary, isLoading: summaryLoading } = trpc.aiUsage.summary.useQuery();
  const { data: daily, isLoading: dailyLoading } = trpc.aiUsage.daily.useQuery({ days: parseInt(timeRange) });
  const { data: weekly, isLoading: weeklyLoading } = trpc.aiUsage.weekly.useQuery({ weeks: 12 });
  const { data: costEstimate, isLoading: costLoading } = trpc.aiUsage.costEstimate.useQuery();
  const { data: fallback, isLoading: fallbackLoading } = trpc.aiUsage.fallbackEvents.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Usage Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track document processing by AI provider and monitor cost savings
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Owner Only
        </Badge>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Processed"
          value={summary?.total ?? 0}
          description="Documents processed by AI"
          icon={Activity}
          loading={summaryLoading}
        />
        <StatCard
          title="Gemini"
          value={summary?.gemini ?? 0}
          description="Processed with your API key"
          icon={Zap}
          loading={summaryLoading}
        />
        <StatCard
          title="Platform LLM"
          value={summary?.platform ?? 0}
          description="Processed with platform credits"
          icon={Server}
          loading={summaryLoading}
        />
        <StatCard
          title="Pre-Integration"
          value={summary?.unknown ?? 0}
          description="Before provider tracking"
          icon={Cpu}
          loading={summaryLoading}
        />
      </div>

      {/* Cost Savings */}
      <CostSavingsCard loading={costLoading} data={costEstimate ?? undefined} />

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Provider Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider Distribution</CardTitle>
            <CardDescription>Share of documents by AI provider</CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ProviderPieChart
                gemini={summary?.gemini ?? 0}
                platform={summary?.platform ?? 0}
                unknown={summary?.unknown ?? 0}
              />
            )}
          </CardContent>
        </Card>

        {/* Weekly Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Breakdown</CardTitle>
            <CardDescription>Documents processed per week (last 12 weeks)</CardDescription>
          </CardHeader>
          <CardContent>
            {weeklyLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <WeeklyUsageChart data={weekly ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Daily Trend</CardTitle>
            <CardDescription>Documents processed per day by provider</CardDescription>
          </div>
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as "30" | "60" | "90")}>
            <TabsList className="h-8">
              <TabsTrigger value="30" className="text-xs px-3 h-6">30d</TabsTrigger>
              <TabsTrigger value="60" className="text-xs px-3 h-6">60d</TabsTrigger>
              <TabsTrigger value="90" className="text-xs px-3 h-6">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {dailyLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <DailyUsageChart data={daily ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Fallback Alert */}
      {fallback && fallback.fallbackRate > 20 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-amber-500">
                  High Fallback Rate: {fallback.fallbackRate}% of recent documents used Platform LLM
                </p>
                <p className="text-muted-foreground">
                  In the last 7 days, {fallback.platformRecent} of {fallback.totalRecent} documents fell back to the platform LLM.
                  This may indicate Gemini rate limits or API issues. Consider checking your Gemini API quota at{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="underline text-amber-400 hover:text-amber-300">
                    Google AI Studio
                  </a>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Fallback Events */}
      <Card>
        <CardHeader>
          <div className="space-y-4">
            {/* Title and Description */}
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileWarning className="h-4 w-4" />
                Rate Limit Monitor
              </CardTitle>
              <CardDescription>Last 7 days — documents that fell back to Platform LLM</CardDescription>
            </div>
            
            {/* Buttons and Stats Row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <UpdateApiKeyButton />
                <TestConnectionButton />
              </div>
              {fallback && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-lg font-bold">{fallback.geminiRecent}</p>
                    <p className="text-xs text-muted-foreground">Gemini</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-orange-500">{fallback.platformRecent}</p>
                    <p className="text-xs text-muted-foreground">Platform</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${fallback.fallbackRate > 20 ? 'text-amber-500' : fallback.fallbackRate > 0 ? 'text-orange-400' : 'text-emerald-500'}`}>
                      {fallback.fallbackRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">Fallback</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* API Key and Quota Info */}
            <ApiKeyQuotaInfo />
          </div>
        </CardHeader>
        <CardContent>
          {fallbackLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : fallback && fallback.events.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {fallback.events.map((event) => (
                <div key={event.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Server className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="truncate">{event.fileName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-xs ${
                      event.status === 'completed' ? 'text-emerald-500 border-emerald-500/30' :
                      event.status === 'discarded' ? 'text-amber-500 border-amber-500/30' :
                      'text-red-500 border-red-500/30'
                    }`}>
                      {event.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.processedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Zap className="h-8 w-8 mb-2 text-emerald-500" />
              <p className="text-sm font-medium">No fallback events in the last 7 days</p>
              <p className="text-xs">All documents processed by Gemini successfully</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Note */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <strong>How it works:</strong> Documents are processed using Gemini 2.0 Flash first (your API key, no platform credits).
                If Gemini fails (rate limit, API error), the system automatically falls back to the platform LLM.
              </p>
              <p>
                <strong>Cost estimates</strong> are rough approximations. Platform cost ~$0.01/doc, Gemini ~$0.001/doc.
                Documents processed before the Gemini integration show as "Pre-Integration" (unknown provider).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
