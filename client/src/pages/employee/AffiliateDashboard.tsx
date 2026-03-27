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
  RefreshCw,
  MousePointerClick,
  BarChart3,
  ExternalLink,
  CalendarClock,
  AlertTriangle,
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
import { useLocation } from "wouter";
import { useStaggerReveal, staggerStyle } from "@/hooks/useAnimations";

type TabId = "overview" | "referrals" | "earnings";

function pathToTab(path: string): TabId {
  if (path === "/employee/referrals") return "referrals";
  if (path === "/employee/earnings") return "earnings";
  return "overview";
}

export default function AffiliateDashboard() {
  const { user } = useAuth();
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
    onError: err => console.error("[AffiliateDashboard] rotateCode error:", err.message),
  });

  const availableBalanceDollars = (earnings?.pending ?? 0) / 100;

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

  // ─── Copy helpers ───────────────────────────────────────────
  const handleCopyCode = () => {
    if (!discountCode?.code) return;
    const codeToCopy = discountCode.code;
    navigator.clipboard.writeText(codeToCopy).then(
      () => {
        toast.success("Copied", {
          description: `${codeToCopy} copied to clipboard.`,
        });
      },
      () =>
        toast.error("Copy failed", {
          description: "Please select and copy the code manually.",
        })
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

  const referralLink = useMemo(
    () =>
      `${window.location.origin}/pricing?coupon=${discountCode?.code ?? ""}`,
    [discountCode?.code]
  );

  // Worker-based shareable referral URL (tracks clicks at edge)
  const workerReferralLink = useMemo(
    () => `https://refer.talktomylawyer.com/${discountCode?.code ?? ""}`,
    [discountCode?.code]
  );

  const handleCopyWorkerLink = () => {
    navigator.clipboard.writeText(workerReferralLink).then(
      () =>
        toast.success("Copied", {
          description: "Tracked referral link copied to clipboard.",
        }),
      () =>
        toast.error("Copy failed", {
          description: "Please select and copy the link manually.",
        })
    );
  };

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
  const statCardVisible = useStaggerReveal(4, 80);

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
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-white/20 text-white" data-testid="text-employee-id">
                {user.employeeId}
              </span>
            )}
          </div>
          <p className="mt-1 text-blue-100">
            Earn 5% commission on every sale made with your discount code. Share
            your code and grow your earnings.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 rounded-lg bg-muted p-1" data-testid="tabs-employee">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-primary/20 bg-primary/5 shadow-sm" data-testid="card-stat-total-earned" style={staggerStyle(0, statCardVisible[0])}>

            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">
                Total Earned
              </CardTitle>
              <DollarSign className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary" data-testid="text-total-earned">
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

          <Card data-testid="card-stat-pending" style={staggerStyle(1, statCardVisible[1])}>

            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
              <Clock className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600" data-testid="text-pending-balance">
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

          <Card data-testid="card-stat-paid-out" style={staggerStyle(2, statCardVisible[2])}>

            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paid Out
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-paid-out">
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

          <Card data-testid="card-stat-referrals" style={staggerStyle(3, statCardVisible[3])}>

            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Referrals
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-referral-count">
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

        {/* Discount Code + Referral Link — overview & referrals tabs */}
        {(activeTab === "overview" || activeTab === "referrals") && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-indigo-600" />
                Referral Program
              </CardTitle>
              <CardDescription>
                Share your unique link. New subscribers get 20% off their first payment, and you earn 5% commission in real-time.
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
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Tracked Referral Link</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <MousePointerClick className="w-2.5 h-2.5" />
                          Click tracking on
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 text-sm font-mono text-primary font-medium truncate" data-testid="text-worker-referral-link">
                          {workerReferralLink}
                        </div>
                        <Button
                          onClick={handleCopyWorkerLink}
                          variant="default"
                          size="lg"
                          className="shrink-0"
                          data-testid="button-copy-worker-link"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Use this link to share — it tracks clicks automatically and redirects to the pricing page.
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Direct Pricing Link</span>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg bg-muted/60 border border-border px-4 py-2.5 text-sm font-mono text-muted-foreground truncate">
                          {referralLink}
                        </div>
                        <Button
                          onClick={handleCopyLink}
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          data-testid="button-copy-referral-link"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Discount Code</span>
                        <span className="text-[10px] text-muted-foreground/70 italic">Unlimited use</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg bg-muted px-4 py-2 text-center font-mono text-lg font-bold tracking-wider">
                          {rotateCode.isPending ? (
                            <span className="text-muted-foreground text-sm font-normal flex items-center justify-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Regenerating…
                            </span>
                          ) : discountCode.code}
                        </div>
                        <Button
                          onClick={handleCopyCode}
                          variant="outline"
                          size="sm"
                          disabled={rotateCode.isPending}
                          data-testid="button-copy-discount-code"
                          title="Copy discount code"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleRegenerateCode}
                          variant="ghost"
                          size="sm"
                          disabled={rotateCode.isPending}
                          data-testid="button-regenerate-code"
                          title="Generate a new code (e.g. if you suspect it was leaked)"
                        >
                          {rotateCode.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Share this code with anyone — it can be used by multiple people. Use "Regenerate" only if you suspect the code was leaked.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                    <span>Total Conversions: <strong>{discountCode.usageCount}</strong></span>
                    <div className="flex items-center gap-2">
                      {discountCode.expiresAt ? (
                        new Date(discountCode.expiresAt) < new Date() ? (
                          <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-code-expired">
                            <AlertTriangle className="w-3 h-3" />
                            Expired
                          </Badge>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-code-expires">
                            <CalendarClock className="w-3 h-3" />
                            Expires {formatDate(discountCode.expiresAt)}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground" data-testid="text-code-no-expiry">
                          No expiration
                        </span>
                      )}
                      <Badge
                        variant={discountCode.isActive ? "default" : "secondary"}
                      >
                        {discountCode.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No discount code found. Contact admin.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Click Analytics Card — referrals tab */}
          {activeTab === "referrals" && (
            <Card data-testid="card-click-analytics">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  Click Analytics
                </CardTitle>
                <CardDescription>
                  Real-time click tracking from your referral link — last 30 days.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 text-center" data-testid="stat-total-clicks">
                        <div className="text-2xl font-bold text-primary">
                          {clickAnalytics?.totalClicks ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Total Clicks</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-center" data-testid="stat-unique-visitors">
                        <div className="text-2xl font-bold text-emerald-700">
                          {clickAnalytics?.uniqueVisitors ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Unique Visitors</p>
                      </div>
                    </div>

                    {clickAnalytics && clickAnalytics.daily.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Daily Breakdown</p>
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {clickAnalytics.daily.map((day) => (
                            <div
                              key={day.date}
                              className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0"
                              data-testid={`row-analytics-${day.date}`}
                            >
                              <span className="text-muted-foreground font-mono text-xs">{day.date}</span>
                              <div className="flex items-center gap-3 text-xs">
                                <span>
                                  <span className="font-semibold text-foreground">{day.clicks}</span>
                                  <span className="text-muted-foreground ml-1">clicks</span>
                                </span>
                                <span>
                                  <span className="font-semibold text-emerald-600">{day.uniqueVisitors}</span>
                                  <span className="text-muted-foreground ml-1">unique</span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No clicks tracked yet.</p>
                        <p className="text-xs mt-1">Share your tracked referral link to start seeing analytics.</p>
                        <a
                          href="https://refer.talktomylawyer.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          refer.talktomylawyer.com
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>}

        {/* Payout Request Section — overview & earnings tabs */}
        {(activeTab === "overview" || activeTab === "earnings") && <Card>
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
                      data-testid="input-payout-amount"
                      type="number"
                      min="10"
                      max={availableBalanceDollars}
                      step="0.01"
                      placeholder="10.00"
                      value={payoutAmount}
                      onChange={e => setPayoutAmount(e.target.value)}
                    />
                    {payoutAmount && parseFloat(payoutAmount) > availableBalanceDollars && (
                      <p className="text-xs text-destructive mt-1">
                        Amount exceeds your available balance of {formatCurrency(earnings?.pending ?? 0)}.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="method">Payment Method</Label>
                    <Select
                      value={payoutMethod}
                      onValueChange={val => {
                        setPayoutMethod(val);
                        setPaypalEmail("");
                        setVenmoHandle("");
                      }}
                    >
                      <SelectTrigger data-testid="select-payout-method">
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
                  {payoutMethod === "paypal" && (
                    <div>
                      <Label htmlFor="paypal-email">PayPal Email</Label>
                      <Input
                        id="paypal-email"
                        data-testid="input-paypal-email"
                        type="email"
                        placeholder="you@example.com"
                        value={paypalEmail}
                        onChange={e => setPaypalEmail(e.target.value)}
                      />
                    </div>
                  )}
                  {payoutMethod === "venmo" && (
                    <div>
                      <Label htmlFor="venmo-handle">Venmo Handle</Label>
                      <Input
                        id="venmo-handle"
                        data-testid="input-venmo-handle"
                        type="text"
                        placeholder="@your-venmo"
                        value={venmoHandle}
                        onChange={e => setVenmoHandle(e.target.value)}
                      />
                    </div>
                  )}
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
                    data-testid="button-submit-payout"
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
                    <TableRow key={p.id} data-testid={`row-payout-${p.id}`}>
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
        </Card>}

        {/* Commission History — overview & earnings tabs */}
        {(activeTab === "overview" || activeTab === "earnings") && <Card>
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
                    <TableRow key={c.id} data-testid={`row-commission-${c.id}`}>
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
        </Card>}
      </div>
    </AppLayout>
  );
}
