import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Ban } from "lucide-react";

interface AffiliateDialogsProps {
  // Payout processing dialog
  processingPayout: { id: number; action: "completed" | "rejected" } | null;
  setProcessingPayout: (
    val: { id: number; action: "completed" | "rejected" } | null
  ) => void;
  rejectionReason: string;
  setRejectionReason: (v: string) => void;
  processPayout: {
    isPending: boolean;
  };
  handleProcessPayout: () => void;
  // Force expire dialog
  forceExpireCodeId: number | null;
  setForceExpireCodeId: (id: number | null) => void;
  forceExpireCode: {
    mutate: (args: { id: number }) => void;
    isPending: boolean;
  };
}

export function AffiliateDialogs({
  processingPayout,
  setProcessingPayout,
  rejectionReason,
  setRejectionReason,
  processPayout,
  handleProcessPayout,
  forceExpireCodeId,
  setForceExpireCodeId,
  forceExpireCode,
}: AffiliateDialogsProps) {
  return (
    <>
      {/* Payout Processing Dialog */}
      <Dialog
        open={!!processingPayout}
        onOpenChange={(open) => {
          if (!open) {
            setProcessingPayout(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {processingPayout?.action === "completed"
                ? "Approve Payout"
                : "Reject Payout"}
            </DialogTitle>
            <DialogDescription>
              {processingPayout?.action === "completed"
                ? "Confirm that this payout has been sent to the affiliate. The commissions reserved for this request will be marked as paid."
                : "Provide a reason for rejecting this payout request."}
            </DialogDescription>
          </DialogHeader>
          {processingPayout?.action === "rejected" && (
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="min-h-20"
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setProcessingPayout(null);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProcessPayout}
              disabled={
                processPayout.isPending ||
                (processingPayout?.action === "rejected" &&
                  !rejectionReason.trim())
              }
              className={
                processingPayout?.action === "completed"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {processPayout.isPending && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              {processingPayout?.action === "completed"
                ? "Confirm Approval"
                : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Expire Confirmation Dialog */}
      <Dialog
        open={forceExpireCodeId !== null}
        onOpenChange={(open) => {
          if (!open) setForceExpireCodeId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Force Expire Discount Code
            </DialogTitle>
            <DialogDescription>
              This will immediately deactivate the code and set it as expired.
              The affiliate will no longer earn commissions from this code. This
              action cannot be undone automatically — you would need to manually
              re-activate and clear the expiration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForceExpireCodeId(null)}
              data-testid="button-cancel-force-expire"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (forceExpireCodeId !== null) {
                  forceExpireCode.mutate({ id: forceExpireCodeId });
                }
              }}
              disabled={forceExpireCode.isPending}
              data-testid="button-confirm-force-expire"
            >
              {forceExpireCode.isPending && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              Force Expire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
