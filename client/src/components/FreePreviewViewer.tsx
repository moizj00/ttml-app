import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PRICING } from "../../../shared/pricing";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
/**
 * FreePreviewViewer — first-letter free-preview lead-magnet renderer.
 *
 * Shown when a subscriber has submitted their first letter via the free-trial
 * path AND the 24-hour cooling-off window has elapsed. Replaces the standard
 * LetterPaywall for these letters.
 *
 * Behavior:
 *   - Renders the FULL ai_draft (no truncation, no PII redaction).
 *   - Content is visually non-selectable and copy-resistant:
 *       * CSS: user-select: none + pointer-events on a transparent overlay
 *       * JS:  onCopy, onCut, onContextMenu, keyboard shortcuts blocked
 *     These are best-effort — a determined user with devtools can still
 *     read it. The goal is to raise friction enough that sharing the
 *     preview isn't a one-click action and to make it clear to the
 *     subscriber that this is a preview, not a deliverable.
 *   - Large diagonal "DRAFT" watermark overlays the letter.
 *   - Single CTA: "Submit For Attorney Review" → navigates to /pricing
 *     so the subscriber can start a subscription. Once subscribed they
 *     can submit the same letter for actual attorney review.
 *
 * Security note: the full draft is supplied by the server only after
 * freePreviewUnlockAt <= NOW() (enforced in server/routers/versions.ts).
 * The client-side copy protection is UX, not security.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  FileText,
  Gavel,
  Shield,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface FreePreviewViewerProps {
  letterId: number;
  subject: string;
  /** Full (un-redacted, un-truncated) ai_draft content from versions.get */
  draftContent: string;
  jurisdictionState?: string | null;
  letterType?: string;
}

/**
 * Block keyboard shortcuts that would otherwise copy the selection or open
 * devtools-level capture: Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+A, Ctrl/Cmd+P,
 * Ctrl/Cmd+S. Also block PrintScreen where possible (most browsers don't
 * surface this event, so it's best-effort).
 */
function useCopyProtection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Only guard events originating inside the preview region; leave the
      // rest of the page alone (the subscribe CTA, form inputs elsewhere, etc).
      if (!target?.closest?.("[data-free-preview-region='true']")) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && ["c", "x", "a", "p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handler, { capture: true });
    return () =>
      document.removeEventListener("keydown", handler, { capture: true });
  }, [enabled]);
}

