import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { X, Zap, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const PRO_BENEFITS = [
  "8 letters/month (vs 4 on Basic)",
  "Priority attorney review queue",
  "Same-day turnaround guarantee",
];

const BASIC_PLAN_IDS = ["monthly_basic", "starter", "monthly"];
const SESSION_KEY = "upgrade_banner_dismissed";

interface Props {
  plan?: string | null;
}

export default function UpgradeBanner({ plan }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
  });

  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      toast.info("Redirecting to checkout...");
      window.open(data.url, "_blank");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start checkout");
    },
  });

  const handleDismiss = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { }
    setDismissed(true);
  };

  const handleUpgrade = () => {
    checkoutMutation.mutate({ planId: "monthly_pro" });
  };

  if (dismissed || !plan || !BASIC_PLAN_IDS.includes(plan)) return null;

  return (
    <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 sm:p-5 text-white overflow-hidden">
      {/* Background decoration */}
      <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8 pointer-events-none" />
      <div className="absolute right-12 bottom-0 w-20 h-20 bg-white/5 rounded-full translate-y-6 pointer-events-none" />

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pr-6">
        {/* Icon + text */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-yellow-300" fill="currentColor" />
            <span className="text-sm font-bold tracking-wide uppercase text-blue-100">Upgrade to Monthly Pro</span>
          </div>
          <p className="text-white/90 text-sm font-medium mb-2">
            You're on Monthly Basic — unlock more with Pro for only $699/mo.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {PRO_BENEFITS.map((b) => (
              <span key={b} className="flex items-center gap-1 text-xs text-blue-100">
                <CheckCircle className="w-3 h-3 text-green-300 flex-shrink-0" />
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Button
          size="sm"
          className="bg-white text-blue-700 hover:bg-blue-50 font-semibold flex-shrink-0 shadow-md"
          onClick={handleUpgrade}
          disabled={checkoutMutation.isPending}
        >
          {checkoutMutation.isPending ? "Loading..." : "Upgrade to Pro →"}
        </Button>
      </div>
    </div>
  );
}
