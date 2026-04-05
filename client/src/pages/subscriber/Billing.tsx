import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import AppLayout from "@/components/shared/AppLayout";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Scale,
  AlertCircle,
  Calendar,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { useEffect } from "react";

const PLAN_DISPLAY: Record<string, { name: string; color: string }> = {
  single_letter: {
    name: "Single Letter ($299)",
    color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  },
  monthly: {
    name: "Monthly ($299/mo)",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  yearly: {
    name: "Yearly ($2,400/yr)",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  // Legacy plan names (kept for backward compatibility with existing subscriptions)
  free_trial: {
    name: "Free Trial (Legacy)",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  per_letter: {
    name: "Pay Per Letter ($299) (Legacy)",
    color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  },
  monthly_basic: {
    name: "Monthly Basic ($499/mo) (Legacy)",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  monthly_pro: {
    name: "Monthly Pro ($699/mo) (Legacy)",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  starter: {
    name: "Starter (Legacy)",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  professional: {
    name: "Professional (Legacy)",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  free_trial_review: {
    name: "Free Trial (Legacy)",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  annual: {
    name: "Annual (Legacy)",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
};

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  active: {
    label: "Active",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  canceled: {
    label: "Canceled",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  past_due: {
    label: "Past Due",
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  },
  trialing: {
    label: "Trial",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  incomplete: {
    label: "Incomplete",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  none: {
    label: "No Plan",
    color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  },
};

function PaymentHistorySection({ portalMutate }: { portalMutate: () => void }) {
  const { data: payments, isLoading } = trpc.billing.paymentHistory.useQuery();

  const statusColor = (status: string) => {
    if (status === "succeeded") return "bg-green-100 text-green-800";
    if (status === "requires_payment_method" || status === "requires_action")
      return "bg-yellow-100 text-yellow-800";
    if (status === "canceled") return "bg-red-100 text-red-800";
    return "bg-slate-100 text-slate-800";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Payment History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Link href="/subscriber/receipts">
              <Button variant="outline" size="sm" className="text-xs">
                <FileText className="w-3 h-3 mr-1" /> View All Receipts
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={portalMutate}
              className="text-xs"
            >
              <ExternalLink className="w-3 h-3 mr-1" /> Stripe Portal
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !payments || payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No payments yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {payments.map(p => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2 sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {p.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.created, "short", { unix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge className={statusColor(p.status) + " text-xs"}>
                    {p.status === "succeeded"
                      ? "Paid"
                      : p.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-sm font-semibold">
                    {formatCurrency(p.amount, p.currency)}
                  </span>
                  {p.receiptUrl && (
                    <a
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3b82f6] hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Billing() {
  const utils = trpc.useUtils();

  const {
    data: subscription,
    isLoading,
    error,
    refetch,
  } = trpc.billing.getSubscription.useQuery();

  const billingPortalMutation = trpc.billing.createBillingPortal.useMutation({
    onSuccess: data => {
      window.open(data.url, "_blank");
    },
    onError: err => {
      toast.error("Could not open billing portal", {
        description: err.message || "Please try again in a moment.",
      });
    },
  });

  // Handle success/cancel redirects from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      toast.success("Payment confirmed", {
        description:
          "Your subscription is now active. You can start submitting letters.",
      });
      utils.billing.getSubscription.invalidate();
      utils.billing.checkCanSubmit.invalidate();
      // Clean up URL
      window.history.replaceState({}, "", "/subscriber/billing");
    } else if (params.get("canceled") === "true") {
      toast.info("Checkout canceled", {
        description: "No charges were made. You can try again anytime.",
      });
      window.history.replaceState({}, "", "/subscriber/billing");
    }
  }, []);

  const planDisplay = subscription ? PLAN_DISPLAY[subscription.plan] : null;
  const statusDisplay = subscription
    ? STATUS_DISPLAY[subscription.status]
    : STATUS_DISPLAY["none"];

  const lettersRemaining =
    subscription?.lettersAllowed === -1
      ? "Unlimited"
      : subscription
        ? `${Math.max(0, (subscription.lettersAllowed ?? 0) - (subscription.lettersUsed ?? 0))} remaining`
        : "0";

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Billing" },
      ]}
    >
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Billing & Subscription
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and payment details
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {error.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetch()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : subscription && subscription.status === "active" ? (
          <>
            {/* Active Subscription Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Current Plan
                  </CardTitle>
                  <div className="flex gap-2">
                    {planDisplay && (
                      <Badge className={planDisplay.color}>
                        {planDisplay.name}
                      </Badge>
                    )}
                    <Badge className={statusDisplay.color}>
                      {statusDisplay.label}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Letters Used
                    </p>
                    <p className="text-lg font-semibold flex items-center gap-1">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      {subscription.lettersUsed ?? 0}
                      {subscription.lettersAllowed !== -1 &&
                        ` / ${subscription.lettersAllowed}`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Remaining
                    </p>
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {lettersRemaining}
                    </p>
                  </div>
                  {subscription.currentPeriodStart && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Period Start
                      </p>
                      <p className="text-sm flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        {formatDate(subscription.currentPeriodStart, "long")}
                      </p>
                    </div>
                  )}
                  {subscription.currentPeriodEnd && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        {subscription.cancelAtPeriodEnd
                          ? "Cancels On"
                          : "Renews On"}
                      </p>
                      <p className="text-sm flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        {formatDate(subscription.currentPeriodEnd, "long")}
                      </p>
                    </div>
                  )}
                </div>

                {subscription.cancelAtPeriodEnd && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <p className="text-sm text-orange-800 dark:text-orange-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Your subscription will cancel at the end of the current
                      period.
                    </p>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => billingPortalMutation.mutate()}
                    disabled={billingPortalMutation.isPending}
                  >
                    {billingPortalMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />{" "}
                        Opening...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" /> Manage Billing
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </>
                    )}
                  </Button>
                  <Link href="/pricing">
                    <Button variant="ghost">Upgrade Plan</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* No Active Subscription */
          <Card className="border-dashed border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#3b82f6]" />
                No Active Subscription
              </CardTitle>
              <CardDescription>
                Subscribe to start submitting professional legal letters
                reviewed by attorneys.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription && subscription.status !== "active" && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Your previous subscription is{" "}
                    <strong>{subscription.status}</strong>.
                  </p>
                </div>
              )}
              <Link href="/pricing">
                <Button className="bg-[#3b82f6] hover:bg-[#2563eb] text-white">
                  <Scale className="w-4 h-4 mr-2" />
                  View Plans & Subscribe
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Payment History */}
        <PaymentHistorySection
          portalMutate={() => billingPortalMutation.mutate()}
        />
      </div>
    </AppLayout>
  );
}
