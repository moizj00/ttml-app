import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DiscountCodeInput,
  type DiscountCodeResult,
} from "@/components/DiscountCodeInput";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  Loader2,
  Scale,
  Shield,
  Zap,
  Sparkles,
  ArrowRight,
  Star,
} from "lucide-react";
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
    cta: "Get this letter",
    highlight: false,
    accent: "from-slate-600 to-slate-800",
  },
  {
    id: PRICING.monthly.id,
    name: PRICING.monthly.name,
    priceDisplay: PRICING.monthly.priceDisplay,
    priceNumeric: PRICING.monthly.price,
    period: PRICING.monthly.period,
    priceSub: null as string | null,
    description: PRICING.monthly.description,
    badge: "Most popular" as string | null,
    features: PRICING.monthly.features as readonly string[],
    cta: "Subscribe monthly",
    highlight: true,
    accent: "from-indigo-600 to-purple-600",
  },
  {
    id: PRICING.yearly.id,
    name: PRICING.yearly.name,
    priceDisplay: PRICING.yearly.priceDisplay,
    priceNumeric: PRICING.yearly.price,
    period: PRICING.yearly.period,
    priceSub: null as string | null,
    description: PRICING.yearly.description,
    badge: "Best value" as string | null,
    features: PRICING.yearly.features as readonly string[],
    cta: "Subscribe yearly",
    highlight: false,
    accent: "from-emerald-600 to-teal-600",
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
      navigate(
        `/signup${returnTo ? "?next=" + encodeURIComponent(`/pricing?returnTo=${returnTo}`) : ""}`
      );
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
    description: `Professional attorney-reviewed legal letters. Choose from single letter (${PRICING.singleLetter.priceDisplay}), monthly subscription (${PRICING.monthly.priceDisplay}/month for ${PRICING.monthly.lettersIncluded} letters), or yearly plan (${PRICING.yearly.priceDisplay}/year for ${PRICING.yearly.lettersIncluded} letters).`,
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <PublicNav activeLink="/pricing" />
      <PublicBreadcrumb items={[{ label: "Pricing" }]} />
      <Helmet>
        <title>
          Legal Letter Pricing — Single, Monthly &amp; Yearly Plans | Talk to My
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

      {/* ── Hero ── */}
      <header className="relative overflow-hidden">
        {/* Decorative gradient blobs */}
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute top-20 right-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl"
          aria-hidden="true"
        />

        <div className="relative max-w-5xl mx-auto px-4 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 mb-5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700 tracking-wide">
              Attorney review included in every plan
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.05] tracking-tight">
            Pick the plan that fits.
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
              Get a real letter, signed by a real attorney.
            </span>
          </h1>

          <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Structured drafting, web-grounded research, and live attorney
            review — delivered in hours, not weeks. Starting at{" "}
            <span className="font-bold text-slate-900">
              {PRICING.singleLetter.priceDisplay}
            </span>
            .
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
            {[
              { icon: Shield, text: "Licensed attorney review" },
              { icon: Zap, text: "Hours, not weeks" },
              { icon: Scale, text: "California-focused" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5">
                <Icon className="w-4 h-4 text-indigo-500" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Plan cards ── */}
      <main className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5 lg:gap-6">
          {PLANS.map(plan => {
            const isPending =
              checkoutMutation.isPending &&
              checkoutMutation.variables?.planId === plan.id;
            const discountedPrice = getDiscountedPrice(plan.priceNumeric);

            return (
              <div
                key={plan.id}
                data-testid={`card-plan-${plan.id}`}
                className={`relative flex flex-col rounded-2xl bg-white transition-all duration-300 group ${
                  plan.highlight
                    ? "border-2 border-indigo-500 shadow-2xl shadow-indigo-500/20 md:scale-[1.03] md:-translate-y-1"
                    : "border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {/* Top accent bar — only for highlight card */}
                {plan.highlight && (
                  <div
                    className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500"
                    aria-hidden="true"
                  />
                )}

                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <div
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white shadow-md ${
                        plan.highlight
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600"
                          : "bg-gradient-to-r from-emerald-600 to-teal-600"
                      }`}
                    >
                      {plan.highlight && (
                        <Star className="w-3 h-3 fill-current" />
                      )}
                      {plan.badge}
                    </div>
                  </div>
                )}

                <div className="p-6 md:p-7 flex-1 flex flex-col">
                  {/* Plan name + tagline */}
                  <div className="mb-5">
                    <h3 className="text-lg font-bold text-slate-900">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 leading-snug">
                      {plan.description}
                    </p>
                  </div>

                  {/* Price block */}
                  <div className="mb-6 pb-6 border-b border-slate-100">
                    {discountedPrice !== null ? (
                      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                        <span className="text-4xl font-black text-slate-900 leading-none">
                          ${discountedPrice}
                        </span>
                        <span className="text-base text-slate-400 line-through">
                          {plan.priceDisplay}
                        </span>
                        <span className="text-sm text-slate-500 font-medium">
                          {plan.period}
                        </span>
                        <span className="ml-auto inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {appliedDiscount?.discountPercent}% off
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl md:text-5xl font-black text-slate-900 leading-none">
                          {plan.priceDisplay}
                        </span>
                        <span className="text-base text-slate-500 font-medium ml-1">
                          {plan.period}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Attorney review included
                    </div>
                  </div>

                  {/* Features list */}
                  <ul className="space-y-2.5 flex-1 mb-6">
                    {plan.features.map(feature => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-slate-700"
                      >
                        <span
                          className={`flex-shrink-0 w-4 h-4 rounded-full bg-gradient-to-br ${plan.accent} flex items-center justify-center mt-0.5`}
                          aria-hidden="true"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                        </span>
                        <span className="leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Button
                    data-testid={`button-select-plan-${plan.id}`}
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={checkoutMutation.isPending}
                    className={`w-full h-11 font-semibold rounded-xl transition-all group/btn ${
                      plan.highlight
                        ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    }`}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing…
                      </>
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="w-4 h-4 ml-1.5 group-hover/btn:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
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
            <p className="text-center text-sm text-emerald-600 font-semibold mt-3">
              {appliedDiscount.discountPercent}% discount applied to all plans.
            </p>
          )}
        </div>

        {/* ── How it works strip ── */}
        <section className="mt-16 mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-slate-900 mb-2">
            How it works
          </h2>
          <p className="text-center text-sm text-slate-500 mb-8">
            From submission to signed letter in under 24 hours.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: "01",
                title: "Submit your matter",
                desc: "Tell us the situation — sender, recipient, jurisdiction, what you want. Takes 3 minutes.",
              },
              {
                step: "02",
                title: "AI drafts the letter",
                desc: "Our pipeline researches the relevant law and drafts a structured, jurisdiction-aware letter.",
              },
              {
                step: "03",
                title: "Attorney reviews & signs",
                desc: "A licensed attorney reviews, edits, and signs. You get a polished PDF — typically within hours.",
              },
            ].map(({ step, title, desc }) => (
              <div
                key={step}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-xs font-black text-indigo-500 tracking-widest mb-2">
                  {step}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">
                  {title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust strip ── */}
        <section className="mt-16 mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                icon: Shield,
                title: "Built for attorney review",
                desc: "Every draft is structured for licensed attorney review before delivery.",
                color: "text-indigo-600 bg-indigo-50 ring-indigo-100",
              },
              {
                icon: Zap,
                title: "California-focused drafting",
                desc: "Curated legal-letter patterns built for California legal language.",
                color: "text-amber-600 bg-amber-50 ring-amber-100",
              },
              {
                icon: Scale,
                title: "Secure & confidential",
                desc: "Your matters are handled with strict confidentiality and 256-bit SSL.",
                color: "text-emerald-600 bg-emerald-50 ring-emerald-100",
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-5 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ${color}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    {title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ-style note ── */}
        <section className="mt-12 mx-auto max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-900 mb-3">
              What you actually pay for
            </h2>
            <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
              <p>
                <span className="font-semibold text-slate-900">Single letter</span> —
                pay <strong>${PRICING.singleLetter.price}</strong> once for one
                attorney-reviewed draft. No recurring charge. No commitment.
              </p>
              <p>
                <span className="font-semibold text-slate-900">Monthly</span> —{" "}
                <strong>${PRICING.monthly.price}/month</strong> for{" "}
                {PRICING.monthly.lettersIncluded} attorney-reviewed letters per
                month. Cancel anytime.
              </p>
              <p>
                <span className="font-semibold text-slate-900">Yearly</span> —{" "}
                <strong>${PRICING.yearly.price}/year</strong> for{" "}
                {PRICING.yearly.lettersIncluded} attorney-reviewed letters total.
                Best per-letter rate.
              </p>
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                All plans include California-focused drafting, web-grounded
                research, attorney review, and PDF delivery. No hidden fees.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
