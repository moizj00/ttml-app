import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function useAffiliateAdmin() {
  const utils = trpc.useUtils();

  // ─── Queries ────────────────────────────────────────────────
  const {
    data: codes,
    isLoading: codesLoading,
    error: codesError,
  } = trpc.affiliate.adminAllCodes.useQuery();

  const {
    data: commissions,
    isLoading: commissionsLoading,
    error: commissionsError,
  } = trpc.affiliate.adminAllCommissions.useQuery();

  const {
    data: payouts,
    isLoading: payoutsLoading,
    error: payoutsError,
  } = trpc.affiliate.adminAllPayouts.useQuery();

  const {
    data: performance,
    isLoading: perfLoading,
    error: perfError,
  } = trpc.affiliate.adminEmployeePerformance.useQuery();

  const combinedError =
    codesError || commissionsError || payoutsError || perfError;

  const refetchAll = () => {
    utils.affiliate.adminAllCodes.invalidate();
    utils.affiliate.adminAllCommissions.invalidate();
    utils.affiliate.adminAllPayouts.invalidate();
    utils.affiliate.adminEmployeePerformance.invalidate();
  };

  // ─── Payout Processing ──────────────────────────────────────
  const [processingPayout, setProcessingPayout] = useState<{
    id: number;
    action: "completed" | "rejected";
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const processPayout = trpc.affiliate.adminProcessPayout.useMutation({
    onSuccess: () => {
      toast.success("Payout processed", {
        description: "The commission has been marked as paid.",
      });
      setProcessingPayout(null);
      setRejectionReason("");
      utils.affiliate.adminAllPayouts.invalidate();
      utils.affiliate.adminAllCommissions.invalidate();
      utils.affiliate.adminEmployeePerformance.invalidate();
    },
    onError: (err) =>
      toast.error("Payout failed", { description: err.message }),
  });

  const handleProcessPayout = () => {
    if (!processingPayout) return;
    processPayout.mutate({
      payoutId: processingPayout.id,
      action: processingPayout.action,
      rejectionReason:
        processingPayout.action === "rejected" ? rejectionReason : undefined,
    });
  };

  // ─── Referral Drill-down ────────────────────────────────────
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(
    null
  );
  const toggleEmployee = (id: number) =>
    setExpandedEmployeeId((prev) => (prev === id ? null : id));

  // ─── Code Toggle ────────────────────────────────────────────
  const updateCode = trpc.affiliate.adminUpdateCode.useMutation({
    onSuccess: () => {
      toast.success("Discount code updated", {
        description: "The code settings have been saved.",
      });
      utils.affiliate.adminAllCodes.invalidate();
    },
    onError: (err) =>
      toast.error("Update failed", { description: err.message }),
  });

  const forceExpireCode = trpc.affiliate.adminForceExpireCode.useMutation({
    onSuccess: () => {
      toast.success("Code force-expired", {
        description: "The discount code has been deactivated and expired.",
      });
      utils.affiliate.adminAllCodes.invalidate();
      utils.affiliate.adminEmployeePerformance.invalidate();
      setForceExpireCodeId(null);
    },
    onError: (err) =>
      toast.error("Force expire failed", { description: err.message }),
  });

  const [forceExpireCodeId, setForceExpireCodeId] = useState<number | null>(
    null
  );

  // ─── Summary Stats ──────────────────────────────────────────
  const totalCommissions =
    commissions?.reduce((s, c) => s + c.commissionAmount, 0) ?? 0;
  const pendingPayouts =
    payouts?.filter((p) => p.status === "pending").length ?? 0;
  const activeEmployees =
    performance?.filter((p) => p.referralCount > 0).length ?? 0;

  return {
    // Data
    codes,
    commissions,
    payouts,
    performance,
    // Loading flags
    codesLoading,
    commissionsLoading,
    payoutsLoading,
    perfLoading,
    // Error
    combinedError,
    refetchAll,
    // Summary stats
    totalCommissions,
    pendingPayouts,
    activeEmployees,
    // Payout processing
    processingPayout,
    setProcessingPayout,
    rejectionReason,
    setRejectionReason,
    processPayout,
    handleProcessPayout,
    // Referral drill-down
    expandedEmployeeId,
    toggleEmployee,
    // Code management
    updateCode,
    forceExpireCode,
    forceExpireCodeId,
    setForceExpireCodeId,
  };
}
