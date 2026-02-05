import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Upload, 
  Users, 
  FileText, 
  Activity,
  AlertCircle,
  Clock,
  ChevronRight
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    enabled: user?.status === 'approved',
  });

  const { data: recentDocs } = trpc.documents.recent.useQuery(
    { limit: 5 },
    { 
      enabled: user?.status === 'approved',
      refetchInterval: 10000, // Auto-refresh every 10 seconds
    }
  );

  const { data: searchResults } = trpc.patients.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: user?.status === 'approved' && searchQuery.length >= 2 }
  );

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

  // Show banned message
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

  return (
    <div className="space-y-8">
      {/* Hero Search Section */}
      <div className="relative py-12 px-6 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-3xl font-bold tracking-tight">
            Virology Report Search
          </h1>
          <p className="text-muted-foreground">
            Search patients by Civil ID, name, or browse the complete database
          </p>
          
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
            <Button 
              type="submit" 
              className="w-full h-12"
              disabled={!searchQuery.trim()}
            >
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>

          {/* Quick Search Results */}
          {searchQuery.length >= 2 && searchResults && searchResults.patients.length > 0 && (
            <Card className="absolute left-0 right-0 top-full mt-2 z-50 max-h-80 overflow-auto">
              <CardContent className="p-2">
                {searchResults.patients.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => setLocation(`/patients/${patient.id}`)}
                    className="w-full flex items-center justify-between p-3 hover:bg-accent rounded-lg transition-colors text-left"
                  >
                    <div>
                      <p className="font-medium">{patient.name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">
                        Civil ID: {patient.civilId}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
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
            <div className="text-2xl font-bold">{stats?.totalPatients || 0}</div>
            <p className="text-xs text-muted-foreground">In database</p>
          </CardContent>
        </Card>

        <Card className="card-hover cursor-pointer" onClick={() => setLocation('/patients')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
            <Activity className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTests || 0}</div>
            <p className="text-xs text-muted-foreground">Virology results</p>
          </CardContent>
        </Card>

        <Card className="card-hover cursor-pointer" onClick={() => setLocation('/upload')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDocuments || 0}</div>
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

      {/* Quick Actions & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button 
              variant="outline" 
              className="justify-start h-auto py-4"
              onClick={() => setLocation('/upload')}
            >
              <Upload className="mr-3 h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-medium">Upload Reports</p>
                <p className="text-sm text-muted-foreground">
                  Upload single or bulk virology reports
                </p>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start h-auto py-4"
              onClick={() => setLocation('/patients')}
            >
              <Search className="mr-3 h-5 w-5 text-chart-2" />
              <div className="text-left">
                <p className="font-medium">Browse Patients</p>
                <p className="text-sm text-muted-foreground">
                  View all patients and their test history
                </p>
              </div>
            </Button>

            {user?.role === 'admin' && (
              <Button 
                variant="outline" 
                className="justify-start h-auto py-4"
                onClick={() => setLocation('/admin/users')}
              >
                <Users className="mr-3 h-5 w-5 text-chart-4" />
                <div className="text-left">
                  <p className="font-medium">User Management</p>
                  <p className="text-sm text-muted-foreground">
                    Approve users and manage access
                  </p>
                </div>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
            <CardDescription>Latest processed documents</CardDescription>
          </CardHeader>
          <CardContent>
            {recentDocs && recentDocs.length > 0 ? (
              <div className="space-y-3">
                {recentDocs.map((doc) => (
                  <div 
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {doc.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant={
                        doc.processingStatus === 'completed' ? 'default' :
                        doc.processingStatus === 'failed' ? 'destructive' :
                        doc.processingStatus === 'discarded' ? 'secondary' :
                        'outline'
                      }
                    >
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
