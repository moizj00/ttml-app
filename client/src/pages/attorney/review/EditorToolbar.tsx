import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Save,
  ClipboardList,
  X,
  Scale,
} from "lucide-react";

interface EditorToolbarProps {
  letterStatus: string;
  isUnderReview: boolean;
  editMode: boolean;
  editContent: string;
  claimIsPending: boolean;
  saveIsPending: boolean;
  unclaimIsPending: boolean;
  requestClientApprovalIsPending: boolean;
  onClaim: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEnterEditMode: () => void;
  onRelease: () => void;
  onRequestChanges: () => void;
  onReject: () => void;
  onApprove: () => void;
  onRequestClientApproval: () => void;
}

export function EditorToolbar({
  letterStatus,
  isUnderReview,
  editMode,
  editContent,
  claimIsPending,
  saveIsPending,
  unclaimIsPending,
  requestClientApprovalIsPending,
  onClaim,
  onCancelEdit,
  onSave,
  onEnterEditMode,
  onRelease,
  onRequestChanges,
  onReject,
  onApprove,
  onRequestClientApproval,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2 flex-shrink-0">
      {(letterStatus === "pending_review" || letterStatus === "client_revision_requested") && (
        <Button
          data-testid="button-claim"
          onClick={onClaim}
          disabled={claimIsPending}
          size="sm"
        >
          <ClipboardList className="w-4 h-4 mr-1.5" />
          {claimIsPending
            ? "Claiming..."
            : letterStatus === "client_revision_requested"
              ? "Claim for Revision"
              : "Claim for Review"}
        </Button>
      )}

      {isUnderReview && (
        <>
          {editMode ? (
            <>
              <Button
                data-testid="button-cancel-edit"
                variant="outline"
                size="sm"
                onClick={onCancelEdit}
                className="bg-background"
              >
                <X className="w-4 h-4 mr-1.5" />
                Cancel Edit
              </Button>
              <Button
                data-testid="button-save-edit"
                size="sm"
                onClick={onSave}
                disabled={saveIsPending || editContent.length < 10}
                className="bg-background border border-border text-foreground hover:bg-muted"
                variant="outline"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveIsPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button
              data-testid="button-edit-draft"
              variant="outline"
              size="sm"
              onClick={onEnterEditMode}
              className="bg-background"
            >
              Edit Draft
            </Button>
          )}

          <Button
            data-testid="button-release"
            variant="outline"
            size="sm"
            onClick={onRelease}
            disabled={unclaimIsPending}
            className="bg-background border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            <X className="w-4 h-4 mr-1.5" />
            {unclaimIsPending ? "Releasing..." : "Release"}
          </Button>

          <Button
            data-testid="button-request-changes"
            variant="outline"
            size="sm"
            onClick={onRequestChanges}
            className="bg-background border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Changes
          </Button>
          <Button
            data-testid="button-reject"
            variant="outline"
            size="sm"
            onClick={onReject}
            className="bg-background border-red-300 text-red-700 hover:bg-red-50 active:scale-[0.98] transition-transform"
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            Reject
          </Button>
          <Button
            data-testid="button-approve"
            size="sm"
            onClick={onApprove}
            className="bg-green-600 hover:bg-green-700 text-white active:scale-[0.98] transition-transform"
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            Approve
          </Button>
        </>
      )}

      {letterStatus === "approved" && (
        <Button
          data-testid="button-request-client-approval"
          variant="outline"
          size="sm"
          onClick={onRequestClientApproval}
          disabled={requestClientApprovalIsPending}
          className="bg-background border-teal-300 text-teal-700 hover:bg-teal-50"
        >
          <Scale className="w-4 h-4 mr-1.5" />
          {requestClientApprovalIsPending
            ? "Sending..."
            : "Send to Client for Approval"}
        </Button>
      )}
    </div>
  );
}
