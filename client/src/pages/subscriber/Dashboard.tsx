import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import OnboardingModal from "@/components/OnboardingModal";
import UpgradeBanner from "@/components/UpgradeBanner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  PlusCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Search,
  Pen,
  Lock,
  Eye,
  ShieldCheck,
  XCircle,
  Download,
  CreditCard,
  MessageSquare,
  Loader2,
  ScanSearch,
  Scale,
  Calendar,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { LETTER_TYPE_CONFIG, ANALYZE_PREFILL_KEY, US_STATES } from "../../../../shared/types";
import type { AnalysisPrefill, DocumentAnalysisResult } from "../../../../shared/types";
import type { DocumentAnalysis } from "../../../../drizzle/schema";
import { useLetterListRealtime } from "@/hooks/useLetterRealtime";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

// Statuses where the dashboard should auto-refresh
const ACTIVE_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "pending_review",
  "under_review",
];

// Pipeline stages in order for the progress stepper
const PIPELINE_STAGES = [
  { key: "submitted", label: "Submitted", icon: FileText },
  { key: "researching", label: "Research", icon: Search },
  { key: "drafting", label: "Drafting", icon: Pen },
  { key: "generated_locked", label: "Unlock", icon: Lock },
  { key: "pending_review", label: "Review", icon: Eye },
  { key: "under_review", label: "Attorney", icon: ShieldCheck },
  { key: "approved", label: "Approved", icon: CheckCircle },
] as const;

// Map status to pipeline stage index
function getStageIndex(status: string): number {
  const idx = PIPELINE_STAGES.findIndex(s => s.key === status);
  if (status === "needs_changes") return 5; // same level as under_review
  if (status === "rejected") return 6; // terminal
  return idx >= 0 ? idx : 0;
}

