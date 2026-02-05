import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ArrowLeft,
  User,
  Calendar,
  Globe,
  CreditCard,
  Activity,
  FileText,
  Clock,
  Loader2,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import { useLocation, useParams } from "wouter";

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
            <Badge variant="outline" className="text-sm">
              {tests?.length || 0} Test{tests?.length !== 1 ? 's' : ''} on Record
            </Badge>
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
