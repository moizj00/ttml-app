import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Mail,
  ExternalLink,
  CheckCircle,
  Loader2,
} from "lucide-react";

const SEEN_KEY_PREFIX = "ttml_approved_seen_";

function markLetterSeen(letterId: number) {
  try {
    localStorage.setItem(`${SEEN_KEY_PREFIX}${letterId}`, "true");
  } catch {}
}

function isLetterSeen(letterId: number): boolean {
  try {
    return localStorage.getItem(`${SEEN_KEY_PREFIX}${letterId}`) === "true";
  } catch {
    return false;
  }
}

interface ApprovedLetter {
  id: number;
  subject: string;
  pdfUrl: string | null;
  status: string;
}

interface ApprovedLetterPreviewModalProps {
  letters: ApprovedLetter[];
  forceLetterIds?: number[];
}

export default function ApprovedLetterPreviewModal({
  letters,
  forceLetterIds,
}: ApprovedLetterPreviewModalProps) {
  const [currentLetter, setCurrentLetter] = useState<ApprovedLetter | null>(null);
  const [open, setOpen] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subjectOverride, setSubjectOverride] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const sendMutation = trpc.letters.sendToRecipient.useMutation({
    onSuccess: () => {
      toast.success("Letter sent!", {
        description: "The letter has been sent to the recipient via attorney email.",
      });
      handleClose();
    },
    onError: (err) => {
      toast.error("Failed to send", { description: err.message });
    },
  });

  useEffect(() => {
    const approvedLetters = letters.filter(
      (l) =>
        (l.status === "approved" || l.status === "client_approved") &&
        !isLetterSeen(l.id) &&
        !dismissedIds.has(l.id)
    );

    if (forceLetterIds && forceLetterIds.length > 0) {
      const forced = letters.find(
        (l) =>
          forceLetterIds.includes(l.id) &&
          (l.status === "approved" || l.status === "client_approved") &&
          !isLetterSeen(l.id) &&
          !dismissedIds.has(l.id)
      );
      if (forced) {
        setCurrentLetter(forced);
        setOpen(true);
        return;
      }
    }

    if (approvedLetters.length > 0) {
      setCurrentLetter(approvedLetters[0]);
      setOpen(true);
    }
  }, [letters, forceLetterIds, dismissedIds]);

  const handleClose = () => {
    if (currentLetter) {
      markLetterSeen(currentLetter.id);
      setDismissedIds((prev) => new Set(prev).add(currentLetter.id));
    }
    setOpen(false);
    setShowSendForm(false);
    setRecipientEmail("");
    setSubjectOverride("");
    setSendNote("");
    setCurrentLetter(null);
  };

  if (!currentLetter) return null;

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground text-left">
                Your Letter Has Been Approved
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground text-left mt-0.5">
                {currentLetter.subject}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-6 overflow-hidden">
          {currentLetter.pdfUrl ? (
            <div className="w-full h-[400px] border border-border rounded-lg overflow-hidden bg-muted/30">
              <iframe
                src={currentLetter.pdfUrl}
                className="w-full h-full"
                title="Approved Letter PDF"
                data-testid="iframe-approved-pdf"
              />
            </div>
          ) : (
            <div className="w-full h-[200px] border border-border rounded-lg flex flex-col items-center justify-center bg-muted/30">
              <Loader2 className="w-8 h-8 text-muted-foreground/50 animate-spin mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                PDF is being generated...
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                This usually takes a few moments. You can view the full letter below.
              </p>
            </div>
          )}
        </div>

        {!showSendForm ? (
          <DialogFooter className="flex flex-col gap-3 p-6 pt-4">
            <Button
              size="lg"
              className="w-full bg-green-700 hover:bg-green-800 text-white text-base"
              onClick={() => setShowSendForm(true)}
              data-testid="button-send-via-attorney-email-modal"
            >
              <Mail className="w-5 h-5 mr-2" />
              Send via Attorney's Email
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Sent from{" "}
              <span className="font-medium text-foreground">
                legal@talk-to-my-lawyer.com
              </span>
            </p>
            <div className="flex items-center justify-center gap-4 pt-1">
              <Link
                href={`/letters/${currentLetter.id}`}
                onClick={handleClose}
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                data-testid="link-view-full-letter"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Full Letter
              </Link>
              <button
                onClick={handleClose}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-dismiss-approved-modal"
              >
                Dismiss
              </button>
            </div>
          </DialogFooter>
        ) : (
          <div className="p-6 pt-4 space-y-4 border-t">
            <div className="space-y-1.5">
              <Label htmlFor="modal-recipient-email">Recipient Email Address</Label>
              <Input
                id="modal-recipient-email"
                data-testid="input-modal-recipient-email"
                type="email"
                placeholder="recipient@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                disabled={sendMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modal-subject-override">Subject Line (optional)</Label>
              <Input
                id="modal-subject-override"
                data-testid="input-modal-subject-override"
                type="text"
                placeholder={currentLetter.subject}
                value={subjectOverride}
                onChange={(e) => setSubjectOverride(e.target.value)}
                disabled={sendMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the original letter subject.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modal-send-note">Note to Recipient (optional)</Label>
              <Textarea
                id="modal-send-note"
                data-testid="input-modal-send-note"
                placeholder="Add an optional note..."
                value={sendNote}
                onChange={(e) => setSendNote(e.target.value)}
                rows={2}
                disabled={sendMutation.isPending}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The letter will be sent from{" "}
              <span className="font-medium">legal@talk-to-my-lawyer.com</span> on
              your behalf.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSendForm(false);
                  setRecipientEmail("");
                  setSubjectOverride("");
                  setSendNote("");
                }}
                disabled={sendMutation.isPending}
                data-testid="button-cancel-modal-send"
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-green-700 hover:bg-green-800 text-white"
                onClick={() =>
                  sendMutation.mutate({
                    letterId: currentLetter.id,
                    recipientEmail: recipientEmail.trim(),
                    subjectOverride: subjectOverride.trim() || undefined,
                    note: sendNote.trim() || undefined,
                  })
                }
                disabled={
                  sendMutation.isPending || !recipientEmail.trim() || !isValidEmail
                }
                data-testid="button-confirm-modal-send"
              >
                {sendMutation.isPending ? (
                  "Sending..."
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Letter
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { isLetterSeen, markLetterSeen };
