import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";

interface ChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changesNote: string;
  onNoteChange: (note: string) => void;
  retrigger: boolean;
  onRetriggerChange: (checked: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}

export function ChangesDialog({
  open,
  onOpenChange,
  changesNote,
  onNoteChange,
  retrigger,
  onRetriggerChange,
  isPending,
  onConfirm,
}: ChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-request-changes">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <MessageSquare className="w-5 h-5" />
            Request Changes from Subscriber
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          The subscriber will be notified and asked to provide additional
          information or corrections. The letter will return to the review queue
          once they respond.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Note to Subscriber *
            </Label>
            <Textarea
              data-testid="input-changes-note"
              value={changesNote}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="Explain what changes or additional information are needed..."
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <input
                data-testid="checkbox-retrigger-pipeline"
                type="checkbox"
                id="retrigger"
                checked={retrigger}
                onChange={e => onRetriggerChange(e.target.checked)}
                className="rounded mt-0.5"
              />
              <div>
                <label
                  htmlFor="retrigger"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Re-run research & drafting pipeline
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {retrigger
                    ? "The full research & drafting process will re-run with the subscriber's updated information."
                    : "The letter will return to the review queue for a light manual edit — no automation re-run."}
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="button-changes-cancel"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-background"
          >
            Cancel
          </Button>
          <Button
            data-testid="button-changes-confirm"
            onClick={onConfirm}
            disabled={isPending || changesNote.length < 10}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending ? "Sending..." : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
