import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  RotateCcw,
  Table2,
  Users,
  ShieldAlert,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const ALL_VALUE = "__all__";

export default function Export() {
  const { user } = useAuth();

  // Filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [testType, setTestType] = useState(ALL_VALUE);
  const [nationality, setNationality] = useState(ALL_VALUE);
  const [civilId, setCivilId] = useState("");
  const [patientName, setPatientName] = useState("");

  // Debounced text inputs for preview
  const [debouncedCivilId, setDebouncedCivilId] = useState("");
  const [debouncedPatientName, setDebouncedPatientName] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCivilId(civilId), 500);
    return () => clearTimeout(t);
  }, [civilId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPatientName(patientName), 500);
    return () => clearTimeout(t);
  }, [patientName]);

  // Build filter object
  const filters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      testType: testType !== ALL_VALUE ? testType : undefined,
      nationality: nationality !== ALL_VALUE ? nationality : undefined,
      civilId: debouncedCivilId || undefined,
      patientName: debouncedPatientName || undefined,
    }),
    [dateFrom, dateTo, testType, nationality, debouncedCivilId, debouncedPatientName]
  );

  // Fetch filter options
  const { data: filterOptions, isLoading: loadingOptions } =
    trpc.export.filterOptions.useQuery();

  // Preview row count (use placeholderData to keep previous result while refetching)
  const prevPreviewRef = useRef<{ rowCount: number } | undefined>(undefined);
  const { data: preview, isLoading: loadingPreview } =
    trpc.export.preview.useQuery(filters, {
      placeholderData: prevPreviewRef.current,
    });
  // Keep track of last successful data
  useEffect(() => {
    if (preview) prevPreviewRef.current = preview;
  }, [preview]);

  // Generate mutation
  const generateMutation = trpc.export.generate.useMutation({
    onSuccess: (result) => {
      // Convert base64 to blob and trigger download
      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported ${result.rowCount} records (${result.uniquePatients} patients)`
      );
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleExport = useCallback(() => {
    generateMutation.mutate({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      testType: testType !== ALL_VALUE ? testType : undefined,
      nationality: nationality !== ALL_VALUE ? nationality : undefined,
      civilId: civilId || undefined,
      patientName: patientName || undefined,
    });
  }, [dateFrom, dateTo, testType, nationality, civilId, patientName, generateMutation]);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setTestType(ALL_VALUE);
    setNationality(ALL_VALUE);
    setCivilId("");
    setPatientName("");
  };

  const hasFilters =
    dateFrom || dateTo || testType !== ALL_VALUE || nationality !== ALL_VALUE || civilId || patientName;

  // Non-admin guard
  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Admin Access Required</h2>
            <p className="text-muted-foreground">
              The data export feature is only available to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Export Data</h1>
        <p className="text-muted-foreground">
          Export patient and test data to Excel with optional filters. The export includes a
          detailed results sheet and a summary statistics sheet.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Narrow down the data to export. Leave all empty to export everything.
            </CardDescription>
          </div>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <RotateCcw className="mr-2 h-3 w-3" />
              Clear All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Date Range */}
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            {/* Test Type */}
            <div className="space-y-2">
              <Label>Test Type</Label>
              <Select value={testType} onValueChange={setTestType}>
                <SelectTrigger>
                  <SelectValue placeholder="All test types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All test types</SelectItem>
                  {filterOptions?.testTypes.filter(t => t && t.trim()).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nationality */}
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Select value={nationality} onValueChange={setNationality}>
                <SelectTrigger>
                  <SelectValue placeholder="All nationalities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All nationalities</SelectItem>
                  {filterOptions?.nationalities.filter(n => n && n.trim()).map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Civil ID */}
            <div className="space-y-2">
              <Label htmlFor="civilId">Civil ID</Label>
              <Input
                id="civilId"
                placeholder="Search by Civil ID..."
                value={civilId}
                onChange={(e) => setCivilId(e.target.value)}
              />
            </div>

            {/* Patient Name */}
            <div className="space-y-2">
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                placeholder="Search by name..."
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview & Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Export Preview
          </CardTitle>
          <CardDescription>
            Review the data count before generating the Excel file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Stats */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Test Records</p>
                  <p className="text-2xl font-bold">
                    {loadingPreview ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      (preview?.rowCount ?? 0).toLocaleString()
                    )}
                  </p>
                </div>
              </div>
              {hasFilters && (
                <Badge variant="secondary" className="text-xs">
                  Filtered
                </Badge>
              )}
            </div>

            {/* Export button */}
            <Button
              size="lg"
              onClick={handleExport}
              disabled={
                generateMutation.isPending ||
                loadingPreview ||
                (preview?.rowCount ?? 0) === 0
              }
              className="min-w-[200px]"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export to Excel
                </>
              )}
            </Button>
          </div>

          {(preview?.rowCount ?? 0) === 0 && !loadingPreview && (
            <p className="text-sm text-muted-foreground mt-4">
              No records match the current filters. Adjust or clear filters to include data.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export Info */}
      <Card>
        <CardHeader>
          <CardTitle>Export Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Sheet 1: Test Results</h4>
              <p className="text-sm text-muted-foreground">
                Contains one row per test result with full patient demographics (Civil ID, name,
                DOB, nationality, gender, passport) and test details (type, result, viral load,
                accession date, signed by, location). Headers are frozen and auto-filtered for
                easy sorting.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Sheet 2: Summary Statistics</h4>
              <p className="text-sm text-muted-foreground">
                Provides aggregate counts: total records, unique patients, breakdown by test type,
                and breakdown by nationality. Also records which filters were applied and the
                export timestamp for audit purposes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
