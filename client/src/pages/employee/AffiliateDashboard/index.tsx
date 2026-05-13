/**
 * AffiliateDashboard — Page Orchestrator
 *
 * Thin orchestrator: owns layout, routing, and the welcome banner.
 * All data fetching, state management, and event handlers live in
 * useAffiliateDashboard. UI sections are delegated to sub-components.
 */

import AppLayout from "@/components/shared/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAffiliateDashboard } from "./hooks/useAffiliateDashboard";
import { AffiliateStatsCards } from "./AffiliateStatsCards";
import { AffiliateReferralTools } from "./AffiliateReferralTools";
import { AffiliateClickAnalytics } from "./AffiliateClickAnalytics";
import { AffiliateEarningsSection } from "./AffiliateEarningsSection";

export default function AffiliateDashboard() {
  const { user } = useAuth();
  const dashboard = useAffiliateDashboard();

  const {
    activeTab,
    navigate,
    discountCode,
    earnings,
    commissions,
    payouts,
    clickAnalytics,
    isLoading,
    codeLoading,
    commissionsLoading,
    payoutsLoading,
    analyticsLoading,
    payoutOpen,
    setPayoutOpen,
    payoutMethod,
    setPayoutMethod,
    paypalEmail,
    setPaypalEmail,
    venmoHandle,
    setVenmoHandle,
    workerReferralLink,
    referralLink,
    requestPayoutPending,
    rotateCodePending,
    handleCopyCode,
    handleCopyLink,
    handleCopyWorkerLink,
    handleRegenerateCode,
    handleRequestPayout,
  } = dashboard;

  return (
    <AppLayout title="Affiliate Dashboard">
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white sm:p-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold sm:text-2xl">
              Welcome, {user?.name ?? "Affiliate"}
            </h1>
            {user?.employeeId && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-white/20 text-white"
                data-testid="text-affiliate-id"
              >
                {user.employeeId}
              </span>
            )}
          </div>
          <p className="mt-1 text-blue-100">
            Promote a California-focused legal drafting platform and earn 5% commission on every paid draft or subscription you refer. Share your link and grow your earnings.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 rounded-lg bg-muted p-1" data-testid="tabs-affiliate">
          <Button
            variant={activeTab === "overview" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => navigate("/employee")}
            data-testid="tab-overview"
          >
            Overview
          </Button>
          <Button
            variant={activeTab === "referrals" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => navigate("/employee/referrals")}
            data-testid="tab-referrals"
          >
            Referral Tools
          </Button>
          <Button
            variant={activeTab === "earnings" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => navigate("/employee/earnings")}
            data-testid="tab-earnings"
          >
            Earnings & Payouts
          </Button>
        </div>

        {/* Stats Cards — always visible */}
        <AffiliateStatsCards
          isLoading={isLoading}
          totalEarned={earnings?.totalEarned ?? 0}
          pending={earnings?.pending ?? 0}
          reserved={earnings?.reserved ?? 0}
          paid={earnings?.paid ?? 0}
          referralCount={earnings?.referralCount ?? 0}
          usageCount={discountCode?.usageCount ?? 0}
        />

        {/* Referral Tools — overview & referrals tabs */}
        {activeTab !== "earnings" && (
          <AffiliateReferralTools
            activeTab={activeTab}
            discountCode={discountCode}
            codeLoading={codeLoading}
            workerReferralLink={workerReferralLink}
            referralLink={referralLink}
            rotateCodePending={rotateCodePending}
            onCopyCode={handleCopyCode}
            onCopyLink={handleCopyLink}
            onCopyWorkerLink={handleCopyWorkerLink}
            onRegenerateCode={handleRegenerateCode}
          />
        )}

        {/* Click Analytics — referrals tab only */}
        {activeTab === "referrals" && (
          <AffiliateClickAnalytics
            analyticsLoading={analyticsLoading}
            clickAnalytics={clickAnalytics}
          />
        )}

        {/* Earnings & Payouts — overview & earnings tabs */}
        {(activeTab === "overview" || activeTab === "earnings") && (
          <AffiliateEarningsSection
            payoutOpen={payoutOpen}
            setPayoutOpen={setPayoutOpen}
            payoutMethod={payoutMethod}
            setPayoutMethod={setPayoutMethod}
            paypalEmail={paypalEmail}
            setPaypalEmail={setPaypalEmail}
            venmoHandle={venmoHandle}
            setVenmoHandle={setVenmoHandle}
            payouts={payouts}
            commissions={commissions}
            payoutsLoading={payoutsLoading}
            commissionsLoading={commissionsLoading}
            pendingBalance={earnings?.pending ?? 0}
            requestPayoutPending={requestPayoutPending}
            onRequestPayout={handleRequestPayout}
          />
        )}
      </div>
    </AppLayout>
  );
}
