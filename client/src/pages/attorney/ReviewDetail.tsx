import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import RichTextEditor, {
  plainTextToHtml,
  htmlToPlainText,
} from "@/components/shared/RichTextEditor";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  BookOpen,
  History,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Shield,
  ClipboardList,
  Scale,
  GitCompare,
} from "lucide-react";
import { useParams } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { LETTER_TYPE_CONFIG, type CitationAuditReport, type CounterArgument } from "../../../../shared/types";
import { IntakePanel } from "./review/IntakePanel";
import { ResearchPanel } from "./review/ResearchPanel";
import { CitationAuditPanel } from "./review/CitationAuditPanel";
import { HistoryPanel } from "./review/HistoryPanel";
import { DiffPanel } from "./review/DiffPanel";
import { CounterArgumentPanel } from "./review/CounterArgumentPanel";
import { ApproveDialog } from "./review/ApproveDialog";
import { RejectDialog } from "./review/RejectDialog";
import { ChangesDialog } from "./review/ChangesDialog";
import { EditorToolbar } from "./review/EditorToolbar";

interface AssemblyVersionMeta {
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

export default function ReviewDetail() {
  const params = useParams<{ id: string }>();
  const letterId = parseInt(params.id ?? "0");
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.review.letterDetail.useQuery(
    { id: letterId },
    {
      enabled: !!letterId,
      refetchInterval: query => {
        const status = query.state.data?.letter?.status;
        if (
          status &&
          ["pending_review", "under_review", "researching", "drafting", "client_revision_requested"].includes(
            status
          )
        )
          return 8000;
        return false;
      },
    }
  );

  const [editContent, setEditContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [changesDialog, setChangesDialog] = useState(false);
  const [approveContent, setApproveContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [retrigger, setRetrigger] = useState(false);
  const [acknowledgedUnverified, setAcknowledgedUnverified] = useState(false);

  const autoEnteredRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsavedToastShownRef = useRef(false);

  const invalidate = () =>
    utils.review.letterDetail.invalidate({ id: letterId });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const claimMutation = trpc.review.claim.useMutation({
    onSuccess: () => {
      toast.success("Letter claimed", {
        description: "The draft has been loaded into the editor.",
      });
      invalidate();
      autoEnteredRef.current = false;
    },
    onError: e =>
      toast.error("Could not claim letter", { description: e.message }),
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
    onError: e =>
      toast.error("Could not release letter", { description: e.message }),
  });

  const saveMutation = trpc.review.saveEdit.useMutation({
    onMutate: () => {
      setSaveStatus("saving");
    },
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
    onSuccess: () => {
      toast.success("Letter submitted for client approval", {
        description:
          "The subscriber has been notified and can now review and approve the letter.",
      });
      setApproveDialog(false);
      setEditMode(false);
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
      invalidate();
    },
    onError: e => toast.error("Submission failed", { description: e.message }),
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
        description: "The subscriber has been notified to review and approve the letter.",
      });
      invalidate();
    },
    onError: e => toast.error("Failed to request client approval", { description: e.message }),
  });

  const handleManualSave = useCallback(() => {
    if (!editMode || !editContent || editContent.length < 10) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    saveMutation.mutate({ letterId, content: editContent });
  }, [editMode, editContent, letterId]);

  // ── Auto-enter edit mode when letter becomes under_review ─────────────────
  useEffect(() => {
    if (!data) return;
    const { letter, versions } = data;
    if (letter.status !== "under_review") return;
    if (autoEnteredRef.current) return;
    autoEnteredRef.current = true;

    const latestDraft =
      versions?.find(v => v.versionType === "attorney_edit") ??
      versions?.find(v => v.versionType === "ai_draft");

    if (latestDraft?.content) {
      const html = plainTextToHtml(latestDraft.content);
      setEditContent(html);
      setEditMode(true);
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
    }
  }, [data]);

