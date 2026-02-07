import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Search, 
  Upload, 
  Users, 
  FileText, 
  Activity,
  AlertCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Globe,
  CalendarIcon,
  X,
  Download,
  Loader2,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import ProcessingQueue from "@/components/ProcessingQueue";
import ProcessingHistoryChart from "@/components/ProcessingHistoryChart";
import { format, subMonths, subDays, subWeeks } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

// Chart color palette matching the theme
const CHART_COLORS = [
  "oklch(0.65 0.18 175)",
  "oklch(0.6 0.15 200)",
  "oklch(0.55 0.12 230)",
  "oklch(0.7 0.14 150)",
  "oklch(0.75 0.16 100)",
  "oklch(0.6 0.18 30)",
  "oklch(0.55 0.2 330)",
  "oklch(0.65 0.15 280)",
  "oklch(0.7 0.1 60)",
  "oklch(0.5 0.15 250)",
];

// Normalize result values into 3 categories for the pie chart
function normalizeResultCategory(result: string): 'Positive' | 'Negative' | 'Not Available' {
  const r = result.toLowerCase().trim();
  // Positive: reactive, detected, positive, BK virus detected, etc.
  if (
    r === 'positive' ||
    r === 'reactive' ||
    r.startsWith('reactive,') ||
    r.includes('detected') && !r.includes('not detected') ||
    r === 'bk virus detected' ||
    r.startsWith('bk virus detected')
  ) return 'Positive';
  // Negative: not detected, negative, non reactive, etc.
  if (
    r === 'negative' ||
    r === 'not detected' ||
    r === 'non reactive' ||
    r === 'nonreactive' ||
    r === 'non-reactive'
  ) return 'Negative';
  // Everything else: Not Available, R NR IND, empty, unknown
  return 'Not Available';
}

// Normalize test type names for the bar chart display
function normalizeTestType(testType: string): string {
  const t = testType.trim();
  if (!t || t.length <= 3) return 'Unknown Test';
  // Truncated/garbage values
  if (['IgG', 'IgM', 'Ab', 'V Ab'].includes(t)) return 'Unknown Test';
  // Colon variant
  if (t === 'Human Immunodeficiency Virus (HIV) RNA: Quantitation (Viral Load)') {
    return 'Human Immunodeficiency Virus (HIV) RNA Quantitation (Viral Load)';
  }
  // Unspecified specimen
  if (t === 'Polyomaviruses (BKV & JCV) DNA') {
    return 'Polyomaviruses (BKV & JCV) DNA (Unspecified)';
  }
  return t;
}

