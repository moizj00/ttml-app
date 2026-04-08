import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  Send,
  RotateCcw,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { SubscriberAction } from "./hooks/useSubscriberPreview";

interface SubscriberActionPanelProps {
  letterId: number;
  activeAction: SubscriberAction;
  setActiveAction: (a: SubscriberAction) => void;
  isBusy: boolean;
  // Revision state
  revisionNotes: string;
  setRevisionNotes: (v: string) => void;
  revisionCount: number;
  revisionsRemaining: number;
  revisionLimitReached: boolean;
  revisionLimitWarning: boolean;
  revisionFeeUsd: number;
  // Decline state
  declineReason: string;
  setDeclineReason: (v: string) => void;
  // Send dialog state
  recipientEmail: string;
  setRecipientEmail: (v: string) => void;
  subjectOverride: string;
  setSubjectOverride: (v: string) => void;
  sendNote: string;
  setSendNote: (v: string) => void;
  // Mutations
  clientApprove: { mutate: (input: any) => void; isPending: boolean };
  clientRequestRevision: { mutate: (input: any) => void; isPending: boolean };
  clientDecline: { mutate: (input: any) => void; isPending: boolean };
}

export function SubscriberActionPanel({
  letterId,
  activeAction,
  setActiveAction,
  isBusy,
  revisionNotes,
  setRevisionNotes,
  revisionCount,
  revisionsRemaining,
  revisionLimitReached,
  revisionLimitWarning,
  revisionFeeUsd,
  declineReason,
  setDeclineReason,
  recipientEmail,
  setRecipientEmail,
  subjectOverride,
  setSubjectOverride,
  sendNote,
  setSendNote,
  clientApprove,
  clientRequestRevision,
  clientDecline,
}: SubscriberActionPanelProps) {
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  // Approve & Send form
  if (activeAction === "send") {
    return (
      <div className="border-t border-border bg-background px-6 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Send className="w-4 h-4 text-green-600" />
          <p className="text-sm font-semibold text-foreground">
            Approve & Send Letter
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          The letter will be sent from{" "}
          <span className="font-medium text-foreground">
            legal@talk-to-my-lawyer.com
          </span>{" "}
          on your behalf.
        </p>
        <div className="space-y-2">
          <div>
            <Label htmlFor="preview-recipient-email" className="text-xs font-medium">
              Recipient Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="preview-recipient-email"
              type="email"
              placeholder="recipient@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={isBusy}
              className="mt-1"
              data-testid="input-preview-recipient-email"
            />
          </div>
          <div>
            <Label htmlFor="preview-subject-override" className="text-xs font-medium">
              Subject Line (optional)
            </Label>
            <Input
              id="preview-subject-override"
              type="text"
              placeholder="Leave blank to use original subject"
              value={subjectOverride}
              onChange={(e) => setSubjectOverride(e.target.value)}
              disabled={isBusy}
              className="mt-1"
              data-testid="input-preview-subject-override"
            />
          </div>
          <div>
            <Label htmlFor="preview-send-note" className="text-xs font-medium">
              Note to Recipient (optional)
            </Label>
            <Textarea
              id="preview-send-note"
              placeholder="Add an optional note..."
              value={sendNote}
              onChange={(e) => setSendNote(e.target.value)}
              rows={2}
              disabled={isBusy}
              className="mt-1 resize-none"
              data-testid="input-preview-send-note"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveAction(null)}
            disabled={isBusy}
          >
            Back
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={() =>
              clientApprove.mutate({
                letterId,
                recipientEmail: recipientEmail.trim(),
                subjectOverride: subjectOverride.trim() || undefined,
                note: sendNote.trim() || undefined,
              })
            }
            disabled={isBusy || !recipientEmail.trim() || !isValidEmail}
            data-testid="button-preview-confirm-send"
          >
            {clientApprove.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1.5" />
                Approve & Send
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Request Revision form
  if (activeAction === "revision") {
    return (
      <div className="border-t border-violet-200 bg-violet-50/80 px-6 py-4 space-y-3">
        <p className="text-sm font-medium text-violet-800">
          What changes would you like the attorney to make?
          {revisionCount >= 1 && (
            <span className="ml-2 text-xs font-normal text-violet-600 bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded">
              ${revisionFeeUsd} consultation fee applies
            </span>
          )}
        </p>
        {revisionLimitWarning && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            You have used {revisionCount} of 5 allowed revisions.{" "}
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
          data-testid="input-preview-revision-notes"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() =>
              clientRequestRevision.mutate({ letterId, revisionNotes })
            }
            disabled={isBusy || revisionNotes.trim().length < 10}
            data-testid="button-preview-submit-revision"
          >
            {clientRequestRevision.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Revision Request"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setActiveAction(null);
              setRevisionNotes("");
            }}
            disabled={isBusy}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Decline confirmation
  if (activeAction === "decline") {
    return (
      <div className="border-t border-red-200 bg-red-50/80 px-6 py-4 space-y-3">
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
          data-testid="input-preview-decline-reason"
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
            data-testid="button-preview-confirm-decline"
          >
            {clientDecline.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Declining...
              </>
            ) : (
              "Confirm Decline"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setActiveAction(null);
              setDeclineReason("");
            }}
            disabled={isBusy}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Default: main CTA bar
  return (
    <div className="border-t border-border bg-background px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        {/* Left: revision info */}
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
            <span className="hidden sm:block">
              Review the letter above, then choose an action.
            </span>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 h-8"
            onClick={() => setActiveAction("decline")}
            disabled={isBusy}
            data-testid="button-preview-decline"
          >
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Decline
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-violet-300 text-violet-700 hover:bg-violet-50 h-8"
            onClick={() => setActiveAction("revision")}
            disabled={isBusy || revisionLimitReached}
            title={
              revisionLimitReached ? "Maximum 5 revisions reached" : undefined
            }
            data-testid="button-preview-request-revision"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {revisionCount >= 1
              ? `Request Changes ($${revisionFeeUsd})`
              : "Request Changes"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50 h-8"
            onClick={() => clientApprove.mutate({ letterId })}
            disabled={isBusy}
            data-testid="button-preview-approve-only"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            {clientApprove.isPending ? "Approving..." : "Approve Only"}
          </Button>

          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-8"
            onClick={() => setActiveAction("send")}
            disabled={isBusy}
            data-testid="button-preview-approve-send"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Approve & Send
          </Button>
        </div>
      </div>
    </div>
  );
}
