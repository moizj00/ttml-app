import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, FileText, AlertCircle } from "lucide-react";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";
import { useSubscriberPreview } from "./hooks/useSubscriberPreview";
import { LetterPreviewContent } from "./LetterPreviewContent";
import { SubscriberActionPanel } from "./SubscriberActionPanel";
import StatusBadge from "../StatusBadge";

interface SubscriberLetterPreviewModalProps {
  letterId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriberLetterPreviewModal({
  letterId,
  open,
  onOpenChange,
}: SubscriberLetterPreviewModalProps) {
  const preview = useSubscriberPreview(letterId, open);

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      preview.resetState();
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold text-foreground text-left truncate">
                {preview.letter?.subject ?? "Letter Preview"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground text-left mt-0.5 flex items-center gap-2">
                {preview.letter && (
                  <>
                    <span>
                      {LETTER_TYPE_CONFIG[preview.letter.letterType]?.label ??
                        preview.letter.letterType}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <StatusBadge status={preview.letter.status} />
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        {preview.isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 text-muted-foreground/50 animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Loading letter...</p>
            </div>
          </div>
        ) : preview.error || !preview.letter ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-destructive/50 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Could not load letter details.
              </p>
            </div>
          </div>
        ) : !preview.finalVersion ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 text-muted-foreground/50 animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">
                The final version is still being prepared...
              </p>
            </div>
          </div>
        ) : (
          <>
            <LetterPreviewContent
              content={preview.finalVersion.content}
              subject={preview.letter.subject}
              letterType={
                LETTER_TYPE_CONFIG[preview.letter.letterType]?.label ??
                preview.letter.letterType
              }
              userVisibleActions={preview.userVisibleActions}
            />

            {/* Action panel — only show for client_approval_pending */}
            {preview.isClientApprovalPending && (
              <SubscriberActionPanel
                letterId={letterId}
                activeAction={preview.activeAction}
                setActiveAction={preview.setActiveAction}
                isBusy={preview.isBusy}
                revisionNotes={preview.revisionNotes}
                setRevisionNotes={preview.setRevisionNotes}
                revisionCount={preview.revisionCount}
                revisionsRemaining={preview.revisionsRemaining}
                revisionLimitReached={preview.revisionLimitReached}
                revisionLimitWarning={preview.revisionLimitWarning}
                revisionFeeUsd={preview.REVISION_FEE_USD}
                declineReason={preview.declineReason}
                setDeclineReason={preview.setDeclineReason}
                recipientEmail={preview.recipientEmail}
                setRecipientEmail={preview.setRecipientEmail}
                subjectOverride={preview.subjectOverride}
                setSubjectOverride={preview.setSubjectOverride}
                sendNote={preview.sendNote}
                setSendNote={preview.setSendNote}
                clientApprove={preview.clientApprove}
                clientRequestRevision={preview.clientRequestRevision}
                clientDecline={preview.clientDecline}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SubscriberLetterPreviewModal;
