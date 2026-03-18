import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DiscountCodeInput,
  type DiscountCodeResult,
} from "@/components/DiscountCodeInput";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Scale, Shield, Zap, Gift } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { PRICING } from "../../../shared/pricing";

const PLANS = [
  {
    id: PRICING.freeTrial.id,
    name: PRICING.freeTrial.name,
    priceDisplay: PRICING.freeTrial.priceDisplay,
    priceNumeric: PRICING.freeTrial.price,
    period: PRICING.freeTrial.period,
    description: PRICING.freeTrial.description,
    badge: null as string | null,
    features: PRICING.freeTrial.features as readonly string[],
    cta: "Start Free",
    highlight: false,
    isFree: true,
  },
  {
    id: PRICING.perLetter.id,
    name: PRICING.perLetter.name,
    priceDisplay: PRICING.perLetter.priceDisplay,
    priceNumeric: PRICING.perLetter.price,
    period: PRICING.perLetter.period,
    description: PRICING.perLetter.description,
    badge: null as string | null,
    features: PRICING.perLetter.features as readonly string[],
    cta: "Get This Letter",
    highlight: false,
    isFree: false,
  },
  {
    id: PRICING.monthlyBasic.id,
    name: "Yearly",
    priceDisplay: PRICING.monthlyBasic.priceDisplay,
    priceNumeric: PRICING.monthlyBasic.price,
    period: PRICING.monthlyBasic.period,
    description: PRICING.monthlyBasic.description,
    badge: "Most Popular" as string | null,
    features: PRICING.monthlyBasic.features as readonly string[],
    cta: "Subscribe — Yearly",
    highlight: true,
    isFree: false,
  },
  {
    id: PRICING.monthlyPro.id,
    name: "Yearly Pro",
    priceDisplay: PRICING.monthlyPro.priceDisplay,
    priceNumeric: PRICING.monthlyPro.price,
    period: PRICING.monthlyPro.period,
    description: PRICING.monthlyPro.description,
    badge: "Best Value" as string | null,
    features: PRICING.monthlyPro.features as readonly string[],
    cta: "Subscribe — Yearly Pro",
    highlight: false,
    isFree: false,
  },
];

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();

  // Extract ?code= or ?coupon= URL parameter (employee referral links use ?coupon=)
  const urlCode = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("code") ?? params.get("coupon") ?? undefined;
  }, [searchString]);

  // Discount code state
  const [appliedDiscount, setAppliedDiscount] =
    useState<DiscountCodeResult | null>(null);

  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: data => {
      toast.info("Redirecting to secure checkout...");
      window.open(data.url, "_blank");
    },
    onError: err => {
      toast.error(err.message || "Failed to create checkout session");
    },
  });

  const handleSelectPlan = (planId: string, isFree: boolean) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (isFree) {
      navigate("/submit-letter");
      return;
    }
    checkoutMutation.mutate({
      planId,
      discountCode: appliedDiscount?.code,
    });
  };

  // Calculate discounted prices for display
  const getDiscountedPrice = (priceNumeric: number) => {
    if (!appliedDiscount || priceNumeric === 0) return null;
    return Math.round(
      priceNumeric * (1 - appliedDiscount.discountPercent / 100)
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <Scale className="w-12 h-12 text-blue-500" />
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Resolve your dispute faster with lawyer-drafted letters and negotiations
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Professionally drafted and attorney-reviewed legal letters. Start
            with your first letter free, then choose the plan that fits your
            needs.
          </p>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map(plan => (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                plan.highlight
                  ? "border-blue-500 shadow-lg shadow-blue-500/20 scale-105"
                  : "border-border"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge
                    className={
                      plan.highlight
                        ? "bg-[#3b82f6] text-white"
                        : "bg-amber-500 text-white"
                    }
                  >
                    {plan.badge}
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  {plan.isFree && <Gift className="w-4 h-4 text-emerald-500" />}
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                </div>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  {!plan.isFree && appliedDiscount ? (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-4xl font-bold text-foreground">
                        ${getDiscountedPrice(plan.priceNumeric)}
                      </span>
                      <span className="text-lg text-muted-foreground line-through">
                        {plan.priceDisplay}
                      </span>
                      <span className="text-xs text-emerald-600 font-semibold">
                        {appliedDiscount.discountPercent}% off
                      </span>
                    </div>
                  ) : (
                    <span className="text-4xl font-bold text-foreground">
                      {plan.priceDisplay}
                    </span>
                  )}
                  <span className="text-muted-foreground ml-1">
                    {plan.period}
                  </span>
                </div>
                
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 flex-1 mb-6">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full ${plan.highlight ? "bg-[#3b82f6] hover:bg-[#2563eb] text-white" : ""} ${plan.isFree ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                  variant={
                    plan.highlight || plan.isFree ? "default" : "outline"
                  }
                  onClick={() => handleSelectPlan(plan.id, plan.isFree)}
                  disabled={checkoutMutation.isPending && !plan.isFree}
                >
                  {checkoutMutation.isPending &&
                  checkoutMutation.variables?.planId === plan.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />{" "}
                      Processing...
                    </>
                  ) : (
                    plan.cta
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Discount Code Section */}
        <div className="mt-10 max-w-md mx-auto">
          <DiscountCodeInput
            variant="light"
            initialCode={urlCode}
            onCodeChange={result => setAppliedDiscount(result)}
            label="Have a promo or referral code?"
          />
          {appliedDiscount && (
            <p className="text-center text-sm text-emerald-600 font-medium mt-2">
              {appliedDiscount.discountPercent}% discount will be applied to all
              paid plans below.
            </p>
          )}
        </div>

        {/* How it works note */}
        <div className="mt-10 p-5 bg-muted/30 border border-border rounded-xl max-w-2xl mx-auto text-center">
          <h3 className="font-semibold text-foreground mb-2">How It Works</h3>
          <p className="text-sm text-muted-foreground">
            Your first letter — including professional research, drafting, and
            licensed attorney review — is completely free. After your free
            letter, choose to pay <strong>${PRICING.perLetter.price}</strong>{" "}
            per letter or subscribe for{" "}
            <strong>${PRICING.monthlyBasic.price}/month</strong> (4 letters) or{" "}
            <strong>${PRICING.monthlyPro.price}/month</strong> (8 letters). All
            plans include attorney review and PDF delivery.
          </p>
        </div>

        {/* Trust badges */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <Shield className="w-8 h-8 text-[#3b82f6]" />
            <h3 className="font-semibold">Attorney Reviewed</h3>
            <p className="text-sm text-muted-foreground">
              Every letter reviewed and approved by a licensed attorney before
              delivery
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Zap className="w-8 h-8 text-amber-500" />
            <h3 className="font-semibold">Professional Drafting</h3>
            <p className="text-sm text-muted-foreground">
              Multi-stage legal research and professional drafting for every
              letter
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Scale className="w-8 h-8 text-green-500" />
            <h3 className="font-semibold">Secure & Confidential</h3>
            <p className="text-sm text-muted-foreground">
              Your legal matters are handled with strict confidentiality and
              256-bit SSL
            </p>
          </div>
        </div>


      </div>
    </div>
  );
}
