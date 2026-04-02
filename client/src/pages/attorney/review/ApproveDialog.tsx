import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle, ShieldAlert } from "lucide-react";
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
  onConfirm: () => void;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-approve" className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            Approve Letter
          </DialogTitle>
        </DialogHeader>
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
                  Research citations in this letter were not independently verified via web search. All legal citations must be manually confirmed before approval.
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
            onClick={onConfirm}
            disabled={
              isPending ||
              htmlToPlainText(approveContent).length < 50 ||
              (isResearchUnverified && !acknowledgedUnverified)
            }
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? "Approving..." : "Confirm Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
