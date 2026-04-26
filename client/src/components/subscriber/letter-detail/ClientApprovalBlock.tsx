import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CheckCircle, AlertCircle, Send, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ClientApprovalBlockProps {
  letterId: number;
  revisionCount?: number;
  onApprove: () => void;
}

export function ClientApprovalBlock({ letterId, revisionCount, onApprove }: ClientApprovalBlockProps) {
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [approveRecipientEmail, setApproveRecipientEmail] = useState("");
  const [approveSubjectOverride, setApproveSubjectOverride] = useState("");
  const [approveNote, setApproveNote] = useState("");

  const MAX_REVISIONS = 5;
  const WARN_REVISIONS = 3;
  const revisionsUsed = revisionCount ?? 0;
  const revisionsRemaining = MAX_REVISIONS - revisionsUsed;
  const revisionLimitReached = revisionsUsed >= MAX_REVISIONS;
  const revisionLimitWarning = revisionsUsed >= WARN_REVISIONS && !revisionLimitReached;

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
      onApprove();
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
        setTimeout(() => { window.location.href = result.checkoutUrl!; }, 1500);
        return;
      }
      if (result.revisionWarning) {
        toast.warning("Revision requested", { description: result.revisionWarning });
      } else {
        toast.success("Revision requested", { description: "Your feedback has been sent to the attorney. The letter will be revised and returned to you." });
      }
      setShowRevisionForm(false);
      setRevisionNotes("");
      onApprove();
    },
    onError: (err) => toast.error("Request failed", { description: err.message }),
  });

  const clientDecline = trpc.letters.clientDecline.useMutation({
    onSuccess: () => {
      toast.info("Letter declined", { description: "The letter has been declined. Our team has been notified." });
      setShowDeclineConfirm(false);
      setDeclineReason("");
      onApprove();
    },
    onError: (err) => toast.error("Decline failed", { description: err.message }),
  });

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-sm font-semibold text-blue-800">Your Letter is Ready — Final Approval Required</p>
              <p className="text-sm text-blue-700 mt-1">
                Your attorney has reviewed and submitted your letter. Please review the final version below. When you approve, your PDF will be generated and made available for download.
              </p>
            </div>

            {revisionLimitWarning && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  You have used {revisionsUsed} of {MAX_REVISIONS} allowed revision requests. You have <strong>{revisionsRemaining} remaining</strong>.
                </p>
              </div>
            )}

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
                    <Label htmlFor="approve-recipient-email">Recipient Email Address</Label>
                    <Input
                      id="approve-recipient-email"
                      data-testid="input-approve-recipient-email"
                      type="email"
                      placeholder="recipient@example.com"
                      value={approveRecipientEmail}
                      onChange={(e) => setApproveRecipientEmail(e.target.value)}
                      disabled={clientApprove.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="approve-subject-override">Subject Line (optional)</Label>
                    <Input
                      id="approve-subject-override"
                      data-testid="input-approve-subject-override"
                      type="text"
                      placeholder="Leave blank to use the original subject"
                      value={approveSubjectOverride}
                      onChange={(e) => setApproveSubjectOverride(e.target.value)}
                      disabled={clientApprove.isPending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="approve-note">Note to Recipient (optional)</Label>
                    <Textarea
                      id="approve-note"
                      data-testid="input-approve-note"
                      placeholder="Add an optional note that will appear in the email..."
                      value={approveNote}
                      onChange={(e) => setApproveNote(e.target.value)}
                      rows={3}
                      disabled={clientApprove.isPending}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={clientApprove.isPending} data-testid="button-cancel-approve-send">
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
                    data-testid="button-confirm-approve-send"
                  >
                    {clientApprove.isPending ? "Processing..." : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Approve & Send
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="button-client-approve-send"
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
                onClick={() => { setShowSendDialog(true); setShowRevisionForm(false); setShowDeclineConfirm(false); }}
                disabled={clientApprove.isPending || clientRequestRevision.isPending || clientDecline.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                Approve & Send
              </Button>
              <Button
                data-testid="button-client-approve"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                size="sm"
                onClick={() => clientApprove.mutate({ letterId })}
                disabled={clientApprove.isPending || clientRequestRevision.isPending || clientDecline.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {clientApprove.isPending ? "Processing..." : "Approve Only"}
              </Button>
              <Button
                data-testid="button-client-request-revision"
                variant="outline"
                className="border-violet-300 text-violet-700 hover:bg-violet-50"
                size="sm"
                onClick={() => { setShowRevisionForm(!showRevisionForm); setShowDeclineConfirm(false); }}
                disabled={clientApprove.isPending || clientRequestRevision.isPending || clientDecline.isPending || revisionLimitReached}
                title={revisionLimitReached ? `Maximum revision limit (${MAX_REVISIONS}) reached` : undefined}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {revisionLimitReached ? "Revision Limit Reached" : "Request Revisions"}
              </Button>
              <Button
                data-testid="button-client-decline"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                size="sm"
                onClick={() => { setShowDeclineConfirm(!showDeclineConfirm); setShowRevisionForm(false); }}
                disabled={clientApprove.isPending || clientRequestRevision.isPending || clientDecline.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Decline
              </Button>
            </div>

            <div className="text-xs text-blue-600/70 space-y-0.5">
              <p><strong>Approve & Send</strong> — Generates your final PDF and sends it directly to the recipient in one step.</p>
              <p><strong>Approve Only</strong> — Generates your final PDF without sending. You can download or send it later.</p>
              <p><strong>Request Revisions</strong> — Sends your feedback to the attorney for further edits. The letter will return to you once revised.</p>
              <p><strong>Decline</strong> — Permanently declines this letter. This cannot be undone.</p>
            </div>

            {showRevisionForm && (
              <div className="bg-white border border-violet-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-violet-800">What changes would you like?</p>
                <Textarea
                  data-testid="input-revision-notes"
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Describe the changes you'd like the attorney to make (at least 10 characters)..."
                  rows={3}
                  className="border-violet-200"
                />
                <div className="flex gap-2">
                  <Button
                    data-testid="button-submit-revision-request"
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => clientRequestRevision.mutate({ letterId, revisionNotes })}
                    disabled={clientRequestRevision.isPending || revisionNotes.trim().length < 10}
                  >
                    {clientRequestRevision.isPending ? "Submitting..." : "Submit Revision Request"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowRevisionForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {showDeclineConfirm && (
              <div className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-red-800">Are you sure you want to decline this letter?</p>
                <p className="text-xs text-red-600">This action is permanent and cannot be undone. The letter will not be sent.</p>
                <Textarea
                  data-testid="input-decline-reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining (optional)..."
                  rows={2}
                  className="border-red-200"
                />
                <div className="flex gap-2">
                  <Button
                    data-testid="button-confirm-decline"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => clientDecline.mutate({ letterId, reason: declineReason.trim() || undefined })}
                    disabled={clientDecline.isPending}
                  >
                    {clientDecline.isPending ? "Declining..." : "Confirm Decline"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDeclineConfirm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
