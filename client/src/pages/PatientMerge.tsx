import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  GitMerge,
  Search,
  AlertTriangle,
  ArrowRight,
  Users,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Wand2,
} from "lucide-react";

type Patient = {
  id: number;
  civilId: string;
  name: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  gender: string | null;
  passportNo: string | null;
  testCount?: number;
};

type DuplicateCandidate = {
  patient1: Patient;
  patient2: Patient;
  matchType: "civil_id";
  similarity: number;
  reason: string;
};

function PatientCard({
  patient,
  isTarget,
  isSource,
  onSelect,
  onRemove,
  compact,
}: {
  patient: Patient & { testCount?: number; recentTests?: any[] };
  isTarget?: boolean;
  isSource?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const borderColor = isTarget
    ? "border-emerald-500/50 bg-emerald-500/5"
    : isSource
    ? "border-orange-500/50 bg-orange-500/5"
    : "border-border hover:border-muted-foreground/30";

  return (
    <Card
      className={`transition-all ${borderColor} ${onSelect ? "cursor-pointer" : ""}`}
      onClick={onSelect}
    >
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isTarget && (
                <Badge variant="default" className="bg-emerald-600 text-xs shrink-0">
                  Primary
                </Badge>
              )}
              {isSource && (
                <Badge variant="default" className="bg-orange-600 text-xs shrink-0">
                  To Merge
                </Badge>
              )}
              <span className="font-semibold text-sm truncate">
                {patient.name || "Unknown"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-2">
              <div>
                <span className="text-muted-foreground/60">Civil ID:</span>{" "}
                <span className="text-foreground font-mono">{patient.civilId}</span>
              </div>
              <div>
                <span className="text-muted-foreground/60">DOB:</span>{" "}
                {patient.dateOfBirth || "—"}
              </div>
              <div>
                <span className="text-muted-foreground/60">Nationality:</span>{" "}
                {patient.nationality || "—"}
              </div>
              <div>
                <span className="text-muted-foreground/60">Gender:</span>{" "}
                {patient.gender || "—"}
              </div>
              {patient.passportNo && (
                <div className="col-span-2">
                  <span className="text-muted-foreground/60">Passport:</span>{" "}
                  {patient.passportNo}
                </div>
              )}
            </div>
            {patient.testCount !== undefined && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                <FileText className="h-3 w-3" />
                <span className="font-medium">{patient.testCount} test{patient.testCount !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PatientMerge() {
  const [activeTab, setActiveTab] = useState<"suggestions" | "manual" | "normalize">("suggestions");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [targetPatient, setTargetPatient] = useState<Patient | null>(null);
  const [sourcePatient, setSourcePatient] = useState<Patient | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastMergeResult, setLastMergeResult] = useState<{ testsReassigned: number } | null>(null);
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);
  const [showNormalizeResult, setShowNormalizeResult] = useState(false);

  // Debounce search
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => setDebouncedQuery(value), 300);
    setSearchTimer(timer);
  };

  const duplicatesQuery = trpc.findDuplicates.useQuery(undefined, {
    enabled: activeTab === "suggestions",
  });

  const searchResults = trpc.searchForMerge.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 && activeTab === "manual" }
  );

  const mergeMutation = trpc.mergePatients.useMutation({
    onSuccess: (result) => {
      setLastMergeResult(result);
      setShowConfirmDialog(false);
      setShowSuccessDialog(true);
      setTargetPatient(null);
      setSourcePatient(null);
      setMergeReason("");
      duplicatesQuery.refetch();
    },
    onError: (error) => {
      toast.error("Merge failed: " + error.message);
    },
  });

  const utils = trpc.useUtils();

  const normalizeMutation = trpc.autoNormalizeNames.useMutation({
    onSuccess: (result) => {
      setShowNormalizeResult(true);
      toast.success(`Normalized ${result.namesNormalized} of ${result.totalPatients} patient names`);
      utils.invalidate();
    },
    onError: (error) => {
      toast.error("Normalization failed: " + error.message);
    },
  });

  const handleMerge = () => {
    if (!targetPatient || !sourcePatient) return;
    mergeMutation.mutate({
      targetId: targetPatient.id,
      sourceId: sourcePatient.id,
      reason: mergeReason || undefined,
    });
  };

  const handleSuggestionMerge = (dup: DuplicateCandidate) => {
    setTargetPatient(dup.patient1);
    setSourcePatient(dup.patient2);
    setMergeReason(dup.reason);
    setShowConfirmDialog(true);
  };

  const handleSwapPatients = () => {
    const temp = targetPatient;
    setTargetPatient(sourcePatient);
    setSourcePatient(temp);
  };

  const selectingFor = useMemo(() => {
    if (activeTab !== "manual") return null;
    if (!targetPatient) return "target";
    if (!sourcePatient) return "source";
    return null;
  }, [activeTab, targetPatient, sourcePatient]);

  const handleSelectPatient = (patient: Patient) => {
    if (selectingFor === "target") {
      if (sourcePatient && sourcePatient.id === patient.id) {
        toast.error("Cannot select the same patient as both target and source");
        return;
      }
      setTargetPatient(patient);
    } else if (selectingFor === "source") {
      if (targetPatient && targetPatient.id === patient.id) {
        toast.error("Cannot select the same patient as both target and source");
        return;
      }
      setSourcePatient(patient);
    }
  };

  const matchTypeBadge = (type: string) => {
    return <Badge variant="destructive" className="text-xs">Civil ID Match</Badge>;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitMerge className="h-6 w-6 text-primary" />
          Patient Merge Tool
        </h1>
        <p className="text-muted-foreground mt-1">
          Identify and merge duplicate patient records. All test histories will be consolidated into the primary patient.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === "suggestions" ? "default" : "outline"}
          onClick={() => setActiveTab("suggestions")}
          size="sm"
        >
          <Users className="h-4 w-4 mr-1" />
          Duplicate Suggestions
        </Button>
        <Button
          variant={activeTab === "manual" ? "default" : "outline"}
          onClick={() => setActiveTab("manual")}
          size="sm"
        >
          <Search className="h-4 w-4 mr-1" />
          Manual Merge
        </Button>
        <Button
          variant={activeTab === "normalize" ? "default" : "outline"}
          onClick={() => setActiveTab("normalize")}
          size="sm"
        >
          <Wand2 className="h-4 w-4 mr-1" />
          Auto-Normalize Names
        </Button>
      </div>

      {/* Suggestions Tab */}
      {activeTab === "suggestions" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Potential Duplicates</CardTitle>
                <CardDescription>
                  Automatically detected patient records that may be duplicates based on Civil ID, name similarity, or matching date of birth.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => duplicatesQuery.refetch()}
                disabled={duplicatesQuery.isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${duplicatesQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {duplicatesQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Scanning for duplicates...
              </div>
            ) : duplicatesQuery.data && duplicatesQuery.data.length > 0 ? (
              <div className="space-y-3">
                {duplicatesQuery.data.map((dup, idx) => (
                  <Card key={idx} className="border-dashed">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {matchTypeBadge(dup.matchType)}
                          <span className="text-xs text-muted-foreground">
                            {dup.similarity}% match
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedSuggestion(expandedSuggestion === idx ? null : idx)
                          }
                        >
                          {expandedSuggestion === idx ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{dup.reason}</p>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                        <PatientCard patient={dup.patient1} compact />
                        <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                        <PatientCard patient={dup.patient2} compact />
                      </div>
                      {expandedSuggestion === idx && (
                        <div className="mt-4 flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTargetPatient(dup.patient1);
                              setSourcePatient(dup.patient2);
                              setActiveTab("manual");
                            }}
                          >
                            Review in Detail
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleSuggestionMerge(dup)}
                          >
                            <GitMerge className="h-4 w-4 mr-1" />
                            Merge (Keep Left)
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No duplicates detected</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  All patient records appear to be unique. Use Manual Merge to combine specific records.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Merge Tab */}
      {activeTab === "manual" && (
        <div className="space-y-4">
          {/* Selected Patients */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Merge Selection</CardTitle>
              <CardDescription>
                Select two patients to merge. The primary patient keeps their Civil ID; all tests from the secondary patient are transferred.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                {/* Target */}
                <div>
                  <p className="text-xs font-medium text-emerald-400 mb-2 uppercase tracking-wider">
                    Primary Patient (Kept)
                  </p>
                  {targetPatient ? (
                    <PatientCard
                      patient={targetPatient}
                      isTarget
                      onRemove={() => setTargetPatient(null)}
                    />
                  ) : (
                    <Card className="border-dashed border-emerald-500/30">
                      <CardContent className="p-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          {selectingFor === "target"
                            ? "Search and click a patient below to select"
                            : "Click to select primary patient"}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Swap Button */}
                <div className="flex items-center justify-center pt-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSwapPatients}
                    disabled={!targetPatient || !sourcePatient}
                    title="Swap patients"
                  >
                    <ArrowRight className="h-5 w-5 rotate-0 md:rotate-0" />
                  </Button>
                </div>

                {/* Source */}
                <div>
                  <p className="text-xs font-medium text-orange-400 mb-2 uppercase tracking-wider">
                    Secondary Patient (Merged & Deleted)
                  </p>
                  {sourcePatient ? (
                    <PatientCard
                      patient={sourcePatient}
                      isSource
                      onRemove={() => setSourcePatient(null)}
                    />
                  ) : (
                    <Card className="border-dashed border-orange-500/30">
                      <CardContent className="p-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          {selectingFor === "source"
                            ? "Search and click a patient below to select"
                            : "Select primary patient first"}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              {/* Merge Button */}
              {targetPatient && sourcePatient && (
                <div className="mt-4 flex justify-center">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setShowConfirmDialog(true)}
                  >
                    <GitMerge className="h-4 w-4 mr-2" />
                    Merge Patients
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Search Patients</CardTitle>
              <CardDescription>
                {selectingFor === "target"
                  ? "Search for the PRIMARY patient (will be kept)"
                  : selectingFor === "source"
                  ? "Search for the SECONDARY patient (will be merged into primary)"
                  : "Both patients selected. Clear one to search again."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Civil ID or patient name..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                  disabled={!selectingFor}
                />
              </div>

              {searchResults.isLoading && debouncedQuery ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Searching...
                </div>
              ) : searchResults.data && searchResults.data.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {searchResults.data.map((patient) => {
                    const isAlreadySelected =
                      patient.id === targetPatient?.id || patient.id === sourcePatient?.id;
                    return (
                      <div
                        key={patient.id}
                        className={isAlreadySelected ? "opacity-50" : ""}
                      >
                        <PatientCard
                          patient={patient}
                          compact
                          onSelect={
                            !isAlreadySelected && selectingFor
                              ? () => handleSelectPatient(patient)
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ) : debouncedQuery && !searchResults.isLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No patients found for "{debouncedQuery}"
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Auto-Normalize Names Tab */}
      {activeTab === "normalize" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Auto-Normalize Patient Names
            </CardTitle>
            <CardDescription>
              Standardize all patient names to Title Case (e.g., "YAQOUB MANDI KHALIFA" becomes "Yaqoub Mandi Khalifa").
              This also ensures future uploads always pick the most complete name for each Civil ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium">What this does:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Converts ALL CAPS names to Title Case (preserves Arabic particles like "al-")</li>
                <li>Trims extra whitespace and normalizes spacing</li>
                <li>Logs all changes to the audit trail</li>
                <li>Future uploads will automatically pick the longer/more complete name when the same Civil ID appears</li>
              </ul>
            </div>

            <Button
              onClick={() => normalizeMutation.mutate()}
              disabled={normalizeMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {normalizeMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Normalizing...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Run Name Normalization
                </>
              )}
            </Button>

            {normalizeMutation.data && showNormalizeResult && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{normalizeMutation.data.totalPatients}</div>
                    <div className="text-xs text-muted-foreground">Total Patients</div>
                  </div>
                  <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-400">{normalizeMutation.data.namesNormalized}</div>
                    <div className="text-xs text-muted-foreground">Names Updated</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{normalizeMutation.data.totalPatients - normalizeMutation.data.namesNormalized}</div>
                    <div className="text-xs text-muted-foreground">Already Correct</div>
                  </div>
                </div>

                {normalizeMutation.data.changes.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Changes Made ({normalizeMutation.data.changes.length}):</p>
                    <div className="max-h-80 overflow-y-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-medium">Civil ID</th>
                            <th className="text-left p-2 font-medium">Before</th>
                            <th className="text-left p-2 font-medium">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {normalizeMutation.data.changes.map((change, idx) => (
                            <tr key={idx} className="border-t border-border/50">
                              <td className="p-2 font-mono text-xs">{change.civilId}</td>
                              <td className="p-2 text-muted-foreground">{change.oldName || '—'}</td>
                              <td className="p-2 text-emerald-400 font-medium">{change.newName || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Patient Merge
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This action is <strong>irreversible</strong>. The following will happen:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>
                    All tests from <strong>{sourcePatient?.name || sourcePatient?.civilId}</strong>{" "}
                    will be transferred to <strong>{targetPatient?.name || targetPatient?.civilId}</strong>
                  </li>
                  <li>
                    Missing demographic info will be filled from the secondary patient
                  </li>
                  <li>
                    Patient <strong>{sourcePatient?.name || sourcePatient?.civilId}</strong>{" "}
                    (Civil ID: {sourcePatient?.civilId}) will be permanently deleted
                  </li>
                </ul>
                <div className="pt-2">
                  <label className="text-xs font-medium text-foreground">
                    Reason for merge (optional)
                  </label>
                  <Textarea
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    placeholder="e.g., Same patient with different Civil ID format"
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mergeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={mergeMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {mergeMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="h-4 w-4 mr-1" />
                  Confirm Merge
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Merge Successful</DialogTitle>
            <DialogDescription>
              {lastMergeResult && (
                <span>
                  Successfully merged patients. {lastMergeResult.testsReassigned} test
                  {lastMergeResult.testsReassigned !== 1 ? "s were" : " was"} transferred to the
                  primary patient record.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowSuccessDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
