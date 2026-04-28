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
 *   - Large diagonal "DRAFTED" watermark overlays the letter.
 *   - Single CTA: subscribe to unlock attorney review → /pricing.
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
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Award,
  Clock,
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
      {/* ── Slim status header: one-line meta strip + soft warning row ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Meta strip — letter identity */}
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span
              className="text-sm font-semibold text-slate-900 truncate max-w-[36ch]"
              title={subject}
            >
              {subject}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {letterTypeLabel && (
              <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                {letterTypeLabel}
              </span>
            )}
            {jurisdictionState && (
              <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                {jurisdictionState}
              </span>
            )}
            <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 font-mono">
              #{letterId}
            </span>
          </div>
        </div>

        {/* Warning row — slim, color-tinted, NOT a big alert box */}
        <div className="px-5 py-2.5 bg-amber-50/60 border-l-4 border-amber-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">Preview only — not attorney reviewed.</span>{" "}
            This draft has not been reviewed, edited, or approved by a licensed
            attorney. Don't rely on it as legal advice or send it anywhere
            until attorney review is complete.
          </p>
        </div>
      </div>

      {/* ── The draft itself — full content, non-selectable, watermarked ── */}
      <Card className="border-slate-200 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900">
              Full Draft Preview
            </span>
          </div>
          <span
            className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1 tracking-wider uppercase"
            data-testid="draft-preview-unreviewed-badge"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 align-middle" />
            Unreviewed
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
            className="relative bg-slate-50/30"
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
              className="text-sm text-slate-800 whitespace-pre-wrap font-mono leading-relaxed p-6 pr-7"
              aria-label="Draft letter preview — not selectable"
            >
              {draftContent}
            </pre>

            {/* Large diagonal DRAFTED watermark spanning the whole region */}
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
              aria-hidden="true"
            >
              <span
                className="text-[8rem] font-black text-amber-700/12 rotate-[-30deg] tracking-[0.3em] select-none whitespace-nowrap"
                style={{ userSelect: "none" }}
              >
                DRAFTED
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Modern, sleek upsell card ── */}
      <div className="relative rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-lg">
        {/* Decorative gradient accent — subtle, not overwhelming */}
        <div
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-indigo-100/60 to-purple-100/40 rounded-full blur-3xl"
          aria-hidden="true"
        />

        <div className="relative p-7">
          {/* Heading row */}
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center flex-shrink-0 ring-1 ring-indigo-100">
              <Gavel className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                  Optional next step
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                Have a licensed attorney review this letter
              </h2>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                A real attorney reads your draft, makes substantive edits,
                signs it on letterhead, and delivers a polished PDF —
                typically within 24 hours.
              </p>
            </div>
          </div>

          {/* Three-up benefit row — clean, bordered cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
            {[
              {
                icon: Shield,
                title: "Licensed review",
                sub: "Real attorney signature",
              },
              {
                icon: Award,
                title: "Substantive edits",
                sub: "Not just a rubber stamp",
              },
              {
                icon: Clock,
                title: "~24h turnaround",
                sub: "PDF delivered to you",
              },
            ].map(({ icon: Icon, title, sub }) => (
              <div
                key={title}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 flex items-start gap-2.5"
              >
                <Icon className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Price + CTA row — two-column on desktop, stacked on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-5 border-t border-slate-100">
            <div>
              <div className="flex items-baseline gap-1.5">
                {isSubscribed ? (
                  <span className="text-3xl font-extrabold text-emerald-600">
                    Included
                  </span>
                ) : (
                  <>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                      From
                    </span>
                    <span className="text-3xl font-extrabold text-slate-900 leading-none">
                      {PRICING.monthly.priceDisplay}
                    </span>
                    <span className="text-base text-slate-500 font-medium">
                      /mo
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isSubscribed
                  ? "Active subscription — no extra charge"
                  : `${PRICING.monthly.lettersIncluded} letters/month · cancel anytime`}
              </p>
            </div>
            <Button
              onClick={handleSubmitReview}
              disabled={isPending}
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-md hover:shadow-lg transition-all w-full sm:w-auto group"
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
                    ? "Submit for attorney review"
                    : "Unlock attorney review"}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={showSubscriptionModal}
        onOpenChange={setShowSubscriptionModal}
      >
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-white text-lg font-bold">
                  Subscription required
                </DialogTitle>
              </DialogHeader>
            </div>
            <DialogDescription className="text-white/90 text-sm leading-relaxed">
              Attorney review is included with all subscription plans. Pick a
              plan to have this letter reviewed, edited, and signed by a real
              attorney.
            </DialogDescription>
          </div>
          <div className="p-6 space-y-3">
            <ul className="space-y-2 mb-2">
              {[
                "Licensed attorney signature",
                "Substantive legal edits",
                "Professional letterhead",
                "Cancel anytime",
              ].map(item => (
                <li
                  key={item}
                  className="flex items-center gap-2.5 text-sm text-slate-700"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold h-11 shadow-md"
              size="lg"
              onClick={() => navigate("/pricing")}
            >
              See plans
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="ghost"
              className="w-full text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              onClick={() => setShowSubscriptionModal(false)}
            >
              Back to preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FreePreviewViewer;