// CTA config per status
function getStatusCTA(status: string, letterId: number) {
  switch (status) {
    case "submitted":
    case "researching":
    case "drafting":
      return {
        label: "Processing...",
        icon: Loader2,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "generated_locked":
      return {
        label: "Pay to Unlock \u2014 $200",
        icon: CreditCard,
        variant: "default" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "pending_review":
      return {
        label: "Awaiting Attorney",
        icon: Clock,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "under_review":
      return {
        label: "Attorney Reviewing",
        icon: Eye,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "needs_changes":
      return {
        label: "Respond to Changes",
        icon: MessageSquare,
        variant: "destructive" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "approved":
      return {
        label: "Download Letter",
        icon: Download,
        variant: "default" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "rejected":
      return {
        label: "View Details",
        icon: XCircle,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    default:
      return {
        label: "View",
        icon: ArrowRight,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
  }
}

// Relative time helper
function timeAgo(dateStr: string | number): string {
  const now = Date.now();
  const then =
    typeof dateStr === "string" ? new Date(dateStr).getTime() : dateStr;
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Progress stepper component
function PipelineStepper({ status }: { status: string }) {
  const currentIdx = getStageIndex(status);
  const isTerminalBad = status === "rejected";
  const isNeedsChanges = status === "needs_changes";

  return (
    <div className="flex min-w-136 items-center gap-0 sm:min-w-0 sm:w-full">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isActive =
          isCurrent &&
          [
            "researching",
            "drafting",
            "pending_review",
            "under_review",
          ].includes(status);
        const isPaywall = isCurrent && status === "generated_locked";
        const isApproved = isCurrent && status === "approved";

        const Icon = stage.icon;

        return (
          <div
            key={stage.key}
            className="flex items-center flex-1 last:flex-none"
          >
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isComplete
                    ? "bg-emerald-500 text-white"
                    : isApproved
                      ? "bg-emerald-500 text-white ring-2 ring-emerald-200"
                      : isTerminalBad && isCurrent
                        ? "bg-red-500 text-white ring-2 ring-red-200"
                        : isNeedsChanges && isCurrent
                          ? "bg-amber-500 text-white ring-2 ring-amber-200"
                          : isPaywall
                            ? "bg-amber-500 text-white ring-2 ring-amber-200 animate-pulse"
                            : isActive
                              ? "bg-blue-500 text-white ring-2 ring-blue-200"
                              : isCurrent
                                ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
                                : "bg-muted text-muted-foreground/40"
                }`}
              >
                {isComplete ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>
              {/* Label - hidden on mobile, shown on sm+ */}
              <span
                className={`hidden sm:block text-[10px] mt-1 text-center leading-tight ${
                  isComplete
                    ? "text-emerald-600 font-medium"
                    : isCurrent
                      ? isPaywall
                        ? "text-amber-600 font-semibold"
                        : isActive
                          ? "text-blue-600 font-semibold"
                          : isApproved
                            ? "text-emerald-600 font-semibold"
                            : isTerminalBad
                              ? "text-red-600 font-semibold"
                              : isNeedsChanges
                                ? "text-amber-600 font-semibold"
                                : "text-foreground font-medium"
                      : "text-muted-foreground/40"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {/* Connector line */}
            {idx < PIPELINE_STAGES.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 rounded transition-all duration-300 ${
                  idx < currentIdx ? "bg-emerald-500" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SubscriberDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const {
    data: subscription,
    error: subscriptionError,
    refetch: refetchSubscription,
  } = trpc.billing.getSubscription.useQuery();
  const {
    data: letters,
    isLoading,
    error: lettersError,
    refetch: refetchLetters,
  } = trpc.letters.myLetters.useQuery(undefined, {
    refetchInterval: query => {
      const list = query.state.data;
      if (list?.some((l: any) => ACTIVE_STATUSES.includes(l.status)))
        return 8000;
      return false;
    },
  });

  const { data: analysesData, isLoading: analysesLoading } =
    trpc.documents.getMyAnalyses.useQuery();

  // Supabase Realtime — instant updates when any letter changes for this user
  useLetterListRealtime({
    userId: user?.id ?? null,
    onAnyChange: () => utils.letters.myLetters.invalidate(),
    enabled: !!user?.id,
  });

  // Safely cast the jsonb field — Drizzle types jsonb as unknown; we validate fields at runtime
  const getAnalysisJson = (row: DocumentAnalysis): Partial<DocumentAnalysisResult> =>
    (row.analysisJson ?? {}) as Partial<DocumentAnalysisResult>;

  const resolveJurisdictionCode = (detected: string | null | undefined): string | undefined => {
    if (!detected) return undefined;
    const upper = detected.trim().toUpperCase();
    const byCode = US_STATES.find(s => s.code === upper);
    if (byCode) return byCode.code;
    const lower = detected.trim().toLowerCase();
    const byName = US_STATES.find(s => s.name.toLowerCase() === lower);
    if (byName) return byName.code;
    const byPrefix = US_STATES.find(s => lower.startsWith(s.name.toLowerCase()));
    if (byPrefix) return byPrefix.code;
    return undefined;
  };

  const handleUseAnalysis = (analysisJson: Partial<DocumentAnalysisResult>) => {
    const prefill: AnalysisPrefill = {};
    if (analysisJson.recommendedLetterType) prefill.letterType = analysisJson.recommendedLetterType;
    if (analysisJson.recommendedResponseSummary) prefill.subject = analysisJson.recommendedResponseSummary.slice(0, 200);
    const jurisdictionCode = resolveJurisdictionCode(analysisJson.detectedJurisdiction);
    if (jurisdictionCode) prefill.jurisdictionState = jurisdictionCode;
    if (analysisJson.detectedParties?.senderName) prefill.senderName = analysisJson.detectedParties.senderName;
    if (analysisJson.detectedParties?.recipientName) prefill.recipientName = analysisJson.detectedParties.recipientName;
    if (analysisJson.summary) prefill.description = analysisJson.summary.slice(0, 600);
    try { sessionStorage.setItem(ANALYZE_PREFILL_KEY, JSON.stringify(prefill)); } catch { /* ignore */ }
    navigate("/submit");
  };

  const stats = {
    total: letters?.length ?? 0,
    active:
      letters?.filter(l => !["approved", "rejected"].includes(l.status))
        .length ?? 0,
    approved: letters?.filter(l => l.status === "approved").length ?? 0,
    needsAttention:
      letters?.filter(l =>
        ["needs_changes", "generated_locked"].includes(
          l.status
        )
      ).length ?? 0,
  };

  const recentLetters = letters?.slice(0, 5) ?? [];

  return (
    <AppLayout breadcrumb={[{ label: "Dashboard" }]}>
      {/* Onboarding modal — shown once for new subscribers */}
      <OnboardingModal />
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="rounded-2xl bg-linear-to-r from-primary to-primary/80 p-5 text-primary-foreground sm:p-6">
          <h1 className="text-xl font-bold mb-1">
            Welcome to Talk to My Lawyer
          </h1>
          <p className="text-primary-foreground/80 text-sm mb-4">
            Submit a legal matter and get a professionally drafted,
            attorney-approved letter.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/submit">
              <PlusCircle className="w-4 h-4 mr-2" />
              Submit New Letter
            </Link>
          </Button>
        </div>

        {/* Subscription Status Banner */}
        {subscription &&
          subscription.status === "active" &&
          (subscription.plan === "monthly" ||
            subscription.plan === "annual") && (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-green-800">
                        Active Subscriber
                      </span>
                      <Badge
                        className={
                          subscription.plan === "annual"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }
                      >
                        {subscription.plan === "annual"
                          ? "Annual Plan"
                          : "Monthly Plan"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-green-700">
                      <span>
                        {subscription.lettersAllowed === -1
                          ? "Unlimited letters"
                          : `${Math.max(0, subscription.lettersAllowed - subscription.lettersUsed)} of ${subscription.lettersAllowed} letters remaining`}
                      </span>
                      {subscription.currentPeriodEnd && (
                        <>
                          <span className="text-green-400">·</span>
                          <span>
                            {subscription.cancelAtPeriodEnd
                              ? "Expires"
                              : "Renews"}{" "}
                            {new Date(
                              subscription.currentPeriodEnd
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-green-300 text-green-700 hover:bg-green-100"
                >
                  <Link href="/subscriber/billing">Manage Plan</Link>
                </Button>
              </CardContent>
            </Card>
          )}

        {/* Upgrade to Pro banner — only for Monthly Basic subscribers */}
        {subscription && subscription.status === "active" && (
          <UpgradeBanner plan={subscription.plan} />
        )}

        {/* Free tier / no subscription banner */}
        {(!subscription ||
          subscription.status !== "active" ||
          subscription.plan === "per_letter") && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-blue-800">
                    {stats.total === 0
                      ? "Your first letter is free — attorney review included"
                      : "Upgrade to a subscription"}
                  </span>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {stats.total === 0
                      ? "Subscribe monthly or yearly for the best value."
                      : "Get 4 letters/month for $200/mo or $2,000/yr. Avoid the $200 per-letter fee."}
                  </p>
                </div>
              </div>
              <Button
                asChild
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Link
                  href={stats.total === 0 ? "/submit" : "/subscriber/billing"}
                >
                  {stats.total === 0 ? "Start Free Letter" : "View Plans"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "Total Letters",
              value: stats.total,
              icon: <FileText className="w-5 h-5" />,
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "In Progress",
              value: stats.active,
              icon: <Clock className="w-5 h-5" />,
              color: "text-amber-600",
              bg: "bg-amber-50",
            },
            {
              label: "Approved",
              value: stats.approved,
              icon: <CheckCircle className="w-5 h-5" />,
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "Needs Attention",
              value: stats.needsAttention,
              icon: <AlertCircle className="w-5 h-5" />,
              color: "text-red-600",
              bg: "bg-red-50",
            },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div
                  className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center mb-3 ${stat.color}`}
                >
                  {stat.icon}
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stat.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Letter Pipeline Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Your Letters
            </h2>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/letters">
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>

          {(subscriptionError || lettersError) && (
            <Card className="border-destructive/50">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <AlertCircle className="w-8 h-8 text-destructive mb-3" />
                <p className="text-sm font-medium text-destructive">
                  Something went wrong
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(subscriptionError || lettersError)?.message}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    refetchSubscription();
                    refetchLetters();
                  }}
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="h-36 bg-muted animate-pulse rounded-xl"
                />
              ))}
            </div>
          ) : recentLetters.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-base font-medium text-foreground mb-2">
                  No letters yet
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Submit your first legal matter and our attorneys will research
                  and draft a professional letter for attorney review.
                </p>
                <Button asChild>
                  <Link href="/submit">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Submit Your First Letter
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {recentLetters.map(letter => {
                const cta = getStatusCTA(letter.status, letter.id);
                const CTAIcon = cta.icon;
                const isActionRequired = [
                  "generated_locked",
                  "needs_changes",
                ].includes(letter.status);

                return (
                  <Card
                    key={letter.id}
                    className={`overflow-hidden transition-all hover:shadow-md ${
                      isActionRequired
                        ? "ring-1 ring-amber-300 bg-amber-50/30"
                        : ""
                    }`}
                  >
                    <CardContent className="p-0">
                      {/* Top section: letter info + status badge */}
                      <div className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-semibold text-foreground truncate">
                                {letter.subject}
                              </h3>
                              {isActionRequired && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                                  Action Required
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {LETTER_TYPE_CONFIG[letter.letterType]?.label ??
                                  letter.letterType}
                              </span>
                              <span className="text-muted-foreground/30">
                                ·
                              </span>
                              <span>
                                {timeAgo(
                                  typeof letter.createdAt === "object"
                                    ? (letter.createdAt as Date).getTime()
                                    : letter.createdAt
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-start sm:justify-end">
                          <StatusBadge status={letter.status} size="sm" />
                        </div>
                      </div>

                      {/* Pipeline stepper */}
                      <div className="overflow-x-auto px-4 py-3">
                        <PipelineStepper status={letter.status} />
                      </div>

                      {/* Bottom: CTA button */}
                      <div className="px-4 pb-4 pt-1">
                        <Button
                          asChild
                          variant={cta.variant}
                          size="sm"
                          className={`w-full sm:w-auto ${
                            letter.status === "generated_locked"
                              ? "bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0"
                              : ""
                          }`}
                        >
                          <Link href={cta.href}>
                            <CTAIcon
                              className={`w-4 h-4 mr-2 ${cta.animate ? "animate-spin" : ""}`}
                            />
                            {cta.label}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Document Analysis History — always visible once data has been fetched or is loading */}
        {(analysesLoading || analysesData !== undefined) && (
          <Card data-testid="card-analysis-history">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanSearch className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base">Document Analysis History</CardTitle>
              </div>
              <Link href="/analyze">
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-new-analysis">
                  <ScanSearch className="w-3.5 h-3.5" />
                  New Analysis
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {analysesLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading analyses…
                </div>
              ) : !analysesData?.rows?.length ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <ScanSearch className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">No analyses yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload a legal document to get an instant AI analysis and recommended action.
                    </p>
                  </div>
                  <Link href="/analyze">
                    <Button size="sm" variant="outline" className="gap-1.5 mt-1" data-testid="button-start-analysis-empty">
                      <ScanSearch className="w-3.5 h-3.5" />
                      Analyze a Document
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {(analysesData?.rows ?? []).map((row: DocumentAnalysis) => {
                    const analysis = getAnalysisJson(row);
                    const letterType = analysis.recommendedLetterType;
                    const letterLabel = letterType
                      ? (LETTER_TYPE_CONFIG[letterType]?.label ?? letterType)
                      : null;
                    const createdAt = row.createdAt ? new Date(row.createdAt) : null;
                    const hasUsefulPrefill = !!(letterType || analysis.recommendedResponseSummary);

                    return (
                      <div
                        key={row.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                        data-testid={`row-analysis-${row.id}`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <FileText className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate" data-testid={`text-analysis-name-${row.id}`}>
                              {row.documentName}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {createdAt && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Calendar className="w-3 h-3" />
                                  {createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                              )}
                              {letterLabel && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1" data-testid={`badge-analysis-type-${row.id}`}>
                                  <Scale className="w-3 h-3" />
                                  {letterLabel}
                                </Badge>
                              )}
                              {analysis.urgencyLevel === "high" && (
                                <Badge variant="destructive" className="text-xs">
                                  High Urgency
                                </Badge>
                              )}
                              {analysis.detectedDeadline && (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                  Deadline: {analysis.detectedDeadline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {hasUsefulPrefill && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUseAnalysis(analysis)}
                            className="flex-shrink-0 gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                            data-testid={`button-use-analysis-${row.id}`}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            Draft Letter
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status Guide — collapsible */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline Status Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  status: "submitted",
                  desc: "Your request has been received and is being prepared for our legal team.",
                },
                {
                  status: "researching",
                  desc: "Our team is researching applicable laws, statutes, and jurisdiction rules.",
                },
                {
                  status: "drafting",
                  desc: "Our attorneys are drafting your professional legal letter using research findings.",
                },
                {
                  status: "generated_locked",
                  desc: "Your letter is ready! Pay to unlock and submit for attorney review.",
                },
                {
                  status: "pending_review",
                  desc: "Letter is queued for a licensed attorney to review and approve.",
                },
                {
                  status: "under_review",
                  desc: "An attorney is actively reviewing and editing your letter.",
                },
                {
                  status: "needs_changes",
                  desc: "The attorney has requested additional information or changes from you.",
                },
                {
                  status: "approved",
                  desc: "Your letter has been approved by an attorney and is ready to download.",
                },
              ].map(item => (
                <div
                  key={item.status}
                  className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                >
                  <StatusBadge status={item.status} size="sm" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
