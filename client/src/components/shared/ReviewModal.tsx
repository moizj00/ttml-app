import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import StatusBadge from "./StatusBadge";
import RichTextEditor, {
  plainTextToHtml,
  htmlToPlainText,
} from "./RichTextEditor";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Edit3,
  FileText,
  BookOpen,
  History,
  AlertCircle,
  Loader2,
  Save,
  ClipboardList,
  Gavel,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";

interface ReviewModalProps {
  letterId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReviewModal({
  letterId,
  open,
  onOpenChange,
}: ReviewModalProps) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.review.letterDetail.useQuery(
    { id: letterId },
    {
      enabled: open && !!letterId,
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

  // Editor state
  const [editContent, setEditContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Mobile side panel toggle
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Action dialog states
  const [activeAction, setActiveAction] = useState<
    "approve" | "reject" | "changes" | null
  >(null);
  const [approveContent, setApproveContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [retrigger, setRetrigger] = useState(false);

  const invalidate = useCallback(() => {
    utils.review.letterDetail.invalidate({ id: letterId });
    utils.review.queue.invalidate();
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
      toast.success("Letter approved", {
        description:
          "The subscriber has been notified and can now download the final PDF.",
      });
      setActiveAction(null);
      invalidate();
    },
    onError: e => toast.error("Approval failed", { description: e.message }),
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
    onError: e => toast.error("Request failed", { description: e.message }),
  });

  // Initialize editor content when data loads
  useEffect(() => {
    if (data?.versions) {
      const latestDraft =
        data.versions.find(v => v.versionType === "attorney_edit") ??
        data.versions.find(v => v.versionType === "ai_draft");
      if (latestDraft?.content) {
        const html = plainTextToHtml(latestDraft.content);
        setEditContent(html);
        setApproveContent(latestDraft.content);
      }
    }
  }, [data?.versions]);

  if (!open) return null;

  const letter = data?.letter;
  const versions = data?.versions ?? [];
  const actions = data?.actions ?? [];
  const research = data?.research ?? [];
  const isUnderReview = letter?.status === "under_review";
  const isPending = letter?.status === "pending_review";

  const latestDraft =
    versions.find(v => v.versionType === "attorney_edit") ??
    versions.find(v => v.versionType === "ai_draft");

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
    const finalContent = isEditing
      ? editContent
      : (latestDraft?.content ?? "");
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false} className="max-w-none w-screen h-screen sm:w-[95vw] sm:h-[95vh] sm:max-w-7xl p-0 gap-0 overflow-hidden rounded-none sm:rounded-xl flex flex-col">

        {/* ═══════════════════════════════════════════════════
            HEADER — sticky, never wraps, always readable
        ═══════════════════════════════════════════════════ */}
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

            {/* Close button */}
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

                {/* Spacer pushes destructive actions to the right on desktop */}
                <div className="flex-1 hidden sm:block" />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveAction("changes")}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                >
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  <span className="hidden xs:inline">Changes</span>
                  <span className="xs:hidden">Changes</span>
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
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm shadow-green-200 shrink-0"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Approve
                </Button>
              </>
            )}

            {/* Mobile: toggle side panel */}
            <div className="flex-1 sm:hidden" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidePanelOpen(v => !v)}
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

        {/* ═══════════════════════════════════════════════════
            BODY — two-panel on desktop, stacked on mobile
        ═══════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row min-h-0">

          {/* ── Left / Main: Draft Editor ── */}
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

          {/* ── Right / Side Panel: Intake · Research · History ── */}
          {/* Desktop: always visible. Mobile: toggled via button above */}
          <div
            className={[
              // Mobile: slide in from bottom as a fixed-height panel
              "flex flex-col overflow-hidden bg-card",
              "border-t border-border sm:border-t-0 sm:border-l",
              // Mobile height: show/hide
              sidePanelOpen
                ? "h-[50vh] sm:h-auto"
                : "h-0 sm:h-auto overflow-hidden sm:overflow-visible",
              // Desktop: fixed width sidebar
              "sm:w-80 lg:w-96 flex-shrink-0",
            ].join(" ")}
          >
            <Tabs
              defaultValue="intake"
              className="flex flex-col flex-1 overflow-hidden h-full"
            >
              <TabsList className="flex-shrink-0 w-full rounded-none border-b border-border bg-muted/30 h-auto p-0 grid grid-cols-3">
                <TabsTrigger
                  value="intake"
                  className="rounded-none py-2.5 text-xs font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                  Intake
                </TabsTrigger>
                <TabsTrigger
                  value="research"
                  className="rounded-none py-2.5 text-xs font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                  Research
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="rounded-none py-2.5 text-xs font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <History className="w-3.5 h-3.5 mr-1.5" />
                  History
                </TabsTrigger>
              </TabsList>

              {/* ── Intake Tab ── */}
              <TabsContent
                value="intake"
                className="flex-1 overflow-y-auto m-0 p-4 space-y-4"
              >
                {letter?.intakeJson ? (
                  (() => {
                    const intake = letter.intakeJson as any;
                    return (
                      <>
                        <IntakeSection label="Sender">
                          <p className="text-sm font-medium">
                            {intake.sender?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {intake.sender?.address}
                          </p>
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
                        </IntakeSection>

                        <IntakeSection label="Recipient">
                          <p className="text-sm font-medium">
                            {intake.recipient?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {intake.recipient?.address}
                          </p>
                          {intake.recipient?.email && (
                            <p className="text-xs text-muted-foreground">
                              {intake.recipient.email}
                            </p>
                          )}
                        </IntakeSection>

                        <IntakeSection label="Jurisdiction">
                          <p className="text-sm">
                            {[
                              intake.jurisdiction?.city,
                              intake.jurisdiction?.state,
                              intake.jurisdiction?.country ?? "US",
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </IntakeSection>

                        <IntakeSection label="Matter Description">
                          <p className="text-sm text-foreground leading-relaxed">
                            {intake.matter?.description}
                          </p>
                        </IntakeSection>

                        <IntakeSection label="Desired Outcome">
                          <p className="text-sm text-foreground">
                            {intake.desiredOutcome}
                          </p>
                        </IntakeSection>

                        {intake.financials?.amountOwed && (
                          <IntakeSection label="Amount Owed">
                            <p className="text-sm font-semibold text-foreground">
                              ${intake.financials.amountOwed.toLocaleString()}{" "}
                              {intake.financials.currency ?? "USD"}
                            </p>
                          </IntakeSection>
                        )}

                        {intake.tonePreference && (
                          <div className="space-y-1.5">
                            <SideLabel label="Tone" />
                            <Badge variant="outline" className="capitalize">
                              {intake.tonePreference}
                            </Badge>
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No intake data available.
                  </p>
                )}
              </TabsContent>

              {/* ── Research Tab ── */}
              <TabsContent
                value="research"
                className="flex-1 overflow-y-auto m-0 p-4"
              >
                {research.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <BookOpen className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Research data not yet available.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {research.map(run => {
                      const packet = (run.resultJson ??
                        run.validationResultJson) as any;
                      return (
                        <div key={run.id} className="space-y-3">
                          {packet?.researchSummary && (
                            <div className="bg-blue-50 rounded-lg p-3">
                              <h4 className="text-xs font-semibold text-blue-800 mb-1.5">
                                Research Summary
                              </h4>
                              <p className="text-xs text-blue-900 leading-relaxed">
                                {packet.researchSummary}
                              </p>
                            </div>
                          )}
                          {packet?.applicableRules?.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2">
                                Applicable Laws
                              </h4>
                              <div className="space-y-2">
                                {packet.applicableRules
                                  .slice(0, 5)
                                  .map((rule: any, i: number) => (
                                    <div
                                      key={i}
                                      className="bg-muted/50 rounded-lg p-2.5"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-medium text-foreground">
                                          {rule.ruleTitle}
                                        </p>
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
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
                                      <p className="text-[11px] text-muted-foreground mt-1">
                                        {rule.summary}
                                      </p>
                                      {rule.citationText && (
                                        <p className="text-[10px] text-primary mt-1 font-mono">
                                          {rule.citationText}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                          {packet?.riskFlags?.length > 0 && (
                            <div className="bg-red-50 rounded-lg p-2.5">
                              <h4 className="text-xs font-semibold text-red-800 mb-1.5">
                                Risk Flags
                              </h4>
                              <ul className="space-y-1">
                                {packet.riskFlags.map(
                                  (flag: string, i: number) => (
                                    <li
                                      key={i}
                                      className="text-[11px] text-red-700 flex items-start gap-1.5"
                                    >
                                      <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                      {flag}
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}
                          {packet?.openQuestions?.length > 0 && (
                            <div className="bg-amber-50 rounded-lg p-2.5">
                              <h4 className="text-xs font-semibold text-amber-800 mb-1.5">
                                Open Questions
                              </h4>
                              <ul className="space-y-1">
                                {packet.openQuestions.map(
                                  (q: string, i: number) => (
                                    <li
                                      key={i}
                                      className="text-[11px] text-amber-700"
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
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── History Tab ── */}
              <TabsContent
                value="history"
                className="flex-1 overflow-y-auto m-0 p-4"
              >
                {actions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <History className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No actions recorded yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actions.map(action => (
                      <div key={action.id} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground capitalize">
                              {action.action.replace(/_/g, " ")}
                            </span>
                            {action.noteVisibility === "internal" && (
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                internal
                              </span>
                            )}
                          </div>
                          {action.noteText && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {action.noteText}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {new Date(action.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            ACTION DIALOGS (Approve / Reject / Changes)
        ═══════════════════════════════════════════════════ */}

        {/* Approve */}
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
                  Approve Letter
                </h3>
                <p className="text-xs text-muted-foreground">
                  This will finalize the letter and notify the subscriber.
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
              <Button
                variant="outline"
                onClick={() => setActiveAction(null)}
              >
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
                    Approving…
                  </>
                ) : (
                  <>
                    <Gavel className="w-4 h-4 mr-1.5" />
                    Confirm Approval
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
                Reason for Rejection <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this letter is being rejected..."
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="outline"
                onClick={() => setActiveAction(null)}
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
                {rejectMutation.isPending
                  ? "Rejecting…"
                  : "Confirm Rejection"}
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
                  Note to Subscriber <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={changesNote}
                  onChange={e => setChangesNote(e.target.value)}
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
                  onChange={e => setRetrigger(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-foreground">
                  Re-trigger drafting pipeline to regenerate draft
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="outline"
                onClick={() => setActiveAction(null)}
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
                {changesMutation.isPending ? "Sending…" : "Send Request"}
              </Button>
            </div>
          </ActionDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SideLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
  );
}

function IntakeSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <SideLabel label={label} />
      <div className="bg-muted/50 rounded-lg p-3 space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Accessible overlay dialog for approve / reject / request-changes confirmations.
 */
function ActionDialog({
  children,
  onClose,
  labelId,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelId: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className="bg-card rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg p-6 outline-none"
      >
        {children}
      </div>
    </div>
  );
}
