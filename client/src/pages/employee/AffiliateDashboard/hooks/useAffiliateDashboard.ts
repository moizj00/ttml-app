/**
 * useAffiliateDashboard
 *
 * Centralises all tRPC queries, mutations, derived state, and event handlers
 * for the AffiliateDashboard page. The page component becomes a thin
 * orchestrator that only handles layout and routing.
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";

export type TabId = "overview" | "referrals" | "earnings";

export function pathToTab(path: string): TabId {
  if (path === "/employee/referrals") return "referrals";
  if (path === "/employee/earnings") return "earnings";
  return "overview";
}

export function useAffiliateDashboard() {
  const [location, navigate] = useLocation();
  const activeTab = pathToTab(location);
  const utils = trpc.useUtils();

  // ─── Queries ────────────────────────────────────────────────
  const { data: discountCode, isLoading: codeLoading } =
    trpc.affiliate.myCode.useQuery();
  const { data: earnings, isLoading: earningsLoading } =
    trpc.affiliate.myEarnings.useQuery();
  const { data: commissions, isLoading: commissionsLoading } =
    trpc.affiliate.myCommissions.useQuery();
  const { data: payouts, isLoading: payoutsLoading } =
    trpc.affiliate.myPayouts.useQuery();
  const { data: clickAnalytics, isLoading: analyticsLoading } =
    trpc.affiliate.clickAnalytics.useQuery({ days: 30 });

  // ─── Payout Request State ───────────────────────────────────
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("bank_transfer");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [venmoHandle, setVenmoHandle] = useState("");

  const requestPayout = trpc.affiliate.requestPayout.useMutation({
    onSuccess: () => {
      toast.success("Payout requested", {
        description: "Your payout request has been submitted for admin review.",
      });
      setPayoutOpen(false);
      setPayoutAmount("");
      utils.affiliate.myPayouts.invalidate();
      utils.affiliate.myEarnings.invalidate();
    },
    onError: err =>
      toast.error("Payout request failed", { description: err.message }),
  });

  const rotateCode = trpc.affiliate.rotateCode.useMutation({
    onSuccess: () => utils.affiliate.myCode.invalidate(),
    onError: err =>
      toast.error("Code rotation failed", { description: err.message }),
  });

  // ─── Derived values ─────────────────────────────────────────
  const availableBalanceDollars = (earnings?.pending ?? 0) / 100;

  const referralLink = useMemo(
    () =>
      `${window.location.origin}/pricing?coupon=${discountCode?.code ?? ""}`,
    [discountCode?.code]
  );

  const workerReferralLink = useMemo(
    () => `https://refer.talktomylawyer.com/${discountCode?.code ?? ""}`,
    [discountCode?.code]
  );

  const isLoading = codeLoading || earningsLoading;

  // ─── Handlers ───────────────────────────────────────────────
  const handleCopyCode = () => {
    if (!discountCode?.code) return;
    const codeToCopy = discountCode.code;
    navigator.clipboard.writeText(codeToCopy).then(
      () => toast.success("Copied", { description: `${codeToCopy} copied to clipboard.` }),
      () => toast.error("Copy failed", { description: "Please select and copy the code manually." })
    );
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink).then(
      () => toast.success("Copied", { description: "Referral link copied to clipboard." }),
      () => toast.error("Copy failed", { description: "Please select and copy the link manually." })
    );
  };

  const handleCopyWorkerLink = () => {
    navigator.clipboard.writeText(workerReferralLink).then(
      () => toast.success("Copied", { description: "Tracked referral link copied to clipboard." }),
      () => toast.error("Copy failed", { description: "Please select and copy the link manually." })
    );
  };

  const handleRegenerateCode = () => {
    rotateCode.mutate(undefined, {
      onSuccess: () =>
        toast.success("Code regenerated", {
          description: "A new discount code has been generated.",
        }),
    });
  };

  const handleRequestPayout = () => {
    const amountCents = Math.round(parseFloat(payoutAmount) * 100);
    if (isNaN(amountCents) || amountCents < 1000) {
      toast.error("Below minimum", {
        description: "The minimum payout amount is $10.00.",
      });
      return;
    }
    if (amountCents > (earnings?.pending ?? 0)) {
      toast.error("Exceeds balance", {
        description: `You can request up to ${formatCurrency(earnings?.pending ?? 0)}.`,
      });
      return;
    }
    const paymentDetails: Record<string, string> = {};
    if (payoutMethod === "paypal") {
      if (!paypalEmail.trim()) {
        toast.error("PayPal email required", {
          description: "Please enter your PayPal email address.",
        });
        return;
      }
      paymentDetails.paypalEmail = paypalEmail.trim();
    }
    if (payoutMethod === "venmo") {
      if (!venmoHandle.trim()) {
        toast.error("Venmo handle required", {
          description: "Please enter your Venmo handle.",
        });
        return;
      }
      paymentDetails.venmoHandle = venmoHandle.trim();
    }
    requestPayout.mutate({
      amount: amountCents,
      paymentMethod: payoutMethod,
      paymentDetails: Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
    });
  };

  return {
    // Navigation
    activeTab,
    navigate,
    // Data
    discountCode,
    earnings,
    commissions,
    payouts,
    clickAnalytics,
    // Loading states
    isLoading,
    codeLoading,
    commissionsLoading,
    payoutsLoading,
    analyticsLoading,
    // Payout dialog state
    payoutOpen,
    setPayoutOpen,
    payoutAmount,
    setPayoutAmount,
    payoutMethod,
    setPayoutMethod,
    paypalEmail,
    setPaypalEmail,
    venmoHandle,
    setVenmoHandle,
    // Derived
    availableBalanceDollars,
    referralLink,
    workerReferralLink,
    // Mutation states
    requestPayoutPending: requestPayout.isPending,
    rotateCodePending: rotateCode.isPending,
    // Handlers
    handleCopyCode,
    handleCopyLink,
    handleCopyWorkerLink,
    handleRegenerateCode,
    handleRequestPayout,
  };
}
