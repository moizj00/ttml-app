/**
 * useReviewDetail
 *
 * Centralises all tRPC queries, mutations, autosave logic, editor state,
 * dialog state, and derived data for the ReviewDetail page.
 * The page component becomes a thin orchestrator that only handles layout.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { plainTextToHtml } from "@/components/shared/RichTextEditor";
import type { CitationAuditReport, CounterArgument } from "../../../../../../shared/types";

export interface AssemblyVersionMeta {
  stage?: string;
  researchUnverified?: boolean;
  citationAuditReport?: CitationAuditReport;
  counterArguments?: CounterArgument[];
  vettingReport?: {
    counterArgumentGaps?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function useReviewDetail() {
  const params = useParams<{ id: string }>();
  const letterId = parseInt(params.id ?? "0");
  const utils = trpc.useUtils();

  // ─── Query ───────────────────────────────────────────────────
  const { data, isLoading, error } = trpc.review.letterDetail.useQuery(
    { id: letterId },
    {
      enabled: !!letterId,
      refetchInterval: query => {
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

  // ─── Editor state ────────────────────────────────────────────
  const [editContent, setEditContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // ─── Dialog state ────────────────────────────────────────────
  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [changesDialog, setChangesDialog] = useState(false);
  const [approveContent, setApproveContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [retrigger, setRetrigger] = useState(false);
  const [acknowledgedUnverified, setAcknowledgedUnverified] = useState(false);

  // ─── Refs ────────────────────────────────────────────────────
  const autoEnteredRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsavedToastShownRef = useRef(false);

  const invalidate = () => utils.review.letterDetail.invalidate({ id: letterId });

  // ─── Mutations ───────────────────────────────────────────────
  const claimMutation = trpc.review.claim.useMutation({
    onSuccess: () => {
      toast.success("Letter claimed", {
        description: "The draft has been loaded into the editor.",
      });
      invalidate();
      autoEnteredRef.current = false;
    },
    onError: e => toast.error("Could not claim letter", { description: e.message }),
  });

  const unclaimMutation = trpc.review.unclaim.useMutation({
    onSuccess: () => {
      toast.success("Letter released", {
        description: "The letter has been returned to the review queue.",
      });
      setEditMode(false);
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
      invalidate();
    },
    onError: e => toast.error("Could not release letter", { description: e.message }),
  });

  const saveMutation = trpc.review.saveEdit.useMutation({
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      const now = new Date();
      setLastSavedAt(now);
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      unsavedToastShownRef.current = false;
      invalidate();
    },
    onError: e => {
      setSaveStatus("error");
      toast.error("Save failed", { description: e.message });
    },
  });

  const approveMutation = trpc.review.approve.useMutation({
    onSuccess: (data) => {
      if (data.recipientSent) {
        toast.success("Letter approved and sent", {
          description: "The PDF has been generated and the letter has been delivered to the recipient.",
        });
      } else if (data.recipientSendError) {
        toast.success("Letter approved", {
          description: `PDF generated. Delivery to recipient failed: ${data.recipientSendError}. The subscriber can retry from their letter page.`,
        });
      } else {
        toast.success("Letter approved", {
          description: "The subscriber has been notified and their PDF is ready.",
        });
      }
      setApproveDialog(false);
      setEditMode(false);
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
      invalidate();
    },
    onError: e => toast.error("Approval failed", { description: e.message }),
  });

  const rejectMutation = trpc.review.reject.useMutation({
    onSuccess: () => {
      toast.success("Letter rejected", {
        description: "The subscriber has been notified of the decision.",
      });
      setRejectDialog(false);
      invalidate();
    },
    onError: e => toast.error("Rejection failed", { description: e.message }),
  });

  const changesMutation = trpc.review.requestChanges.useMutation({
    onSuccess: () => {
      toast.success("Revision requested", {
        description:
          "The subscriber has been asked to provide additional information.",
      });
      setChangesDialog(false);
      invalidate();
    },
    onError: e => toast.error("Request failed", { description: e.message }),
  });

  const requestClientApprovalMutation = trpc.letters.requestClientApproval.useMutation({
    onSuccess: () => {
      toast.success("Client approval requested", {
        description:
          "The subscriber has been notified to review and approve the letter.",
      });
      invalidate();
    },
    onError: e =>
      toast.error("Failed to request client approval", { description: e.message }),
  });

  // ─── Manual save ─────────────────────────────────────────────
  const handleManualSave = useCallback(() => {
    if (!editMode || !editContent || editContent.length < 10) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    saveMutation.mutate({ letterId, content: editContent });
  }, [editMode, editContent, letterId]);

  // ─── Auto-enter edit mode when letter becomes under_review ───
  useEffect(() => {
    if (!data) return;
    const { letter, versions } = data;
    if (letter.status !== "under_review") return;
    if (autoEnteredRef.current) return;
    const latestDraft =
      versions?.find(v => v.versionType === "attorney_edit") ??
      versions?.find(v => v.versionType === "ai_draft");
    if (latestDraft && !editMode) {
      const html = plainTextToHtml(latestDraft.content ?? "");
      setEditContent(html);
      setEditMode(true);
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
      autoEnteredRef.current = true;
    }
  }, [data, editMode]);

  // ─── Autosave on edit content change ─────────────────────────
  useEffect(() => {
    if (!editMode || !hasUnsavedChanges) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (editContent && editContent.length >= 10) {
        saveMutation.mutate({ letterId, content: editContent });
      }
    }, 3000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [editContent, editMode, hasUnsavedChanges, letterId]);

  // ─── Unsaved changes toast ────────────────────────────────────
  useEffect(() => {
    if (hasUnsavedChanges && !unsavedToastShownRef.current) {
      unsavedToastShownRef.current = true;
    }
  }, [hasUnsavedChanges]);

  // ─── Helpers ─────────────────────────────────────────────────
  const enterEditMode = () => {
    const latestDraft =
      data?.versions?.find(v => v.versionType === "attorney_edit") ??
      data?.versions?.find(v => v.versionType === "ai_draft");
    const html = plainTextToHtml(latestDraft?.content ?? "");
    setEditContent(html);
    setEditMode(true);
    setHasUnsavedChanges(false);
    setSaveStatus("idle");
    autoEnteredRef.current = true;
  };

  const cancelEdit = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Discard them?")) return;
    }
    setEditMode(false);
    setHasUnsavedChanges(false);
    setSaveStatus("idle");
  };

  const openApproveDialog = () => {
    if (hasUnsavedChanges) handleManualSave();
    const latestDraft =
      data?.versions?.find(v => v.versionType === "attorney_edit") ??
      data?.versions?.find(v => v.versionType === "ai_draft");
    const content = editMode ? editContent : plainTextToHtml(latestDraft?.content ?? "");
    setApproveContent(content);
    setApproveDialog(true);
  };

  // ─── Derived data ─────────────────────────────────────────────
  const letter = data?.letter;
  const versions = data?.versions;
  const actions = data?.actions;
  const research = data?.research;

  const latestDraft =
    versions?.find(v => v.versionType === "attorney_edit") ??
    versions?.find(v => v.versionType === "ai_draft");

  const assemblyVersion = versions?.find(
    v =>
      v.versionType === "ai_draft" &&
      (v.metadataJson as AssemblyVersionMeta | null)?.stage === "final_assembly"
  );
  const assemblyMeta = assemblyVersion?.metadataJson as AssemblyVersionMeta | null;
  const citationAuditReport: CitationAuditReport | null =
    assemblyMeta?.citationAuditReport ?? null;
  const isResearchUnverified =
    letter?.researchUnverified === true || assemblyMeta?.researchUnverified === true;
  const isQualityDegraded = letter?.qualityDegraded === true;

  const draftVersion = versions?.find(
    v =>
      v.versionType === "ai_draft" &&
      (v.metadataJson as AssemblyVersionMeta | null)?.stage === "draft_generation"
  );
  const draftMeta = draftVersion?.metadataJson as AssemblyVersionMeta | null;
  const vettedVersion = versions?.find(
    v =>
      v.versionType === "ai_draft" &&
      (v.metadataJson as AssemblyVersionMeta | null)?.stage === "vetted_final"
  );
  const vettedMeta = vettedVersion?.metadataJson as AssemblyVersionMeta | null;
  const counterArguments: CounterArgument[] = (
    draftMeta?.counterArguments ??
    assemblyMeta?.counterArguments ??
    vettedMeta?.counterArguments ??
    []
  ) as CounterArgument[];
  const counterArgumentGaps: string[] = (
    vettedMeta?.vettingReport?.counterArgumentGaps ??
    assemblyMeta?.vettingReport?.counterArgumentGaps ??
    []
  ) as string[];

  const highlightCitationsInHtml = (html: string): string => {
    if (!citationAuditReport) return html;
    let result = html;
    const unverifiedCitations = (citationAuditReport.unverifiedCitations ?? []).map(
      e => e.citation
    );
    const lowConfidenceCitations = (citationAuditReport.verifiedCitations ?? [])
      .filter(e => e.confidence === "low")
      .map(e => e.citation);
    for (const cit of unverifiedCitations) {
      const escaped = cit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${escaped})`, "gi");
      result = result.replace(
        re,
        `<mark style="background-color:#fecaca;border-radius:2px;padding:0 2px" title="Unverified citation">$1</mark>`
      );
    }
    for (const cit of lowConfidenceCitations) {
      const escaped = cit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${escaped})`, "gi");
      result = result.replace(
        re,
        `<mark style="background-color:#fef3c7;border-radius:2px;padding:0 2px" title="Low confidence citation">$1</mark>`
      );
    }
    return result;
  };

  return {
    // Route
    letterId,
    // Query state
    data,
    isLoading,
    error,
    // Derived data
    letter,
    versions,
    actions,
    research,
    latestDraft,
    citationAuditReport,
    isResearchUnverified,
    isQualityDegraded,
    counterArguments,
    counterArgumentGaps,
    // Editor state
    editContent,
    setEditContent,
    editMode,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    lastSavedAt,
    saveStatus,
    // Dialog state
    approveDialog,
    setApproveDialog,
    rejectDialog,
    setRejectDialog,
    changesDialog,
    setChangesDialog,
    approveContent,
    setApproveContent,
    rejectReason,
    setRejectReason,
    changesNote,
    setChangesNote,
    retrigger,
    setRetrigger,
    acknowledgedUnverified,
    setAcknowledgedUnverified,
    // Mutation states
    claimPending: claimMutation.isPending,
    unclaimPending: unclaimMutation.isPending,
    approvePending: approveMutation.isPending,
    rejectPending: rejectMutation.isPending,
    changesPending: changesMutation.isPending,
    requestClientApprovalPending: requestClientApprovalMutation.isPending,
    // Handlers
    enterEditMode,
    cancelEdit,
    handleManualSave,
    openApproveDialog,
    highlightCitationsInHtml,
    handleClaim: () => claimMutation.mutate({ letterId }),
    handleUnclaim: () => unclaimMutation.mutate({ letterId }),
    handleApprove: (opts?: { recipientEmail?: string; subjectOverride?: string; deliveryNote?: string }) =>
      approveMutation.mutate({
        letterId,
        finalContent: approveContent,
        ...(isResearchUnverified
          ? { acknowledgedUnverifiedResearch: acknowledgedUnverified }
          : {}),
        ...(opts?.recipientEmail ? { recipientEmail: opts.recipientEmail } : {}),
        ...(opts?.subjectOverride ? { subjectOverride: opts.subjectOverride } : {}),
        ...(opts?.deliveryNote ? { deliveryNote: opts.deliveryNote } : {}),
      }),
    handleReject: () => rejectMutation.mutate({ letterId, reason: rejectReason }),
    handleRequestChanges: () =>
      changesMutation.mutate({
        letterId,
        userVisibleNote: changesNote,
        retriggerPipeline: retrigger,
      }),
    handleRequestClientApproval: () =>
      requestClientApprovalMutation.mutate({ letterId }),
  };
}
