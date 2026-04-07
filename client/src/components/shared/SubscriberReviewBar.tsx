import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle,
  RotateCcw,
  XCircle,
  ChevronUp,
  AlertCircle,
  ArrowUp,
  Send,
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
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [approveRecipientEmail, setApproveRecipientEmail] = useState("");
  const [approveSubjectOverride, setApproveSubjectOverride] = useState("");
  const [approveNote, setApproveNote] = useState("");

  const revisionsRemaining = MAX_REVISIONS - revisionCount;
  const revisionLimitReached = revisionCount >= MAX_REVISIONS;
  const revisionLimitWarning = revisionCount >= WARN_REVISIONS && !revisionLimitReached;

  const clientApprove = trpc.letters.clientApprove.useMutation({
    onSuccess: (res) => {
      const result = res as { success: boolean; pdfUrl?: string; recipientSent?: boolean; recipientSendError?: string };
      if (result.recipientSent) {
        toast.success("Letter approved & sent!", { description: "Your PDF has been generated and the letter sent to the recipient." });
      } else if (result.recipientSendError) {
        toast.warning("Letter approved, but sending failed", { description: "Your PDF is ready for download. You can retry sending via the 'Send Via Lawyer's Email' button." });
      } else {
        toast.success("Letter approved!", { description: "Your PDF is being generated and will be available for download shortly." });
      }
      setShowSendDialog(false);
      setApproveRecipientEmail("");
      setApproveSubjectOverride("");
      setApproveNote("");
      onAction();
    },
    onError: (err) => toast.error("Approval failed", { description: err.message }),
  });

  const clientRequestRevision = trpc.letters.clientRequestRevision.useMutation({
    onSuccess: (res) => {
      const result = res as { success: boolean; requiresPayment?: boolean; checkoutUrl?: string; revisionCount?: number; revisionWarning?: string };
      if (result.requiresPayment && result.checkoutUrl) {
        toast.info("Redirecting to payment", {
          description: "A $20 revision consultation fee applies. You will be redirected to complete payment.",
        });
        setTimeout(() => {
          window.location.href = result.checkoutUrl!;
        }, 1500);
        return;
      }
      if (result.revisionWarning) {
        toast.warning("Revision requested", { description: result.revisionWarning });
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
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50 h-8"
            onClick={() => clientApprove.mutate({ letterId })}
            disabled={isBusy}
            data-testid="button-sticky-approve-only"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            {clientApprove.isPending ? "Approving..." : "Approve Only"}
          </Button>

          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-8"
            onClick={() => setShowSendDialog(true)}
            disabled={isBusy}
            data-testid="button-sticky-approve-send"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Approve & Send
          </Button>
        </div>
      </div>

      <Dialog open={showSendDialog} onOpenChange={(open) => { setShowSendDialog(open); if (!open) { setApproveRecipientEmail(""); setApproveSubjectOverride(""); setApproveNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve & Send Letter</DialogTitle>
            <DialogDescription>
              Your letter will be approved, a PDF generated, and sent directly to the recipient's email — all in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bar-recipient-email">Recipient Email Address</Label>
              <Input
                id="bar-recipient-email"
                data-testid="input-bar-recipient-email"
                type="email"
                placeholder="recipient@example.com"
                value={approveRecipientEmail}
                onChange={(e) => setApproveRecipientEmail(e.target.value)}
                disabled={clientApprove.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bar-subject-override">Subject Line (optional)</Label>
              <Input
                id="bar-subject-override"
                data-testid="input-bar-subject-override"
                type="text"
                placeholder="Leave blank to use the original subject"
                value={approveSubjectOverride}
                onChange={(e) => setApproveSubjectOverride(e.target.value)}
                disabled={clientApprove.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bar-note">Note to Recipient (optional)</Label>
              <Textarea
                id="bar-note"
                data-testid="input-bar-note"
                placeholder="Add an optional note that will appear in the email..."
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                rows={3}
                disabled={clientApprove.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={clientApprove.isPending} data-testid="button-bar-cancel-send">
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => clientApprove.mutate({
                letterId,
                recipientEmail: approveRecipientEmail.trim(),
                subjectOverride: approveSubjectOverride.trim() || undefined,
                note: approveNote.trim() || undefined,
              })}
              disabled={clientApprove.isPending || !approveRecipientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approveRecipientEmail.trim())}
              data-testid="button-bar-confirm-send"
            >
              {clientApprove.isPending ? "Processing..." : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Approve & Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
