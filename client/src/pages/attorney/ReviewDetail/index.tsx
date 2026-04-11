/**
 * ReviewDetail — Page Orchestrator
 *
 * Thin orchestrator: owns layout, breadcrumb, and split-panel structure.
 * All data fetching, mutations, autosave, and derived state live in
 * useReviewDetail. Sub-components are in ../review/.
 */

import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import RichTextEditor from "@/components/shared/RichTextEditor";
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
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";

import { IntakePanel } from "../review/IntakePanel";
import { ResearchPanel } from "../review/ResearchPanel";
import { CitationAuditPanel } from "../review/CitationAuditPanel";
import { HistoryPanel } from "../review/HistoryPanel";
import { DiffPanel } from "../review/DiffPanel";
import { CounterArgumentPanel } from "../review/CounterArgumentPanel";
import { ApproveDialog } from "../review/ApproveDialog";
import { RejectDialog } from "../review/RejectDialog";
import { ChangesDialog } from "../review/ChangesDialog";
import { EditorToolbar } from "../review/EditorToolbar";

import { useReviewDetail } from "./hooks/useReviewDetail";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ReviewDetail() {
  const rd = useReviewDetail();

  // ── Loading / error guards ─────────────────────────────────────────────
  if (!rd.letterId || isNaN(rd.letterId) || rd.letterId <= 0) {
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
          <p className="text-sm text-muted-foreground">
            The letter ID in the URL is not valid.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (rd.isLoading) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Review Center", href: "/review" },
          { label: `Letter #${rd.letterId}` },
        ]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (rd.error || !rd.data) {
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

  const { letter, versions, actions, research } = rd;
  const isUnderReview = letter!.status === "under_review";

  return (
    <AppLayout
      breadcrumb={[
        { label: "Review Center", href: "/review" },
        { label: "Queue", href: "/review/queue" },
        { label: letter!.subject },
      ]}
    >
      <div className="flex flex-col h-full gap-0 animate-dashboard-fade-up">
        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pb-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-foreground leading-tight truncate">
              {letter!.subject}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={letter!.status} data-testid="status-badge-letter" />
              <span className="text-xs text-muted-foreground">
                {LETTER_TYPE_CONFIG[letter!.letterType]?.label ?? letter!.letterType}
                {letter!.jurisdictionState && ` · ${letter!.jurisdictionState}`}
                {" · "}
                Submitted {new Date(letter!.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <EditorToolbar
            letterStatus={letter!.status}
            isUnderReview={isUnderReview}
            editMode={rd.editMode}
            editContent={rd.editContent}
            hasUnsavedChanges={rd.hasUnsavedChanges}
            saveStatus={rd.saveStatus}
            lastSavedAt={rd.lastSavedAt}
            claimIsPending={rd.claimPending}
            saveIsPending={false}
            unclaimIsPending={rd.unclaimPending}
            approvePending={rd.approvePending}
            onClaim={rd.handleClaim}
            onCancelEdit={rd.cancelEdit}
            onSave={rd.handleManualSave}
            onEnterEditMode={rd.enterEditMode}
            onRelease={() => {
              if (rd.hasUnsavedChanges) {
                if (!window.confirm("You have unsaved changes. Release this letter anyway?"))
                  return;
              }
              rd.handleUnclaim();
            }}
            onRequestChanges={() => rd.setChangesDialog(true)}
            onReject={() => rd.setRejectDialog(true)}
            onApprove={rd.openApproveDialog}
          />
        </div>

        {/* ── Warning banners ───────────────────────────────────────────────── */}
        {rd.isResearchUnverified && (
          <div
            data-testid="banner-research-unverified"
            className="flex items-center gap-3 px-4 py-3 mb-3 rounded-xl bg-red-50 border border-red-200"
          >
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">RESEARCH UNVERIFIED</p>
              <p className="text-xs text-red-700 mt-0.5">
                This letter's legal research was not web-verified (Perplexity was unavailable).
                Citations require manual attorney validation before approval.
              </p>
            </div>
          </div>
        )}
        {rd.isQualityDegraded && (
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
                This draft was produced with quality warnings (e.g. jurisdiction mismatch,
                vetting issues, or pipeline fallback). Please review carefully before approving.
              </p>
            </div>
          </div>
        )}

        {/* ── Split panel ───────────────────────────────────────────────────── */}
        <div className="flex gap-4 min-h-0" style={{ height: "calc(100vh - 200px)" }}>
          {/* Left: Rich text editor */}
          <div className="flex-1 flex flex-col min-w-0 border border-border rounded-2xl overflow-hidden bg-card">
            {/* Editor header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20 flex-shrink-0">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {rd.editMode ? "Editing Draft" : "Initial Draft"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {rd.editMode && rd.hasUnsavedChanges && (
                  <span
                    data-testid="indicator-unsaved"
                    className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-1 rounded-full font-medium animate-pulse"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Unsaved changes
                  </span>
                )}
                {rd.editMode && rd.saveStatus === "saving" && (
                  <span
                    data-testid="indicator-saving"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </span>
                )}
                {rd.editMode &&
                  rd.saveStatus === "saved" &&
                  !rd.hasUnsavedChanges &&
                  rd.lastSavedAt && (
                    <span
                      data-testid="indicator-saved"
                      className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Saved {formatTimeAgo(rd.lastSavedAt)}
                    </span>
                  )}
                {rd.editMode && rd.saveStatus === "error" && (
                  <span
                    data-testid="indicator-save-error"
                    className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                  >
                    <AlertCircle className="w-3 h-3" />
                    Save failed
                  </span>
                )}
                {!rd.editMode && rd.latestDraft && (
                  <span className="text-xs text-muted-foreground">
                    {rd.latestDraft.versionType === "attorney_edit"
                      ? "Attorney edit"
                      : "System draft"}{" "}
                    · {new Date(rd.latestDraft.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Editor body */}
            <div className="flex-1 overflow-auto">
              {letter!.status === "pending_review" ||
              letter!.status === "client_revision_requested" ||
              letter!.status === "researching" ||
              letter!.status === "drafting" ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  {letter!.status === "pending_review" ||
                  letter!.status === "client_revision_requested" ? (
                    <>
                      <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {letter!.status === "client_revision_requested"
                          ? "Client requested revisions. Claim to review their notes and update the letter."
                          : "Claim this letter to load the draft into the editor."}
                      </p>
                      {letter!.status === "client_revision_requested" &&
                        (() => {
                          const revisionAction = [...(actions ?? [])]
                            .reverse()
                            .find(
                              a =>
                                a.action === "client_revision_requested" && a.noteText
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
              ) : rd.editMode ? (
                <RichTextEditor
                  data-testid="editor-letter-edit"
                  content={rd.editContent}
                  onChange={html => {
                    rd.setEditContent(html);
                    rd.setHasUnsavedChanges(true);
                  }}
                  className="h-full border-0 rounded-none"
                />
              ) : (
                <div
                  data-testid="preview-letter-content"
                  className="prose prose-sm max-w-none p-6 h-full overflow-auto"
                  dangerouslySetInnerHTML={{
                    __html: rd.highlightCitationsInHtml(
                      rd.latestDraft?.content
                        ? rd.latestDraft.content.startsWith("<")
                          ? rd.latestDraft.content
                          : rd.latestDraft.content
                              .split("\n")
                              .map(l => `<p>${l}</p>`)
                              .join("")
                        : "<p><em>No draft available.</em></p>"
                    ),
                  }}
                />
              )}
            </div>
          </div>

          {/* Right: Intake / Research / Citations / History panel */}
          <div className="w-80 flex-shrink-0 flex flex-col min-h-0">
            <Tabs defaultValue="intake" className="flex flex-col h-full">
              <TabsList className="w-full flex-shrink-0" data-testid="tabs-review-panel">
                <TabsTrigger
                  value="intake"
                  className="flex-1 text-xs"
                  data-testid="tab-intake"
                >
                  <ClipboardList className="w-3 h-3 mr-1" />
                  Intake
                </TabsTrigger>
                <TabsTrigger
                  value="research"
                  className="flex-1 text-xs"
                  data-testid="tab-research"
                >
                  <BookOpen className="w-3 h-3 mr-1" />
                  Research
                </TabsTrigger>
                <TabsTrigger
                  value="citations"
                  className="flex-1 text-xs"
                  data-testid="tab-citations"
                >
                  <Scale className="w-3 h-3 mr-1" />
                  Citations
                </TabsTrigger>
                <TabsTrigger
                  value="counter-args"
                  className="flex-1 text-xs"
                  data-testid="tab-counter-args"
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Counter
                </TabsTrigger>
                <TabsTrigger
                  value="diff"
                  className="flex-1 text-xs"
                  data-testid="tab-diff"
                >
                  <GitCompare className="w-3 h-3 mr-1" />
                  Diff
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex-1 text-xs"
                  data-testid="tab-history"
                >
                  <History className="w-3 h-3 mr-1" />
                  History
                </TabsTrigger>
              </TabsList>
              <TabsContent value="intake" className="flex-1 overflow-auto mt-2">
                <IntakePanel
                  intakeJson={letter!.intakeJson}
                  jurisdictionState={letter!.jurisdictionState}
                />
              </TabsContent>
              <TabsContent value="research" className="flex-1 overflow-auto mt-2">
                <ResearchPanel research={research} />
              </TabsContent>
              <TabsContent value="citations" className="flex-1 overflow-auto mt-2">
                <CitationAuditPanel citationAuditReport={rd.citationAuditReport} />
              </TabsContent>
              <TabsContent value="counter-args" className="flex-1 overflow-auto mt-2">
                <CounterArgumentPanel
                  counterArguments={rd.counterArguments}
                  counterArgumentGaps={rd.counterArgumentGaps}
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

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      <ApproveDialog
        open={rd.approveDialog}
        onOpenChange={open => {
          rd.setApproveDialog(open);
          if (!open) rd.setAcknowledgedUnverified(false);
        }}
        approveContent={rd.approveContent}
        onContentChange={rd.setApproveContent}
        isResearchUnverified={rd.isResearchUnverified}
        acknowledgedUnverified={rd.acknowledgedUnverified}
        onAcknowledgeChange={rd.setAcknowledgedUnverified}
        isPending={rd.approvePending}
        onConfirm={(opts) => rd.handleApprove(opts)}
      />
      <RejectDialog
        open={rd.rejectDialog}
        onOpenChange={rd.setRejectDialog}
        rejectReason={rd.rejectReason}
        onReasonChange={rd.setRejectReason}
        isPending={rd.rejectPending}
        onConfirm={rd.handleReject}
      />
      <ChangesDialog
        open={rd.changesDialog}
        onOpenChange={rd.setChangesDialog}
        changesNote={rd.changesNote}
        onNoteChange={rd.setChangesNote}
        retrigger={rd.retrigger}
        onRetriggerChange={rd.setRetrigger}
        isPending={rd.changesPending}
        onConfirm={rd.handleRequestChanges}
      />
    </AppLayout>
  );
}
