import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import ReviewModal from "@/components/shared/ReviewModal";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ClipboardCheck, Clock, CheckCircle, ArrowRight, FileText, AlertCircle, AlertTriangle, Timer } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { useStaggerReveal, staggerStyle } from "@/hooks/useAnimations";

/** Calculate hours since a given date */
function hoursSince(dateStr: string | Date): number {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60));
}

export default function AttorneyDashboard() {
  const { user } = useAuth();
  const { data: pendingLetters } = trpc.review.queue.useQuery({ status: "pending_review" }, {
    refetchInterval: 15000,
  });
  const { data: myLetters } = trpc.review.queue.useQuery({ myAssigned: true }, {
    refetchInterval: 15000,
  });
  const { data: allLetters } = trpc.review.queue.useQuery({});
  const [selectedLetterId, setSelectedLetterId] = useState<number | null>(null);

  // SLA calculations
  const slaData = useMemo(() => {
    const pending = pendingLetters ?? [];
    const overdue = pending.filter((l) => hoursSince(l.createdAt) > 24);
    const urgent = pending.filter((l) => {
      const h = hoursSince(l.createdAt);
      return h > 18 && h <= 24;
    });
    return {
      overdueCount: overdue.length,
      urgentCount: urgent.length,
      overdueLetters: overdue,
    };
  }, [pendingLetters]);

  const stats = {
    pending: pendingLetters?.length ?? 0,
    myActive: myLetters?.filter((l) => l.status === "under_review").length ?? 0,
    totalReviewed: allLetters?.filter((l) => ["approved", "rejected"].includes(l.status)).length ?? 0,
    overdue: slaData.overdueCount,
  };

  const statCardVisible = useStaggerReveal(4, 80);

  return (
    <AppLayout breadcrumb={[{ label: "Review Center" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-600 p-5 text-white sm:p-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold">Attorney Review Center</h1>
            {user?.attorneyId && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-white/20 text-white" data-testid="text-attorney-id">
                {user.attorneyId}
              </span>
            )}
          </div>
          <p className="text-purple-100 text-sm mb-4">
            Review drafted letters, edit as needed, and approve or request changes.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="secondary" size="sm">
              <Link href="/attorney/queue">
                <ClipboardList className="w-4 h-4 mr-2" />
                Review Queue
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/attorney/review-centre">
                <ClipboardCheck className="w-4 h-4 mr-2" />
                My Review Centre
              </Link>
            </Button>
          </div>
        </div>

        {/* SLA Alert Banner */}
        {slaData.overdueCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {slaData.overdueCount} letter{slaData.overdueCount > 1 ? "s" : ""} overdue (SLA: 24h)
              </p>
              <p className="text-xs text-red-600 mt-1">
                These letters have been waiting for review for more than 24 hours. Please prioritize them.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            { label: "Pending Review", value: stats.pending, icon: <Clock className="w-5 h-5" />, color: "text-amber-600", bg: "bg-amber-50", urgent: stats.pending > 5 },
            { label: "Overdue (>24h)", value: stats.overdue, icon: <AlertTriangle className="w-5 h-5" />, color: "text-red-600", bg: "bg-red-50", urgent: stats.overdue > 0 },
            { label: "My Active", value: stats.myActive, icon: <FileText className="w-5 h-5" />, color: "text-blue-600", bg: "bg-blue-50", urgent: false },
            { label: "Total Reviewed", value: stats.totalReviewed, icon: <CheckCircle className="w-5 h-5" />, color: "text-green-600", bg: "bg-green-50", urgent: false },
          ].map((stat, idx) => (
            <Card key={stat.label} className={stat.urgent ? "border-red-300 bg-red-50/30" : ""} style={staggerStyle(idx, statCardVisible[idx])}>
              <CardContent className="p-4">
                <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center mb-3 ${stat.color}`}>
                  {stat.icon}
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Overdue Letters */}
        {slaData.overdueLetters.length > 0 && (
          <Card className="border-red-200">
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                Overdue Letters ({slaData.overdueCount})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {slaData.overdueLetters.map((letter) => {
                  const hrs = Math.round(hoursSince(letter.createdAt));
                  return (
                    <div
                      key={letter.id}
                      onClick={() => setSelectedLetterId(letter.id)}
                      className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-red-50/50 sm:flex-row sm:items-center sm:gap-4 cursor-pointer"
                    >
                      <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Timer className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{letter.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {LETTER_TYPE_CONFIG[letter.letterType as keyof typeof LETTER_TYPE_CONFIG]?.label ?? letter.letterType}
                          {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                        <Badge variant="destructive" className="text-xs">
                          {hrs}h overdue
                        </Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Review Queue */}
        <Card>
          <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Needs Review ({stats.pending})
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/attorney/queue">View All <ArrowRight className="w-3 h-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!pendingLetters || pendingLetters.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No letters pending review. Great work!</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingLetters.slice(0, 5).map((letter) => {
                  const hrs = hoursSince(letter.createdAt);
                  const isOverdue = hrs > 24;
                  const isUrgent = hrs > 18 && hrs <= 24;
                  return (
                    <div
                      key={letter.id}
                      onClick={() => setSelectedLetterId(letter.id)}
                      className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4 cursor-pointer"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isOverdue ? "bg-red-100" : isUrgent ? "bg-orange-100" : "bg-amber-50"
                      }`}>
                        <FileText className={`w-4 h-4 ${
                          isOverdue ? "text-red-600" : isUrgent ? "text-orange-600" : "text-amber-600"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{letter.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {LETTER_TYPE_CONFIG[letter.letterType as keyof typeof LETTER_TYPE_CONFIG]?.label ?? letter.letterType}
                          {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto flex-shrink-0">
                        {isOverdue && <Badge variant="destructive" className="text-xs">{Math.round(hrs)}h</Badge>}
                        {isUrgent && <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-100">{Math.round(hrs)}h</Badge>}
                        <StatusBadge status={letter.status} approvedByRole={letter.approvedByRole} size="sm" />
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Assigned Letters */}
        {myLetters && myLetters.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My Assigned Letters</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {myLetters.map((letter) => (
                  <div
                    key={letter.id}
                    onClick={() => setSelectedLetterId(letter.id)}
                    className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4 cursor-pointer"
                  >
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{letter.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {LETTER_TYPE_CONFIG[letter.letterType as keyof typeof LETTER_TYPE_CONFIG]?.label ?? letter.letterType}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto flex-shrink-0">
                      <StatusBadge status={letter.status} approvedByRole={letter.approvedByRole} size="sm" />
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Review Modal */}
      {selectedLetterId !== null && (
        <ReviewModal
          letterId={selectedLetterId}
          open={true}
          onOpenChange={(open) => { if (!open) setSelectedLetterId(null); }}
        />
      )}
    </AppLayout>
  );
}
