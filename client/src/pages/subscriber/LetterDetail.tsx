import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import { LetterPaywall } from "@/components/LetterPaywall";
import { FreePreviewViewer } from "@/components/FreePreviewViewer";
import { FreePreviewWaiting } from "@/components/FreePreviewWaiting";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Download,
  MessageSquare,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  Copy,
  Trash2,
  XCircle,
  RotateCcw,
  Eye,
  Send,
} from "lucide-react";
import { Link, useParams, useSearch } from "wouter";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLetterRealtime } from "@/hooks/useLetterRealtime";
import { SubscriberReviewBar } from "@/components/shared/SubscriberReviewBar";
import { SubscriberLetterPreviewModal } from "@/components/shared/SubscriberLetterPreviewModal";
import { ClientApprovalBlock } from "./letter-detail/ClientApprovalBlock";
import { RejectionRetryBlock } from "./letter-detail/RejectionRetryBlock";
import { LetterStatusDisplay } from "./letter-detail/LetterStatusDisplay";
import { NeedsChangesPanel } from "./letter-detail/NeedsChangesPanel";
import { ApprovedLetterPanel } from "./letter-detail/ApprovedLetterPanel";
import { LetterContentRenderer } from "./letter-detail/LetterContentRenderer";

const TransitionBanner = ({ status }: { status: string }) => {
  if (status === "client_approval_pending") {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 w-full">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium">Action Required: Review Your Letter</h4>
          <p className="text-sm mt-1 opacity-90">
            An attorney has completed their review and your letter is ready for
            your final approval before it is sent.
          </p>
        </div>
      </div>
    );
  }
  if (status === "needs_changes") {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 w-full">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium">
            Action Required: Attorney Requested Changes
          </h4>
          <p className="text-sm mt-1 opacity-90">
            Please provide the requested information below so our attorneys can
            finalize your letter.
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const POLLING_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "pending_review",
  "under_review",
  "client_approval_pending",
  "client_revision_requested",
  "client_approved",
  "approved",
];

const STATUS_LABELS: Record<string, string> = {
  researching: "Our team is researching your legal situation...",
  drafting: "Drafting your letter...",
  generated_locked: "Your letter draft is ready!",
  pending_review: "Sent to attorney review queue.",
  under_review: "An attorney is reviewing your letter.",
  approved: "Your letter has been approved by an attorney! Your PDF is ready.",
  client_approval_pending: "Your letter is ready for your final approval.",
  client_revision_requested: "Your revision request has been submitted.",
  client_approved: "You approved the letter for delivery.",
  client_declined: "You declined the letter.",
  rejected: "Your letter request was rejected.",
  needs_changes: "The attorney has requested changes.",
  sent: "Your letter has been sent to the recipient.",
};

