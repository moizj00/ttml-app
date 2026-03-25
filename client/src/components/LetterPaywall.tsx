/**
 * LetterPaywall — shown when a letter is in `generated_locked` status.
 *
 * The server returns only a truncated preview (first ~20% of content).
 * Full content is never exposed before payment.
 */
import { useState } from "react";
import {
  Lock, CheckCircle, ArrowRight, Shield, Gavel,
  FileText, Gift, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiscountCodeInput, type DiscountCodeResult } from "@/components/DiscountCodeInput";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface LetterPaywallProps {
  letterId: number;
  letterType: string;
  subject: string;
  /** The truncated draft content from the server (ai_draft, first ~20%) */
  draftContent?: string;
}

export function LetterPaywall({ letterId, draftContent }: LetterPaywallProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCodeResult | null>(null);

  const paywallStatus = trpc.billing.checkPaywallStatus.useQuery(undefined, {
    staleTime: 30_000,
  });

  const isFreeEligible = paywallStatus.data?.state === "free";
  const isSubscribed = paywallStatus.data?.state === "subscribed";

  const freeUnlockMutation = trpc.billing.freeUnlock.useMutation({
    onSuccess: () => {
      toast.success("Your letter has been submitted for free attorney review!");
      window.location.reload();
    },
    onError: (err) => {
      toast.error("Could not submit for free review", { description: err.message });
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

  const isPending = payToUnlock.isPending || isRedirecting || freeUnlockMutation.isPending;

  const hasDraft = !!draftContent && draftContent.length > 0;

  const basePrice = 200;
  const discountedPrice = appliedDiscount
    ? Math.round(basePrice * (1 - appliedDiscount.discountPercent / 100))
    : null;

  if (isSubscribed) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-5 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-800" data-testid="text-subscribed-status">
            You have an active subscription — this letter will be submitted for review automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Draft Preview (truncated by server, blurred tail) ── */}
      {hasDraft && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-xl">
            <div className="p-5 pb-0">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground" data-testid="text-draft-preview-label">Draft Preview</span>
                <span className="text-xs text-muted-foreground">(truncated — attorney review required)</span>
              </div>
              <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed" data-testid="text-draft-preview">
                {draftContent}
              </pre>
            </div>

            {/* Blurred fade-out + lock overlay */}
            <div className="relative h-24">
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to bottom, transparent, hsl(var(--background)) 80%)",
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-3">
                <Lock className="w-5 h-5 text-muted-foreground/60 mb-1" />
                <p className="text-xs font-medium text-muted-foreground text-center px-4" data-testid="text-paywall-lock-message">
                  Full draft available after attorney review payment
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── FREE FIRST LETTER CTA ── */}
      {isFreeEligible && (
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">Your First Letter is Free!</h2>
              <p className="text-sm text-white/80 mt-1">
                Submit your letter for professional attorney review at no cost.
                A licensed attorney will review, edit, and approve your letter.
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
              <p className="text-xs text-white/60 mt-0.5">Free · Includes attorney review + PDF</p>
            </div>
            <Button
              onClick={() => freeUnlockMutation.mutate({ letterId })}
              disabled={freeUnlockMutation.isPending}
              size="lg"
              className="bg-white text-emerald-800 hover:bg-white/90 font-bold shadow-md w-full sm:w-auto"
              data-testid="button-free-unlock"
            >
              {freeUnlockMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Gift className="w-4 h-4" />
                  Submit for Free Review
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── PAID ATTORNEY REVIEW CTA (shown when NOT free-eligible) ── */}
      {!isFreeEligible && !isSubscribed && (
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
