import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import RichTextEditor, {
  plainTextToHtml,
  htmlToPlainText,
} from "@/components/shared/RichTextEditor";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  FileText,
  BookOpen,
  History,
  AlertCircle,
  Loader2,
  Save,
  ClipboardList,
  X,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Scale,
} from "lucide-react";
import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { LETTER_TYPE_CONFIG, type CitationAuditReport, type CitationAuditEntry } from "../../../../shared/types";

interface AssemblyVersionMeta {
  stage?: string;
  researchUnverified?: boolean;
  citationAuditReport?: CitationAuditReport;
  [key: string]: unknown;
}

interface IntakeJson {
  sender?: { name?: string; address?: string; email?: string; phone?: string };
  recipient?: { name?: string; address?: string; company?: string; email?: string };
  jurisdiction?: string | { state?: string; country?: string; city?: string };
  matter?: { description?: string; [key: string]: unknown };
  description?: string;
  desiredOutcome?: string;
  financials?: { amountOwed?: string; currency?: string };
  timeline?: string;
  [key: string]: unknown;
}

interface ResearchPacketSummary {
  researchSummary?: string;
  applicableRules?: Array<{
    ruleTitle?: string;
    relevanceScore?: number;
    citationText?: string;
    citation?: string;
    summary?: string;
    confidence?: string;
  }>;
  issuesIdentified?: string[];
  riskFlags?: string[];
  openQuestions?: string[];
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
      // Poll every 8s while letter is in active review statuses
      refetchInterval: query => {
        const status = query.state.data?.letter?.status;
        if (
          status &&
          ["pending_review", "under_review", "researching", "drafting"].includes(
            status
          )
        )
          return 8000;
        return false;
      },
    }
  );

  // ── Editor state ──────────────────────────────────────────────────────────
  // editContent holds the HTML string that the RichTextEditor works with.
  // It is initialised from the AI draft when edit mode is entered.
  const [editContent, setEditContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [changesDialog, setChangesDialog] = useState(false);
  const [approveContent, setApproveContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [retrigger, setRetrigger] = useState(false);
  const [citationReportOpen, setCitationReportOpen] = useState(false);
  const [acknowledgedUnverified, setAcknowledgedUnverified] = useState(false);

  // Track whether we've already auto-entered edit mode after a claim so we
  // don't re-enter it on every subsequent poll refetch.
  const autoEnteredRef = useRef(false);

  // ── Auto-save timer ───────────────────────────────────────────────────────
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidate = () =>
    utils.review.letterDetail.invalidate({ id: letterId });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const claimMutation = trpc.review.claim.useMutation({
    onSuccess: () => {
      toast.success("Letter claimed", {
        description: "The AI draft has been loaded into the editor.",
      });
      invalidate();
      // Auto-enter edit mode — the invalidate() above will refetch and
      // populate latestDraft; we set a flag so the useEffect below can
      // open the editor as soon as the fresh data arrives.
      autoEnteredRef.current = false; // reset so the effect fires once more
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
      invalidate();
    },
    onError: e =>
      toast.error("Could not release letter", { description: e.message }),
  });

  const saveMutation = trpc.review.saveEdit.useMutation({
    onSuccess: () => {
      toast.success("Draft saved", {
        description: "Your edits have been preserved.",
      });
      setHasUnsavedChanges(false);
      invalidate();
    },
    onError: e => toast.error("Save failed", { description: e.message }),
  });

  const approveMutation = trpc.review.approve.useMutation({
    onSuccess: () => {
      toast.success("Letter approved", {
        description:
          "The subscriber has been notified and can now download the final PDF.",
      });
      setApproveDialog(false);
      setEditMode(false);
      setHasUnsavedChanges(false);
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
        description: "The subscriber has been notified to review and approve the letter.",
      });
      invalidate();
    },
    onError: e => toast.error("Failed to request client approval", { description: e.message }),
  });

  // ── Auto-enter edit mode when letter becomes under_review ─────────────────
  // This fires after claim succeeds and the refetch returns the updated letter.
  useEffect(() => {
    if (!data) return;
    const { letter, versions } = data;
    if (letter.status !== "under_review") return;
    if (autoEnteredRef.current) return; // already entered once
    autoEnteredRef.current = true;

    const latestDraft =
      versions?.find(v => v.versionType === "attorney_edit") ??
      versions?.find(v => v.versionType === "ai_draft");

    if (latestDraft?.content) {
      const html = plainTextToHtml(latestDraft.content);
      setEditContent(html);
      setEditMode(true);
      setHasUnsavedChanges(false);
    }
  }, [data]);

  // ── Auto-save when editContent changes while in edit mode ─────────────────
  // Only fires when there are actual unsaved changes to avoid spurious saves
  // on editor initialisation.
  useEffect(() => {
    if (!editMode || !hasUnsavedChanges) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveMutation.mutate({ letterId, content: htmlToPlainText(editContent) });
    }, 2000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [editContent, editMode, hasUnsavedChanges]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Review Center", href: "/review" },
          { label: "Loading..." },
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
          { label: "Error" },
        ]}
      >
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Letter not found or access denied.
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const enterEditMode = () => {
    const html = plainTextToHtml(latestDraft?.content ?? "");
    setEditContent(html);
    setEditMode(true);
    setHasUnsavedChanges(false);
    autoEnteredRef.current = true;
  };

  const cancelEdit = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    setEditMode(false);
    setHasUnsavedChanges(false);
  };

  const highlightCitationsInHtml = (html: string): string => {
    if (!citationAuditReport) return html;
    let result = html;
    const unverifiedCitations: string[] = (citationAuditReport.unverifiedCitations ?? []).map((e: CitationAuditEntry) => e.citation);
    const lowConfidenceCitations: string[] = (citationAuditReport.verifiedCitations ?? [])
      .filter((e: CitationAuditEntry) => e.confidence === "low")
      .map((e: CitationAuditEntry) => e.citation);
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
    // Pre-populate approve dialog with the current editor content (or latest draft)
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
                {LETTER_TYPE_CONFIG[letter.letterType]?.label ??
                  letter.letterType}
                {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                {" · "}
                Submitted {new Date(letter.createdAt).toLocaleDateString()}
              </span>
              {hasUnsavedChanges && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            {letter.status === "pending_review" && (
              <Button
                data-testid="button-claim"
                onClick={() => claimMutation.mutate({ letterId })}
                disabled={claimMutation.isPending}
                size="sm"
              >
                <ClipboardList className="w-4 h-4 mr-1.5" />
                {claimMutation.isPending ? "Claiming..." : "Claim for Review"}
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
                      onClick={cancelEdit}
                      className="bg-background"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Cancel Edit
                    </Button>
                    <Button
                      data-testid="button-save-edit"
                      size="sm"
                      onClick={() =>
                        saveMutation.mutate({
                          letterId,
                          content: htmlToPlainText(editContent),
                        })
                      }
                      disabled={
                        saveMutation.isPending || editContent.length < 10
                      }
                      className="bg-background border border-border text-foreground hover:bg-muted"
                      variant="outline"
                    >
                      <Save className="w-4 h-4 mr-1.5" />
                      {saveMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <Button
                    data-testid="button-edit-draft"
                    variant="outline"
                    size="sm"
                    onClick={enterEditMode}
                    className="bg-background"
                  >
                    Edit Draft
                  </Button>
                )}

                <Button
                  data-testid="button-release"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Release this letter back to the review queue?")) {
                      unclaimMutation.mutate({ letterId });
                    }
                  }}
                  disabled={unclaimMutation.isPending}
                  className="bg-background border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  <X className="w-4 h-4 mr-1.5" />
                  {unclaimMutation.isPending ? "Releasing..." : "Release"}
                </Button>

                <Button
                  data-testid="button-request-changes"
                  variant="outline"
                  size="sm"
                  onClick={() => setChangesDialog(true)}
                  className="bg-background border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Changes
                </Button>
                <Button
                  data-testid="button-reject"
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectDialog(true)}
                  className="bg-background border-red-300 text-red-700 hover:bg-red-50 active:scale-[0.98] transition-transform"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Reject
                </Button>
                <Button
                  data-testid="button-approve"
                  size="sm"
                  onClick={openApproveDialog}
                  className="bg-green-600 hover:bg-green-700 text-white active:scale-[0.98] transition-transform"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Approve
                </Button>
              </>
            )}

            {letter.status === "approved" && (
              <Button
                data-testid="button-request-client-approval"
                variant="outline"
                size="sm"
                onClick={() => requestClientApprovalMutation.mutate({ letterId })}
                disabled={requestClientApprovalMutation.isPending}
                className="bg-background border-teal-300 text-teal-700 hover:bg-teal-50"
              >
                <Scale className="w-4 h-4 mr-1.5" />
                {requestClientApprovalMutation.isPending ? "Sending..." : "Send to Client for Approval"}
              </Button>
            )}
          </div>
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
              {latestDraft && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {latestDraft.versionType === "attorney_edit"
                    ? "Attorney edit"
                    : "AI draft"}{" "}
                  · {new Date(latestDraft.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Editor body */}
            <div className="flex-1 overflow-auto">
              {letter.status === "pending_review" ||
              letter.status === "researching" ||
              letter.status === "drafting" ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                  {letter.status === "pending_review" ? (
                    <>
                      <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        Claim this letter to load the AI draft into the editor.
                      </p>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                      <p className="text-sm text-muted-foreground">
                        AI pipeline is running — draft will appear here shortly.
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
                  }}
                  editable={true}
                  placeholder="Edit the letter content..."
                  minHeight="100%"
                  className="h-full border-0 rounded-none"
                />
              ) : (
                <RichTextEditor
                  data-testid="editor-letter-view"
                  content={highlightCitationsInHtml(plainTextToHtml(latestDraft?.content ?? ""))}
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
                <TabsTrigger value="history" className="flex-1 text-xs" data-testid="tab-history">
                  <History className="w-3 h-3 mr-1" />
                  History
                </TabsTrigger>
              </TabsList>

              {/* Intake */}
              <TabsContent
                value="intake"
                className="flex-1 overflow-auto mt-2"
              >
                <Card className="h-full border-border">
                  <CardContent className="p-3 space-y-3">
                    {letter.intakeJson ? (
                      (() => {
                        const intake = letter.intakeJson as IntakeJson;
                        return (
                          <>
                            {/* Sender */}
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-xs font-semibold text-foreground mb-1">
                                {intake.sender?.name}
                              </p>
                              {intake.sender?.address && (
                                <p className="text-xs text-muted-foreground">
                                  {intake.sender.address}
                                </p>
                              )}
                              {intake.sender?.email && (
                                <p className="text-xs text-muted-foreground">
                                  {intake.sender.email}
                                </p>
                              )}
                              {intake.sender?.phone && (
                                <p className="text-xs text-muted-foreground">
                                  {intake.sender.phone}
                                </p>
                              )}
                            </div>

                            {/* Recipient */}
                            {intake.recipient && (
                              <div className="bg-muted/50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                  Recipient
                                </p>
                                <p className="text-xs font-medium text-foreground">
                                  {intake.recipient.name}
                                  {intake.recipient.company &&
                                    ` / ${intake.recipient.company}`}
                                </p>
                                {intake.recipient.address && (
                                  <p className="text-xs text-muted-foreground">
                                    {intake.recipient.address}
                                  </p>
                                )}
                                {intake.recipient.email && (
                                  <p className="text-xs text-muted-foreground">
                                    {intake.recipient.email}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Jurisdiction */}
                            {(intake.jurisdiction ||
                              letter.jurisdictionState) && (
                              <div className="bg-muted/50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                  Jurisdiction
                                </p>
                                <p className="text-xs text-foreground">
                                  {typeof intake.jurisdiction === "string"
                                    ? intake.jurisdiction
                                    : intake.jurisdiction
                                      ? [intake.jurisdiction.city, intake.jurisdiction.state, intake.jurisdiction.country].filter(Boolean).join(", ")
                                      : `${letter.jurisdictionState}, US`}
                                </p>
                              </div>
                            )}

                            {/* Matter description */}
                            {intake.matter?.description && (
                              <div className="bg-muted/50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                  Matter Description
                                </p>
                                <p className="text-xs text-foreground leading-relaxed">
                                  {intake.matter.description}
                                </p>
                              </div>
                            )}

                            {/* Desired outcome */}
                            {intake.desiredOutcome && (
                              <div className="bg-muted/50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                  Desired Outcome
                                </p>
                                <p className="text-xs text-foreground leading-relaxed">
                                  {intake.desiredOutcome}
                                </p>
                              </div>
                            )}

                            {/* Financials */}
                            {intake.financials?.amountOwed && (
                              <div className="bg-muted/50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                  Amount Owed
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  $
                                  {intake.financials.amountOwed.toLocaleString()}{" "}
                                  {intake.financials.currency ?? "USD"}
                                </p>
                              </div>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No intake data available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Research */}
              <TabsContent
                value="research"
                className="flex-1 overflow-auto mt-2"
              >
                <Card className="h-full border-border">
                  <CardContent className="p-3 space-y-3">
                    {!research || research.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <BookOpen className="w-7 h-7 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">
                          Research not yet available.
                        </p>
                      </div>
                    ) : (
                      research.map(run => {
                        const packet = (run.resultJson ??
                          run.validationResultJson) as ResearchPacketSummary | null;
                        const isCacheHit = run.cacheHit === true;
                        return (
                          <div key={run.id} className="space-y-2">
                            {isCacheHit && (
                              <div
                                data-testid="badge-research-cache-hit"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200"
                              >
                                <span className="text-xs text-emerald-700 font-medium">Served from cache</span>
                                <span className="text-xs text-emerald-600">&mdash; Perplexity API call skipped</span>
                              </div>
                            )}
                            {packet?.researchSummary && (
                              <div className="bg-blue-50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-blue-800 mb-1">
                                  Research Summary
                                </p>
                                <p className="text-xs text-blue-900 leading-relaxed">
                                  {packet.researchSummary}
                                </p>
                              </div>
                            )}
                            {packet?.applicableRules &&
                              packet.applicableRules.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-foreground mb-1.5">
                                    Applicable Laws
                                  </p>
                                  <div className="space-y-1.5">
                                    {packet.applicableRules
                                      .slice(0, 5)
                                      .map((rule, i) => (
                                        <div
                                          key={i}
                                          className="bg-muted/50 rounded-lg p-2.5"
                                        >
                                          <div className="flex items-start justify-between gap-1.5">
                                            <p className="text-xs font-medium text-foreground leading-snug">
                                              {rule.ruleTitle}
                                            </p>
                                            <span
                                              className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                                rule.confidence === "high"
                                                  ? "bg-green-100 text-green-700"
                                                  : rule.confidence === "medium"
                                                    ? "bg-amber-100 text-amber-700"
                                                    : "bg-gray-100 text-gray-600"
                                              }`}
                                            >
                                              {rule.confidence}
                                            </span>
                                          </div>
                                          {rule.summary && (
                                            <p className="text-xs text-muted-foreground mt-1 leading-snug">
                                              {rule.summary}
                                            </p>
                                          )}
                                          {rule.citationText && (
                                            <p className="text-xs text-primary mt-1 font-mono">
                                              {rule.citationText}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            {packet?.riskFlags &&
                              packet.riskFlags.length > 0 && (
                                <div className="bg-red-50 rounded-lg p-2.5">
                                  <p className="text-xs font-semibold text-red-800 mb-1">
                                    Risk Flags
                                  </p>
                                  <ul className="space-y-0.5">
                                    {packet.riskFlags.map(
                                      (flag: string, i: number) => (
                                        <li
                                          key={i}
                                          className="text-xs text-red-700 flex items-start gap-1"
                                        >
                                          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                          {flag}
                                        </li>
                                      )
                                    )}
                                  </ul>
                                </div>
                              )}
                            {packet?.openQuestions &&
                              packet.openQuestions.length > 0 && (
                                <div className="bg-amber-50 rounded-lg p-2.5">
                                  <p className="text-xs font-semibold text-amber-800 mb-1">
                                    Open Questions
                                  </p>
                                  <ul className="space-y-0.5">
                                    {packet.openQuestions.map(
                                      (q: string, i: number) => (
                                        <li
                                          key={i}
                                          className="text-xs text-amber-700"
                                        >
                                          • {q}
                                        </li>
                                      )
                                    )}
                                  </ul>
                                </div>
                              )}
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Citations */}
              <TabsContent
                value="citations"
                className="flex-1 overflow-auto mt-2"
              >
                <Card className="h-full border-border">
                  <CardContent className="p-3 space-y-3" data-testid="panel-citation-report">
                    {!citationAuditReport ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <Scale className="w-7 h-7 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">
                          Citation audit not yet available.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">
                            Citation Confidence Report
                          </p>
                          <span
                            data-testid="text-hallucination-risk"
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              citationAuditReport.hallucinationRiskScore === 0
                                ? "bg-green-100 text-green-700"
                                : citationAuditReport.hallucinationRiskScore <= 25
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            Risk: {citationAuditReport.hallucinationRiskScore}%
                          </span>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-2.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Total citations</span>
                            <span className="font-medium text-foreground">{citationAuditReport.totalCitations}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>Verified</span>
                            <span className="font-medium text-green-700">{citationAuditReport.verifiedCitations?.length ?? 0}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>Unverified</span>
                            <span className="font-medium text-red-700">{citationAuditReport.unverifiedCitations?.length ?? 0}</span>
                          </div>
                        </div>

                        {citationAuditReport.verifiedCitations?.length > 0 && (
                          <div>
                            <button
                              onClick={() => setCitationReportOpen(!citationReportOpen)}
                              className="flex items-center gap-1 text-xs font-semibold text-foreground mb-1.5 hover:text-primary transition-colors"
                              data-testid="button-toggle-verified"
                            >
                              {citationReportOpen ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              Verified Citations ({citationAuditReport.verifiedCitations.length})
                            </button>
                            {citationReportOpen && (
                              <div className="space-y-1.5">
                                {citationAuditReport.verifiedCitations.map(
                                  (entry: CitationAuditEntry, i: number) => (
                                    <div
                                      key={i}
                                      data-testid={`citation-verified-${i}`}
                                      className={`rounded-lg p-2 border ${
                                        entry.confidence === "low"
                                          ? "bg-amber-50 border-amber-200"
                                          : "bg-green-50 border-green-200"
                                      }`}
                                    >
                                      <p className="text-xs font-mono text-foreground leading-snug">
                                        {entry.citation}
                                      </p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span
                                          className={`text-xs px-1.5 py-0.5 rounded ${
                                            entry.confidence === "high"
                                              ? "bg-green-100 text-green-700"
                                              : entry.confidence === "medium"
                                                ? "bg-amber-100 text-amber-700"
                                                : "bg-red-100 text-red-700"
                                          }`}
                                        >
                                          {entry.confidence}
                                        </span>
                                        <span className="text-xs text-green-600">
                                          verified
                                        </span>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {citationAuditReport.unverifiedCitations?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-700 mb-1.5">
                              Unverified Citations ({citationAuditReport.unverifiedCitations.length})
                            </p>
                            <div className="space-y-1.5">
                              {citationAuditReport.unverifiedCitations.map(
                                (entry: CitationAuditEntry, i: number) => (
                                  <div
                                    key={i}
                                    data-testid={`citation-unverified-${i}`}
                                    className="bg-red-50 border border-red-200 rounded-lg p-2"
                                  >
                                    <p className="text-xs font-mono text-red-800 leading-snug">
                                      {entry.citation}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                        unverified
                                      </span>
                                      <span className="text-xs text-red-600">
                                        added by Claude
                                      </span>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Audited: {new Date(citationAuditReport.auditedAt).toLocaleString()}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History */}
              <TabsContent
                value="history"
                className="flex-1 overflow-auto mt-2"
              >
                <Card className="h-full border-border">
                  <CardContent className="p-3">
                    {!actions || actions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No actions recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {actions.map(action => (
                          <div key={action.id} className="flex gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-foreground capitalize">
                                  {action.action.replace(/_/g, " ")}
                                </span>
                                {action.noteVisibility === "internal" && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                    internal
                                  </span>
                                )}
                              </div>
                              {action.noteText && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                  {action.noteText}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground/60 mt-0.5">
                                {new Date(action.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* ── Approve Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={approveDialog} onOpenChange={(open) => {
        setApproveDialog(open);
        if (!open) setAcknowledgedUnverified(false);
      }}>
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
              onChange={setApproveContent}
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
                    onChange={e => setAcknowledgedUnverified(e.target.checked)}
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
              onClick={() => setApproveDialog(false)}
              className="bg-background"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-approve-confirm"
              onClick={() =>
                approveMutation.mutate({
                  letterId,
                  finalContent: htmlToPlainText(approveContent),
                  ...(isResearchUnverified ? { acknowledgedUnverifiedResearch: acknowledgedUnverified } : {}),
                })
              }
              disabled={
                approveMutation.isPending ||
                htmlToPlainText(approveContent).length < 50 ||
                (isResearchUnverified && !acknowledgedUnverified)
              }
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {approveMutation.isPending ? "Approving..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
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
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Explain why this letter is being rejected..."
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              data-testid="button-reject-cancel"
              variant="outline"
              onClick={() => setRejectDialog(false)}
              className="bg-background"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-reject-confirm"
              onClick={() =>
                rejectMutation.mutate({ letterId, reason: rejectReason })
              }
              disabled={rejectMutation.isPending || rejectReason.length < 10}
              variant="destructive"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request Changes Dialog ─────────────────────────────────────────── */}
      <Dialog open={changesDialog} onOpenChange={setChangesDialog}>
        <DialogContent data-testid="dialog-request-changes">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <MessageSquare className="w-5 h-5" />
              Request Changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">
                Note to Subscriber *
              </Label>
              <Textarea
                data-testid="input-changes-note"
                value={changesNote}
                onChange={e => setChangesNote(e.target.value)}
                placeholder="Explain what changes are needed..."
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                data-testid="checkbox-retrigger-pipeline"
                type="checkbox"
                id="retrigger"
                checked={retrigger}
                onChange={e => setRetrigger(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="retrigger" className="text-sm text-foreground">
                Re-trigger drafting pipeline to regenerate draft
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-changes-cancel"
              variant="outline"
              onClick={() => setChangesDialog(false)}
              className="bg-background"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-changes-confirm"
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
              {changesMutation.isPending ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
