import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search, 
  Filter,
  ChevronRight,
  User,
  Calendar,
  X,
  Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

export default function Patients() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  
  // Parse initial query from URL
  const urlParams = new URLSearchParams(searchParams);
  const initialQuery = urlParams.get('q') || '';

  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filters, setFilters] = useState({
    civilId: '',
    name: '',
    nationality: '',
    dateOfBirth: '',
    accessionDateFrom: '',
    accessionDateTo: '',
  });
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Build query params
  const queryParams = {
    query: searchQuery || undefined,
    civilId: filters.civilId || undefined,
    name: filters.name || undefined,
    nationality: filters.nationality || undefined,
    dateOfBirth: filters.dateOfBirth || undefined,
    accessionDateFrom: filters.accessionDateFrom || undefined,
    accessionDateTo: filters.accessionDateTo || undefined,
    limit: pageSize,
    offset: page * pageSize,
  };

  const { data, isLoading, isFetching } = trpc.patients.search.useQuery(queryParams, {
    enabled: user?.status === 'approved',
  });

  // Update URL when search changes
  useEffect(() => {
    if (searchQuery) {
      setLocation(`/patients?q=${encodeURIComponent(searchQuery)}`, { replace: true });
    } else {
      setLocation('/patients', { replace: true });
    }
  }, [searchQuery, setLocation]);

  const clearFilters = () => {
    setFilters({
      civilId: '',
      name: '',
      nationality: '',
      dateOfBirth: '',
      accessionDateFrom: '',
      accessionDateTo: '',
    });
    setSearchQuery('');
    setPage(0);
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || searchQuery;
  const hasDateRangeFilter = filters.accessionDateFrom || filters.accessionDateTo;

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients</h1>
          <p className="text-muted-foreground">
            Search and browse patient records
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className={showFilters ? 'bg-primary/10' : ''}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2">Active</Badge>
          )}
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by Civil ID or patient name..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
          className="pl-10 h-12"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => setSearchQuery('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Advanced Filters</CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Patient Info Filters */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="civilId">Civil ID</Label>
                <Input
                  id="civilId"
                  placeholder="Enter Civil ID"
                  value={filters.civilId}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, civilId: e.target.value }));
                    setPage(0);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Patient Name</Label>
                <Input
                  id="name"
                  placeholder="Enter name"
                  value={filters.name}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, name: e.target.value }));
                    setPage(0);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality</Label>
                <Input
                  id="nationality"
                  placeholder="Enter nationality"
                  value={filters.nationality}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, nationality: e.target.value }));
                    setPage(0);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={filters.dateOfBirth}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, dateOfBirth: e.target.value }));
                    setPage(0);
                  }}
                />
              </div>
            </div>

            {/* Date Range Filters */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-primary" />
                <h4 className="font-medium">Test Date Range</h4>
                {hasDateRangeFilter && (
                  <Badge variant="outline" className="text-xs">
                    Filtering by test dates
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Filter patients by the accession date of their virology tests
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dateFrom">From Date</Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={filters.accessionDateFrom}
                    onChange={(e) => {
                      setFilters(prev => ({ ...prev, accessionDateFrom: e.target.value }));
                      setPage(0);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateTo">To Date</Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={filters.accessionDateTo}
                    onChange={(e) => {
                      setFilters(prev => ({ ...prev, accessionDateTo: e.target.value }));
                      setPage(0);
                    }}
                  />
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
                {data ? `${data.total} patients found` : 'Loading...'}
                {hasDateRangeFilter && ' (filtered by test date range)'}
              </CardDescription>
            </div>
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
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
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setLocation(`/patients/${patient.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {patient.name || 'Unknown'}
                              </p>
                              {patient.gender && (
                                <p className="text-sm text-muted-foreground">
                                  {patient.gender}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {patient.civilId}
                          </code>
                        </TableCell>
                        <TableCell>
                          {patient.dateOfBirth || '-'}
                        </TableCell>
                        <TableCell>
                          {patient.nationality || '-'}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No patients found</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters 
                  ? 'Try adjusting your search criteria'
                  : 'Upload virology reports to add patients to the database'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