export default function LetterDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearch();
  const letterId = parseInt(params.id ?? "0");
  const [updateText, setUpdateText] = useState("");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewModalDismissed, setPreviewModalDismissed] = useState(false);

  useEffect(() => {
    if (
      data?.letter &&
      ["client_approval_pending", "needs_changes"].includes(data.letter.status)
    ) {
      const timeoutId = setTimeout(() => {
        const element = document.getElementById("attorney-review");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [data?.letter?.status]);

  useEffect(() => {
    const sp = new URLSearchParams(search);
    if (sp.get("unlocked") === "true") {
      toast.success("Payment confirmed", {
        description:
          "Your letter has been sent for attorney review. You'll receive an email when it's approved.",
        duration: 6000,
      });
    } else if (sp.get("canceled") === "true") {
      toast.info("Checkout canceled", {
        description:
          "No charges were made. Your letter draft is still ready whenever you are.",
      });
    }
  }, [search]);

  const { data, isLoading, error } = trpc.letters.detail.useQuery(
    { id: letterId },
    {
      enabled: !!letterId,
      refetchInterval: query => {
        const status = query.state.data?.letter?.status;
        return status && POLLING_STATUSES.includes(status) ? 10000 : false;
      },
    }
  );

  const utils = trpc.useUtils();
  const invalidate = () => utils.letters.detail.invalidate({ id: letterId });

  // Delivery log — only fetch when letter has been sent
  const { data: deliveryLogData } = trpc.letters.deliveryLog.useQuery(
    { letterId },
    { enabled: !!letterId }
  );

  useLetterRealtime({
    letterId: letterId || null,
    enabled: !!letterId,
    onStatusChange: ({ newStatus }) => {
      invalidate();
      const label = STATUS_LABELS[newStatus];
      if (label) {
        if (["approved", "client_approved", "sent"].includes(newStatus))
          toast.success(label);
        else if (
          ["rejected", "needs_changes", "client_declined"].includes(newStatus)
        )
          toast.warning(label);
        else toast.info(label);
      }
      // Auto-open preview modal when letter transitions to client_approval_pending
      if (newStatus === "client_approval_pending") {
        setPreviewModalDismissed(false);
        setPreviewModalOpen(true);
      }
    },
  });

  // Auto-open preview modal on initial load if status is client_approval_pending
  useEffect(() => {
    if (
      data?.letter?.status === "client_approval_pending" &&
      !previewModalDismissed
    ) {
      setPreviewModalOpen(true);
    }
  }, [data?.letter?.status, previewModalDismissed]);

  const archiveMutation = trpc.letters.archive.useMutation({
    onSuccess: () => {
      toast.success("Letter archived");
      window.history.back();
    },
    onError: (err: any) =>
      toast.error("Could not archive letter", { description: err.message }),
  });

  const updateMutation = trpc.letters.updateForChanges.useMutation({
    onSuccess: () => {
      toast.success("Response submitted", {
        description:
          "Our legal team is re-processing your letter with the new information.",
      });
      setUpdateText("");
    },
    onError: err =>
      toast.error("Submission failed", { description: err.message }),
  });

  const handleCopy = () => {
    const content = data?.versions?.find(
      (v: any) => v.versionType === "final_approved"
    )?.content;
    if (!content) {
      toast.error("Nothing to copy");
      return;
    }
    navigator.clipboard
      .writeText(content)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() =>
        toast.error("Copy failed", {
          description: "Please try selecting and copying the text manually.",
        })
      );
  };

  const handleArchive = () => {
    if (
      confirm(
        "Are you sure you want to archive this letter? It will be hidden from your letters list."
      )
    ) {
      archiveMutation.mutate({ letterId });
    }
  };

  if (!letterId || isNaN(letterId) || letterId <= 0) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "My Letters", href: "/letters" },
          { label: "Invalid Letter" },
        ]}
      >
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">
            Invalid letter ID
          </h3>
          <Button asChild variant="outline" size="sm">
            <Link href="/letters">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Letters
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "My Letters", href: "/letters" },
          { label: `Letter #${letterId}` },
        ]}
      >
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "My Letters", href: "/letters" },
          { label: "Not Found" },
        ]}
      >
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">
            Letter not found
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            This letter doesn't exist or you don't have access to it.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/letters">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Letters
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { letter, actions, versions, attachments } = data;
  const finalVersion = versions?.find(v => v.versionType === "final_approved");
  const aiDraftVersion = versions?.find(v => v.versionType === "ai_draft");
  const userVisibleActions = actions?.filter(
    a => a.noteVisibility === "user_visible" && a.noteText
  );
  const isPolling = POLLING_STATUSES.includes(letter.status);
  const isGeneratedLocked =
    (letter.status === "generated_locked" ||
      letter.status === "generated_unlocked") &&
    !(letter as any).submittedByAdmin;
  const isApproved =
    letter.status === "approved" ||
    letter.status === "client_approved" ||
    letter.status === "sent";
  const pdfUrl = (letter as any).pdfUrl as string | null | undefined;

  return (
    <AppLayout
      breadcrumb={[
        { label: "My Letters", href: "/letters" },
        { label: letter.subject },
      ]}
    >
      {/* Subscriber Letter Preview Modal — auto-opens for client_approval_pending */}
      <SubscriberLetterPreviewModal
        letterId={letterId}
        open={previewModalOpen}
        onOpenChange={open => {
          setPreviewModalOpen(open);
          if (!open) {
            setPreviewModalDismissed(true);
            invalidate();
          }
        }}
      />

      <div
        className="max-w-3xl mx-auto space-y-5"
        style={{
          paddingBottom:
            letter.status === "client_approval_pending" ? "5rem" : undefined,
        }}
      >
        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground leading-tight">
                  {letter.subject}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {LETTER_TYPE_CONFIG[letter.letterType]?.label ??
                    letter.letterType}
                  {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <StatusBadge status={letter.status} />
                  <span className="text-xs text-muted-foreground">
                    Submitted {new Date(letter.createdAt).toLocaleDateString()}
                  </span>
                  {isPolling &&
                    !["submitted", "researching", "drafting"].includes(
                      letter.status
                    ) && (
                      <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Updating...
                      </span>
                    )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              {/* Re-open preview modal button for client_approval_pending */}
              {letter.status === "client_approval_pending" &&
                previewModalDismissed && (
                  <Button
                    onClick={() => {
                      setPreviewModalDismissed(false);
                      setPreviewModalOpen(true);
                    }}
                    size="sm"
                    variant="outline"
                    className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 flex-1 sm:flex-initial"
                    data-testid="button-reopen-preview-modal"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Review Letter
                  </Button>
                )}
              {isApproved && finalVersion && (
                <>
                  <Button
                    onClick={handleCopy}
                    size="sm"
                    variant="outline"
                    className="bg-background flex-1 sm:flex-initial"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                  <Button
                    onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
                    size="sm"
                    className="flex-1 sm:flex-initial"
                    disabled={!pdfUrl}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {pdfUrl ? "Download PDF" : "Generating..."}
                  </Button>
                </>
              )}
              {[
                "approved",
                "client_approved",
                "sent",
                "rejected",
                "client_declined",
              ].includes(letter.status) && (
                <Button
                  onClick={handleArchive}
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={archiveMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {["client_approval_pending", "needs_changes"].includes(
          letter.status
        ) && <TransitionBanner status={letter.status} />}

        <LetterStatusDisplay status={letter.status} />

        {/*
         * Routing rule (3-way):
         *   a) Free-preview letter that hasn't unlocked yet (server has NOT
         *      stamped the draft with `freePreview: true`) → show the
         *      FreePreviewWaiting card with the 24h countdown. This branch is
         *      intentionally hoisted OUT of `isGeneratedLocked` so the user
         *      sees a consistent "preparing your draft" message throughout the
         *      whole pre-unlock lifecycle (submitted → researching → drafting
         *      → generated_locked).
         *   b) `generated_locked` + free-preview unlocked (24h elapsed) →
         *      FreePreviewViewer (full draft, non-selectable, DRAFT watermark,
         *      subscribe CTA).
         *   c) `generated_locked` non-free-preview → standard LetterPaywall
         *      (truncated preview, payment CTAs).
         *
         * The `freePreview` flag is added by server/db/letter-versions.ts only
         * when letterRequests.isFreePreview === true AND
         * freePreviewUnlockAt <= NOW(). The client trusts that flag — it
         * never sees the raw window logic.
         */}
        {letter.isFreePreview === true &&
        (aiDraftVersion as any)?.freePreview !== true ? (
          <FreePreviewWaiting
            unlockAt={(letter as any).freePreviewUnlockAt ?? null}
            subject={letter.subject}
          />
        ) : isGeneratedLocked ? (
          (aiDraftVersion as any)?.freePreview === true &&
          aiDraftVersion?.content ? (
            <FreePreviewViewer
              letterId={letterId}
              subject={letter.subject}
              draftContent={aiDraftVersion.content}
              jurisdictionState={letter.jurisdictionState}
              letterType={letter.letterType}
            />
          ) : (
            <LetterPaywall
              letterId={letterId}
              letterType={letter.letterType}
              subject={letter.subject}
              draftContent={aiDraftVersion?.content ?? undefined}
              qualityDegraded={letter.qualityDegraded === true}
              lastStatusChangedAt={(letter as any).lastStatusChangedAt ?? null}
              draftReadyEmailSent={(letter as any).draftReadyEmailSent === true}
              __isFreePreview={letter.isFreePreview === true}
            />
          )
        ) : null}

        {(letter.status === "client_approval_pending" ||
          letter.status === "needs_changes") && (
          <div id="attorney-review" className="scroll-mt-24" />
        )}

        {letter.status === "client_approval_pending" && (
          <ClientApprovalBlock
            letterId={letterId}
            revisionCount={(letter as any).clientRevisionCount ?? 0}
            onApprove={invalidate}
          />
        )}

        {letter.status === "client_approved" && (
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-800">
                    You have approved this letter
                  </p>
                  {pdfUrl ? (
                    <p className="text-sm text-emerald-700 mt-1">
                      Your PDF is ready. You can download it or send it to the
                      recipient below.
                    </p>
                  ) : (
                    <p className="text-sm text-emerald-700 mt-1 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      Your PDF is being generated and will be available for
                      download shortly.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isGeneratedLocked &&
          userVisibleActions &&
          userVisibleActions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Attorney Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {userVisibleActions.map(action => (
                  <div key={action.id} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-foreground">{action.noteText}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(action.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        {letter.status === "needs_changes" && (
          <NeedsChangesPanel
            updateText={updateText}
            onUpdateTextChange={setUpdateText}
            isPending={updateMutation.isPending}
            onSubmit={() => {
              if (updateText.trim().length < 10) {
                toast.error("Response too short", {
                  description: "Please provide at least 10 characters.",
                });
                return;
              }
              updateMutation.mutate({
                letterId,
                additionalContext: updateText,
              });
            }}
          />
        )}

        {letter.status === "client_approval_pending" && (
          <SubscriberReviewBar
            letterId={letterId}
            revisionCount={(letter as any).clientRevisionCount ?? 0}
            onAction={invalidate}
          />
        )}

        {letter.status === "client_approval_pending" && finalVersion && (
          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
                <FileText className="w-4 h-4" />
                Letter Preview — Review Before Approving
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LetterContentRenderer
                content={finalVersion.content}
                borderClass="border-blue-100"
              />
            </CardContent>
          </Card>
        )}

        {isApproved && finalVersion && (
          <ApprovedLetterPanel
            letterId={letterId}
            letterSubject={letter.subject}
            pdfUrl={pdfUrl}
            content={finalVersion.content}
            onInvalidate={invalidate}
            onCopy={handleCopy}
          />
        )}

        {letter.status === "client_declined" && (
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    You Declined This Letter
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    You chose not to proceed with this letter. If you need
                    assistance with a similar matter, you can submit a new
                    letter request.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {letter.status === "client_revision_requested" && (
          <Card className="border-violet-200 bg-violet-50/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <RotateCcw className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-800">
                    Revision Requested
                  </p>
                  <p className="text-sm text-violet-700 mt-1">
                    Your revision request has been sent to the attorney. The
                    letter will be revised and returned for your approval.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {letter.status === "rejected" && (
          <RejectionRetryBlock letterId={letterId} onRetry={invalidate} />
        )}

        {/* Delivery confirmation — shown when at least one delivery log entry exists */}
        {deliveryLogData && deliveryLogData.length > 0 && (
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Send className="w-4 h-4 text-green-600" />
                Delivery Confirmation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deliveryLogData.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-green-800 font-medium">
                      Letter delivered via {entry.deliveryMethod}
                      {entry.recipientEmail && ` to ${entry.recipientEmail}`}
                    </p>
                    {entry.deliveredAt && (
                      <p className="text-green-600 text-xs mt-0.5">
                        {new Date(entry.deliveredAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {attachments && attachments.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Attachments ({attachments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {attachments.map(att => (
                <a
                  key={att.id}
                  href={att.storageUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">
                    {att.fileName ?? "Attachment"}
                  </span>
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
