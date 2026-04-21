import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { plainTextToHtml, htmlToPlainText } from "../../../shared/RichTextEditor";

export type ActiveAction = "approve" | "reject" | "changes" | null;

export function useReviewModal(letterId: number, open: boolean) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.review.letterDetail.useQuery(
    { id: letterId },
    {
      enabled: open && !!letterId,
      refetchInterval: (query) => {
        const status = query.state.data?.letter?.status;
        if (
          status &&
          [
            "pending_review",
            "under_review",
            "researching",
            "drafting",
            "client_revision_requested",
          ].includes(status)
        )
          return 8000;
        return false;
      },
    }
  );

  // Editor state
  const [editContent, setEditContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Mobile side panel toggle
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Action dialog states
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [approveContent, setApproveContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [retrigger, setRetrigger] = useState(false);

  const invalidate = useCallback(() => {
    void utils.review.letterDetail.invalidate({ id: letterId });
    void utils.review.queue.invalidate();
    void utils.review.myClaimed.invalidate();
  }, [utils, letterId]);

  // Mutations
  const claimMutation = trpc.review.claim.useMutation({
    onSuccess: () => {
      toast.success("Letter assigned to you", {
        description: "You can now review and edit the draft.",
      });
      invalidate();
    },
    onError: (e: any) =>
      toast.error("Could not claim letter", { description: e.message }),
  });

  const saveMutation = trpc.review.saveEdit.useMutation({
    onSuccess: () => {
      toast.success("Draft saved", {
        description: "Your edits have been preserved.",
      });
      setHasUnsavedChanges(false);
      invalidate();
    },
    onError: (e: any) => toast.error("Save failed", { description: e.message }),
  });

  const approveMutation = trpc.review.approve.useMutation({
    onSuccess: () => {
      toast.success("Letter submitted for client approval", {
        description:
          "The subscriber has been notified to review and approve the letter.",
      });
      setActiveAction(null);
      invalidate();
    },
    onError: (e: any) =>
      toast.error("Submission failed", { description: e.message }),
  });

  const rejectMutation = trpc.review.reject.useMutation({
    onSuccess: () => {
      toast.success("Letter rejected", {
        description: "The subscriber has been notified of the decision.",
      });
      setActiveAction(null);
      invalidate();
    },
    onError: (e: any) =>
      toast.error("Rejection failed", { description: e.message }),
  });

  const changesMutation = trpc.review.requestChanges.useMutation({
    onSuccess: () => {
      toast.success("Revision requested", {
        description:
          "The subscriber has been asked to provide additional information.",
      });
      setActiveAction(null);
      invalidate();
    },
    onError: (e: any) => toast.error("Request failed", { description: e.message }),
  });

  // Initialize editor content when data loads
  useEffect(() => {
    if (data?.versions) {
      const latestDraft =
        data.versions.find((v) => v.versionType === "attorney_edit") ??
        data.versions.find((v) => v.versionType === "ai_draft");
      if (latestDraft?.content) {
        const html = plainTextToHtml(latestDraft.content);
        setEditContent(html);
        setApproveContent(latestDraft.content);
      }
    }
  }, [data?.versions]);

  const letter = data?.letter;
  const versions = data?.versions ?? [];
  const research = data?.research ?? [];
  const actions = data?.actions ?? [];

  const latestDraft =
    versions.find((v) => v.versionType === "attorney_edit") ??
    versions.find((v) => v.versionType === "ai_draft");

  const isPending = letter?.status === "pending_review";
  const isUnderReview = letter?.status === "under_review";
  const isClientRevisionRequested = letter?.status === "client_revision_requested";

  const handleStartEdit = () => {
    const html = plainTextToHtml(latestDraft?.content ?? "");
    setEditContent(html);
    setIsEditing(true);
    setHasUnsavedChanges(false);
  };

  const handleEditorChange = (html: string) => {
    setEditContent(html);
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    const plainText = htmlToPlainText(editContent);
    if (plainText.length < 50) {
      toast.error("Draft too short", {
        description:
          "The letter must contain at least 50 characters before saving.",
      });
      return;
    }
    saveMutation.mutate({ letterId, content: editContent });
  };

  const handleApprove = () => {
    const finalContent = isEditing ? editContent : (latestDraft?.content ?? "");
    const plainText = htmlToPlainText(finalContent);
    if (plainText.length < 50) {
      toast.error("Cannot approve", {
        description:
          "The letter must contain at least 50 characters before approval.",
      });
      return;
    }
    setApproveContent(finalContent);
    setActiveAction("approve");
  };

  return {
    // Data
    letter,
    versions,
    research,
    actions,
    latestDraft,
    isLoading,
    // Derived status flags
    isPending,
    isUnderReview,
    isClientRevisionRequested,
    // Editor state
    editContent,
    isEditing,
    hasUnsavedChanges,
    setIsEditing,
    setHasUnsavedChanges,
    handleStartEdit,
    handleEditorChange,
    handleSave,
    handleApprove,
    // Mobile
    sidePanelOpen,
    setSidePanelOpen,
    // Action dialogs
    activeAction,
    setActiveAction,
    approveContent,
    rejectReason,
    setRejectReason,
    changesNote,
    setChangesNote,
    retrigger,
    setRetrigger,
    // Mutations
    claimMutation,
    saveMutation,
    approveMutation,
    rejectMutation,
    changesMutation,
  };
}
