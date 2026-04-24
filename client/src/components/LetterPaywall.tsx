import { useState, useMemo } from "react";
import {
  CheckCircle,
  ArrowRight,
  Shield,
  Gavel,
  FileText,
  Loader2,
  AlertCircle,
  CreditCard,
  Tag,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  DiscountCodeInput,
  type DiscountCodeResult,
} from "@/components/DiscountCodeInput";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch, useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LockedLetterDocument } from "@/components/shared/LockedLetterDocument";

interface LetterPaywallProps {
  letterId: number;
  letterType: string;
  subject: string;
  draftContent?: string;
  qualityDegraded?: boolean;
  /** ISO string or Date — when the letter entered generated_locked */
  lastStatusChangedAt?: string | Date | null;
  /** True once the 24h draft-ready email has been sent */
  draftReadyEmailSent?: boolean;
  /**
   * Defensive guard: free-preview lead-magnet letters must NEVER render the
   * paid paywall ($299 CTA). The parent should branch to FreePreviewWaiting
   * or FreePreviewViewer instead — this prop just hard-stops the render in
   * case the branching order is reshuffled later.
   */
  __isFreePreview?: boolean;
}

const DRAFT_REVEAL_HOURS = 24;

export function LetterPaywall({
  letterId,
  letterType,
  subject,
  draftContent,
  qualityDegraded,
  lastStatusChangedAt,
  draftReadyEmailSent,
  __isFreePreview,
}: LetterPaywallProps) {
  // Determine whether the 24h reveal window has passed
  const isDraftRevealed = useMemo(() => {
    if (draftReadyEmailSent) return true;
    if (!lastStatusChangedAt) return false;
    const lockedAt = new Date(lastStatusChangedAt).getTime();
    const hoursElapsed = (Date.now() - lockedAt) / (1000 * 60 * 60);
    return hoursElapsed >= DRAFT_REVEAL_HOURS;
  }, [lastStatusChangedAt, draftReadyEmailSent]);

  // Hours remaining until draft is revealed (0 when already revealed)
  const hoursRemaining = useMemo(() => {
    if (isDraftRevealed) return 0;
    if (!lastStatusChangedAt) return DRAFT_REVEAL_HOURS;
    const lockedAt = new Date(lastStatusChangedAt).getTime();
    const elapsed = (Date.now() - lockedAt) / (1000 * 60 * 60);
    return Math.max(0, Math.ceil(DRAFT_REVEAL_HOURS - elapsed));
  }, [lastStatusChangedAt, isDraftRevealed]);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [appliedDiscount, setAppliedDiscount] =
    useState<DiscountCodeResult | null>(null);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [, navigate] = useLocation();

  const searchString = useSearch();
  const urlCouponCode = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return (
      params.get("coupon") ??
      params.get("code") ??
      params.get("ref") ??
      undefined
    );
  }, [searchString]);

  const paywallStatus = trpc.billing.checkPaywallStatus.useQuery(undefined, {
    staleTime: 30_000,
  });

  const isFreeReviewAvailable =
    __isFreePreview === true
      ? false
      : paywallStatus.data?.state === "free_review_available";
  const isSubscribed = paywallStatus.data?.state === "subscribed";

  const subscriptionSubmitMutation =
    trpc.billing.subscriptionSubmit.useMutation({
      onSuccess: () => {
        toast.success("Your letter has been submitted for attorney review!", {
          description: "An attorney will review your letter shortly.",
        });
        window.location.reload();
      },
      onError: err => {
        toast.error("Could not submit for review", {
          description: err.message,
        });
      },
    });

  const isPending =
    payToUnlock.isPending ||
    isRedirecting ||
    subscriptionSubmitMutation.isPending;

  const hasDraft = !!draftContent && draftContent.length > 0 && isDraftRevealed;

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
              <h2 className="text-lg font-bold leading-tight">
                Active Subscription
              </h2>
              <p className="text-sm text-white/80 mt-1">
                Your subscription covers attorney review. Submit your letter now
                and a licensed attorney will review, edit, and approve it.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              { icon: Shield, text: "Licensed attorney review" },
              { icon: CheckCircle, text: "Edits & approval included" },
              { icon: FileText, text: "Professional PDF delivered" },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2"
              >
                <Icon className="w-4 h-4 text-white/80 flex-shrink-0" />
                <span className="text-xs text-white/90">{text}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-3xl font-extrabold text-white">$0</span>
              <p className="text-xs text-white/60 mt-0.5">
                Covered by your subscription
              </p>
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
      <div className="space-y-6">
        {qualityDegraded && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Review note for attorney</p>
              <p className="mt-1">
                The attorney reviewing this letter has been alerted to verify
                facts and citations carefully.
              </p>
            </div>
          </div>
        )}

        {/* Primary Subscription CTA */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Shield className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Tag className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold leading-tight">
                Pick a plan to submit for attorney review
              </h2>
            </div>
            <p className="text-emerald-100 text-base max-w-lg mb-6">
              Subscribe to get this letter professionally reviewed, edited,
              signed, and delivered by a licensed attorney. Plans include
              unlimited drafts and priority support.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {[
                { icon: Shield, text: "Licensed attorney review" },
                { icon: CheckCircle, text: "Edits & approval included" },
                { icon: FileText, text: "Professional PDF delivered" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2"
                >
                  <Icon className="w-4 h-4 text-emerald-50 flex-shrink-0" />
                  <span className="text-xs text-white font-medium">{text}</span>
                </div>
              ))}
            </div>
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto bg-white text-emerald-800 hover:bg-emerald-50 font-bold shadow-lg"
            >
              <a href={`/pricing?returnTo=/letters/${letterId}`}>
                View Plans
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>

        <div className="pt-2">
          {/* Pay-as-you-go option for non-subscribers */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-colors">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex-1">
                <h4 className="text-lg font-bold text-slate-800 mb-1">
                  Single Letter Review
                </h4>
                <p className="text-sm text-slate-500 mb-4 max-w-md">
                  One-time attorney review, signature, and PDF delivery without
                  a subscription.
                </p>
                <DiscountCodeInput
                  className="mb-4 max-w-sm"
                  initialCode={urlCouponCode}
                  onCodeChange={result => setAppliedDiscount(result)}
                />
                <div className="flex items-end gap-2">
                  {discountedPrice !== null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-slate-900">
                        ${discountedPrice}
                      </span>
                      <span className="text-sm text-slate-400 line-through">
                        ${basePrice}
                      </span>
                      <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                        {appliedDiscount!.discountPercent}% off
                      </span>
                    </div>
                  ) : (
                    <span className="text-2xl font-extrabold text-slate-900">
                      ${basePrice}
                    </span>
                  )}
                </div>
              </div>
              <Button
                onClick={() =>
                  payToUnlock.mutate({
                    letterId,
                    discountCode: appliedDiscount?.code ?? undefined,
                  })
                }
                disabled={isPending}
                size="lg"
                className="w-full md:w-auto flex-shrink-0 shadow-sm"
              >
                {isPending && payToUnlock.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing checkout...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Pay & Submit
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Defensive guard — free-preview lead-magnet letters must NEVER hit the
  // paid paywall. Placed AFTER all hooks to comply with the rules of hooks.
  if (__isFreePreview) return null;

  return (
    <>
      {/* Waiting state — draft not yet revealed */}
      {!isDraftRevealed && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800 mb-1">
                  Your draft is being finalized
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Your letter draft is undergoing final research and quality
                  assurance. This ensures every citation and fact is verified
                  before you receive the draft.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg px-3 py-2 w-fit">
                  <Clock className="w-4 h-4" />
                  {hoursRemaining <= 1
                    ? "Your draft will be ready in less than 1 hour"
                    : `Your draft will be ready in approximately ${hoursRemaining} hours`}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  You'll receive an email notification when your draft is ready
                  to read. No action required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revealed state — show full watermarked draft */}
      {isDraftRevealed && hasDraft && (
        <Card className="mb-6 border-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <FileText className="w-5 h-5 text-slate-500" />
              Your letter draft — read-only preview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LockedLetterDocument
              content={draftContent!}
              subject={subject}
              letterType={letterType}
            />
          </CardContent>
          <CardFooter className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-between items-center">
            <p className="text-sm text-slate-600 hidden sm:block">
              Read your full draft above. Attorney review required for final
              delivery.
            </p>
            <Button
              size="lg"
              className="w-full sm:w-auto shadow-md"
              onClick={() => setShowPaywallModal(true)}
            >
              Subscribe or Pay to Submit &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Revealed but no draft content — fallback CTA */}
      {isDraftRevealed && !hasDraft && !showPaywallModal && (
        <Button
          onClick={() => setShowPaywallModal(true)}
          className="w-full mt-4"
          size="lg"
        >
          Submit for Attorney Review
        </Button>
      )}

      <Dialog open={showPaywallModal} onOpenChange={setShowPaywallModal}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-0 bg-transparent flex flex-col max-h-[90vh]">
          <div className="bg-slate-900 px-6 py-5 text-white flex-shrink-0">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              Submit your draft for attorney review
            </DialogTitle>
            <DialogDescription className="text-slate-300 mt-2 text-base font-medium">
              A licensed attorney will review, edit, sign, and deliver your
              letter. Choose a plan or pay once below.
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
