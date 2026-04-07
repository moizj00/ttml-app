/**
 * LetterPaywall — shown when a letter is in `generated_locked` status.
 *
 * Shows a truncated preview of the AI draft with the bottom blurred out,
 * plus CTAs to unlock via payment or subscription.
 *
 * For first-time users: $50 attorney review + subscribe to waive option.
 * For non-first letters without subscription: $299 pay-per-letter CTA.
 */
import { useState, useMemo } from "react";
import {
  Lock, CheckCircle, ArrowRight, Shield, Gavel,
  FileText, Loader2, AlertCircle, CreditCard, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiscountCodeInput, type DiscountCodeResult } from "@/components/DiscountCodeInput";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch, useLocation } from "wouter";
import { FIRST_LETTER_REVIEW_PRICE } from "@shared/pricing";

interface LetterPaywallProps {
  letterId: number;
  letterType: string;
  subject: string;
  /** The truncated AI draft preview from the server */
  draftContent?: string;
  /** When true, shows a subtle note that attorney review will address any quality flags */
  qualityDegraded?: boolean;
}

export function LetterPaywall({ letterId, draftContent, qualityDegraded }: LetterPaywallProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCodeResult | null>(null);
  const [, navigate] = useLocation();

  // Read referral/coupon code from URL params (e.g. ?coupon=TTML-001 from Worker redirect)
  const searchString = useSearch();
  const urlCouponCode = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("coupon") ?? params.get("code") ?? params.get("ref") ?? undefined;
  }, [searchString]);

  const paywallStatus = trpc.billing.checkPaywallStatus.useQuery(undefined, {
    staleTime: 30_000,
  });

  const isFreeReviewAvailable = paywallStatus.data?.state === "free_review_available";
  const isSubscribed = paywallStatus.data?.state === "subscribed";

  const payFirstLetterMutation = trpc.billing.payFirstLetterReview.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setIsRedirecting(true);
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error("Payment could not be initiated", { description: err.message || "Please try again in a moment." });
      setIsRedirecting(false);
    },
  });

  const payToUnlock = trpc.billing.payToUnlock.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setIsRedirecting(true);
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error("Payment could not be initiated", { description: err.message || "Please try again in a moment." });
      setIsRedirecting(false);
    },
  });

  const subscriptionSubmitMutation = trpc.billing.subscriptionSubmit.useMutation({
    onSuccess: () => {
      toast.success("Your letter has been submitted for attorney review!", {
        description: "An attorney will review your letter shortly.",
      });
      window.location.reload();
    },
    onError: (err) => {
      toast.error("Could not submit for review", { description: err.message });
    },
  });

  const isPending = payToUnlock.isPending || payFirstLetterMutation.isPending || isRedirecting || subscriptionSubmitMutation.isPending;

  const hasDraft = !!draftContent && draftContent.length > 0;

  const basePrice = 299;
  const discountedPrice = appliedDiscount
    ? Math.round(basePrice * (1 - appliedDiscount.discountPercent / 100))
    : null;

  if (isSubscribed) {
    return (
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight">Active Subscription</h2>
            <p className="text-sm text-white/80 mt-1">
              Your subscription covers attorney review. Submit your letter now and a licensed attorney will review, edit, and approve it.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { icon: Shield, text: "Licensed attorney review" },
            { icon: CheckCircle, text: "Edits & approval included" },
            { icon: FileText, text: "Professional PDF delivered" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <Icon className="w-4 h-4 text-white/80 flex-shrink-0" />
              <span className="text-xs text-white/90">{text}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-3xl font-extrabold text-white">$0</span>
            <p className="text-xs text-white/60 mt-0.5">Covered by your subscription</p>
          </div>
          <Button
            onClick={() => subscriptionSubmitMutation.mutate({ letterId })}
            disabled={subscriptionSubmitMutation.isPending}
            size="lg"
            className="bg-white text-emerald-800 hover:bg-white/90 font-bold shadow-md w-full sm:w-auto"
            data-testid="button-subscription-submit"
          >
            {subscriptionSubmitMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Gavel className="w-4 h-4" />
                Submit for Attorney Review
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Truncated Draft Preview with blur fade ── */}
      {hasDraft && (
        <Card className="border-amber-200 overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800" data-testid="text-draft-preview-label">AI-Generated Draft Preview</span>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 tracking-wider">
              DRAFT — Unreviewed
            </span>
          </div>
          <CardContent className="p-5">
            <div className="relative">
              <pre
                className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed"
                data-testid="text-draft-preview"
              >
                {draftContent}
              </pre>
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-background dark:via-background/90"
                style={{ backdropFilter: "blur(4px)" }}
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5 select-none"
                aria-hidden="true"
              >
                <span className="text-7xl font-black text-amber-700 rotate-[-30deg] tracking-widest">DRAFT</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Lock className="w-4 h-4" />
              <span>Pay for attorney review to see the full letter</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quality Degraded notice ── */}
      {qualityDegraded && (
        <div
          data-testid="banner-quality-degraded-paywall"
          className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Note:</span> Our attorney review team will give this letter additional attention to ensure it meets all quality standards before delivering it to you.
          </p>
        </div>
      )}

      {/* ── FIRST LETTER: $50 attorney review gate + subscribe option ── */}
      {isFreeReviewAvailable && (
        <div className="space-y-3">
          {/* Primary CTA: $50 attorney review */}
          <div className="bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Gavel className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">Attorney Review — First Letter</h2>
                <p className="text-sm text-white/80 mt-1">
                  A licensed attorney will review your draft, make any necessary edits, and approve it.
                  You receive the professionally formatted PDF once approved.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {[
                { icon: Shield, text: "Licensed attorney review" },
                { icon: CheckCircle, text: "Edits & approval included" },
                { icon: FileText, text: "Professional PDF delivered" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                  <Icon className="w-4 h-4 text-white/80 flex-shrink-0" />
                  <span className="text-xs text-white/90">{text}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-3xl font-extrabold text-white">${FIRST_LETTER_REVIEW_PRICE}</span>
                <p className="text-xs text-white/60 mt-0.5">One-time · Attorney review + PDF</p>
              </div>
              <Button
                onClick={() => payFirstLetterMutation.mutate({ letterId })}
                disabled={isPending}
                size="lg"
                className="bg-white text-blue-800 hover:bg-white/90 font-bold shadow-md w-full sm:w-auto"
                data-testid="button-pay-first-letter-review"
              >
                {isPending && payFirstLetterMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing checkout...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Gavel className="w-4 h-4" />
                    Pay ${FIRST_LETTER_REVIEW_PRICE} for Attorney Review
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Secondary CTA: Subscribe & waive the fee */}
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-5 text-white shadow-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Tag className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold leading-tight">Subscribe & Get This Free</h3>
                <p className="text-sm text-white/80 mt-0.5">
                  Choose a plan — your subscription waives the $50 fee and covers this letter under your plan.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-2xl font-extrabold text-white">From $299<span className="text-sm font-normal text-white/60">/mo</span></span>
                <p className="text-xs text-white/60 mt-0.5">4 letters/month · cancel anytime</p>
              </div>
              <Button
                onClick={() => navigate("/pricing")}
                disabled={isPending}
                size="lg"
                className="bg-white text-emerald-800 hover:bg-white/90 font-bold shadow-md w-full sm:w-auto"
                data-testid="button-subscribe-waive-fee"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  View Plans & Subscribe
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAID ATTORNEY REVIEW CTA (non-first letter, no subscription) ── */}
      {!isFreeReviewAvailable && !isSubscribed && (
        <div className="bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Gavel className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">Submit for Attorney Review</h2>
              <p className="text-sm text-white/80 mt-1">
                A licensed attorney will review your draft, make any necessary edits, and approve the final letter.
                You receive the professionally formatted PDF once approved.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              { icon: Shield, text: "Licensed attorney review" },
              { icon: CheckCircle, text: "Edits & approval included" },
              { icon: FileText, text: "Professional PDF delivered" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                <Icon className="w-4 h-4 text-white/80 flex-shrink-0" />
                <span className="text-xs text-white/90">{text}</span>
              </div>
            ))}
          </div>

          <DiscountCodeInput
            variant="dark"
            className="mb-4"
            initialCode={urlCouponCode}
            onCodeChange={(result) => setAppliedDiscount(result)}
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              {discountedPrice !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">${discountedPrice}</span>
                  <span className="text-lg text-white/50 line-through">${basePrice}</span>
                  <span className="text-sm text-emerald-300 font-semibold">{appliedDiscount!.discountPercent}% off</span>
                </div>
              ) : (
                <span className="text-3xl font-extrabold text-white">${basePrice}</span>
              )}
              <p className="text-xs text-white/60 mt-0.5">One-time · Includes attorney review + PDF</p>
            </div>

            <Button
              onClick={() => payToUnlock.mutate({ letterId, discountCode: appliedDiscount?.code ?? undefined })}
              disabled={isPending}
              size="lg"
              className="bg-white text-blue-800 hover:bg-white/90 font-bold shadow-md w-full sm:w-auto"
              data-testid="button-pay-unlock"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing checkout...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Gavel className="w-4 h-4" />
                  Pay & Submit for Review
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
