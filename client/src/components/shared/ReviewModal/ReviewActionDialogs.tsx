import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Loader2,
  Gavel,
} from "lucide-react";
import { ActionDialog } from "./ActionDialog";
import { plainTextToHtml, htmlToPlainText } from "../RichTextEditor";
import type { ActiveAction } from "./hooks/useReviewModal";

interface ReviewActionDialogsProps {
  activeAction: ActiveAction;
  setActiveAction: (a: ActiveAction) => void;
  letterId: number;
  approveContent: string;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  changesNote: string;
  setChangesNote: (v: string) => void;
  retrigger: boolean;
  setRetrigger: (v: boolean) => void;
  approveMutation: any;
  rejectMutation: any;
  changesMutation: any;
}

export function ReviewActionDialogs({
  activeAction,
  setActiveAction,
  letterId,
  approveContent,
  rejectReason,
  setRejectReason,
  changesNote,
  setChangesNote,
  retrigger,
  setRetrigger,
  approveMutation,
  rejectMutation,
  changesMutation,
}: ReviewActionDialogsProps) {
  return (
    <>
      {/* Submit to Client */}
      {activeAction === "approve" && (
        <ActionDialog
          onClose={() => setActiveAction(null)}
          labelId="approve-dialog-title"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3
                id="approve-dialog-title"
                className="text-base font-bold text-foreground"
              >
                Submit Letter for Client Approval
              </h3>
              <p className="text-xs text-muted-foreground">
                The subscriber will be notified to review and approve. PDF is
                generated after their approval.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">
                Final Letter Preview
              </Label>
              <div className="bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div
                  className="prose prose-sm max-w-none text-xs"
                  dangerouslySetInnerHTML={{
                    __html: plainTextToHtml(approveContent),
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {htmlToPlainText(approveContent).length} characters
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                approveMutation.mutate({
                  letterId,
                  finalContent: approveContent,
                })
              }
              disabled={
                approveMutation.isPending ||
                htmlToPlainText(approveContent).length < 50
              }
              className="bg-green-600 hover:bg-green-700 text-white font-semibold min-w-[160px] justify-center"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Gavel className="w-4 h-4 mr-1.5" />
                  Submit to Client
                </>
              )}
            </Button>
          </div>
        </ActionDialog>
      )}

      {/* Reject */}
      {activeAction === "reject" && (
        <ActionDialog
          onClose={() => setActiveAction(null)}
          labelId="reject-dialog-title"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3
                id="reject-dialog-title"
                className="text-base font-bold text-foreground"
              >
                Reject Letter
              </h3>
              <p className="text-xs text-muted-foreground">
                The subscriber will be notified of the rejection.
              </p>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Reason for Rejection{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this letter is being rejected..."
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                rejectMutation.mutate({ letterId, reason: rejectReason })
              }
              disabled={rejectMutation.isPending || rejectReason.length < 10}
              variant="destructive"
            >
              {rejectMutation.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </div>
        </ActionDialog>
      )}

      {/* Request Changes */}
      {activeAction === "changes" && (
        <ActionDialog
          onClose={() => setActiveAction(null)}
          labelId="changes-dialog-title"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3
                id="changes-dialog-title"
                className="text-base font-bold text-foreground"
              >
                Request Changes
              </h3>
              <p className="text-xs text-muted-foreground">
                Ask the subscriber for additional information.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">
                Note to Subscriber{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={changesNote}
                onChange={(e) => setChangesNote(e.target.value)}
                placeholder="Explain what changes are needed..."
                rows={4}
                className="resize-none"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="retrigger-modal"
                checked={retrigger}
                onChange={(e) => setRetrigger(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-foreground">
                Re-trigger drafting pipeline to regenerate draft
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                changesMutation.mutate({
                  letterId,
                  userVisibleNote: changesNote,
                  retriggerPipeline: retrigger,
                })
              }
              disabled={changesMutation.isPending || changesNote.length < 10}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {changesMutation.isPending ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </ActionDialog>
      )}
    </>
  );
}
