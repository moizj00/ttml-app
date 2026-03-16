import AppLayout from "@/components/shared/AppLayout";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  DollarSign,
  TrendingUp,
  Copy,
  Gift,
  ArrowUpRight,
  Clock,
  Loader2,
  Wallet,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CommissionStatusBadge,
  PayoutStatusBadge,
} from "@/components/shared/CommissionBadges";
import { useState, useMemo } from "react";

export default function AffiliateDashboard() {
  const { user } = useAuth();
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

  // ─── Payout Request State ───────────────────────────────────
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("bank_transfer");

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

  const handleRequestPayout = () => {
    const amountCents = Math.round(parseFloat(payoutAmount) * 100);
    if (isNaN(amountCents) || amountCents < 1000) {
      toast.error("Below minimum", {
        description: "The minimum payout amount is $10.00.",
      });
      return;
    }
    requestPayout.mutate({ amount: amountCents, paymentMethod: payoutMethod });
  };

  // ─── Copy helpers ───────────────────────────────────────────
  const handleCopyCode = () => {
    if (!discountCode?.code) return;
    navigator.clipboard.writeText(discountCode.code).then(
      () =>
        toast.success("Copied", {
          description: "Discount code copied to clipboard.",
        }),
      () =>
        toast.error("Copy failed", {
          description: "Please select and copy the code manually.",
        })
    );
  };

  const referralLink = useMemo(
    () =>
      `${window.location.origin}/pricing?coupon=${discountCode?.code ?? ""}`,
    [discountCode?.code]
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink).then(
      () =>
        toast.success("Copied", {
          description: "Referral link copied to clipboard.",
        }),
      () =>
        toast.error("Copy failed", {
          description: "Please select and copy the link manually.",
        })
    );
  };

  const isLoading = codeLoading || earningsLoading;

  return (
    <AppLayout title="Affiliate Dashboard">
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white sm:p-6">
          <h1 className="text-xl font-bold sm:text-2xl">
            Welcome, {user?.name ?? "Affiliate"}
          </h1>
          <p className="mt-1 text-blue-100">
            Earn 5% commission on every sale made with your discount code. Share
            your code and grow your earnings.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">
                Total Earned
              </CardTitle>
              <DollarSign className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  formatCurrency(earnings?.totalEarned ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                5% commission on all referred sales
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
              <Clock className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  formatCurrency(earnings?.pending ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting payout
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paid Out
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  formatCurrency(earnings?.paid ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total withdrawn
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Referrals
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  (earnings?.referralCount ?? discountCode?.usageCount ?? 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Successful conversions
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Discount Code + Referral Link */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-indigo-600" />
                Referral Program
              </CardTitle>
              <CardDescription>
                Share your unique link. Subscribers get a 20% discount, and you earn 5% commission in real-time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {codeLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : discountCode ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Referral Link</span>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 text-sm font-mono text-primary font-medium truncate">
                          {referralLink}
                        </div>
                        <Button
                          onClick={handleCopyLink}
                          variant="default"
                          size="lg"
                          className="shrink-0"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Link
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Discount Code</span>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg bg-muted px-4 py-2 text-center font-mono text-lg font-bold tracking-wider">
                          {discountCode.code}
                        </div>
                        <Button
                          onClick={handleCopyCode}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                    <span>Total Conversions: <strong>{discountCode.usageCount}</strong></span>
                    <Badge
                      variant={discountCode.isActive ? "default" : "secondary"}
                    >
                      {discountCode.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No discount code found. Contact admin.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600" />
                Referral Link
              </CardTitle>
              <CardDescription>
                Share this link directly — the discount code is pre-applied at
                checkout.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-lg bg-muted px-4 py-3 font-mono text-sm break-all">
                    {referralLink}
                  </div>
                  <Button
                    onClick={handleCopyLink}
                    variant="outline"
                    size="icon"
                    className="self-start sm:self-auto"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  When clients visit this link and purchase a letter, your
                  discount code is automatically applied.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payout Request Section */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" />
                Payout Requests
              </CardTitle>
              <CardDescription>
                Request withdrawal of your pending commissions.
              </CardDescription>
            </div>
            <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={(earnings?.pending ?? 0) < 1000}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  Request Payout
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Payout</DialogTitle>
                  <DialogDescription>
                    Available balance:{" "}
                    <strong>{formatCurrency(earnings?.pending ?? 0)}</strong>.
                    Minimum payout: $10.00.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="amount">Amount ($)</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="10"
                      step="0.01"
                      placeholder="10.00"
                      value={payoutAmount}
                      onChange={e => setPayoutAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="method">Payment Method</Label>
                    <Select
                      value={payoutMethod}
                      onValueChange={setPayoutMethod}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">
                          Bank Transfer
                        </SelectItem>
                        <SelectItem value="paypal">PayPal</SelectItem>
                        <SelectItem value="venmo">Venmo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setPayoutOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestPayout}
                    disabled={requestPayout.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {requestPayout.isPending && (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    )}
                    Submit Request
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {payoutsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : payouts && payouts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {formatDate(p.createdAt)}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No payout requests yet.</p>
                <p className="text-xs mt-1">
                  Earn commissions and request your first payout.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commission History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-indigo-600" />
              Commission History
            </CardTitle>
            <CardDescription>
              Track every commission earned from your referrals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {commissionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : commissions && commissions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Sale Amount</TableHead>
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
                      <TableCell>{formatCurrency(c.saleAmount)}</TableCell>
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No commissions yet.</p>
                <p className="text-xs mt-1">
                  Share your discount code to start earning.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
