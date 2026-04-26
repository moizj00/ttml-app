import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mail } from "lucide-react";

interface SendLetterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterSubject: string;
  recipientEmail: string;
  onRecipientEmailChange: (v: string) => void;
  sendSubjectOverride: string;
  onSendSubjectOverrideChange: (v: string) => void;
  sendNote: string;
  onSendNoteChange: (v: string) => void;
  isPending: boolean;
  onSend: () => void;
  onCancel: () => void;
}

export function SendLetterDialog({
  open,
  onOpenChange,
  letterSubject,
  recipientEmail,
  onRecipientEmailChange,
  sendSubjectOverride,
  onSendSubjectOverrideChange,
  sendNote,
  onSendNoteChange,
  isPending,
  onSend,
  onCancel,
}: SendLetterDialogProps) {
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Letter via Lawyer's Email</DialogTitle>
          <DialogDescription>
            Enter the recipient's email address. The approved letter will be sent from our platform's legal address, with the PDF attached (or letter content inline if no PDF is available).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="recipient-email">Recipient Email Address</Label>
            <Input
              id="recipient-email"
              data-testid="input-recipient-email"
              type="email"
              placeholder="recipient@example.com"
              value={recipientEmail}
              onChange={(e) => onRecipientEmailChange(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject-override">Subject Line (optional)</Label>
            <Input
              id="subject-override"
              data-testid="input-subject-override"
              type="text"
              placeholder={letterSubject}
              value={sendSubjectOverride}
              onChange={(e) => onSendSubjectOverrideChange(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the original letter subject.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-note">Note to Recipient (optional)</Label>
            <Textarea
              id="send-note"
              data-testid="input-send-note"
              placeholder="Add an optional note that will appear in the email to the recipient..."
              value={sendNote}
              onChange={(e) => onSendNoteChange(e.target.value)}
              rows={3}
              disabled={isPending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The letter will be sent from our platform's lawyer email address on behalf of you.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            data-testid="button-cancel-send"
          >
            Cancel
          </Button>
          <Button
            onClick={onSend}
            disabled={isPending || !recipientEmail.trim() || !isValidEmail}
            data-testid="button-confirm-send"
          >
            {isPending ? (
              "Sending..."
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Send Letter
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
