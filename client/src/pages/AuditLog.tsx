import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  ShieldCheck,
  FileDown,
  FileText,
  Ban,
  UserCog,
  ClipboardList,
} from "lucide-react";
import { useState } from "react";

interface AuditLogEntry {
  id: number;
  action: string;
  userId: number;
  targetUserId: number | null;
  reason: string | null;
  metadata: string | null;
  createdAt: string | Date;
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: typeof Ban }> = {
  document_cancel: { label: "Document Cancel", color: "text-red-400 bg-red-400/10 border-red-400/30", icon: Ban },
  document_cancel_batch: { label: "Batch Cancel", color: "text-red-400 bg-red-400/10 border-red-400/30", icon: Ban },
  pdf_export: { label: "PDF Export", color: "text-blue-400 bg-blue-400/10 border-blue-400/30", icon: FileText },
  excel_export: { label: "Excel Export", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", icon: FileDown },
  user_approved: { label: "User Approved", color: "text-green-400 bg-green-400/10 border-green-400/30", icon: UserCog },
  user_banned: { label: "User Banned", color: "text-orange-400 bg-orange-400/10 border-orange-400/30", icon: UserCog },
  user_pending: { label: "User Pending", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30", icon: UserCog },
};

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString();
}

function parseMetadata(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

function MetadataDisplay({ metadata }: { metadata: string | null }) {
  const parsed = parseMetadata(metadata);
  if (!parsed) return <span className="text-muted-foreground">-</span>;

  const entries = Object.entries(parsed);
  return (
    <div className="space-y-0.5">
      {entries.map(([key, value]) => {
        // Skip large nested objects
        if (typeof value === "object" && value !== null) {
          const nested = value as Record<string, unknown>;
          const summary = Object.entries(nested)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          return (
            <div key={key} className="text-xs">
              <span className="text-muted-foreground">{key}:</span>{" "}
              <span className="text-foreground">{summary || "-"}</span>
            </div>
          );
        }
        return (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{key}:</span>{" "}
            <span className="text-foreground">{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLog() {
  const { user } = useAuth();
  const [actionFilter, setActionFilter] = useState<string>("_all_");

  const { data: logs, isLoading } = trpc.users.auditLogs.useQuery(
    {
      limit: 200,
      actionFilter: actionFilter === "_all_" ? undefined : actionFilter,
    },
    { enabled: user?.role === "admin" }
  );

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">Admin Access Required</h3>
          <p className="text-muted-foreground">
            You need administrator privileges to view audit logs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground">
            Track all cancellations, exports, and user management actions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={actionFilter}
            onValueChange={setActionFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all_">All Actions</SelectItem>
              <SelectItem value="cancel">Cancellations</SelectItem>
              <SelectItem value="pdf_export">PDF Exports</SelectItem>
              <SelectItem value="excel_export">Excel Exports</SelectItem>
              <SelectItem value="user_">User Management</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {logs && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{(logs as AuditLogEntry[]).length}</p>
                </div>
                <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cancellations</p>
                  <p className="text-2xl font-bold text-red-400">
                    {(logs as AuditLogEntry[]).filter((l: AuditLogEntry) => l.action.includes("cancel")).length}
                  </p>
                </div>
                <Ban className="h-8 w-8 text-red-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">PDF Exports</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {(logs as AuditLogEntry[]).filter((l: AuditLogEntry) => l.action === "pdf_export").length}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-blue-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Excel Exports</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {(logs as AuditLogEntry[]).filter((l: AuditLogEntry) => l.action === "excel_export").length}
                  </p>
                </div>
                <FileDown className="h-8 w-8 text-emerald-400/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            {logs ? `${(logs as AuditLogEntry[]).length} events recorded` : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[160px]">Action</TableHead>
                    <TableHead className="w-[100px]">User ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logs as AuditLogEntry[]).map((log: AuditLogEntry) => {
                    const actionInfo = ACTION_LABELS[log.action] || {
                      label: log.action,
                      color: "text-muted-foreground bg-muted border-border",
                      icon: ClipboardList,
                    };
                    const Icon = actionInfo.icon;

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`gap-1 ${actionInfo.color}`}
                          >
                            <Icon className="h-3 w-3" />
                            {actionInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {log.userId}
                          </code>
                          {log.targetUserId && (
                            <span className="text-xs text-muted-foreground ml-1">
                              → {log.targetUserId}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <MetadataDisplay metadata={log.metadata} />
                          {log.reason && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Reason: {log.reason}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No audit events</h3>
              <p className="text-muted-foreground">
                {actionFilter !== "_all_"
                  ? "No events match the selected filter"
                  : "Audit events will appear here as users perform actions"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
