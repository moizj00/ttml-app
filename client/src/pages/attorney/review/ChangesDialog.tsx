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
            Request Changes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Note to Subscriber *
            </Label>
            <Textarea
              data-testid="input-changes-note"
              value={changesNote}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="Explain what changes are needed..."
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              data-testid="checkbox-retrigger-pipeline"
              type="checkbox"
              id="retrigger"
              checked={retrigger}
              onChange={e => onRetriggerChange(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="retrigger" className="text-sm text-foreground">
              Re-trigger drafting pipeline to regenerate draft
            </label>
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
