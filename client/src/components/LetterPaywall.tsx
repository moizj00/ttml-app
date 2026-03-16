/**
 * LetterPaywall — shown when a letter is in `generated_locked` status.
 *
 * Simplified flow (Phase 69 + Phase 82):
 *   - Every letter ends at generated_locked after the drafting pipeline.
 *   - Subscriber sees the first ~35% of the draft clearly; the rest is blurred.
 *   - If eligible for free first letter → "Submit for Free Review" CTA
 *   - Otherwise → $200 CTA with optional promo code discount
 *   - Stripe webhook transitions generated_locked → pending_review on payment.
 */
import { useState } from "react";
import {
  Lock, CheckCircle, ArrowRight, Shield, Gavel,
  FileText, Eye, EyeOff, Gift, Loader2, Download,
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
  /** The actual draft content from letter_versions (ai_draft) */
  draftContent?: string;
}

export function LetterPaywall({ letterId, draftContent }: LetterPaywallProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCodeResult | null>(null);

  // Check if user is eligible for free first letter
  const paywallStatus = trpc.billing.checkPaywallStatus.useQuery(undefined, {
    staleTime: 30_000,
  });

  const isFreeEligible = paywallStatus.data?.state === "free";
  const isSubscribed = paywallStatus.data?.state === "subscribed";

  // Free unlock mutation
  const freeUnlockMutation = trpc.billing.freeUnlock.useMutation({
    onSuccess: () => {
      toast.success("Your letter has been submitted for free attorney review!");
      window.location.reload();
    },
    onError: (err) => {
      toast.error("Could not submit for free review", { description: err.message });
    },
  });

  // $200 pay-per-letter checkout
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

  // Split draft into visible (first ~20%) and blurred remainder
  const previewLines = draftContent?.split("\n") ?? [];
  const visibleLineCount = Math.max(5, Math.floor(previewLines.length * 0.20));
  const visibleText = previewLines.slice(0, visibleLineCount).join("\n");
  const blurredText = previewLines.slice(visibleLineCount).join("\n");
  const hasDraft = previewLines.length > 0;

  // Download draft PDF handler
  const [isDownloading, setIsDownloading] = useState(false);
  async function handleDownloadDraft() {
    setIsDownloading(true);
    try {
      const resp = await fetch(`/api/letters/${letterId}/draft-pdf`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Download failed" }));
        toast.error("Download failed", { description: err.error ?? "Please try again." });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unreviewed-pdf-${letterId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed", { description: "Please check your connection and try again." });
    } finally {
      setIsDownloading(false);
    }
  }

  const basePrice = 200;
  const discountedPrice = appliedDiscount
    ? Math.round(basePrice * (1 - appliedDiscount.discountPercent / 100))
    : null;

  // If subscribed, auto-unlock (this shouldn't normally show, but handle gracefully)
  if (isSubscribed) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-5 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-800">
            You have an active subscription — this letter will be submitted for review automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Draft Preview (blurred) ── */}
      {hasDraft && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-xl">
            {/* Visible portion */}
            <div className="p-5 pb-0">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Draft Preview</span>
                <span className="text-xs text-muted-foreground">(first 20% — attorney review required)</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs gap-1.5 border-dashed"
                  onClick={handleDownloadDraft}
                  disabled={isDownloading}
                  title="Download the full Unreviewed PDF (AI draft, not attorney-reviewed)"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  {isDownloading ? "Generating..." : "Download Unreviewed PDF"}
                </Button>
              </div>
              <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {visibleText}
              </pre>
            </div>

            {/* Blurred portion */}
            {blurredText && (
              <div className="relative">
                <pre
                  className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed p-5 pt-0 select-none"
                  style={{
                    filter: showFullPreview ? "none" : "blur(6px)",
                    userSelect: "none",
                    transition: "filter 0.3s ease",
                  }}
                  aria-hidden={!showFullPreview}
                >
                  {blurredText}
                </pre>

                {/* Gradient overlay + unlock prompt */}
                {!showFullPreview && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-background/95 via-background/60 to-transparent">
                    <div className="flex flex-col items-center gap-2 mt-8">
                      <Lock className="w-8 h-8 text-muted-foreground/60" />
                      <p className="text-sm font-medium text-muted-foreground text-center px-4">
                        Full draft available after attorney review payment
                      </p>
                      <button
                        onClick={() => setShowFullPreview(true)}
                        className="text-xs text-primary underline underline-offset-2 flex items-center gap-1 mt-1"
                      >
                        <Eye className="w-3 h-3" />
                        Preview blurred text
                      </button>
                    </div>
                  </div>
                )}

                {showFullPreview && (
                  <div className="flex justify-center pb-3">
                    <button
                      onClick={() => setShowFullPreview(false)}
                      className="text-xs text-muted-foreground underline underline-offset-2 flex items-center gap-1"
                    >
                      <EyeOff className="w-3 h-3" />
                      Hide preview
                    </button>
                  </div>
                )}
              </div>
            )}
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

          {/* What's included */}
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

          {/* What's included */}
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

          {/* Promo code — reusable component */}
          <DiscountCodeInput
            variant="dark"
            className="mb-4"
            onCodeChange={(result) => setAppliedDiscount(result)}
          />

          {/* Price + CTA */}
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
        </div>
      )}
    </div>
  );
}
