import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Download, Copy, Mail, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { LetterContentRenderer } from "./LetterContentRenderer";
import { SendLetterDialog } from "./SendLetterDialog";

interface ApprovedLetterPanelProps {
  letterId: number;
  letterSubject: string;
  pdfUrl: string | null | undefined;
  content: string;
  onInvalidate: () => void;
  onCopy: () => void;
}

export function ApprovedLetterPanel({ letterId, letterSubject, pdfUrl, content, onInvalidate, onCopy }: ApprovedLetterPanelProps) {
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendSubjectOverride, setSendSubjectOverride] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [showRequestEditForm, setShowRequestEditForm] = useState(false);
  const [requestEditNotes, setRequestEditNotes] = useState("");

  const sendToRecipientMutation = trpc.letters.sendToRecipient.useMutation({
    onSuccess: () => {
      toast.success("Letter sent", { description: `The approved letter has been sent to ${recipientEmail}.` });
      setSendDialogOpen(false);
      setRecipientEmail("");
      setSendSubjectOverride("");
      setSendNote("");
    },
    onError: (err) => toast.error("Failed to send letter", { description: err.message }),
  });

  const requestEditMutation = trpc.letters.clientRequestRevision.useMutation({
    onSuccess: (res) => {
      const result = res as { success: boolean; requiresPayment?: boolean; checkoutUrl?: string; revisionCount?: number; revisionWarning?: string };
      if (result.requiresPayment && result.checkoutUrl) {
        toast.info("Redirecting to payment", { description: "A $20 revision consultation fee applies. You will be redirected to complete payment." });
        setTimeout(() => { window.location.href = result.checkoutUrl!; }, 1500);
        return;
      }
      if (result.revisionWarning) {
        toast.warning("Edit requested", { description: result.revisionWarning });
      } else {
        toast.success("Edit requested", { description: "Your feedback has been sent to the attorney. The letter will be revised and returned to you." });
      }
      setShowRequestEditForm(false);
      setRequestEditNotes("");
      onInvalidate();
    },
    onError: (err) => toast.error("Request failed", { description: err.message }),
  });

  const handleDownload = () => {
    if (pdfUrl) window.open(pdfUrl, "_blank");
  };

  const closeSendDialog = () => {
    setSendDialogOpen(false);
    setRecipientEmail("");
    setSendSubjectOverride("");
    setSendNote("");
  };

  return (
    <>
      <SendLetterDialog
        open={sendDialogOpen}
        onOpenChange={(open) => { if (!open) closeSendDialog(); else setSendDialogOpen(true); }}
        letterSubject={letterSubject}
        recipientEmail={recipientEmail}
        onRecipientEmailChange={setRecipientEmail}
        sendSubjectOverride={sendSubjectOverride}
        onSendSubjectOverrideChange={setSendSubjectOverride}
        sendNote={sendNote}
        onSendNoteChange={setSendNote}
        isPending={sendToRecipientMutation.isPending}
        onSend={() => sendToRecipientMutation.mutate({
          letterId,
          recipientEmail: recipientEmail.trim(),
          subjectOverride: sendSubjectOverride.trim() || undefined,
          note: sendNote.trim() || undefined,
        })}
        onCancel={closeSendDialog}
      />
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700">
              <CheckCircle className="w-4 h-4" />
              Your Approved Letter
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleDownload}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-download-letter"
                disabled={!pdfUrl}
              >
                <Download className="w-4 h-4 mr-1.5" />
                {pdfUrl ? "Download PDF" : "Generating PDF..."}
              </Button>
              <Button
                onClick={onCopy}
                size="sm"
                variant="outline"
                className="bg-background border-green-300 text-green-700 hover:bg-green-50"
                data-testid="button-copy-letter"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy
              </Button>
              <Button
                onClick={() => setSendDialogOpen(true)}
                size="sm"
                variant="outline"
                className="bg-background border-green-300 text-green-700 hover:bg-green-50"
                data-testid="button-send-via-lawyer-email"
                disabled={!pdfUrl}
              >
                <Mail className="w-3.5 h-3.5 mr-1.5" />
                Send Via Lawyer's Email
              </Button>
              <Button
                onClick={() => setShowRequestEditForm(!showRequestEditForm)}
                size="sm"
                variant="outline"
                className="border-violet-300 text-violet-700 hover:bg-violet-50"
                data-testid="button-request-edit"
                disabled={requestEditMutation.isPending}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Request Edit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showRequestEditForm && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-3 mb-4">
              <p className="text-sm font-medium text-violet-800">What changes would you like?</p>
              <p className="text-xs text-violet-600">Your first post-approval edit request is free. Subsequent edit requests will require a $20 consultation fee.</p>
              <Textarea
                data-testid="input-request-edit-notes"
                value={requestEditNotes}
                onChange={(e) => setRequestEditNotes(e.target.value)}
                placeholder="Describe the changes you'd like the attorney to make (at least 10 characters)..."
                rows={3}
                className="border-violet-200"
                disabled={requestEditMutation.isPending}
              />
              <div className="flex gap-2">
                <Button
                  data-testid="button-submit-request-edit"
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => requestEditMutation.mutate({ letterId, revisionNotes: requestEditNotes })}
                  disabled={requestEditMutation.isPending || requestEditNotes.trim().length < 10}
                >
                  {requestEditMutation.isPending ? "Submitting..." : "Submit Edit Request"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowRequestEditForm(false); setRequestEditNotes(""); }}>Cancel</Button>
              </div>
            </div>
          )}
          <LetterContentRenderer content={content} borderClass="border-green-200" />
        </CardContent>
      </Card>
    </>
  );
}