// Preset date ranges
const DATE_PRESETS = [
  { label: "Last 30 days", getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "Last 3 months", getValue: () => ({ from: subMonths(new Date(), 3), to: new Date() }) },
  { label: "Last 6 months", getValue: () => ({ from: subMonths(new Date(), 6), to: new Date() }) },
  { label: "Last 12 months", getValue: () => ({ from: subMonths(new Date(), 12), to: new Date() }) },
  { label: "This year", getValue: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: new Date() }) },
  { label: "All time", getValue: () => ({ from: undefined as Date | undefined, to: undefined as Date | undefined }) },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-card-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-card-foreground">{payload[0].name}</p>
      <p className="text-sm text-muted-foreground">
        Count: <span className="font-semibold text-card-foreground">{payload[0].value.toLocaleString()}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Share: <span className="font-semibold text-card-foreground">{(payload[0].percent * 100).toFixed(1)}%</span>
      </p>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activePreset, setActivePreset] = useState("All time");
  const [compareMode, setCompareMode] = useState(false);
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>(undefined);
  const [compareCalendarOpen, setCompareCalendarOpen] = useState(false);
  const [comparePreset, setComparePreset] = useState("");

  const isApproved = user?.status === 'approved';

  // Convert date range to string params for API
  const dateParams = useMemo(() => {
    if (!dateRange?.from && !dateRange?.to) return undefined;
    return {
      from: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
      to: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
    };
  }, [dateRange]);

  const compareDateParams = useMemo(() => {
    if (!compareMode || !compareDateRange?.from) return undefined;
    return {
      from: compareDateRange?.from ? format(compareDateRange.from, 'yyyy-MM-dd') : undefined,
      to: compareDateRange?.to ? format(compareDateRange.to, 'yyyy-MM-dd') : undefined,
    };
  }, [compareMode, compareDateRange]);

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    enabled: isApproved,
  });

  const { data: recentDocs } = trpc.documents.recent.useQuery(
    { limit: 5 },
    { enabled: isApproved, refetchInterval: 10000 }
  );


  // Debounced autocomplete
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.length >= 2) {
      debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    } else {
      setDebouncedQuery("");
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const { data: autocompleteResults } = trpc.patients.autocomplete.useQuery(
    { query: debouncedQuery },
    { enabled: isApproved && debouncedQuery.length >= 2 }
  );

  // Analytics queries with date range
  const { data: volumeData } = trpc.dashboard.testVolumeByMonth.useQuery(dateParams, {
    enabled: isApproved,
  });

  const { data: rawResultData } = trpc.dashboard.resultDistribution.useQuery(dateParams, {
    enabled: isApproved,
  });

  // Group raw result data into 3 categories for pie chart
  const resultData = useMemo(() => {
    if (!rawResultData) return undefined;
    const grouped: Record<string, number> = { Positive: 0, Negative: 0, 'Not Available': 0 };
    for (const item of rawResultData) {
      const category = normalizeResultCategory(item.result);
      grouped[category] += item.count;
    }
    return Object.entries(grouped)
      .filter(([, count]) => count > 0)
      .map(([result, count]) => ({ result, count }))
      .sort((a, b) => b.count - a.count);
  }, [rawResultData]);

  const { data: topTests } = trpc.dashboard.topTestTypes.useQuery(
    dateParams ? { ...dateParams } : undefined,
    { enabled: isApproved }
  );

  const { data: nationalityData } = trpc.dashboard.testsByNationality.useQuery(
    dateParams ? { ...dateParams } : undefined,
    { enabled: isApproved }
  );

  // Comparison period queries
  const { data: compareVolumeData } = trpc.dashboard.testVolumeByMonth.useQuery(compareDateParams, {
    enabled: isApproved && !!compareDateParams,
  });
  const { data: compareRawResultData } = trpc.dashboard.resultDistribution.useQuery(compareDateParams, {
    enabled: isApproved && !!compareDateParams,
  });
  const { data: compareTopTests } = trpc.dashboard.topTestTypes.useQuery(
    compareDateParams ? { ...compareDateParams } : undefined,
    { enabled: isApproved && !!compareDateParams }
  );
  const { data: compareNationalityData } = trpc.dashboard.testsByNationality.useQuery(
    compareDateParams ? { ...compareDateParams } : undefined,
    { enabled: isApproved && !!compareDateParams }
  );

  // Compute comparison result data
  const compareResultData = useMemo(() => {
    if (!compareRawResultData) return undefined;
    const grouped: Record<string, number> = { Positive: 0, Negative: 0, 'Not Available': 0 };
    for (const item of compareRawResultData) {
      const category = normalizeResultCategory(item.result);
      grouped[category] += item.count;
    }
    return Object.entries(grouped)
      .filter(([, count]) => count > 0)
      .map(([result, count]) => ({ result, count }))
      .sort((a, b) => b.count - a.count);
  }, [compareRawResultData]);

  const compareFormattedTopTests = useMemo(() => {
    if (!compareTopTests) return [];
    const grouped: Record<string, number> = {};
    for (const d of compareTopTests) {
      const normalized = normalizeTestType(d.testType);
      grouped[normalized] = (grouped[normalized] || 0) + d.count;
    }
    return Object.entries(grouped)
      .map(([testType, count]) => ({ testType, count, shortName: testType.length > 35 ? testType.substring(0, 32) + '...' : testType }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [compareTopTests]);

  const formattedVolumeData = useMemo(() => {
    if (!volumeData) return [];
    return volumeData.map((d: any) => ({
      ...d,
      label: new Date(d.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    }));
  }, [volumeData]);

  const formattedTopTests = useMemo(() => {
    if (!topTests) return [];
    // Group by normalized test type name
    const grouped: Record<string, number> = {};
    for (const d of topTests) {
      const normalized = normalizeTestType(d.testType);
      grouped[normalized] = (grouped[normalized] || 0) + d.count;
    }
    return Object.entries(grouped)
      .map(([testType, count]) => ({
        testType,
        count,
        shortName: testType.length > 35 ? testType.substring(0, 32) + '...' : testType,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [topTests]);

  const handlePreset = useCallback((preset: typeof DATE_PRESETS[0]) => {
    const value = preset.getValue();
    setActivePreset(preset.label);
    if (!value.from && !value.to) {
      setDateRange(undefined);
    } else {
      setDateRange({ from: value.from, to: value.to });
    }
    setCalendarOpen(false);
  }, []);

  const clearDateRange = useCallback(() => {
    setDateRange(undefined);
    setActivePreset("All time");
  }, []);

  const generateReport = trpc.dashboard.generateReport.useMutation({
    onSuccess: async (data) => {
      try {
        // Fetch the PDF as a blob to avoid popup blockers
        const response = await fetch(data.url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `dashboard-report-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        toast.success('Dashboard report downloaded successfully');
      } catch {
        // Fallback: use window.location to navigate directly
        window.location.href = data.url;
        toast.success('Dashboard report generated successfully');
      }
    },
    onError: (err) => {
      toast.error(`Failed to generate report: ${err.message}`);
    },
  });

  const handleDownloadReport = useCallback(() => {
    generateReport.mutate(dateParams ?? undefined);
  }, [dateParams, generateReport]);

  // Show pending approval message
  if (user?.status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Account Pending Approval</CardTitle>
            <CardDescription>
              Your account is awaiting administrator approval. You will be notified once your access has been granted.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user.name}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user?.status === 'banned') {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Card className="max-w-md w-full border-destructive">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              Your account has been suspended. Please contact an administrator for assistance.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/patients?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const dateRangeLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, 'MMM d, yyyy')} – ${format(dateRange.to, 'MMM d, yyyy')}`
      : `From ${format(dateRange.from, 'MMM d, yyyy')}`
    : "All time";

  return (
    <div className="space-y-8">
      {/* Hero Search Section */}
      <div className="relative py-12 px-6 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-3xl font-bold tracking-tight">Virology Report Search</h1>
          <p className="text-muted-foreground">Search patients by Civil ID, name, or browse the complete database</p>
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by Civil ID or patient name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 h-14 text-lg bg-background/80 backdrop-blur border-primary/30 focus:border-primary"
              />
            </div>
            <Button type="submit" className="w-full h-12" disabled={!searchQuery.trim()}>
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>
          {searchQuery.length >= 2 && autocompleteResults && autocompleteResults.length > 0 && (
            <Card className="absolute left-0 right-0 top-full mt-2 z-50 max-h-80 overflow-auto shadow-lg border-primary/20">
              <CardContent className="p-2">
                {autocompleteResults.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => setLocation(`/patients/${patient.id}`)}
                    className="w-full flex items-center justify-between p-3 hover:bg-accent rounded-lg transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{patient.name || 'Unknown'}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Civil ID: {patient.civilId || 'N/A'}</span>
                        {patient.nationality && (
                          <Badge variant="outline" className="text-xs">{patient.nationality}</Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
                <button
                  onClick={handleSearch}
                  className="w-full p-2 text-sm text-primary hover:bg-accent rounded-lg transition-colors text-center mt-1"
                >
                  View all results for "{searchQuery}"
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-hover cursor-pointer" onClick={() => setLocation('/patients')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPatients?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">In database</p>
          </CardContent>
        </Card>
        <Card className="card-hover cursor-pointer" onClick={() => setLocation('/patients')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
            <Activity className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTests?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Virology results</p>
          </CardContent>
        </Card>
        <Card className="card-hover cursor-pointer" onClick={() => setLocation('/upload')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDocuments?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Uploaded reports</p>
          </CardContent>
        </Card>
        <Card className="card-hover cursor-pointer" onClick={() => setLocation('/upload')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-chart-5" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingDocuments || 0}</div>
            <p className="text-xs text-muted-foreground">Processing queue</p>
          </CardContent>
        </Card>
      </div>

      {/* Real-Time Processing Queue */}
      <ProcessingQueue />

      {/* Processing History Chart */}
      <ProcessingHistoryChart />

      {/* Date Range Picker for Analytics */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Analytics</CardTitle>
              <CardDescription>{dateRange?.from ? dateRangeLabel : "Showing all-time data"}</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant={activePreset === preset.label ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => handlePreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={activePreset === "Custom" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Custom
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      setActivePreset("Custom");
                      if (range?.from && range?.to) {
                        setCalendarOpen(false);
                      }
                    }}
                    numberOfMonths={2}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
              {dateRange?.from && (
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={clearDateRange}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 gap-1.5 ml-1"
                onClick={handleDownloadReport}
                disabled={generateReport.isPending}
              >
                {generateReport.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {generateReport.isPending ? 'Generating...' : 'Download Report'}
              </Button>
              <Button
                variant={compareMode ? "default" : "outline"}
                size="sm"
                className="text-xs h-8 gap-1.5"
                onClick={() => {
                  setCompareMode(!compareMode);
                  if (compareMode) {
                    setCompareDateRange(undefined);
                    setComparePreset("");
                  }
                }}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {compareMode ? 'Exit Compare' : 'Compare'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Compare Period Picker */}
      {compareMode && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-orange-400" />
                  Comparison Period
                </CardTitle>
                <CardDescription>
                  {compareDateRange?.from
                    ? compareDateRange.to
                      ? `${format(compareDateRange.from, 'MMM d, yyyy')} \u2013 ${format(compareDateRange.to, 'MMM d, yyyy')}`
                      : `From ${format(compareDateRange.from, 'MMM d, yyyy')}`
                    : "Select a period to compare against"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { label: "Previous 30 days", getValue: () => ({ from: subDays(dateRange?.from ?? new Date(), 30), to: dateRange?.from ?? new Date() }) },
                  { label: "Previous 3 months", getValue: () => ({ from: subMonths(dateRange?.from ?? new Date(), 3), to: dateRange?.from ?? new Date() }) },
                  { label: "Previous 6 months", getValue: () => ({ from: subMonths(dateRange?.from ?? new Date(), 6), to: dateRange?.from ?? new Date() }) },
                  { label: "Previous year", getValue: () => ({ from: subMonths(dateRange?.from ?? new Date(), 12), to: dateRange?.from ?? new Date() }) },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant={comparePreset === preset.label ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => {
                      const value = preset.getValue();
                      setCompareDateRange({ from: value.from, to: value.to });
                      setComparePreset(preset.label);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Popover open={compareCalendarOpen} onOpenChange={setCompareCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant={comparePreset === "Custom" ? "default" : "outline"} size="sm" className="text-xs h-8 gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      Custom
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={compareDateRange}
                      onSelect={(range) => {
                        setCompareDateRange(range);
                        setComparePreset("Custom");
                        if (range?.from && range?.to) setCompareCalendarOpen(false);
                      }}
                      numberOfMonths={2}
                      disabled={{ after: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
                {compareDateRange?.from && (
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setCompareDateRange(undefined); setComparePreset(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Charts Row 1: Volume Trend + Result Distribution */}
      {compareMode && compareDateParams ? (
        <div className="space-y-6">
          {/* Comparison: Result Distribution side by side */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-primary/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Current Period</CardTitle>
                    <CardDescription>{dateRangeLabel}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {resultData && resultData.length > 0 ? (
                  <div className="space-y-3">
                    {resultData.map((item: any, index: number) => {
                      const compareItem = compareResultData?.find((c: any) => c.result === item.result);
                      const diff = compareItem ? item.count - compareItem.count : 0;
                      const pct = compareItem && compareItem.count > 0 ? ((diff / compareItem.count) * 100).toFixed(1) : null;
                      return (
                        <div key={item.result} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span className="text-sm font-medium">{item.result}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold tabular-nums text-lg">{item.count.toLocaleString()}</span>
                            {pct && (
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-red-500/20 text-red-400' : diff < 0 ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                                {diff > 0 ? '+' : ''}{pct}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Total</span>
                        <span className="font-bold text-foreground">{resultData.reduce((s: number, i: any) => s + i.count, 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-orange-500/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-orange-400" />
                  <div>
                    <CardTitle className="text-base">Comparison Period</CardTitle>
                    <CardDescription>
                      {compareDateRange?.from && compareDateRange?.to
                        ? `${format(compareDateRange.from, 'MMM d, yyyy')} \u2013 ${format(compareDateRange.to, 'MMM d, yyyy')}`
                        : "Select comparison dates"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {compareResultData && compareResultData.length > 0 ? (
                  <div className="space-y-3">
                    {compareResultData.map((item: any, index: number) => {
                      const currentItem = resultData?.find((c: any) => c.result === item.result);
                      const diff = currentItem ? currentItem.count - item.count : 0;
                      return (
                        <div key={item.result} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span className="text-sm font-medium">{item.result}</span>
                          </div>
                          <span className="font-bold tabular-nums text-lg">{item.count.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Total</span>
                        <span className="font-bold text-foreground">{compareResultData.reduce((s: number, i: any) => s + i.count, 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data for comparison period</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Comparison: Top Test Types side by side */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-primary/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Top Tests - Current</CardTitle>
                    <CardDescription>{dateRangeLabel}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {formattedTopTests.length > 0 ? (
                  <div className="space-y-2">
                    {formattedTopTests.slice(0, 8).map((item: any, index: number) => {
                      const maxCount = formattedTopTests[0]?.count || 1;
                      const compareItem = compareFormattedTopTests.find((c: any) => c.testType === item.testType);
                      const diff = compareItem ? item.count - compareItem.count : 0;
                      const pct = compareItem && compareItem.count > 0 ? ((diff / compareItem.count) * 100).toFixed(0) : null;
                      return (
                        <div key={item.testType} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground truncate max-w-[200px]" title={item.testType}>{item.shortName}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-medium tabular-nums">{item.count}</span>
                              {pct && (
                                <span className={`text-xs px-1 py-0.5 rounded ${diff > 0 ? 'bg-red-500/20 text-red-400' : diff < 0 ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                                  {diff > 0 ? '+' : ''}{pct}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(item.count / maxCount) * 100}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-orange-500/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-orange-400" />
                  <div>
                    <CardTitle className="text-base">Top Tests - Comparison</CardTitle>
                    <CardDescription>
                      {compareDateRange?.from && compareDateRange?.to
                        ? `${format(compareDateRange.from, 'MMM d, yyyy')} \u2013 ${format(compareDateRange.to, 'MMM d, yyyy')}`
                        : "Comparison period"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {compareFormattedTopTests.length > 0 ? (
                  <div className="space-y-2">
                    {compareFormattedTopTests.slice(0, 8).map((item: any, index: number) => {
                      const maxCount = compareFormattedTopTests[0]?.count || 1;
                      return (
                        <div key={item.testType} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground truncate max-w-[200px]" title={item.testType}>{item.shortName}</span>
                            <span className="font-medium tabular-nums">{item.count}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(item.count / maxCount) * 100}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          {/* Normal mode: Volume Trend + Result Distribution */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Test Volume Trend</CardTitle>
                    <CardDescription>Monthly test count</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {formattedVolumeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={formattedVolumeData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.65 0.18 175)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="oklch(0.65 0.18 175)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260)" />
                      <XAxis dataKey="label" tick={{ fill: 'oklch(0.65 0.02 260)', fontSize: 12 }} axisLine={{ stroke: 'oklch(0.3 0.02 260)' }} tickLine={false} />
                      <YAxis tick={{ fill: 'oklch(0.65 0.02 260)', fontSize: 12 }} axisLine={{ stroke: 'oklch(0.3 0.02 260)' }} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="count" name="Tests" stroke="oklch(0.65 0.18 175)" strokeWidth={2} fill="url(#volumeGradient)" dot={{ fill: 'oklch(0.65 0.18 175)', r: 3 }} activeDot={{ r: 5, stroke: 'oklch(0.65 0.18 175)', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                    <div className="text-center">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No test data available for this period</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-chart-2" />
                  <div>
                    <CardTitle>Result Distribution</CardTitle>
                    <CardDescription>Positive / Negative / Not Available</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {resultData && resultData.length > 0 ? (
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={resultData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="result">
                          {resultData.map((_: any, index: number) => (
                            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                      {resultData.map((item: any, index: number) => (
                        <div key={item.result} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span className="text-muted-foreground truncate max-w-[140px]" title={item.result}>{item.result}</span>
                          </div>
                          <span className="font-medium tabular-nums">{item.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                    <div className="text-center">
                      <PieChartIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No result data for this period</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Normal mode: Top Test Types + Nationality */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-chart-3" />
                  <div>
                    <CardTitle>Top Test Types</CardTitle>
                    <CardDescription>Most frequently ordered tests</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {formattedTopTests.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(280, formattedTopTests.length * 32)}>
                    <BarChart data={formattedTopTests} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'oklch(0.65 0.02 260)', fontSize: 12 }} axisLine={{ stroke: 'oklch(0.3 0.02 260)' }} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="shortName" width={200} tick={{ fill: 'oklch(0.65 0.02 260)', fontSize: 11 }} axisLine={{ stroke: 'oklch(0.3 0.02 260)' }} tickLine={false} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-card px-3 py-2 shadow-lg max-w-xs">
                            <p className="text-sm font-medium text-card-foreground break-words">{d.testType}</p>
                            <p className="text-sm text-muted-foreground">Count: <span className="font-semibold text-card-foreground">{d.count.toLocaleString()}</span></p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="count" name="Tests" radius={[0, 4, 4, 0]}>
                        {formattedTopTests.map((_: any, index: number) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No test type data for this period</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-chart-4" />
                  <div>
                    <CardTitle>Tests by Nationality</CardTitle>
                    <CardDescription>Patient nationality distribution</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {nationalityData && nationalityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={nationalityData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260)" />
                      <XAxis dataKey="nationality" tick={{ fill: 'oklch(0.65 0.02 260)', fontSize: 11 }} axisLine={{ stroke: 'oklch(0.3 0.02 260)' }} tickLine={false} angle={-45} textAnchor="end" interval={0} height={80} />
                      <YAxis tick={{ fill: 'oklch(0.65 0.02 260)', fontSize: 12 }} axisLine={{ stroke: 'oklch(0.3 0.02 260)' }} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Tests" radius={[4, 4, 0, 0]}>
                        {nationalityData.map((_: any, index: number) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                    <div className="text-center">
                      <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No nationality data for this period</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}


      {/* Quick Actions & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" className="justify-start h-auto py-4" onClick={() => setLocation('/upload')}>
              <Upload className="mr-3 h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-medium">Upload Reports</p>
                <p className="text-sm text-muted-foreground">Upload single or bulk virology reports</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4" onClick={() => setLocation('/patients')}>
              <Search className="mr-3 h-5 w-5 text-chart-2" />
              <div className="text-left">
                <p className="font-medium">Browse Patients</p>
                <p className="text-sm text-muted-foreground">View all patients and their test history</p>
              </div>
            </Button>
            {user?.role === 'admin' && (
              <Button variant="outline" className="justify-start h-auto py-4" onClick={() => setLocation('/admin/users')}>
                <Users className="mr-3 h-5 w-5 text-chart-4" />
                <div className="text-left">
                  <p className="font-medium">User Management</p>
                  <p className="text-sm text-muted-foreground">Approve users and manage access</p>
                </div>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
            <CardDescription>Latest processed documents</CardDescription>
          </CardHeader>
          <CardContent>
            {recentDocs && recentDocs.length > 0 ? (
              <div className="space-y-3">
                {recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">{doc.fileName}</p>
                        <p className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={
                      doc.processingStatus === 'completed' ? 'default' :
                      doc.processingStatus === 'failed' ? 'destructive' :
                      doc.processingStatus === 'discarded' ? 'secondary' : 'outline'
                    }>
                      {doc.processingStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No documents uploaded yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