export function FreePreviewViewer({
  letterId,
  subject,
  draftContent,
  jurisdictionState,
  letterType,
}: FreePreviewViewerProps) {
  const [, navigate] = useLocation();
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  useCopyProtection(true);

  const utils = trpc.useUtils();
  const paywallStatus = trpc.billing.checkPaywallStatus.useQuery(undefined, {
    staleTime: 30_000,
  });

  const subscriptionSubmitMutation =
    trpc.billing.subscriptionSubmit.useMutation({
      onSuccess: () => {
        toast.success("Submitted for attorney review!");
        utils.letters.detail.invalidate({ id: letterId });
      },
      onError: err => {
        toast.error(err.message || "Failed to submit for review");
      },
    });

  const isSubscribed =
    paywallStatus.data?.hasActiveRecurringSubscription === true;
  const isPending = subscriptionSubmitMutation.isPending;

  const handleSubmitReview = () => {
    if (isSubscribed) {
      subscriptionSubmitMutation.mutate({ letterId });
    } else {
      // For free preview users, show the subscription-required message
      setShowSubscriptionModal(true);
    }
  };

  const noCopyHandler = (
    e: React.ClipboardEvent | React.MouseEvent | React.DragEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const letterTypeLabel = letterType
    ? letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : undefined;

  return (
    <div className="space-y-5" data-testid="free-preview-viewer">
      {/* ── Header card: what this is and what it isn't ── */}
      <Card className="border-amber-200 bg-amber-50/70">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-700 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-amber-900">
                Draft Preview — Not Attorney Reviewed
              </h2>
              <p className="text-sm text-amber-800 mt-1">
                This is your complimentary preview of the draft generated from
                your intake. It has not been reviewed, edited, or approved by a
                licensed attorney. Do not rely on it as legal advice or send it
                anywhere until attorney review is complete.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-amber-900">
                <span className="rounded bg-amber-100 border border-amber-200 px-2 py-0.5">
                  <span className="font-semibold">Letter:</span> {subject}
                </span>
                {letterTypeLabel && (
                  <span className="rounded bg-amber-100 border border-amber-200 px-2 py-0.5">
                    <span className="font-semibold">Type:</span>{" "}
                    {letterTypeLabel}
                  </span>
                )}
                {jurisdictionState && (
                  <span className="rounded bg-amber-100 border border-amber-200 px-2 py-0.5">
                    <span className="font-semibold">Jurisdiction:</span>{" "}
                    {jurisdictionState}
                  </span>
                )}
                <span className="rounded bg-amber-100 border border-amber-200 px-2 py-0.5">
                  <span className="font-semibold">Letter ID:</span> #{letterId}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── The draft itself — full content, non-selectable, watermarked ── */}
      <Card className="border-amber-200 overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              Full Draft Preview
            </span>
          </div>
          <span
            className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 tracking-wider"
            data-testid="draft-preview-unreviewed-badge"
          >
            DRAFT — Unreviewed
          </span>
        </div>
        <CardContent className="p-0">
          <div
            data-free-preview-region="true"
            data-testid="free-preview-content"
            onCopy={noCopyHandler}
            onCut={noCopyHandler}
            onDragStart={noCopyHandler}
            onContextMenu={noCopyHandler}
            className="relative"
            style={{
              // Best-effort copy protection — non-authoritative.
              userSelect: "none",
              WebkitUserSelect: "none",
              MozUserSelect: "none",
              msUserSelect: "none",
              WebkitTouchCallout: "none",
            }}
          >
            {/* The draft text itself */}
            <pre
              className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed p-5 pr-6"
              aria-label="Draft letter preview — not selectable"
            >
              {draftContent}
            </pre>

            {/* Large diagonal DRAFT watermark spanning the whole region */}
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
              aria-hidden="true"
            >
              <span
                className="text-[8rem] font-black text-amber-700/15 rotate-[-30deg] tracking-[0.3em] select-none whitespace-nowrap"
                style={{ userSelect: "none" }}
              >
                DRAFT
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Call to action: subscribe to unlock attorney review ── */}
      <div className="bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Gavel className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight">
              Ready to Send It? Submit For Attorney Review
            </h2>
            <p className="text-sm text-white/80 mt-1">
              Subscribe to unlock licensed attorney review — a real attorney
              will read your draft, make any necessary edits, approve it, and
              deliver a professionally formatted PDF to your account.
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
            <span className="text-3xl font-extrabold text-white">
              {isSubscribed ? "$0" : `From ${PRICING.monthly.priceDisplay}`}
              {!isSubscribed && (
                <span className="text-base font-normal text-white/60">/mo</span>
              )}
            </span>
            <p className="text-xs text-white/60 mt-0.5">
              {isSubscribed
                ? "Included in your active subscription"
                : `${PRICING.monthly.lettersIncluded} letters/month · cancel anytime`}
            </p>
          </div>
          <Button
            onClick={handleSubmitReview}
            disabled={isPending}
            size="lg"
            className="bg-white text-blue-800 hover:bg-white/90 font-bold shadow-md w-full sm:w-auto"
            data-testid="button-free-preview-subscribe"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Gavel className="w-4 h-4" />
                {isSubscribed
                  ? "Submit For Attorney Review"
                  : "Subscribe to Submit"}
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </div>
      </div>

      <Dialog
        open={showSubscriptionModal}
        onOpenChange={setShowSubscriptionModal}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Shield className="w-5 h-5" />
              Subscription Required
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-2">
              Attorney review is included with all subscription plans. Please
              subscribe to a plan to have this letter professionally reviewed,
              edited, and delivered by a licensed attorney.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
              size="lg"
              onClick={() => navigate("/pricing")}
            >
              Choose a Plan
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="ghost"
              className="w-full text-slate-500 hover:text-slate-700"
              onClick={() => setShowSubscriptionModal(false)}
            >
              Back to Preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FreePreviewViewer;
