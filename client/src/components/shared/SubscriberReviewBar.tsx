import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle,
  RotateCcw,
  XCircle,
  ChevronUp,
  AlertCircle,
  ArrowUp,
} from "lucide-react";

interface SubscriberReviewBarProps {
  letterId: number;
  revisionCount?: number;
  onAction: () => void;
}

const REVISION_FEE_USD = 20;

const MAX_REVISIONS = 5;
const WARN_REVISIONS = 3;

export function SubscriberReviewBar({
  letterId,
  revisionCount = 0,
  onAction,
}: SubscriberReviewBarProps) {
  const [mode, setMode] = useState<"idle" | "revision" | "decline">("idle");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const revisionsRemaining = MAX_REVISIONS - revisionCount;
  const revisionLimitReached = revisionCount >= MAX_REVISIONS;
  const revisionLimitWarning = revisionCount >= WARN_REVISIONS && !revisionLimitReached;

  const clientApprove = trpc.letters.clientApprove.useMutation({
    onSuccess: () => {
      toast.success("Letter approved!", {
        description: "Your PDF is being generated and will be available for download shortly.",
      });
      onAction();
    },
    onError: (err) => toast.error("Approval failed", { description: err.message }),
  });

  const clientRequestRevision = trpc.letters.clientRequestRevision.useMutation({
    onSuccess: (res: any) => {
      // Paid revision gate: redirect to Stripe checkout
      if (res?.requiresPayment && res?.checkoutUrl) {
        toast.info("Redirecting to payment", {
          description: "A $20 revision consultation fee applies. You will be redirected to complete payment.",
        });
        // Short delay so the toast is visible before redirect
        setTimeout(() => {
          window.location.href = res.checkoutUrl;
        }, 1500);
        return;
      }
      if (res?.revisionWarning) {
        toast.warning("Revision requested", { description: res.revisionWarning });
      } else {
        toast.success("Revision requested", {
          description: "Your feedback has been sent to the attorney.",
        });
      }
      setMode("idle");
      setRevisionNotes("");
      onAction();
    },
    onError: (err) => toast.error("Request failed", { description: err.message }),
  });

  const clientDecline = trpc.letters.clientDecline.useMutation({
    onSuccess: () => {
      toast.info("Letter declined", { description: "The letter has been declined." });
      setMode("idle");
      setDeclineReason("");
      onAction();
    },
    onError: (err) => toast.error("Decline failed", { description: err.message }),
  });

  const isBusy =
    clientApprove.isPending ||
    clientRequestRevision.isPending ||
    clientDecline.isPending;

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm shadow-lg">
      {/* Revision panel — slides in above the bar */}
      {mode === "revision" && (
        <div className="border-b border-violet-200 bg-violet-50/80 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-violet-800">
            What changes would you like the attorney to make?
            {revisionCount >= 1 && (
              <span className="ml-2 text-xs font-normal text-violet-600 bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded">
                ${REVISION_FEE_USD} consultation fee applies
              </span>
            )}
          </p>
          {revisionLimitWarning && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              You have used {revisionCount} of {MAX_REVISIONS} allowed revisions.{" "}
              <strong>{revisionsRemaining} remaining.</strong>
            </div>
          )}
          <Textarea
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            placeholder="Describe the changes you'd like (at least 10 characters)..."
            rows={3}
            className="bg-white border-violet-200 text-sm resize-none"
            disabled={isBusy}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() =>
                clientRequestRevision.mutate({ letterId, revisionNotes })
              }
              disabled={isBusy || revisionNotes.trim().length < 10}
            >
              {clientRequestRevision.isPending ? "Submitting..." : "Submit Revision Request"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMode("idle");
                setRevisionNotes("");
              }}
              disabled={isBusy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Decline confirmation panel */}
      {mode === "decline" && (
        <div className="border-b border-red-200 bg-red-50/80 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-red-800">
            Are you sure you want to decline this letter? This cannot be undone.
          </p>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason for declining (optional)..."
            rows={2}
            className="bg-white border-red-200 text-sm resize-none"
            disabled={isBusy}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() =>
                clientDecline.mutate({
                  letterId,
                  reason: declineReason.trim() || undefined,
                })
              }
              disabled={isBusy}
            >
              {clientDecline.isPending ? "Declining..." : "Confirm Decline"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMode("idle");
                setDeclineReason("");
              }}
              disabled={isBusy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Main action bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 max-w-3xl mx-auto">
        {/* Left: revision count indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          {revisionLimitWarning && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {revisionsRemaining} revision{revisionsRemaining !== 1 ? "s" : ""} left
            </span>
          )}
          {revisionLimitReached && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Revision limit reached
            </span>
          )}
          {!revisionLimitWarning && !revisionLimitReached && (
            <span className="hidden sm:block">Review the letter above, then choose an action.</span>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-muted-foreground"
            onClick={scrollToTop}
            title="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 h-8"
            onClick={() => setMode(mode === "decline" ? "idle" : "decline")}
            disabled={isBusy}
          >
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Decline
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-violet-300 text-violet-700 hover:bg-violet-50 h-8"
            onClick={() => setMode(mode === "revision" ? "idle" : "revision")}
            disabled={isBusy || revisionLimitReached}
            title={revisionLimitReached ? `Maximum ${MAX_REVISIONS} revisions reached` : undefined}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {mode === "revision" ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 mr-0.5" />
                Close
              </>
            ) : revisionCount >= 1 ? (
              `Request Revisions ($${REVISION_FEE_USD})`
            ) : (
              "Request Revisions (Free)"
            )}
          </Button>

          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-8"
            onClick={() => clientApprove.mutate({ letterId })}
            disabled={isBusy}
            data-testid="button-sticky-approve"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            {clientApprove.isPending ? "Approving..." : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}
