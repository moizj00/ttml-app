import AppLayout from "@/components/shared/AppLayout";
import OnboardingModal from "@/components/OnboardingModal";
import UpgradeBanner from "@/components/UpgradeBanner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { ANALYZE_PREFILL_KEY, US_STATES } from "../../../../shared/types";
import ApprovedLetterPreviewModal from "@/components/ApprovedLetterPreviewModal";
import type {
  AnalysisPrefill,
  DocumentAnalysisResult,
} from "../../../../shared/types";
import { useLetterListRealtime } from "@/hooks/useLetterRealtime";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { useStaggerReveal } from "@/hooks/useAnimations";

// Sub-components
import { WelcomeBanner } from "@/components/subscriber/dashboard/WelcomeBanner";
import { NotificationsPanel } from "@/components/subscriber/dashboard/NotificationsPanel";
import { SubscriptionBanner } from "@/components/subscriber/dashboard/SubscriptionBanner";
import { FreeTierBanner } from "@/components/subscriber/dashboard/FreeTierBanner";
import { DashboardStats } from "@/components/subscriber/dashboard/DashboardStats";
import { LetterList } from "@/components/subscriber/dashboard/LetterList";
import { AnalysisHistory } from "@/components/subscriber/dashboard/AnalysisHistory";
import { StatusGuide } from "@/components/subscriber/dashboard/StatusGuide";

// Statuses where the dashboard should auto-refresh
const ACTIVE_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "pending_review",
  "under_review",
  "client_approval_pending",
  "client_revision_requested",
];

export default function SubscriberDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const utils = trpc.useUtils();

  const [approvedQueryParam, setApprovedQueryParam] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const val = params.get("approved");
    if (val) {
      const id = parseInt(val, 10);
      if (!isNaN(id)) {
        setApprovedQueryParam(id);
        window.history.replaceState({}, "", "/dashboard");
      }
    }
  }, [searchString]);

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

  const resolveJurisdictionCode = (
    detected: string | null | undefined
  ): string | undefined => {
    if (!detected) return undefined;
    const upper = detected.trim().toUpperCase();
    const byCode = US_STATES.find(s => s.code === upper);
    if (byCode) return byCode.code;
    const lower = detected.trim().toLowerCase();
    const byName = US_STATES.find(s => s.name.toLowerCase() === lower);
    if (byName) return byName.code;
    const byPrefix = US_STATES.find(s =>
      lower.startsWith(s.name.toLowerCase())
    );
    if (byPrefix) return byPrefix.code;
    return undefined;
  };

  const handleUseAnalysis = (analysisJson: Partial<DocumentAnalysisResult>) => {
    const prefill: AnalysisPrefill = {};
    if (analysisJson.recommendedLetterType)
      prefill.letterType = analysisJson.recommendedLetterType;
    if (analysisJson.recommendedResponseSummary)
      prefill.subject = analysisJson.recommendedResponseSummary.slice(0, 200);
    const jurisdictionCode = resolveJurisdictionCode(
      analysisJson.detectedJurisdiction
    );
    if (jurisdictionCode) prefill.jurisdictionState = jurisdictionCode;
    if (analysisJson.detectedParties?.senderName)
      prefill.senderName = analysisJson.detectedParties.senderName;
    if (analysisJson.detectedParties?.recipientName)
      prefill.recipientName = analysisJson.detectedParties.recipientName;
    if (analysisJson.summary)
      prefill.description = analysisJson.summary.slice(0, 600);
    try {
      sessionStorage.setItem(ANALYZE_PREFILL_KEY, JSON.stringify(prefill));
    } catch {
      /* ignore */
    }
    navigate("/submit");
  };

  const lettersTotal = letters?.length ?? 0;
  const stats = {
    total: lettersTotal,
    active:
      letters?.filter(
        l =>
          ![
            "approved",
            "rejected",
            "client_approved",
            "client_declined",
            "sent",
          ].includes(l.status)
      ).length ?? 0,
    approved:
      letters?.filter(l =>
        ["approved", "client_approved", "sent"].includes(l.status)
      ).length ?? 0,
    needsAttention:
      letters?.filter(l =>
        [
          "needs_changes",
          "generated_locked",
          "client_approval_pending",
        ].includes(l.status)
      ).length ?? 0,
  };

  const recentLetters = letters?.slice(0, 5) ?? [];
  const statCardVisible = useStaggerReveal(4, 80);
  const letterVisible = useStaggerReveal(recentLetters.length, 60);

  return (
    <AppLayout breadcrumb={[{ label: "Dashboard" }]}>
      <OnboardingModal />
      {letters && letters.length > 0 && (
        <ApprovedLetterPreviewModal
          letters={letters.map(l => ({
            id: l.id,
            subject: l.subject,
            pdfUrl: l.pdfUrl ?? null,
            status: l.status,
          }))}
          forceLetterIds={approvedQueryParam ? [approvedQueryParam] : undefined}
        />
      )}

      <div className="space-y-6">
        <WelcomeBanner subscriberId={user?.subscriberId} />
        <NotificationsPanel />

        {subscription && (
          <>
            <SubscriptionBanner subscription={subscription} />
            <UpgradeBanner plan={subscription.plan} />
          </>
        )}

        {(!subscription ||
          subscription.status !== "active" ||
          subscription.plan === "per_letter") && (
          <FreeTierBanner totalLetters={lettersTotal} />
        )}

        <DashboardStats stats={stats} statCardVisible={statCardVisible} />

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

          <LetterList
            letters={recentLetters}
            isLoading={isLoading}
            letterVisible={letterVisible}
          />
        </div>

        {(analysesLoading || analysesData !== undefined) && (
          <AnalysisHistory
            isLoading={analysesLoading}
            analyses={analysesData}
            onUseAnalysis={handleUseAnalysis}
          />
        )}

        <StatusGuide />
      </div>
    </AppLayout>
  );
}
