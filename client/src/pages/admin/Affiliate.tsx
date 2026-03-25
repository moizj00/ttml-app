import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  DollarSign,
  Users,
  Gift,
  Wallet,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
  BarChart3,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import React, { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CommissionStatusBadge,
  PayoutStatusBadge,
} from "@/components/shared/CommissionBadges";

function SubscriptionStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    canceled: "bg-red-100 text-red-800",
    past_due: "bg-amber-100 text-amber-800",
    trialing: "bg-blue-100 text-blue-800",
    none: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status] ?? "bg-gray-100 text-gray-600"}`}
      data-testid="badge-subscription-status"
    >
      {status.replace("_", " ")}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string | null }) {
  if (!plan) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 font-mono"
      data-testid="badge-plan"
    >
      {plan}
    </span>
  );
}

function EmployeeReferralDetails({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = trpc.affiliate.adminReferralDetails.useQuery(
    { employeeId },
    { staleTime: 30_000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6" data-testid="referral-details-loading">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading referrals…</span>
      </div>
    );
  }

  if (!data) return null;

  const { referrals, summary } = data;

  return (
    <div className="bg-muted/30 border-t px-4 py-4 space-y-4" data-testid="referral-details-panel">
      {/* Summary Stats */}
      <div className="flex flex-wrap gap-4 text-sm" data-testid="referral-summary">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-500" />
          <span className="text-muted-foreground">Total referred:</span>
          <span className="font-semibold" data-testid="summary-total-referred">{summary.totalReferred}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <span className="text-muted-foreground">Avg tenure:</span>
          <span className="font-semibold" data-testid="summary-avg-tenure">{summary.avgTenureMonths} mo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="text-muted-foreground">Revenue generated:</span>
          <span className="font-semibold" data-testid="summary-total-revenue">{formatCurrency(summary.totalRevenue)}</span>
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm" data-testid="referral-empty">
          No referrals recorded for this affiliate.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background" data-testid="referral-table-container">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Sub Status</TableHead>
                <TableHead className="text-center">Tenure</TableHead>
                <TableHead className="text-right">Sale</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Com. Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map(r => (
                <TableRow key={r.commissionId} data-testid={`referral-row-${r.commissionId}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm" data-testid={`referral-subscriber-name-${r.commissionId}`}>
                        {r.subscriberName ?? "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid={`referral-subscriber-email-${r.commissionId}`}>
                        {r.subscriberEmail ?? `#${r.subscriberId}`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PlanBadge plan={r.subscriptionPlan} />
                  </TableCell>
                  <TableCell>
                    <SubscriptionStatusBadge status={r.subscriptionStatus} />
                  </TableCell>
                  <TableCell className="text-center" data-testid={`referral-tenure-${r.commissionId}`}>
                    {r.tenureMonths !== null ? `${r.tenureMonths} mo` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(r.saleAmount)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-700">
                    {formatCurrency(r.commissionAmount)}
                  </TableCell>
                  <TableCell>
                    <CommissionStatusBadge status={r.commissionStatus} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.commissionCreatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function AdminAffiliate() {
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
    onError: err => toast.error("Payout failed", { description: err.message }),
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
    setExpandedEmployeeId(prev => (prev === id ? null : id));

  // ─── Code Toggle ────────────────────────────────────────────
  const updateCode = trpc.affiliate.adminUpdateCode.useMutation({
    onSuccess: () => {
      toast.success("Discount code updated", {
        description: "The new code is now active for this affiliate.",
      });
      utils.affiliate.adminAllCodes.invalidate();
    },
    onError: err => toast.error("Update failed", { description: err.message }),
  });

  // ─── Summary Stats ──────────────────────────────────────────
  const totalCommissions =
    commissions?.reduce((s, c) => s + c.commissionAmount, 0) ?? 0;
  const pendingPayouts =
    payouts?.filter(p => p.status === "pending").length ?? 0;
  const activeEmployees =
    performance?.filter(p => p.referralCount > 0).length ?? 0;

  return (
    <AppLayout
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Affiliate Program" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-700 to-purple-700 rounded-2xl p-6 text-white">
          <h1 className="text-xl font-bold mb-1">
            Affiliate Program Management
          </h1>
          <p className="text-indigo-200 text-sm">
            Manage discount codes, commissions, payouts, and employee
            performance.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mb-3">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(totalCommissions)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total Commissions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
                <Wallet className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-2xl font-bold">{pendingPayouts}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pending Payouts
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
                <Gift className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold">{codes?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Discount Codes
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-bold">{activeEmployees}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active Affiliates
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Error State */}
        {combinedError && (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {combinedError.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetchAll()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="performance">
              <BarChart3 className="w-3.5 h-3.5 mr-1" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="codes">
              <Gift className="w-3.5 h-3.5 mr-1" />
              Codes
            </TabsTrigger>
            <TabsTrigger value="commissions">
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              Commissions
            </TabsTrigger>
            <TabsTrigger value="payouts">
              <Wallet className="w-3.5 h-3.5 mr-1" />
              Payouts
            </TabsTrigger>
          </TabsList>

          {/* Employee Performance Tab */}
          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  Affiliate Performance
                </CardTitle>
                <CardDescription>
                  Overview of each affiliate's referral activity and earnings.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {perfLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : performance && performance.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Affiliate</TableHead>
                          <TableHead>Discount Code</TableHead>
                          <TableHead className="text-center">Uses</TableHead>
                          <TableHead className="text-center">
                            Referrals
                          </TableHead>
                          <TableHead className="text-right">
                            Total Earned
                          </TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {performance.map(emp => (
                          <React.Fragment key={emp.employeeId}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleEmployee(emp.employeeId)}
                              data-testid={`employee-row-${emp.employeeId}`}
                            >
                              <TableCell className="pr-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={e => {
                                    e.stopPropagation();
                                    toggleEmployee(emp.employeeId);
                                  }}
                                  data-testid={`expand-employee-${emp.employeeId}`}
                                  aria-label={
                                    expandedEmployeeId === emp.employeeId
                                      ? "Collapse referrals"
                                      : "Expand referrals"
                                  }
                                >
                                  {expandedEmployeeId === emp.employeeId ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">
                                    {emp.name ?? "Unknown"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {emp.email}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                {emp.discountCode ? (
                                  <Badge
                                    variant={
                                      emp.codeActive ? "default" : "secondary"
                                    }
                                    className="font-mono text-xs"
                                  >
                                    {emp.discountCode}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    None
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {emp.usageCount}
                              </TableCell>
                              <TableCell className="text-center">
                                {emp.referralCount}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(emp.totalEarned)}
                              </TableCell>
                              <TableCell className="text-right text-amber-600">
                                {formatCurrency(emp.pending)}
                              </TableCell>
                              <TableCell className="text-right text-green-600">
                                {formatCurrency(emp.paid)}
                              </TableCell>
                            </TableRow>
                            {expandedEmployeeId === emp.employeeId && (
                              <TableRow
                                key={`detail-${emp.employeeId}`}
                                className="hover:bg-transparent"
                              >
                                <TableCell
                                  colSpan={8}
                                  className="p-0"
                                  data-testid={`referral-details-cell-${emp.employeeId}`}
                                >
                                  <EmployeeReferralDetails
                                    employeeId={emp.employeeId}
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No affiliates found.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Discount Codes Tab */}
          <TabsContent value="codes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-indigo-600" />
                  All Discount Codes
                </CardTitle>
                <CardDescription>
                  Manage affiliate discount codes. Toggle active/inactive status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {codesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : codes && codes.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Affiliate</TableHead>
                        <TableHead className="text-center">Discount</TableHead>
                        <TableHead className="text-center">Uses</TableHead>
                        <TableHead className="text-center">Max Uses</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codes.map(code => (
                        <TableRow key={code.id}>
                          <TableCell className="font-mono font-medium">
                            {code.code}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{code.employeeName ?? "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{code.employeeEmail ?? `#${code.employeeId}`}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {code.discountPercent}%
                          </TableCell>
                          <TableCell className="text-center">
                            {code.usageCount}
                          </TableCell>
                          <TableCell className="text-center">
                            {code.maxUses ?? "∞"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(code.createdAt)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={code.isActive}
                              onCheckedChange={checked =>
                                updateCode.mutate({
                                  id: code.id,
                                  isActive: checked,
                                })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gift className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No discount codes created yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                  All Commissions
                </CardTitle>
                <CardDescription>
                  Full ledger of all commissions across affiliates.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {commissionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : commissions && commissions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Affiliate</TableHead>
                          <TableHead>Sale</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commissions.map(c => (
                          <TableRow key={c.id}>
                            <TableCell className="text-sm">
                              {formatDate(c.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{c.employeeName ?? "Unknown"}</p>
                                <p className="text-xs text-muted-foreground">{c.employeeEmail ?? `#${c.employeeId}`}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatCurrency(c.saleAmount)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(c.commissionRate / 100).toFixed(1)}%
                            </TableCell>
                            <TableCell className="font-medium text-green-700">
                              {formatCurrency(c.commissionAmount)}
                            </TableCell>
                            <TableCell>
                              <CommissionStatusBadge status={c.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No commissions recorded yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-indigo-600" />
                  Payout Requests
                </CardTitle>
                <CardDescription>
                  Review and process affiliate payout requests.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payoutsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : payouts && payouts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Affiliate</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payouts.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">
                            {formatDate(p.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{p.employeeName ?? "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{p.employeeEmail ?? `#${p.employeeId}`}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell className="text-sm capitalize">
                            {p.paymentMethod.replace("_", " ")}
                          </TableCell>
                          <TableCell>
                            <PayoutStatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {p.status === "pending" ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() =>
                                    setProcessingPayout({
                                      id: p.id,
                                      action: "completed",
                                    })
                                  }
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-700 border-red-300 hover:bg-red-50"
                                  onClick={() =>
                                    setProcessingPayout({
                                      id: p.id,
                                      action: "rejected",
                                    })
                                  }
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Processed
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No payout requests yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payout Processing Dialog */}
        <Dialog
          open={!!processingPayout}
          onOpenChange={open => {
            if (!open) {
              setProcessingPayout(null);
              setRejectionReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {processingPayout?.action === "completed"
                  ? "Approve Payout"
                  : "Reject Payout"}
              </DialogTitle>
              <DialogDescription>
                {processingPayout?.action === "completed"
                  ? "Confirm that this payout has been sent to the employee. Oldest pending commissions up to the payout amount will be marked as paid."
                  : "Provide a reason for rejecting this payout request."}
              </DialogDescription>
            </DialogHeader>
            {processingPayout?.action === "rejected" && (
              <Textarea
                placeholder="Reason for rejection..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                className="min-h-20"
              />
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setProcessingPayout(null);
                  setRejectionReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleProcessPayout}
                disabled={
                  processPayout.isPending ||
                  (processingPayout?.action === "rejected" &&
                    !rejectionReason.trim())
                }
                className={
                  processingPayout?.action === "completed"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }
              >
                {processPayout.isPending && (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                )}
                {processingPayout?.action === "completed"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
