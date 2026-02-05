import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { 
  Users,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  History,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileText,
  AlertTriangle,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function UserManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [actionType, setActionType] = useState<'approve' | 'ban' | null>(null);
  const [reason, setReason] = useState('');
  const [reprocessStatuses, setReprocessStatuses] = useState<string[]>(['failed', 'discarded']);
  const [isReprocessing, setIsReprocessing] = useState(false);

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = trpc.users.list.useQuery(
    undefined,
    { enabled: user?.role === 'admin' }
  );

  const { data: auditLogs, isLoading: logsLoading } = trpc.users.auditLogs.useQuery(
    undefined,
    { enabled: user?.role === 'admin' }
  );

  const { data: docStats, isLoading: statsLoading, refetch: refetchStats } = trpc.documents.stats.useQuery(
    undefined,
    { enabled: user?.role === 'admin' }
  );

  const { data: failedDocs, isLoading: failedDocsLoading, refetch: refetchFailedDocs } = trpc.documents.getByStatus.useQuery(
    { statuses: ['failed', 'discarded'] },
    { enabled: user?.role === 'admin' }
  );

  const updateStatusMutation = trpc.users.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(`User ${actionType === 'approve' ? 'approved' : 'status updated'} successfully`);
      refetchUsers();
      closeDialog();
    },
    onError: (error) => {
      toast.error(`Failed to update user: ${error.message}`);
    }
  });

  const batchReprocessMutation = trpc.documents.batchReprocess.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setIsReprocessing(false);
      refetchStats();
      refetchFailedDocs();
    },
    onError: (error) => {
      toast.error(`Batch reprocess failed: ${error.message}`);
      setIsReprocessing(false);
    }
  });

  const reprocessSingleMutation = trpc.documents.reprocess.useMutation({
    onSuccess: () => {
      toast.success('Document queued for reprocessing');
      refetchStats();
      refetchFailedDocs();
    },
    onError: (error) => {
      toast.error(`Reprocess failed: ${error.message}`);
    }
  });

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page. Admin privileges are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation('/')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openDialog = (targetUser: any, action: 'approve' | 'ban') => {
    setSelectedUser(targetUser);
    setActionType(action);
    setReason('');
  };

  const closeDialog = () => {
    setSelectedUser(null);
    setActionType(null);
    setReason('');
  };

  const handleAction = () => {
    if (!selectedUser || !actionType) return;

    updateStatusMutation.mutate({
      userId: selectedUser.id,
      status: actionType === 'approve' ? 'approved' : 'banned',
      reason: reason || undefined,
    });
  };

  const handleBatchReprocess = () => {
    if (reprocessStatuses.length === 0) {
      toast.error('Please select at least one status to reprocess');
      return;
    }
    setIsReprocessing(true);
    batchReprocessMutation.mutate({
      statuses: reprocessStatuses as ('failed' | 'discarded')[],
      limit: 50,
    });
  };

  const handleSingleReprocess = (docId: number) => {
    reprocessSingleMutation.mutate({ documentId: docId });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'banned':
        return <Badge variant="destructive"><Ban className="mr-1 h-3 w-3" />Banned</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === 'admin') {
      return <Badge className="bg-purple-600"><Shield className="mr-1 h-3 w-3" />Admin</Badge>;
    }
    return <Badge variant="secondary">User</Badge>;
  };

  const getDocStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-600">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500">Processing</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'discarded':
        return <Badge variant="secondary">Discarded</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingUsers = users?.filter(u => u.status === 'pending') || [];
  const approvedUsers = users?.filter(u => u.status === 'approved') || [];
  const bannedUsers = users?.filter(u => u.status === 'banned') || [];

  const totalDocs = docStats?.total || 0;
  const completedPercent = totalDocs > 0 ? ((docStats?.completed || 0) / totalDocs) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage users, view audit history, and reprocess documents
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Users</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingUsers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approved Users</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedUsers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Docs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{docStats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{docStats?.completed || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{docStats?.failed || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Discarded</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{docStats?.discarded || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending Users
            {pendingUsers.length > 0 && (
              <span className="ml-2 bg-yellow-500 text-black text-xs px-1.5 py-0.5 rounded-full">
                {pendingUsers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Users</TabsTrigger>
          <TabsTrigger value="reprocess" className="relative">
            Batch Reprocess
            {((docStats?.failed || 0) + (docStats?.discarded || 0)) > 0 && (
              <span className="ml-2 bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">
                {(docStats?.failed || 0) + (docStats?.discarded || 0)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {/* Pending Users Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approval</CardTitle>
              <CardDescription>
                Users waiting for access approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingUsers.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="font-medium">{u.name || 'Unknown'}</div>
                          </TableCell>
                          <TableCell>{u.email || '-'}</TableCell>
                          <TableCell>
                            {new Date(u.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => openDialog(u, 'approve')}
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openDialog(u, 'ban')}
                              >
                                <Ban className="mr-1 h-4 w-4" />
                                Ban
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/50 mb-4" />
                  <h3 className="text-lg font-medium mb-1">All Caught Up</h3>
                  <p className="text-muted-foreground">
                    No users are waiting for approval
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Users Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>
                Complete list of registered users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : users && users.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="font-medium">{u.name || 'Unknown'}</div>
                          </TableCell>
                          <TableCell>{u.email || '-'}</TableCell>
                          <TableCell>{getRoleBadge(u.role)}</TableCell>
                          <TableCell>{getStatusBadge(u.status)}</TableCell>
                          <TableCell>
                            {new Date(u.lastSignedIn).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {u.id !== user?.id && (
                              <div className="flex justify-end gap-2">
                                {u.status !== 'approved' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openDialog(u, 'approve')}
                                  >
                                    Approve
                                  </Button>
                                )}
                                {u.status !== 'banned' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => openDialog(u, 'ban')}
                                  >
                                    Ban
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-1">No Users</h3>
                  <p className="text-muted-foreground">
                    No users have registered yet
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batch Reprocess Tab */}
        <TabsContent value="reprocess">
          <div className="space-y-6">
            {/* Processing Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Document Processing Overview
                </CardTitle>
                <CardDescription>
                  Monitor and reprocess failed or discarded documents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing Progress</span>
                        <span>{completedPercent.toFixed(1)}% completed</span>
                      </div>
                      <Progress value={completedPercent} className="h-2" />
                    </div>

                    <div className="grid gap-4 md:grid-cols-5">
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <div className="text-2xl font-bold text-yellow-500">{docStats?.pending || 0}</div>
                        <div className="text-sm text-muted-foreground">Pending</div>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <div className="text-2xl font-bold text-blue-500">{docStats?.processing || 0}</div>
                        <div className="text-sm text-muted-foreground">Processing</div>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <div className="text-2xl font-bold text-green-500">{docStats?.completed || 0}</div>
                        <div className="text-sm text-muted-foreground">Completed</div>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <div className="text-2xl font-bold text-destructive">{docStats?.failed || 0}</div>
                        <div className="text-sm text-muted-foreground">Failed</div>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50 text-center">
                        <div className="text-2xl font-bold text-muted-foreground">{docStats?.discarded || 0}</div>
                        <div className="text-sm text-muted-foreground">Discarded</div>
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h4 className="font-medium mb-4">Batch Reprocess Options</h4>
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="failed" 
                            checked={reprocessStatuses.includes('failed')}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setReprocessStatuses([...reprocessStatuses, 'failed']);
                              } else {
                                setReprocessStatuses(reprocessStatuses.filter(s => s !== 'failed'));
                              }
                            }}
                          />
                          <Label htmlFor="failed" className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-destructive" />
                            Failed Documents ({docStats?.failed || 0})
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="discarded" 
                            checked={reprocessStatuses.includes('discarded')}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setReprocessStatuses([...reprocessStatuses, 'discarded']);
                              } else {
                                setReprocessStatuses(reprocessStatuses.filter(s => s !== 'discarded'));
                              }
                            }}
                          />
                          <Label htmlFor="discarded" className="flex items-center gap-2">
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                            Discarded Documents ({docStats?.discarded || 0})
                          </Label>
                        </div>
                        <Button 
                          onClick={handleBatchReprocess}
                          disabled={isReprocessing || reprocessStatuses.length === 0}
                        >
                          {isReprocessing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Reprocess Selected (up to 50)
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Failed/Discarded Documents List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Failed & Discarded Documents
                </CardTitle>
                <CardDescription>
                  Documents that need attention or reprocessing
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failedDocsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : failedDocs && failedDocs.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error/Reason</TableHead>
                          <TableHead>Uploaded</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {failedDocs.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell>
                              <div className="font-medium truncate max-w-[200px]" title={doc.fileName}>
                                {doc.fileName}
                              </div>
                            </TableCell>
                            <TableCell>{getDocStatusBadge(doc.processingStatus || 'unknown')}</TableCell>
                            <TableCell>
                              <div className="text-sm text-muted-foreground truncate max-w-[300px]" title={doc.processingError || '-'}>
                                {doc.processingError || '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSingleReprocess(doc.id)}
                                disabled={reprocessSingleMutation.isPending}
                              >
                                <RefreshCw className="mr-1 h-4 w-4" />
                                Reprocess
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/50 mb-4" />
                    <h3 className="text-lg font-medium mb-1">All Documents Processed</h3>
                    <p className="text-muted-foreground">
                      No failed or discarded documents to reprocess
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Audit Log
              </CardTitle>
              <CardDescription>
                History of user management actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs && auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div 
                      key={log.id}
                      className="flex items-start gap-4 p-4 rounded-lg bg-muted/50"
                    >
                      <div className={`
                        h-10 w-10 rounded-full flex items-center justify-center shrink-0
                        ${log.action.includes('approved') ? 'bg-green-500/20' : 'bg-destructive/20'}
                      `}>
                        {log.action.includes('approved') ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Ban className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {log.action.replace('user_', 'User ').replace('_', ' ')}
                        </p>
                        {log.reason && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Reason: {log.reason}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-1">No Activity</h3>
                  <p className="text-muted-foreground">
                    No user management actions have been recorded yet
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!selectedUser && !!actionType} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve User' : 'Ban User'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' 
                ? `Grant ${selectedUser?.name || 'this user'} access to the virology dashboard?`
                : `Revoke ${selectedUser?.name || 'this user'}'s access to the virology dashboard?`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="font-medium">{selectedUser?.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">{selectedUser?.email || '-'}</p>
            </div>
            
            {actionType === 'ban' && (
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter reason for banning..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant={actionType === 'ban' ? 'destructive' : 'default'}
              onClick={handleAction}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : actionType === 'approve' ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              {actionType === 'approve' ? 'Approve' : 'Ban'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
