import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Edit3,
  FileText,
  Loader2,
  Save,
  ClipboardList,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useEffect } from "react";
import StatusBadge from "../StatusBadge";
import RichTextEditor, { plainTextToHtml } from "../RichTextEditor";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";
import { useReviewModal } from "./hooks/useReviewModal";
import { ReviewSidePanel } from "./ReviewSidePanel";
import { ReviewActionDialogs } from "./ReviewActionDialogs";

interface ReviewModalProps {
  letterId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to the next letter in the queue (keyboard: J) */
  onNext?: () => void;
  /** Navigate to the previous letter in the queue (keyboard: K) */
  onPrev?: () => void;
}

export default function ReviewModal({
  letterId,
  open,
  onOpenChange,
  onNext,
  onPrev,
}: ReviewModalProps) {
  const {
    letter,
    versions,
    research,
    actions,
    latestDraft,
    isLoading,
    isPending,
    isUnderReview,
    editContent,
    isEditing,
    hasUnsavedChanges,
    setIsEditing,
    setHasUnsavedChanges,
    handleStartEdit,
    handleEditorChange,
    handleSave,
    handleApprove,
    sidePanelOpen,
    setSidePanelOpen,
    activeAction,
    setActiveAction,
    approveContent,
    rejectReason,
    setRejectReason,
    changesNote,
    setChangesNote,
    retrigger,
    setRetrigger,
    claimMutation,
    saveMutation,
    approveMutation,
    rejectMutation,
    changesMutation,
  } = useReviewModal(letterId, open);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Are you sure you want to close?"))
        return;
    }
    setIsEditing(false);
    setHasUnsavedChanges(false);
    setActiveAction(null);
    setSidePanelOpen(false);
    onOpenChange(false);
  };

  // ── Keyboard shortcuts ──
  // A = approve  |  R = request changes  |  J = next letter  |  K = previous letter
  // Only active when the modal is open, no input/textarea/contenteditable is focused,
  // and no action dialog is currently open.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "a":
          if (isUnderReview && !activeAction) {
            e.preventDefault();
            handleApprove();
          }
          break;
        case "r":
          if (isUnderReview && !activeAction) {
            e.preventDefault();
            setActiveAction("changes");
          }
          break;
        case "j":
          if (!activeAction) {
            e.preventDefault();
            onNext?.();
          }
          break;
        case "k":
          if (!activeAction) {
            e.preventDefault();
            onPrev?.();
          }
          break;
        case "escape":
          if (activeAction) {
            setActiveAction(null);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isUnderReview, activeAction, handleApprove, setActiveAction, onNext, onPrev]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        className="max-w-none w-screen h-screen sm:w-[95vw] sm:h-[95vh] sm:max-w-7xl p-0 gap-0 overflow-hidden rounded-none sm:rounded-xl flex flex-col"
      >
        {/* ═══ HEADER ═══ */}
        <div className="flex-shrink-0 bg-card border-b border-border">
          {/* Top row: title + close */}
          <div className="flex items-start gap-3 px-4 sm:px-6 pt-4 pb-2">
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <div className="space-y-1.5">
                  <div className="h-5 w-56 bg-muted animate-pulse rounded" />
                  <div className="h-3.5 w-40 bg-muted animate-pulse rounded" />
                </div>
              ) : letter ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                      {letter.subject}
                    </h2>
                    <StatusBadge status={letter.status} />
                    {hasUnsavedChanges && (
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-300 bg-amber-50 text-xs shrink-0"
                      >
                        Unsaved changes
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {LETTER_TYPE_CONFIG[letter.letterType]?.label ??
                      letter.letterType}
                    {letter.jurisdictionState &&
                      ` · ${letter.jurisdictionState}`}
                    {" · "}Submitted{" "}
                    {new Date(letter.createdAt).toLocaleDateString()}
                  </p>
                </>
              ) : null}
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-0.5"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action bar row */}
          <div className="flex items-center gap-2 px-4 sm:px-6 pb-3 overflow-x-auto scrollbar-none">
            {isPending && (
              <Button
                onClick={() => claimMutation.mutate({ letterId })}
                disabled={claimMutation.isPending}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 min-w-[138px] justify-center"
              >
                {claimMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Claiming…
                  </>
                ) : (
                  <>
                    <ClipboardList className="w-4 h-4 mr-1.5" />
                    Claim for Review
                  </>
                )}
              </Button>
            )}

            {isUnderReview && (
              <>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartEdit}
                    className="shrink-0"
                  >
                    <Edit3 className="w-4 h-4 mr-1.5" />
                    Edit Draft
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSave}
                      disabled={saveMutation.isPending || !hasUnsavedChanges}
                      className="shrink-0"
                    >
                      <Save className="w-4 h-4 mr-1.5" />
                      {saveMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        setHasUnsavedChanges(false);
                      }}
                      className="shrink-0 text-muted-foreground"
                    >
                      Cancel Edit
                    </Button>
                  </>
                )}
                <div className="flex-1 hidden sm:block" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveAction("changes")}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                >
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveAction("reject")}
                  className="border-red-300 text-red-700 hover:bg-red-50 shrink-0"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm shadow-green-200 shrink-0"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  {approveMutation.isPending ? "Submitting..." : "Submit"}
                </Button>
              </>
            )}

            {/* Mobile: toggle side panel */}
            <div className="flex-1 sm:hidden" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidePanelOpen((v) => !v)}
              className="sm:hidden shrink-0 text-muted-foreground"
            >
              {sidePanelOpen ? (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Hide Info
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Show Info
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ═══ BODY ═══ */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row min-h-0">
          {/* Left / Main: Draft Editor */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Draft sub-header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {isEditing ? "Editing Draft" : "Initial Draft"}
                </span>
                {latestDraft && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    v{versions.indexOf(latestDraft) + 1}
                  </span>
                )}
              </div>
            </div>

            {/* Draft content */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm">Loading draft…</p>
                </div>
              ) : isEditing ? (
                <RichTextEditor
                  content={editContent}
                  onChange={handleEditorChange}
                  editable={true}
                  placeholder="Edit the letter content..."
                  minHeight="400px"
                  className="border-0 rounded-none h-full"
                />
              ) : latestDraft?.content ? (
                <div className="p-5 sm:p-6 max-w-3xl mx-auto">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: plainTextToHtml(latestDraft.content),
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                  <FileText className="w-12 h-12 text-muted-foreground/20" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No draft available yet
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    The draft will appear here once the pipeline completes.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right / Side Panel */}
          <ReviewSidePanel
            letter={letter}
            research={research}
            actions={actions}
            sidePanelOpen={sidePanelOpen}
          />
        </div>

        {/* ═══ ACTION DIALOGS ═══ */}
        <ReviewActionDialogs
          activeAction={activeAction}
          setActiveAction={setActiveAction}
          letterId={letterId}
          approveContent={approveContent}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          changesNote={changesNote}
          setChangesNote={setChangesNote}
          retrigger={retrigger}
          setRetrigger={setRetrigger}
          approveMutation={approveMutation}
          rejectMutation={rejectMutation}
          changesMutation={changesMutation}
        />
      </DialogContent>
    </Dialog>
  );
}
