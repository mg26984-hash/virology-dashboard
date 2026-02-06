import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Printer
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
      let viralLoadValue: number | null = null;
      if (test.viralLoad) {
        const cleanValue = test.viralLoad.replace(/[^0-9.>]/g, '');
        if (test.viralLoad.includes('>')) {
          // Above max detection - use a high value
          viralLoadValue = parseFloat(cleanValue) || 50000000;
        } else {
          viralLoadValue = parseFloat(cleanValue) || null;
        }
      } else if (test.result.toLowerCase().includes('not detected') || 
                 test.result.toLowerCase().includes('negative')) {
        viralLoadValue = 0;
      }
      
      entry[test.testType] = viralLoadValue;
    });

    return {
      data: Array.from(dataMap.values()),
      testTypes
    };
  }, [tests]);

  // Check if there's meaningful chart data (at least 2 data points with viral load)
  const hasChartData = useMemo(() => {
    if (chartData.data.length < 2) return false;
    
    // Check if any test type has at least 2 non-null values
    return chartData.testTypes.some(testType => {
      const values = chartData.data.filter(d => d[testType] !== undefined && d[testType] !== null);
      return values.length >= 2;
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

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-mono">
                {entry.value === 0 
                  ? 'Not Detected' 
                  : entry.value >= 50000000 
                    ? '>50M' 
                    : entry.value?.toLocaleString() || 'N/A'
                } {entry.value > 0 ? 'copies/mL' : ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
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
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl">
                {patient.name || 'Unknown Patient'}
              </CardTitle>
              <CardDescription className="mt-1">
                Civil ID: <code className="bg-muted px-2 py-0.5 rounded">{patient.civilId}</code>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm">
                {tests?.length || 0} Test{tests?.length !== 1 ? 's' : ''} on Record
              </Badge>
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
      {hasChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Viral Load Trends
            </CardTitle>
            <CardDescription>
              Track viral load changes over time for each test type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData.data}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    scale="log"
                    domain={[1, 100000000]}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => {
                      if (value >= 1000000) return `${value / 1000000}M`;
                      if (value >= 1000) return `${value / 1000}K`;
                      return value.toString();
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) => (
                      <span className="text-sm text-foreground">{value}</span>
                    )}
                  />
                  <ReferenceLine 
                    y={1000} 
                    stroke="#22c55e" 
                    strokeDasharray="5 5" 
                    label={{ value: 'Low threshold', fill: '#22c55e', fontSize: 10 }}
                  />
                  {chartData.testTypes.map((testType) => (
                    <Line
                      key={testType}
                      type="monotone"
                      dataKey={testType}
                      name={testType}
                      stroke={TEST_TYPE_COLORS[testType] || TEST_TYPE_COLORS.default}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Note: "Not Detected" results are shown as 0 on the chart. Values above 50M indicate results above maximum detection limit.
            </p>
          </CardContent>
        </Card>
      )}

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
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ 
                          backgroundColor: TEST_TYPE_COLORS[test.testType] || TEST_TYPE_COLORS.default 
                        }}
                      />
                      <div>
                        <h4 className="font-semibold text-lg">{test.testType}</h4>
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

                  <div className="grid gap-4 md:grid-cols-2">
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

                  <div className="grid gap-4 md:grid-cols-3 mt-4 pt-3 border-t border-border/50">
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
                          {new Date(test.signedAt).toLocaleDateString()}
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
    </div>
  );
}
