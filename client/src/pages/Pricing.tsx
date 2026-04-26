import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
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
import PublicNav from "@/components/shared/PublicNav";
import PublicBreadcrumb from "@/components/shared/PublicBreadcrumb";
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
    priceSub: null as string | null,
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
    badge: "Best Value" as string | null,
    features: PRICING.yearly.features as readonly string[],
    cta: "Subscribe Yearly",
    highlight: false,
  },
];

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const returnTo = urlParams.get("returnTo");

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
      if (planId === "single_letter") {
        navigate(`/signup?next=${encodeURIComponent("/submit")}`);
      } else {
        navigate(
          `/signup${returnTo ? "?next=" + encodeURIComponent(`/pricing?returnTo=${returnTo}`) : ""}`
        );
      }
      return;
    }
    if (planId === "single_letter") {
      navigate("/submit");
      return;
    }
    checkoutMutation.mutate({
      planId,
      discountCode: appliedDiscount?.code,
      returnTo: returnTo || undefined,
    });
  };

  // Calculate discounted prices for display
  const getDiscountedPrice = (priceNumeric: number) => {
    if (!appliedDiscount) return null;
    return Math.round(
      priceNumeric * (1 - appliedDiscount.discountPercent / 100)
    );
  };

  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Talk to My Lawyer — Legal Letter Service",
    url: "https://www.talk-to-my-lawyer.com/pricing",
    provider: {
      "@type": "Organization",
      name: "Talk to My Lawyer",
      url: "https://www.talk-to-my-lawyer.com",
    },
    description:
      `Professional attorney-reviewed legal letters. Choose from single letter (${PRICING.singleLetter.priceDisplay}), monthly subscription (${PRICING.monthly.priceDisplay}/month for ${PRICING.monthly.lettersIncluded} letters), or yearly plan (${PRICING.yearly.priceDisplay}/year for ${PRICING.yearly.lettersIncluded} letters).`,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Legal Letter Plans",
      itemListElement: [
        {
          "@type": "Offer",
          name: "Single Letter",
          price: String(PRICING.singleLetter.price),
          priceCurrency: "USD",
          description:
            "One professionally drafted and attorney-reviewed legal letter. No subscription required.",
          eligibleQuantity: { "@type": "QuantitativeValue", value: 1 },
        },
        {
          "@type": "Offer",
          name: "Monthly Plan",
          price: String(PRICING.monthly.price),
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            billingDuration: "P1M",
          },
          description:
            "4 attorney-reviewed letters per month. Best for individuals with regular legal needs.",
        },
        {
          "@type": "Offer",
          name: "Yearly Plan",
          price: String(PRICING.yearly.price),
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            billingDuration: "P1Y",
          },
          description: "8 attorney-reviewed letters per year, billed annually.",
        },
      ],
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicNav activeLink="/pricing" />
      <PublicBreadcrumb items={[{ label: "Pricing" }]} />
      <Helmet>
        <title>
          Legal Letter Pricing — Single, Monthly & Yearly Plans | Talk to My
          Lawyer
        </title>
        <meta
          name="description"
          content={`Transparent pricing for attorney-reviewed legal letters. Single letter ${PRICING.singleLetter.priceDisplay}, monthly ${PRICING.monthly.priceDisplay}/month (${PRICING.monthly.lettersIncluded} letters), or yearly ${PRICING.yearly.priceDisplay} (${PRICING.yearly.lettersIncluded} letters). All plans include attorney review and PDF delivery.`}
        />
        <link
          rel="canonical"
          href="https://www.talk-to-my-lawyer.com/pricing"
        />
        <meta
          property="og:title"
          content="Legal Letter Pricing Plans | Talk to My Lawyer"
        />
        <meta
          property="og:description"
          content={`Choose the right plan for your legal needs. Single letter ${PRICING.singleLetter.priceDisplay}, monthly ${PRICING.monthly.priceDisplay}/month, or yearly ${PRICING.yearly.priceDisplay}. Attorney review included in every plan.`}
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content="https://www.talk-to-my-lawyer.com/pricing"
        />
        <meta
          property="og:image"
          content="https://www.talk-to-my-lawyer.com/logo-main.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Legal Letter Pricing Plans | Talk to My Lawyer"
        />
        <meta
          name="twitter:description"
          content="Transparent pricing for attorney-reviewed legal letters. Single, monthly, and yearly plans available."
        />
        <meta
          name="twitter:image"
          content="https://www.talk-to-my-lawyer.com/logo-main.png"
        />
        <script type="application/ld+json">
          {JSON.stringify(pricingJsonLd)}
        </script>
      </Helmet>

      {/* Header */}
      <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <Scale className="w-12 h-12 text-blue-500" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Structured Drafting + Attorney Review — Starting at {PRICING.singleLetter.priceDisplay}
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            The only service that combines structured drafting with live
            attorney review and web-grounded legal research — delivered in
            hours, not weeks.
          </p>
        </div>
      </header>

      {/* Plans */}
      <main className="max-w-6xl mx-auto px-4 py-16">
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
              {appliedDiscount.discountPercent}% discount will be applied to all
              plans.
            </p>
          )}
        </div>

        {/* How it works note */}
        <div className="mt-10 p-5 bg-muted/30 border border-border rounded-xl max-w-2xl mx-auto text-center">
          <h3 className="font-semibold text-foreground mb-2">How It Works</h3>
          <p className="text-sm text-muted-foreground">
            Choose a plan and complete checkout to get started. Pay{" "}
            <strong>${PRICING.singleLetter.price}</strong> for a single draft,
            or subscribe for <strong>${PRICING.monthly.price}/month</strong> (4
            drafts) or <strong>${PRICING.yearly.price}/year</strong> (8 drafts
            total). All plans include California-focused drafting and PDF
            delivery.
          </p>
        </div>

        {/* Trust badges */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <Shield className="w-8 h-8 text-[#3b82f6]" />
            <h3 className="font-semibold">Built for Attorney Review</h3>
            <p className="text-sm text-muted-foreground">
              Every draft is structured for licensed attorney review before
              delivery — review-friendly outputs every time
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Zap className="w-8 h-8 text-amber-500" />
            <h3 className="font-semibold">California-Focused Drafting</h3>
            <p className="text-sm text-muted-foreground">
              Built from curated legal-letter patterns designed around
              California legal language and repeatable workflows
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
      </main>
    </div>
  );
}