  // ── Auto-save with debounce ───────────────────────────────────────────────
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
  }, [editContent, editMode, hasUnsavedChanges]);

  // ── Keyboard shortcut: Ctrl/Cmd+S to save ────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editMode && hasUnsavedChanges) {
          handleManualSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editMode, hasUnsavedChanges, handleManualSave]);

  // ── Browser tab close / refresh guard ─────────────────────────────────────
  useEffect(() => {
    if (!editMode || !hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editMode, hasUnsavedChanges]);

  // ── Periodic unsaved changes reminder ─────────────────────────────────────
  useEffect(() => {
    if (!editMode || !hasUnsavedChanges) {
      unsavedToastShownRef.current = false;
      return;
    }
    const reminderTimer = setTimeout(() => {
      if (hasUnsavedChanges && !unsavedToastShownRef.current) {
        unsavedToastShownRef.current = true;
        toast.warning("You have unsaved changes", {
          description: "Click Save or press Ctrl+S to save your edits.",
          duration: 5000,
          action: {
            label: "Save Now",
            onClick: handleManualSave,
          },
        });
      }
    }, 30000);
    return () => clearTimeout(reminderTimer);
  }, [editMode, hasUnsavedChanges, handleManualSave]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (!letterId || isNaN(letterId) || letterId <= 0) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Review Center", href: "/review" },
          { label: "Invalid Letter" },
        ]}
      >
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">Invalid letter ID</h3>
          <p className="text-sm text-muted-foreground">The letter ID in the URL is not valid.</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Review Center", href: "/review" },
          { label: `Letter #${letterId}` },
        ]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Review Center", href: "/review" },
          { label: "Not Found" },
        ]}
      >
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">Letter not found</h3>
          <p className="text-sm text-muted-foreground">
            This letter doesn't exist or you don't have access to it.
          </p>
        </div>
      </AppLayout>
    );
  }

  const { letter, versions, actions, research } = data;

  const latestDraft =
    versions?.find(v => v.versionType === "attorney_edit") ??
    versions?.find(v => v.versionType === "ai_draft");

  const isUnderReview = letter.status === "under_review";

  const assemblyVersion = versions?.find(
    v => v.versionType === "ai_draft" && (v.metadataJson as AssemblyVersionMeta | null)?.stage === "final_assembly"
  );
  const assemblyMeta = assemblyVersion?.metadataJson as AssemblyVersionMeta | null;
  const citationAuditReport: CitationAuditReport | null = assemblyMeta?.citationAuditReport ?? null;
  const isResearchUnverified = letter.researchUnverified === true || assemblyMeta?.researchUnverified === true;
  const isQualityDegraded = letter.qualityDegraded === true;

  const draftVersion = versions?.find(v => v.versionType === "ai_draft" && (v.metadataJson as AssemblyVersionMeta | null)?.stage === "draft_generation");
  const draftMeta = draftVersion?.metadataJson as AssemblyVersionMeta | null;
  const vettedVersion = versions?.find(v => v.versionType === "ai_draft" && (v.metadataJson as AssemblyVersionMeta | null)?.stage === "vetted_final");
  const vettedMeta = vettedVersion?.metadataJson as AssemblyVersionMeta | null;
  const counterArguments: CounterArgument[] = (draftMeta?.counterArguments ?? assemblyMeta?.counterArguments ?? vettedMeta?.counterArguments ?? []) as CounterArgument[];
  const counterArgumentGaps: string[] = (vettedMeta?.vettingReport?.counterArgumentGaps ?? assemblyMeta?.vettingReport?.counterArgumentGaps ?? []) as string[];

  // ── Helpers ───────────────────────────────────────────────────────────────
  const enterEditMode = () => {
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

  const highlightCitationsInHtml = (html: string): string => {
    if (!citationAuditReport) return html;
    let result = html;
    const unverifiedCitations: string[] = (citationAuditReport.unverifiedCitations ?? []).map(e => e.citation);
    const lowConfidenceCitations: string[] = (citationAuditReport.verifiedCitations ?? [])
      .filter(e => e.confidence === "low")
      .map(e => e.citation);
    for (const cit of unverifiedCitations) {
      const escaped = cit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${escaped})`, "gi");
      result = result.replace(re, `<mark style="background-color:#fecaca;border-radius:2px;padding:0 2px" title="Unverified citation">$1</mark>`);
    }
    for (const cit of lowConfidenceCitations) {
      const escaped = cit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${escaped})`, "gi");
      result = result.replace(re, `<mark style="background-color:#fef3c7;border-radius:2px;padding:0 2px" title="Low confidence citation">$1</mark>`);
    }
    return result;
  };

  const openApproveDialog = () => {
    if (hasUnsavedChanges) {
      handleManualSave();
    }
    const content = editMode
      ? editContent
      : plainTextToHtml(latestDraft?.content ?? "");
    setApproveContent(content);
    setApproveDialog(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout
      breadcrumb={[
        { label: "Review Center", href: "/review" },
        { label: "Queue", href: "/review/queue" },
        { label: letter.subject },
      ]}
    >
      <div className="flex flex-col h-full gap-0 animate-dashboard-fade-up">
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pb-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-foreground leading-tight truncate">
              {letter.subject}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={letter.status} data-testid="status-badge-letter" />
              <span className="text-xs text-muted-foreground">
                {LETTER_TYPE_CONFIG[letter.letterType]?.label ?? letter.letterType}
                {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                {" · "}
                Submitted {new Date(letter.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <EditorToolbar
            letterStatus={letter.status}
            isUnderReview={isUnderReview}
            editMode={editMode}
            editContent={editContent}
            hasUnsavedChanges={hasUnsavedChanges}
            saveStatus={saveStatus}
            lastSavedAt={lastSavedAt}
            claimIsPending={claimMutation.isPending}
            saveIsPending={saveMutation.isPending}
            unclaimIsPending={unclaimMutation.isPending}
            approvePending={approveMutation.isPending}
            onClaim={() => claimMutation.mutate({ letterId })}
            onCancelEdit={cancelEdit}
            onSave={handleManualSave}
            onEnterEditMode={enterEditMode}
            onRelease={() => {
              if (hasUnsavedChanges) {
                if (!window.confirm("You have unsaved changes. Release this letter anyway?")) return;
              }
              unclaimMutation.mutate({ letterId });
            }}
            onRequestChanges={() => setChangesDialog(true)}
            onReject={() => setRejectDialog(true)}
            onApprove={openApproveDialog}
          />
        </div>

        {isResearchUnverified && (
          <div
            data-testid="banner-research-unverified"
            className="flex items-center gap-3 px-4 py-3 mb-3 rounded-xl bg-red-50 border border-red-200"
          >
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                RESEARCH UNVERIFIED
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                This letter's legal research was not web-verified (Perplexity was
                unavailable). Citations require manual attorney validation before
                approval.
              </p>
            </div>
          </div>
        )}

        {isQualityDegraded && (
          <div
            data-testid="banner-quality-degraded"
            className="flex items-center gap-3 px-4 py-3 mb-3 rounded-xl bg-amber-50 border border-amber-300"
          >
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                QUALITY FLAGS — EXTRA SCRUTINY REQUIRED
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                This draft was produced with quality warnings (e.g. jurisdiction mismatch, vetting issues, or pipeline fallback). 
                Please review carefully before approving. Check the version metadata and review history for details.
              </p>
            </div>
          </div>
        )}

        {/* ── Split panel ─────────────────────────────────────────────────── */}
        <div className="flex gap-4 min-h-0" style={{ height: "calc(100vh - 200px)" }}>
          {/* Left: Rich text editor */}
          <div className="flex-1 flex flex-col min-w-0 border border-border rounded-2xl overflow-hidden bg-card">
            {/* Editor header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20 flex-shrink-0">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {editMode ? "Editing Draft" : "Initial Draft"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {editMode && hasUnsavedChanges && (
                  <span
                    data-testid="indicator-unsaved"
                    className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-1 rounded-full font-medium animate-pulse"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Unsaved changes
                  </span>
                )}
                {editMode && saveStatus === "saving" && (
                  <span
                    data-testid="indicator-saving"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </span>
                )}
                {editMode && saveStatus === "saved" && !hasUnsavedChanges && lastSavedAt && (
                  <span
                    data-testid="indicator-saved"
                    className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Saved {formatTimeAgo(lastSavedAt)}
                  </span>
                )}
                {editMode && saveStatus === "error" && (
                  <span
                    data-testid="indicator-save-error"
                    className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                  >
                    <AlertCircle className="w-3 h-3" />
                    Save failed
                  </span>
                )}
                {!editMode && latestDraft && (
                  <span className="text-xs text-muted-foreground">
                    {latestDraft.versionType === "attorney_edit"
                      ? "Attorney edit"
                      : "System draft"}{" "}
                    · {new Date(latestDraft.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Editor body */}
            <div className="flex-1 overflow-auto">
              {letter.status === "pending_review" ||
              letter.status === "client_revision_requested" ||
              letter.status === "researching" ||
              letter.status === "drafting" ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  {letter.status === "pending_review" ||
                  letter.status === "client_revision_requested" ? (
                    <>
                      <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {letter.status === "client_revision_requested"
                          ? "Client requested revisions. Claim to review their notes and update the letter."
                          : "Claim this letter to load the draft into the editor."}
                      </p>
                      {letter.status === "client_revision_requested" && (() => {
                        const revisionAction = [...(actions ?? [])].reverse().find(
                          (a) => a.action === "client_revision_requested" && a.noteText
                        );
                        return revisionAction?.noteText ? (
                          <div
                            data-testid="client-revision-notes"
                            className="w-full max-w-md text-left bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4"
                          >
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1 uppercase tracking-wide">
                              Client revision notes
                            </p>
                            <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                              {revisionAction.noteText}
                            </p>
                          </div>
                        ) : null;
                      })()}
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                      <p className="text-sm text-muted-foreground">
                        Drafting pipeline is running — draft will appear here shortly.
                      </p>
                    </>
                  )}
                </div>
              ) : editMode ? (
                <RichTextEditor
                  data-testid="editor-letter-edit"
                  content={editContent}
                  onChange={html => {
                    setEditContent(html);
                    setHasUnsavedChanges(true);
                    if (saveStatus === "saved" || saveStatus === "error") {
                      setSaveStatus("idle");
                    }
                  }}
                  editable={true}
                  placeholder="Edit the letter content..."
                  minHeight="100%"
                  className="h-full border-0 rounded-none"
                />
              ) : (
                <RichTextEditor
                  data-testid="editor-letter-view"
                  content={highlightCitationsInHtml(
                    plainTextToHtml(latestDraft?.content ?? "")
                  )}
                  editable={false}
                  minHeight="100%"
                  className="h-full border-0 rounded-none"
                />
              )}
            </div>
          </div>

          {/* Right: Intake / Research / Citations / History panel */}
          <div className="w-80 flex-shrink-0 flex flex-col min-h-0">
            <Tabs defaultValue="intake" className="flex flex-col h-full">
              <TabsList className="w-full flex-shrink-0" data-testid="tabs-review-panel">
                <TabsTrigger value="intake" className="flex-1 text-xs" data-testid="tab-intake">
                  <ClipboardList className="w-3 h-3 mr-1" />
                  Intake
                </TabsTrigger>
                <TabsTrigger value="research" className="flex-1 text-xs" data-testid="tab-research">
                  <BookOpen className="w-3 h-3 mr-1" />
                  Research
                </TabsTrigger>
                <TabsTrigger value="citations" className="flex-1 text-xs" data-testid="tab-citations">
                  <Scale className="w-3 h-3 mr-1" />
                  Citations
                </TabsTrigger>
                <TabsTrigger value="counter-args" className="flex-1 text-xs" data-testid="tab-counter-args">
                  <Shield className="w-3 h-3 mr-1" />
                  Counter
                </TabsTrigger>
                <TabsTrigger value="diff" className="flex-1 text-xs" data-testid="tab-diff">
                  <GitCompare className="w-3 h-3 mr-1" />
                  Diff
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 text-xs" data-testid="tab-history">
                  <History className="w-3 h-3 mr-1" />
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="intake" className="flex-1 overflow-auto mt-2">
                <IntakePanel
                  intakeJson={letter.intakeJson}
                  jurisdictionState={letter.jurisdictionState}
                />
              </TabsContent>

              <TabsContent value="research" className="flex-1 overflow-auto mt-2">
                <ResearchPanel research={research} />
              </TabsContent>

              <TabsContent value="citations" className="flex-1 overflow-auto mt-2">
                <CitationAuditPanel citationAuditReport={citationAuditReport} />
              </TabsContent>

              <TabsContent value="counter-args" className="flex-1 overflow-auto mt-2">
                <CounterArgumentPanel
                  counterArguments={counterArguments}
                  counterArgumentGaps={counterArgumentGaps}
                />
              </TabsContent>

              <TabsContent value="diff" className="flex-1 overflow-auto mt-2">
                <DiffPanel versions={versions} />
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-auto mt-2">
                <HistoryPanel actions={actions} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <ApproveDialog
        open={approveDialog}
        onOpenChange={(open) => {
          setApproveDialog(open);
          if (!open) setAcknowledgedUnverified(false);
        }}
        approveContent={approveContent}
        onContentChange={setApproveContent}
        isResearchUnverified={isResearchUnverified}
        acknowledgedUnverified={acknowledgedUnverified}
        onAcknowledgeChange={setAcknowledgedUnverified}
        isPending={approveMutation.isPending}
        onConfirm={() =>
          approveMutation.mutate({
            letterId,
            finalContent: approveContent,
            ...(isResearchUnverified
              ? { acknowledgedUnverifiedResearch: acknowledgedUnverified }
              : {}),
          })
        }
      />

      <RejectDialog
        open={rejectDialog}
        onOpenChange={setRejectDialog}
        rejectReason={rejectReason}
        onReasonChange={setRejectReason}
        isPending={rejectMutation.isPending}
        onConfirm={() => rejectMutation.mutate({ letterId, reason: rejectReason })}
      />

      <ChangesDialog
        open={changesDialog}
        onOpenChange={setChangesDialog}
        changesNote={changesNote}
        onNoteChange={setChangesNote}
        retrigger={retrigger}
        onRetriggerChange={setRetrigger}
        isPending={changesMutation.isPending}
        onConfirm={() =>
          changesMutation.mutate({
            letterId,
            userVisibleNote: changesNote,
            retriggerPipeline: retrigger,
          })
        }
      />
    </AppLayout>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
