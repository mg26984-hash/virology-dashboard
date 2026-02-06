import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Search, Filter, ChevronRight, User, Calendar, X, Loader2,
  FlaskConical, FileText, Download,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";

export default function Patients() {
  const { user } = useAuth();
  // toast imported from sonner
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const initialQuery = urlParams.get("q") || "";

  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filters, setFilters] = useState({
    civilId: "", name: "", nationality: "", dateOfBirth: "",
    accessionDateFrom: "", accessionDateTo: "", testResult: "", testType: "",
  });
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: filterOptions } = trpc.patients.filterOptions.useQuery(undefined, {
    enabled: user?.status === "approved",
  });

  const queryParams = {
    query: searchQuery || undefined,
    civilId: filters.civilId || undefined,
    name: filters.name || undefined,
    nationality: filters.nationality || undefined,
    dateOfBirth: filters.dateOfBirth || undefined,
    accessionDateFrom: filters.accessionDateFrom || undefined,
    accessionDateTo: filters.accessionDateTo || undefined,
    testResult: filters.testResult || undefined,
    testType: filters.testType || undefined,
    limit: pageSize,
    offset: page * pageSize,
  };

  const { data, isLoading, isFetching } = trpc.patients.search.useQuery(queryParams, {
    enabled: user?.status === "approved",
  });

  const bulkPDFMutation = trpc.patients.bulkPDF.useMutation({
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
      toast.success(`Downloaded report for ${result.patientCount} patient(s) with ${result.totalTests} test(s).`);
    },
    onError: (err) => {
      toast.error(`Export failed: ${err.message}`);
    },
  });

  useEffect(() => {
    if (searchQuery) {
      setLocation(`/patients?q=${encodeURIComponent(searchQuery)}`, { replace: true });
    } else {
      setLocation("/patients", { replace: true });
    }
  }, [searchQuery, setLocation]);

  useEffect(() => { setSelectedIds(new Set()); }, [page, searchQuery, filters]);

  const clearFilters = () => {
    setFilters({ civilId: "", name: "", nationality: "", dateOfBirth: "", accessionDateFrom: "", accessionDateTo: "", testResult: "", testType: "" });
    setSearchQuery("");
    setPage(0);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v) || searchQuery;
  const hasDateRangeFilter = filters.accessionDateFrom || filters.accessionDateTo;
  const hasTestFilter = filters.testResult || filters.testType;
  const activeFilterCount = [filters.civilId, filters.name, filters.nationality, filters.dateOfBirth, hasDateRangeFilter ? "date" : "", filters.testResult, filters.testType].filter(Boolean).length;
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const currentPageIds = data?.patients.map((p) => p.id) || [];
  const allOnPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) { currentPageIds.forEach((id) => next.delete(id)); }
      else { currentPageIds.forEach((id) => next.add(id)); }
      return next;
    });
  }, [allOnPageSelected, currentPageIds]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return;
    bulkPDFMutation.mutate({ patientIds: Array.from(selectedIds) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients</h1>
          <p className="text-muted-foreground">Search and browse patient records</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={handleBulkExport} disabled={bulkPDFMutation.isPending} className="gap-2">
              {bulkPDFMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export PDF
              <Badge variant="secondary" className="ml-1">{selectedIds.size}</Badge>
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className={showFilters ? "bg-primary/10" : ""}>
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {activeFilterCount > 0 && <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input type="text" placeholder="Search by Civil ID or patient name..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} className="pl-10 h-12" />
        {searchQuery && (
          <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && !showFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.testResult && (
            <Badge variant="secondary" className="gap-1 pr-1">
              <FlaskConical className="h-3 w-3" /> Result: {filters.testResult}
              <button className="ml-1 hover:opacity-70" onClick={() => { setFilters((p) => ({ ...p, testResult: "" })); setPage(0); }}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.testType && (
            <Badge variant="secondary" className="gap-1 pr-1">
              <FileText className="h-3 w-3" /> Test: {filters.testType}
              <button className="ml-1 hover:opacity-70" onClick={() => { setFilters((p) => ({ ...p, testType: "" })); setPage(0); }}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.nationality && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Nationality: {filters.nationality}
              <button className="ml-1 hover:opacity-70" onClick={() => { setFilters((p) => ({ ...p, nationality: "" })); setPage(0); }}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {hasDateRangeFilter && (
            <Badge variant="secondary" className="gap-1 pr-1">
              <Calendar className="h-3 w-3" /> Date: {filters.accessionDateFrom || "..."} to {filters.accessionDateTo || "..."}
              <button className="ml-1 hover:opacity-70" onClick={() => { setFilters((p) => ({ ...p, accessionDateFrom: "", accessionDateTo: "" })); setPage(0); }}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-6">Clear all</Button>
        </div>
      )}

      {/* Advanced Filters */}
      {showFilters && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Advanced Filters</CardTitle>
              {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear All</Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="civilId">Civil ID</Label>
                <Input id="civilId" placeholder="Enter Civil ID" value={filters.civilId} onChange={(e) => { setFilters((p) => ({ ...p, civilId: e.target.value })); setPage(0); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Patient Name</Label>
                <Input id="name" placeholder="Enter name" value={filters.name} onChange={(e) => { setFilters((p) => ({ ...p, name: e.target.value })); setPage(0); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" placeholder="Enter nationality" value={filters.nationality} onChange={(e) => { setFilters((p) => ({ ...p, nationality: e.target.value })); setPage(0); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input id="dob" type="date" value={filters.dateOfBirth} onChange={(e) => { setFilters((p) => ({ ...p, dateOfBirth: e.target.value })); setPage(0); }} />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <FlaskConical className="h-4 w-4 text-primary" />
                <h4 className="font-medium">Test Filters</h4>
                {hasTestFilter && <Badge variant="outline" className="text-xs">Filtering by test data</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-4">Filter patients by their virology test results or test type</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Test Type</Label>
                  <Select value={filters.testType || "_all_"} onValueChange={(val) => { setFilters((p) => ({ ...p, testType: val === "_all_" ? "" : val })); setPage(0); }}>
                    <SelectTrigger><SelectValue placeholder="All test types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all_">All test types</SelectItem>
                      {filterOptions?.testTypes.filter((t) => t && t.trim()).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Test Result</Label>
                  <Select value={filters.testResult || "_all_"} onValueChange={(val) => { setFilters((p) => ({ ...p, testResult: val === "_all_" ? "" : val })); setPage(0); }}>
                    <SelectTrigger><SelectValue placeholder="All results" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all_">All results</SelectItem>
                      {filterOptions?.testResults.filter((r) => r && r.trim()).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-primary" />
                <h4 className="font-medium">Test Date Range</h4>
                {hasDateRangeFilter && <Badge variant="outline" className="text-xs">Filtering by test dates</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-4">Filter patients by the accession date of their virology tests</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dateFrom">From Date</Label>
                  <Input id="dateFrom" type="date" value={filters.accessionDateFrom} onChange={(e) => { setFilters((p) => ({ ...p, accessionDateFrom: e.target.value })); setPage(0); }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateTo">To Date</Label>
                  <Input id="dateTo" type="date" value={filters.accessionDateTo} onChange={(e) => { setFilters((p) => ({ ...p, accessionDateTo: e.target.value })); setPage(0); }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Results</CardTitle>
              <CardDescription>
                {data ? `${data.total} patients found` : "Loading..."}
                {hasDateRangeFilter && " (filtered by test date range)"}
                {hasTestFilter && " (filtered by test data)"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {selectedIds.size > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
              )}
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data && data.patients.length > 0 ? (
            <>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all patients on this page"
                        />
                      </TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Civil ID</TableHead>
                      <TableHead>Date of Birth</TableHead>
                      <TableHead>Nationality</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.patients.map((patient) => (
                      <TableRow
                        key={patient.id}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(patient.id) ? "bg-primary/5" : ""}`}
                        onClick={() => setLocation(`/patients/${patient.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(patient.id)}
                            onCheckedChange={() => toggleSelect(patient.id)}
                            aria-label={`Select ${patient.name || patient.civilId}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{patient.name || "Unknown"}</p>
                              {patient.gender && <p className="text-sm text-muted-foreground">{patient.gender}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">{patient.civilId}</code>
                        </TableCell>
                        <TableCell>{patient.dateOfBirth || "-"}</TableCell>
                        <TableCell>{patient.nationality || "-"}</TableCell>
                        <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.total)} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No patients found</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters ? "Try adjusting your search criteria" : "Upload virology reports to add patients to the database"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
