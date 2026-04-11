import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle, ShieldAlert, Send, ChevronDown, ChevronUp } from "lucide-react";
import RichTextEditor, { htmlToPlainText } from "@/components/shared/RichTextEditor";

interface ApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approveContent: string;
  onContentChange: (html: string) => void;
  isResearchUnverified: boolean;
  acknowledgedUnverified: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
  isPending: boolean;
  onConfirm: (opts: {
    recipientEmail?: string;
    subjectOverride?: string;
    deliveryNote?: string;
  }) => void;
}

export function ApproveDialog({
  open,
  onOpenChange,
  approveContent,
  onContentChange,
  isResearchUnverified,
  acknowledgedUnverified,
  onAcknowledgeChange,
  isPending,
  onConfirm,
}: ApproveDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subjectOverride, setSubjectOverride] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [showDelivery, setShowDelivery] = useState(false);

  const handleConfirm = () => {
    onConfirm({
      recipientEmail: recipientEmail.trim() || undefined,
      subjectOverride: subjectOverride.trim() || undefined,
      deliveryNote: deliveryNote.trim() || undefined,
    });
  };

  const isContentValid = htmlToPlainText(approveContent).length >= 50;
  const isEmailValid = !recipientEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());
  const canConfirm =
    !isPending &&
    isContentValid &&
    isEmailValid &&
    !(isResearchUnverified && !acknowledgedUnverified);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-approve" className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            Approve Letter
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          Review and finalise the letter content below. Once approved, the subscriber will be notified and their PDF will be generated immediately.
        </p>
        <div className="flex-1 overflow-auto space-y-3 min-h-0">
          <Label className="text-sm font-medium">
            Final Letter Content — review and edit before approving
          </Label>
          <RichTextEditor
            data-testid="editor-approve-content"
            content={approveContent}
            onChange={onContentChange}
            editable={true}
            placeholder="Final letter content..."
            minHeight="300px"
          />

          {isResearchUnverified && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2" data-testid="unverified-research-acknowledgment">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                  Research citations in this letter were not independently verified via web search. All legal citations must be manually confirmed before approving.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledgedUnverified}
                  onChange={e => onAcknowledgeChange(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  data-testid="checkbox-acknowledge-unverified"
                />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  I have manually verified all legal citations in this letter
                </span>
              </label>
            </div>
          )}

          {/* Optional: Send to recipient in one step */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setShowDelivery(v => !v)}
              data-testid="button-toggle-delivery-section"
            >
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4 text-muted-foreground" />
                Send to recipient after approval{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </span>
              {showDelivery ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {showDelivery && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  If you provide a recipient email, the letter will be sent to them immediately after approval in one step.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="approve-recipient-email" className="text-xs">
                    Recipient Email
                  </Label>
                  <Input
                    id="approve-recipient-email"
                    data-testid="input-approve-recipient-email"
                    type="email"
                    placeholder="recipient@example.com"
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="approve-subject-override" className="text-xs">
                    Subject Override{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="approve-subject-override"
                    data-testid="input-approve-subject-override"
                    type="text"
                    placeholder="Leave blank to use the letter subject"
                    value={subjectOverride}
                    onChange={e => setSubjectOverride(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="approve-delivery-note" className="text-xs">
                    Note to Recipient{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="approve-delivery-note"
                    data-testid="input-approve-delivery-note"
                    placeholder="Optional note to include in the delivery email..."
                    value={deliveryNote}
                    onChange={e => setDeliveryNote(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            data-testid="button-approve-cancel"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-background"
          >
            Cancel
          </Button>
          <Button
            data-testid="button-approve-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending
              ? "Approving..."
              : recipientEmail.trim()
              ? "Approve & Send"
              : "Approve Letter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
