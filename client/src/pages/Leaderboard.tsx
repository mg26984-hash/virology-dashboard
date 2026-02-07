import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp, Activity, ChevronRight, Flame, AlertTriangle, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { formatDateTime } from "@/lib/dateUtils";

function formatViralLoad(value: string): string {
  const num = parseInt(value.replace(/,/g, "").trim(), 10);
  if (isNaN(num)) return value;
  return num.toLocaleString();
}

function getViralLoadSeverity(value: string): "critical" | "high" | "moderate" | "low" {
  const num = parseInt(value.replace(/,/g, "").trim(), 10);
  if (isNaN(num)) return "low";
  if (num >= 1_000_000) return "critical";
  if (num >= 100_000) return "high";
  if (num >= 10_000) return "moderate";
  return "low";
}

function getSeverityColor(severity: "critical" | "high" | "moderate" | "low") {
  switch (severity) {
    case "critical": return "text-red-500 dark:text-red-400";
    case "high": return "text-orange-500 dark:text-orange-400";
    case "moderate": return "text-yellow-500 dark:text-yellow-400";
    case "low": return "text-emerald-500 dark:text-emerald-400";
  }
}

function getSeverityBg(severity: "critical" | "high" | "moderate" | "low") {
  switch (severity) {
    case "critical": return "bg-red-500/10 border-red-500/20";
    case "high": return "bg-orange-500/10 border-orange-500/20";
    case "moderate": return "bg-yellow-500/10 border-yellow-500/20";
    case "low": return "bg-emerald-500/10 border-emerald-500/20";
  }
}

function getRankIcon(rank: number) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-lg font-bold text-muted-foreground w-8 text-center">#{rank}</span>;
}

interface LeaderboardEntry {
  patientId: number;
  civilId: string;
  patientName: string | null;
  nationality: string | null;
  viralLoad: string;
  unit: string | null;
  result: string;
  accessionDate: string | null;
  testType: string;
  numericLoad: number;
}

function LeaderboardTable({
  data,
  isLoading,
  virusLabel,
  virusColor,
}: {
  data: LeaderboardEntry[] | undefined;
  isLoading: boolean;
  virusLabel: string;
  virusColor: string;
}) {
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">No {virusLabel} data found</p>
        <p className="text-sm">Upload virology reports to populate the leaderboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((entry, index) => {
        const rank = index + 1;
        const severity = getViralLoadSeverity(entry.viralLoad);
        const severityColor = getSeverityColor(severity);
        const severityBg = getSeverityBg(severity);

        return (
          <div
            key={`${entry.patientId}-${index}`}
            onClick={() => setLocation(`/patients/${entry.patientId}`)}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] ${severityBg}`}
          >
            {/* Rank */}
            <div className="flex-shrink-0 w-10 flex justify-center">
              {getRankIcon(rank)}
            </div>

            {/* Patient Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">
                  {entry.patientName || "Unknown"}
                </span>
                {entry.nationality && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {entry.nationality}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>ID: {entry.civilId}</span>
                {entry.accessionDate && (
                  <>
                    <span>·</span>
                    <span>{formatDateTime(new Date(entry.accessionDate))}</span>
                  </>
                )}
              </div>
            </div>

            {/* Viral Load */}
            <div className="flex-shrink-0 text-right">
              <div className={`text-lg font-bold tabular-nums ${severityColor}`}>
                {formatViralLoad(entry.viralLoad)}
              </div>
              <div className="text-xs text-muted-foreground">
                {entry.unit || "Copies/mL"}
              </div>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("bk");

  const isAdmin = user?.role === 'admin';
  const bkData = trpc.leaderboard.bkPCR.useQuery({ limit: 20 }, { enabled: isAdmin });
  const cmvData = trpc.leaderboard.cmvPCR.useQuery({ limit: 20 }, { enabled: isAdmin });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
            <p className="text-muted-foreground">
              The Leaderboard is only available to administrators. Contact the project owner to request admin access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bkCount = bkData.data?.length ?? 0;
  const cmvCount = cmvData.data?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-7 w-7 text-amber-500" />
          Viral Load Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Patients ranked by highest PCR viral load counts in blood
        </p>
      </div>

      {/* Severity Legend */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Severity Scale
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>Critical (&ge;1M)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span>High (&ge;100K)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Moderate (&ge;10K)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span>Low (&lt;10K)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="bk" className="gap-2">
            <Flame className="h-4 w-4" />
            BK Virus in Blood
            {bkCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {bkCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cmv" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            CMV PCR in Blood
            {cmvCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {cmvCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bk" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                BK Virus (BKV) — Blood PCR
              </CardTitle>
              <CardDescription>
                Highest BK Polyomavirus viral loads detected in blood samples, ranked by peak value per patient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaderboardTable
                data={bkData.data as LeaderboardEntry[] | undefined}
                isLoading={bkData.isLoading}
                virusLabel="BK Virus"
                virusColor="orange"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cmv" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Cytomegalovirus (CMV) — Blood PCR
              </CardTitle>
              <CardDescription>
                Highest CMV viral loads detected in blood samples, ranked by peak value per patient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaderboardTable
                data={cmvData.data as LeaderboardEntry[] | undefined}
                isLoading={cmvData.isLoading}
                virusLabel="CMV"
                virusColor="blue"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
