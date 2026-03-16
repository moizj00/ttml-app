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
} from "lucide-react";
import { useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";

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

  // Track whether we've already auto-entered edit mode after a claim so we
  // don't re-enter it on every subsequent poll refetch.
  const autoEnteredRef = useRef(false);

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

  // Prefer the latest attorney edit; fall back to the AI draft.
  const latestDraft =
    versions?.find(v => v.versionType === "attorney_edit") ??
    versions?.find(v => v.versionType === "ai_draft");

  const isUnderReview = letter.status === "under_review";

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
      <div className="flex flex-col h-full gap-0">
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pb-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-foreground leading-tight truncate">
              {letter.subject}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={letter.status} />
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
                      variant="outline"
                      size="sm"
                      onClick={cancelEdit}
                      className="bg-background"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Cancel Edit
                    </Button>
                    <Button
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
                    variant="outline"
                    size="sm"
                    onClick={enterEditMode}
                    className="bg-background"
                  >
                    Edit Draft
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangesDialog(true)}
                  className="bg-background border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectDialog(true)}
                  className="bg-background border-red-300 text-red-700 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={openApproveDialog}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>

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
                  content={plainTextToHtml(latestDraft?.content ?? "")}
                  editable={false}
                  minHeight="100%"
                  className="h-full border-0 rounded-none"
                />
              )}
            </div>
          </div>

          {/* Right: Intake / Research / History panel */}
          <div className="w-80 flex-shrink-0 flex flex-col min-h-0">
            <Tabs defaultValue="intake" className="flex flex-col h-full">
              <TabsList className="w-full flex-shrink-0">
                <TabsTrigger value="intake" className="flex-1 text-xs">
                  <ClipboardList className="w-3 h-3 mr-1" />
                  Intake
                </TabsTrigger>
                <TabsTrigger value="research" className="flex-1 text-xs">
                  <BookOpen className="w-3 h-3 mr-1" />
                  Research
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 text-xs">
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
                        const intake = letter.intakeJson as any;
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
                                  {intake.jurisdiction ??
                                    `${letter.jurisdictionState}, US`}
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
                          run.validationResultJson) as any;
                        return (
                          <div key={run.id} className="space-y-2">
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
                                      .map((rule: any, i: number) => (
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
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
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
              content={approveContent}
              onChange={setApproveContent}
              editable={true}
              placeholder="Final letter content..."
              minHeight="300px"
            />
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setApproveDialog(false)}
              className="bg-background"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                approveMutation.mutate({
                  letterId,
                  finalContent: htmlToPlainText(approveContent),
                })
              }
              disabled={
                approveMutation.isPending ||
                htmlToPlainText(approveContent).length < 50
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
        <DialogContent>
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
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Explain why this letter is being rejected..."
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog(false)}
              className="bg-background"
            >
              Cancel
            </Button>
            <Button
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
        <DialogContent>
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
                value={changesNote}
                onChange={e => setChangesNote(e.target.value)}
                placeholder="Explain what changes are needed..."
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
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
              variant="outline"
              onClick={() => setChangesDialog(false)}
              className="bg-background"
            >
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
              {changesMutation.isPending ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
