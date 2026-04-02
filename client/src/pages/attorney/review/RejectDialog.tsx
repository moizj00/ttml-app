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
import { XCircle } from "lucide-react";

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectReason: string;
  onReasonChange: (reason: string) => void;
  isPending: boolean;
  onConfirm: () => void;
}

export function RejectDialog({
  open,
  onOpenChange,
  rejectReason,
  onReasonChange,
  isPending,
  onConfirm,
}: RejectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-reject">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <XCircle className="w-5 h-5" />
            Reject Letter
          </DialogTitle>
        </DialogHeader>
        <div>
          <Label className="text-sm font-medium mb-1.5 block">
            Reason for Rejection *
          </Label>
          <Textarea
            data-testid="input-reject-reason"
            value={rejectReason}
            onChange={e => onReasonChange(e.target.value)}
            placeholder="Explain why this letter is being rejected..."
            rows={4}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="button-reject-cancel"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-background"
          >
            Cancel
          </Button>
          <Button
            data-testid="button-reject-confirm"
            onClick={onConfirm}
            disabled={isPending || rejectReason.length < 10}
            variant="destructive"
          >
            {isPending ? "Rejecting..." : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
