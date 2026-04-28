import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Download, Copy, Mail, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LetterContentRenderer } from "./LetterContentRenderer";
import { SendLetterDialog } from "./SendLetterDialog";

interface ApprovedLetterPanelProps {
  letterId: number;
  letterSubject: string;
  pdfUrl: string | null | undefined;
  content: string;
  /**
   * Current letter status — used to phrase the PDF button correctly.
   * - `approved` (attorney approved, awaiting subscriber click): PDF doesn't
   *   exist yet AND nothing is generating. Per CLAUDE.md, PDF generation is
   *   triggered on subscriber `clientApprove` — not when the attorney submits.
   *   Showing "Generating PDF..." here is misleading; the user has to click
   *   "Approve for delivery" first.
   * - `client_approved` / `sent`: PDF SHOULD exist; if pdfUrl is null, it's
   *   actually mid-generation, so "Generating PDF..." is accurate.
   * - `pdfUrl` populated: ready, show "Download PDF".
   */
  status?: string;
  onInvalidate: () => void;
  onCopy: () => void;
}

export function ApprovedLetterPanel({ letterId, letterSubject, pdfUrl, content, status, onInvalidate, onCopy }: ApprovedLetterPanelProps) {
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendSubjectOverride, setSendSubjectOverride] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [showRequestEditForm, setShowRequestEditForm] = useState(false);
  const [requestEditNotes, setRequestEditNotes] = useState("");

  const sendToRecipientMutation = trpc.letters.sendToRecipient.useMutation({
    onSuccess: (data: any) => {
      const pdfAttached = data?.pdfAttached !== false;
      toast.success("Letter sent", {
        description: pdfAttached
          ? `The approved letter has been sent to ${recipientEmail} with the PDF attached.`
          : `Sent to ${recipientEmail}, but PDF generation failed — the letter content was included inline. You can retry "Send" to attach the PDF.`,
      });
      setSendDialogOpen(false);
      setRecipientEmail("");
      setSendSubjectOverride("");
      setSendNote("");
      onInvalidate();
    },
    onError: (err) => toast.error("Failed to send letter", { description: err.message }),
  });

  // On-demand PDF: lets the subscriber retrieve a PDF even when upstream
  // attorney-approve generation failed silently or the URL has expired.
  // Returns a fresh presigned URL; we trigger the browser download right away.
  const generateOrFetchPdfMutation = trpc.letters.generateOrFetchPdf.useMutation({
    onSuccess: (data: any) => {
      const url = data?.pdfUrl as string | undefined;
      if (url) {
        window.open(url, "_blank");
        if (data?.regenerated) {
          toast.success("PDF generated", { description: "Your PDF is opening in a new tab." });
        }
        onInvalidate();
      } else {
        toast.error("PDF unavailable", { description: "Server didn't return a URL. Please retry." });
      }
    },
    onError: (err) => toast.error("PDF generation failed", { description: err.message }),
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
    // Fast path — already-stored URL: open immediately.
    if (pdfUrl) {
      window.open(pdfUrl, "_blank");
      return;
    }
    // Slow path — ask the server to (re)mint or render the PDF.
    generateOrFetchPdfMutation.mutate({ letterId });
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
                disabled={generateOrFetchPdfMutation.isPending}
              >
                {generateOrFetchPdfMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Generating PDF…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-1.5" />
                    {pdfUrl ? "Download PDF" : "Generate PDF"}
                  </>
                )}
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
