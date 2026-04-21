import { useState, useMemo } from "react";
import {
  Lock, CheckCircle, ArrowRight, Shield, Gavel,
  FileText, Loader2, AlertCircle, CreditCard, Tag,
} from "lucide-react";
import { redactPII } from "@shared/utils/pii-redaction";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiscountCodeInput, type DiscountCodeResult } from "@/components/DiscountCodeInput";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch, useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FIRST_LETTER_REVIEW_PRICE } from "@shared/pricing";

interface LetterPaywallProps {
  letterId: number;
  letterType: string;
  subject: string;
  draftContent?: string;
  qualityDegraded?: boolean;
}

export function LetterPaywall({ letterId, draftContent, qualityDegraded }: LetterPaywallProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCodeResult | null>(null);
  const [showPaywallModal, setShowPaywallModal] = useState(true);
  const [, navigate] = useLocation();

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
      setIsRedirecting(true);
      window.location.href = data.checkoutUrl;
    },
    onError: (err) => {
      toast.error("Could not initialize checkout", { description: err.message });
      setIsRedirecting(false);
    },
  });

  const payToUnlock = trpc.billing.payToUnlock.useMutation({
    onSuccess: (data) => {
      if (data.status === "unlocked") {
        toast.success("Payment successful", { description: "Your letter is now under attorney review." });
        window.location.reload();
      } else if (data.status === "checkout_required" && data.checkoutUrl) {
        setIsRedirecting(true);
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (err) => {
      toast.error("Payment failed", { description: err.message });
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
  
  const redactedPreview = useMemo(() => {
    if (!draftContent) return "";
    return redactPII(draftContent, {
      redactNames: true,
      redactAddresses: true,
      redactFinancial: true,
    });
  }, [draftContent]);

  const basePrice = 299;
  const discountedPrice = appliedDiscount
    ? Math.round(basePrice * (1 - appliedDiscount.discountPercent / 100))
    : null;

  const renderPaywallContent = () => {
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
        {qualityDegraded && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Review note for attorney</p>
              <p className="mt-1">
                The attorney reviewing this letter has been alerted to verify facts and citations carefully.
              </p>
            </div>
          </div>
        )}

        {isFreeReviewAvailable ? (
          <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Shield className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl font-bold leading-tight mb-2">First Letter Review</h2>
              <p className="text-blue-100 text-sm max-w-lg mb-6">
                Your first letter requires a nominal fee to verify identity and cover processing costs. An experienced attorney will review your case.
              </p>
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
            <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-5 text-white shadow-md mt-6">
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
              <Button asChild variant="outline" className="w-full bg-white/10 hover:bg-white/20 border-white/20 text-white font-semibold">
                <a href="/pricing">View Subscription Plans <ArrowRight className="w-4 h-4 ml-2" /></a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <FileText className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl font-bold leading-tight mb-2">Single Letter Review</h2>
              <p className="text-slate-300 text-sm mb-6 max-w-lg">
                Pay a flat fee for one-time attorney review, signature, and PDF delivery without a subscription.
              </p>
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
              <div className="mt-8 border-t border-white/10 pt-6">
                <h3 className="text-base font-bold text-white mb-2">Need more letters?</h3>
                <p className="text-sm text-slate-300 mb-4">
                  For unlimited letters and faster processing, consider a monthly or yearly subscription plan instead.
                </p>
                <Button asChild variant="outline" className="w-full bg-transparent hover:bg-white/10 border-white/20 text-white font-semibold">
                  <a href="/pricing">View Subscription Plans <ArrowRight className="w-4 h-4 ml-2" /></a>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {hasDraft && (
        <Card className="mb-6 border-slate-200">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-semibold text-slate-800" data-testid="text-draft-preview-label">Free AI Draft Generated</span>
            </div>
            <Button size="sm" variant="default" className="shadow-sm" onClick={() => setShowPaywallModal(true)}>
               Unlock Attorney Review
            </Button>
          </div>
          <CardContent className="p-5">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed" data-testid="text-draft-preview">
              {redactedPreview}
            </pre>
          </CardContent>
        </Card>
      )}

      {!hasDraft && !showPaywallModal && (
        <Button onClick={() => setShowPaywallModal(true)} className="w-full mt-4" size="lg">
          Unlock Attorney Review
        </Button>
      )}

      <Dialog open={showPaywallModal} onOpenChange={setShowPaywallModal}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-0 bg-transparent flex flex-col max-h-[90vh]">
          <div className="bg-slate-900 px-6 py-5 text-white flex-shrink-0">
            <DialogTitle className="text-2xl font-bold tracking-tight">You've reviewed your free draft!</DialogTitle>
            <DialogDescription className="text-slate-300 mt-2 text-base font-medium">
              To have a licensed attorney review, sign, and send this on a company's letterhead, please choose from the options below.
            </DialogDescription>
          </div>
          <div className="p-6 overflow-y-auto bg-slate-50 relative flex-1">
            {renderPaywallContent()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
