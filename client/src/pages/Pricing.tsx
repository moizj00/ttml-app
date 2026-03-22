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
import { CheckCircle2, Loader2, Scale, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { PRICING } from "../../../shared/pricing";

const PLANS = [
  {
    id: PRICING.singleLetter.id,
    name: PRICING.singleLetter.name,
    priceDisplay: PRICING.singleLetter.priceDisplay,
    priceNumeric: PRICING.singleLetter.price,
    period: PRICING.singleLetter.period,
    priceSub: null as string | null,
    description: PRICING.singleLetter.description,
    badge: null as string | null,
    features: PRICING.singleLetter.features as readonly string[],
    cta: "Get This Letter",
    highlight: false,
  },
  {
    id: PRICING.monthly.id,
    name: PRICING.monthly.name,
    priceDisplay: PRICING.monthly.priceDisplay,
    priceNumeric: PRICING.monthly.price,
    period: PRICING.monthly.period,
    priceSub: "$50 per letter" as string | null,
    description: PRICING.monthly.description,
    badge: "Most Popular" as string | null,
    features: PRICING.monthly.features as readonly string[],
    cta: "Subscribe Monthly",
    highlight: true,
  },
  {
    id: PRICING.yearly.id,
    name: PRICING.yearly.name,
    priceDisplay: PRICING.yearly.priceDisplay,
    priceNumeric: PRICING.yearly.price,
    period: PRICING.yearly.period,
    priceSub: null as string | null,
    description: PRICING.yearly.description,
    badge: "2 Months Free" as string | null,
    features: PRICING.yearly.features as readonly string[],
    cta: "Subscribe Yearly",
    highlight: false,
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
      const win = window.open(data.url, "_blank");
      if (!win) {
        window.location.href = data.url;
      }
    },
    onError: err => {
      toast.error(err.message || "Failed to create checkout session");
    },
  });

  const handleSelectPlan = (planId: string) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (planId === "single") {
      navigate("/submit");
      return;
    }
    checkoutMutation.mutate({
      planId,
      discountCode: appliedDiscount?.code,
    });
  };

  // Calculate discounted prices for display
  const getDiscountedPrice = (priceNumeric: number) => {
    if (!appliedDiscount) return null;
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
            Professionally drafted and attorney-reviewed legal letters. Choose the plan that fits your needs.
          </p>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <Card
              key={plan.id}
              data-testid={`card-plan-${plan.id}`}
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
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  {appliedDiscount ? (
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
                  {plan.priceSub && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.priceSub}
                    </p>
                  )}
                </div>
                <p className="text-xs mt-1 font-medium text-emerald-600">
                  Attorney review included
                </p>
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
                  data-testid={`button-select-plan-${plan.id}`}
                  className={`w-full ${plan.highlight ? "bg-[#3b82f6] hover:bg-[#2563eb] text-white" : ""}`}
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={checkoutMutation.isPending}
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
              {appliedDiscount.discountPercent}% discount will be applied to all plans.
            </p>
          )}
        </div>

        {/* How it works note */}
        <div className="mt-10 p-5 bg-muted/30 border border-border rounded-xl max-w-2xl mx-auto text-center">
          <h3 className="font-semibold text-foreground mb-2">How It Works</h3>
          <p className="text-sm text-muted-foreground">
            Choose a plan and complete checkout to get started. Pay{" "}
            <strong>${PRICING.singleLetter.price}</strong> for a single letter,
            or subscribe for{" "}
            <strong>${PRICING.monthly.price}/month</strong> (4 letters, $50 per letter) or{" "}
            <strong>${PRICING.yearly.price}/year</strong> (4 letters/month, 2 months free). All
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
