import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDateTime, relativeTime } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft,
  User,
  Calendar,
  Globe,
  CreditCard,
  Activity,
  Loader2,
  AlertTriangle,
  TrendingUp,
  FileDown,
  Printer,
  Pencil,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useMemo, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";

// Color palette for different test types
const TEST_TYPE_COLORS: Record<string, string> = {
  'Cytomegalovirus (CMV) DNA in Blood': '#3b82f6',
  'Polyomaviruses (BKV & JCV) DNA in Urine': '#8b5cf6',
  'Epstein-Barr Virus (EBV) DNA in Blood': '#10b981',
  'Adenovirus DNA in Blood': '#f59e0b',
  'Human Herpesvirus 6 (HHV-6) DNA in Blood': '#ef4444',
  'Parvovirus B19 DNA in Blood': '#ec4899',
  'default': '#6b7280'
};

// Abbreviate long test type names for compact legend display
function abbreviateTestType(name: string): string {
  return name
    .replace('Hepatitis B Virus (HBV) ', 'HBV ')
    .replace('Hepatitis C Virus (HCV) ', 'HCV ')
    .replace('Hepatitis B Virus ', 'HBV ')
    .replace('Hepatitis C Virus ', 'HCV ')
    .replace('Herpes Simplex Virus (HSV) ', 'HSV ')
    .replace('Human Immunodeficiency Virus (HIV) ', 'HIV ')
    .replace('Varicella Zoster Virus (VZV) ', 'VZV ')
    .replace('Cytomegalovirus (CMV) ', 'CMV ')
    .replace('Epstein-Barr Virus (EBV) ', 'EBV ')
    .replace('Human Herpesvirus 6 (HHV-6) ', 'HHV-6 ')
    .replace('Polyomaviruses (BKV & JCV) ', 'BKV/JCV ')
    .replace('Parvovirus B19 ', 'Parvo B19 ')
    .replace('Adenovirus ', 'Adeno ')
    .replace(' in Blood', '')
    .replace(' in Urine', ' (Urine)')
    .replace('Antibody - ', '')
    .replace('Antigen - ', '')
    .replace('Surface Antibodies - ', '')
    .replace('Surface Antigen - ', '')
    .replace('Core IgM Antibody - ', 'Core IgM - ')
    .replace('Core Total Antibody - ', 'Core Total - ');
}

