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
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CommissionStatusBadge,
  PayoutStatusBadge,
} from "@/components/shared/CommissionBadges";

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
                  Employee Performance
                </CardTitle>
                <CardDescription>
                  Overview of each affiliate's referral activity and earnings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {perfLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : performance && performance.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
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
                          <TableRow key={emp.employeeId}>
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No employees found.</p>
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
                  Manage employee discount codes. Toggle active/inactive status.
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
                        <TableHead>Employee</TableHead>
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
                  Full ledger of all commissions across employees.
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
                          <TableHead>Employee</TableHead>
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
                  Review and process employee payout requests.
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
                        <TableHead>Employee</TableHead>
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