// Custom tooltip for chart
function ChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg p-3 shadow-lg max-w-[280px]">
        <p className="font-medium mb-2 text-sm">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs mb-1">
            <div 
              className="w-2.5 h-2.5 rounded-full shrink-0" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground truncate">{abbreviateTestType(entry.name)}:</span>
            <span className="font-mono whitespace-nowrap">
              {entry.value != null && entry.value < 1
                ? 'ND' 
                : entry.value >= 50000000 
                  ? '>50M' 
                  : entry.value?.toLocaleString() || 'N/A'
              }
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// Extracted Viral Load Trend Card - mobile-friendly with collapsible legend
function ViralLoadTrendCard({ chartData }: { chartData: { data: Record<string, any>[]; testTypes: string[] } }) {
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const visibleTypes = chartData.testTypes.filter(t => !hiddenTypes.has(t));
  const showToggle = chartData.testTypes.length > 3;
  const displayedTypes = showToggle && !legendExpanded 
    ? chartData.testTypes.slice(0, 3) 
    : chartData.testTypes;

  const toggleType = (testType: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(testType)) {
        next.delete(testType);
      } else {
        // Don't allow hiding all types
        if (visibleTypes.length > 1) {
          next.add(testType);
        }
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Viral Load Trends
        </CardTitle>
        <CardDescription>
          Track viral load changes over time for each test type
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Compact interactive legend */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {displayedTypes.map((testType) => {
              const color = TEST_TYPE_COLORS[testType] || TEST_TYPE_COLORS.default;
              const isHidden = hiddenTypes.has(testType);
              return (
                <button
                  key={testType}
                  onClick={() => toggleType(testType)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all border ${
                    isHidden 
                      ? 'opacity-40 bg-muted border-transparent line-through' 
                      : 'bg-muted/50 border-border hover:bg-muted'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate max-w-[180px]">{abbreviateTestType(testType)}</span>
                </button>
              );
            })}
          </div>
          {showToggle && (
            <button
              onClick={() => setLegendExpanded(!legendExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {legendExpanded ? (
                <><ChevronUp className="h-3.5 w-3.5" /> Show fewer</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> +{chartData.testTypes.length - 3} more test types</>
              )}
            </button>
          )}
        </div>

        {/* Chart */}
        <div className="h-[250px] sm:h-[320px] w-full -ml-2 sm:ml-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData.data}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                scale="log"
                domain={[0.5, 'auto']}
                allowDataOverflow={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                width={45}
                tickFormatter={(value) => {
                  if (value < 1) return 'ND';
                  if (value >= 1000000) return `${value / 1000000}M`;
                  if (value >= 1000) return `${value / 1000}K`;
                  return value.toString();
                }}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine 
                y={1000} 
                stroke="#22c55e" 
                strokeDasharray="5 5" 
                label={{ value: 'Low', fill: '#22c55e', fontSize: 10 }}
              />
              {visibleTypes.map((testType) => (
                <Line
                  key={testType}
                  type="monotone"
                  dataKey={testType}
                  name={testType}
                  stroke={TEST_TYPE_COLORS[testType] || TEST_TYPE_COLORS.default}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          "ND" = Not Detected. Values above 50M = above max detection. Tap legend to toggle.
        </p>
      </CardContent>
    </Card>
  );
}

export default function PatientDetail() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id || '0');

  const { data: patient, isLoading: patientLoading } = trpc.patients.getById.useQuery(
    { id: patientId },
    { enabled: user?.status === 'approved' && patientId > 0 }
  );

  const { data: tests, isLoading: testsLoading } = trpc.patients.getTests.useQuery(
    { patientId },
    { enabled: user?.status === 'approved' && patientId > 0 }
  );

  const isLoading = patientLoading || testsLoading;
  const isAdmin = user?.role === 'admin';

  // Edit demographics state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    dateOfBirth: '',
    nationality: '',
    gender: '',
    passportNo: '',
  });

  const utils = trpc.useUtils();
  const updateDemographics = trpc.patients.updateDemographics.useMutation({
    onSuccess: () => {
      toast.success('Patient demographics updated');
      utils.patients.getById.invalidate({ id: patientId });
      setEditOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update demographics');
    },
  });

  const openEditDialog = useCallback(() => {
    if (patient) {
      setEditForm({
        name: patient.name || '',
        dateOfBirth: patient.dateOfBirth || '',
        nationality: patient.nationality || '',
        gender: patient.gender || '',
        passportNo: patient.passportNo || '',
      });
      setEditOpen(true);
    }
  }, [patient]);

  const handleSaveEdit = useCallback(() => {
    updateDemographics.mutate({
      patientId,
      name: editForm.name || null,
      dateOfBirth: editForm.dateOfBirth || null,
      nationality: editForm.nationality || null,
      gender: editForm.gender || null,
      passportNo: editForm.passportNo || null,
    });
  }, [patientId, editForm, updateDemographics]);

  // PDF generation mutation
  const pdfMutation = trpc.patients.generatePDF.useMutation({
    onSuccess: (result) => {
      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`PDF report downloaded (${result.testCount} tests)`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate PDF");
    },
  });

  const handleDownloadPDF = useCallback(() => {
    if (patientId > 0) {
      pdfMutation.mutate({ patientId });
    }
  }, [patientId, pdfMutation]);

  // Process tests for chart data
  const chartData = useMemo(() => {
    if (!tests || tests.length === 0) return { data: [], testTypes: [] };

    // Group tests by date and test type
    const testTypes = Array.from(new Set(tests.map(t => t.testType)));
    
    // Sort tests by date
    const sortedTests = [...tests].sort((a, b) => {
      const dateA = a.accessionDate ? new Date(a.accessionDate).getTime() : 0;
      const dateB = b.accessionDate ? new Date(b.accessionDate).getTime() : 0;
      return dateA - dateB;
    });

    // Create chart data points
    const dataMap = new Map<string, Record<string, number | string | null>>();
    
    sortedTests.forEach(test => {
      if (!test.accessionDate) return;
      
      const dateKey = new Date(test.accessionDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit'
      });
      
      if (!dataMap.has(dateKey)) {
        dataMap.set(dateKey, { date: dateKey });
      }
      
      const entry = dataMap.get(dateKey)!;
      
      // Parse viral load
      // Note: log scale cannot display 0, so "Not Detected" uses 0.5 as a floor value
      let viralLoadValue: number | null = null;
      if (test.viralLoad) {
        const cleanValue = test.viralLoad.replace(/[^0-9.>]/g, '');
        if (test.viralLoad.includes('>')) {
          // Above max detection - use a high value
          viralLoadValue = parseFloat(cleanValue) || 50000000;
        } else {
          const parsed = parseFloat(cleanValue);
          viralLoadValue = parsed > 0 ? parsed : null;
        }
      } else if (test.result.toLowerCase().includes('not detected') || 
                 test.result.toLowerCase().includes('negative')) {
        // Use 0.5 as floor for log scale (displayed as "ND" in tooltip)
        viralLoadValue = 0.5;
      }
      
      entry[test.testType] = viralLoadValue;
    });

    return {
      data: Array.from(dataMap.values()),
      testTypes
    };
  }, [tests]);

  // Check if there's meaningful chart data for a trend line
  // Requires at least one test type with 2+ data points where at least one has a quantitative value > 0
  // Hides chart when: only qualitative results, single data point, or no real viral load values
  const hasChartData = useMemo(() => {
    if (chartData.data.length < 2) return false;
    
    return chartData.testTypes.some(testType => {
      const dataPoints = chartData.data.filter(d => d[testType] !== undefined && d[testType] !== null);
      if (dataPoints.length < 2) return false;
      // At least one data point must have a real quantitative value > 0.5 (0.5 = ND floor)
      return dataPoints.some(d => typeof d[testType] === 'number' && (d[testType] as number) > 0.5);
    });
  }, [chartData]);

  // Helper to determine viral load severity
  const getViralLoadBadge = (viralLoad: string | null, result: string) => {
    if (!viralLoad) {
      if (result.toLowerCase().includes('not detected') || result.toLowerCase().includes('negative')) {
        return <Badge className="bg-green-600">Not Detected</Badge>;
      }
      return <Badge variant="secondary">See Result</Badge>;
    }

    const numericValue = parseFloat(viralLoad.replace(/[^0-9.]/g, ''));
    const isAboveMax = viralLoad.includes('>');

    if (isAboveMax || numericValue > 10000000) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Very High
        </Badge>
      );
    } else if (numericValue > 1000000) {
      return <Badge className="bg-orange-500">High</Badge>;
    } else if (numericValue > 1000) {
      return <Badge className="bg-yellow-500 text-black">Moderate</Badge>;
    } else if (numericValue > 0) {
      return <Badge className="bg-blue-500">Low</Badge>;
    } else {
      return <Badge className="bg-green-600">Undetectable</Badge>;
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setLocation('/patients')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patients
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Patient Not Found</h3>
            <p className="text-muted-foreground">
              The requested patient record could not be found.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => setLocation('/patients')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Patients
      </Button>

      {/* Patient Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl sm:text-2xl break-words">
                {patient.name || 'Unknown Patient'}
              </CardTitle>
              <CardDescription className="mt-1">
                Civil ID: <code className="bg-muted px-2 py-0.5 rounded">{patient.civilId}</code>
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Badge variant="outline" className="text-sm">
                {tests?.length || 0} Test{tests?.length !== 1 ? 's' : ''} on Record
              </Badge>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditDialog}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={pdfMutation.isPending}
              >
                {pdfMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileDown className="mr-2 h-3.5 w-3.5" />
                    Download PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date of Birth</p>
                <p className="font-medium">{patient.dateOfBirth || 'Not recorded'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Globe className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nationality</p>
                <p className="font-medium">{patient.nationality || 'Not recorded'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gender</p>
                <p className="font-medium">{patient.gender || 'Not recorded'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Passport No.</p>
                <p className="font-medium">{patient.passportNo || 'Not recorded'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Viral Load Trend Chart */}
      {hasChartData && <ViralLoadTrendCard chartData={chartData} />}

      {/* Test History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Virology Test History
          </CardTitle>
          <CardDescription>
            Complete record of all virology tests for this patient
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tests && tests.length > 0 ? (
            <div className="space-y-4">
              {tests.map((test) => (
                <div 
                  key={test.id}
                  className="p-4 rounded-lg border bg-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                        style={{ 
                          backgroundColor: TEST_TYPE_COLORS[test.testType] || TEST_TYPE_COLORS.default 
                        }}
                      />
                      <div className="min-w-0">
                        <h4 className="font-semibold text-base sm:text-lg break-words">{test.testType}</h4>
                        <p className="text-sm text-muted-foreground">
                          {test.accessionDate 
                            ? new Date(test.accessionDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Date not recorded'
                          }
                        </p>
                      </div>
                    </div>
                    {getViralLoadBadge(test.viralLoad, test.result)}
                  </div>

                  <Separator className="my-3" />

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Result</p>
                      <p className="font-medium">{test.result}</p>
                    </div>

                    {test.viralLoad && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Viral Load</p>
                        <p className="font-medium font-mono">
                          {test.viralLoad} {test.unit || 'Copies/mL'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 mt-4 pt-3 border-t border-border/50">
                    {test.sampleNo && (
                      <div>
                        <p className="text-xs text-muted-foreground">Sample No.</p>
                        <p className="text-sm font-mono">{test.sampleNo}</p>
                      </div>
                    )}
                    {test.accessionNo && (
                      <div>
                        <p className="text-xs text-muted-foreground">Accession No.</p>
                        <p className="text-sm font-mono">{test.accessionNo}</p>
                      </div>
                    )}
                    {test.departmentNo && (
                      <div>
                        <p className="text-xs text-muted-foreground">Department No.</p>
                        <p className="text-sm font-mono">{test.departmentNo}</p>
                      </div>
                    )}
                    {test.location && (
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="text-sm">{test.location}</p>
                      </div>
                    )}
                    {test.signedBy && (
                      <div>
                        <p className="text-xs text-muted-foreground">Signed By</p>
                        <p className="text-sm">{test.signedBy}</p>
                      </div>
                    )}
                    {test.signedAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">Signed At</p>
                        <p className="text-sm">
                          {formatDateTime(test.signedAt)}
                          <span className="text-xs text-muted-foreground ml-1">({relativeTime(test.signedAt)})</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No Tests Recorded</h3>
              <p className="text-muted-foreground">
                No virology tests have been recorded for this patient yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Demographics Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Patient Demographics</DialogTitle>
            <DialogDescription>
              Update patient information. Civil ID cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Patient full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dob">Date of Birth</Label>
              <Input
                id="edit-dob"
                value={editForm.dateOfBirth}
                onChange={(e) => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                placeholder="e.g. 24/05/1977"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-nationality">Nationality</Label>
              <Select
                value={editForm.nationality || 'none'}
                onValueChange={(val) => setEditForm(prev => ({ ...prev, nationality: val === 'none' ? '' : val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select nationality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not recorded</SelectItem>
                  <SelectItem value="Kuwaiti">Kuwaiti</SelectItem>
                  <SelectItem value="Non-Kuwaiti">Non-Kuwaiti</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gender">Gender</Label>
              <Select
                value={editForm.gender || 'none'}
                onValueChange={(val) => setEditForm(prev => ({ ...prev, gender: val === 'none' ? '' : val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not recorded</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-passport">Passport No.</Label>
              <Input
                id="edit-passport"
                value={editForm.passportNo}
                onChange={(e) => setEditForm(prev => ({ ...prev, passportNo: e.target.value }))}
                placeholder="Passport number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateDemographics.isPending}>
              {updateDemographics.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
