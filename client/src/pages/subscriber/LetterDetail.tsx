import AppLayout from "@/components/shared/AppLayout";
import { LetterPaywall } from "@/components/LetterPaywall";
import DraftPreviewViewer from "@/components/DraftPreviewViewer";
import { DraftPreviewWaiting } from "@/components/DraftPreviewWaiting";
import { FreePreviewUpsellBanner } from "@/components/FreePreviewUpsellBanner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  ArrowLeft,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Link, useParams, useSearch } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLetterRealtime } from "@/hooks/useLetterRealtime";
import { SubscriberReviewBar } from "@/components/shared/SubscriberReviewBar";
import { SubscriberLetterPreviewModal } from "@/components/shared/SubscriberLetterPreviewModal";
import { ClientApprovalBlock } from "@/components/subscriber/letter-detail/ClientApprovalBlock";
import { RejectionRetryBlock } from "@/components/subscriber/letter-detail/RejectionRetryBlock";
import { LetterStatusDisplay } from "@/components/subscriber/letter-detail/LetterStatusDisplay";
import { NeedsChangesPanel } from "@/components/subscriber/letter-detail/NeedsChangesPanel";
import { ApprovedLetterPanel } from "@/components/subscriber/letter-detail/ApprovedLetterPanel";
import { LetterContentRenderer } from "@/components/subscriber/letter-detail/LetterContentRenderer";

// Sub-components
import { TransitionBanner } from "@/components/subscriber/letter-detail/TransitionBanner";
import { LetterHeader } from "@/components/subscriber/letter-detail/LetterHeader";
import { ActionButtons } from "@/components/subscriber/letter-detail/ActionButtons";
import { StatusSpecificBanners } from "@/components/subscriber/letter-detail/StatusSpecificBanners";
import { AttorneyNotes } from "@/components/subscriber/letter-detail/AttorneyNotes";
import { DeliveryConfirmation } from "@/components/subscriber/letter-detail/DeliveryConfirmation";
import { AttachmentsList } from "@/components/subscriber/letter-detail/AttachmentsList";

const POLLING_STATUSES = [
  "submitted",
  "free_preview_waiting",
  "researching",
  "drafting",
  "PROCESSED_HIDDEN",
  "ai_generation_completed_hidden",
  "pending_review",
  "under_review",
  "client_approval_pending",
  "client_revision_requested",
  "client_approved",
  "approved",
];

const STATUS_LABELS: Record<string, string> = {
  free_preview_waiting: "Your professional draft is being prepared.",
  researching: "Our team is researching your legal situation...",
  drafting: "Drafting your letter...",
  PROCESSED_HIDDEN: "Finalizing your professional draft...",
  ai_generation_completed_hidden: "Finalizing your professional draft...",
  letter_released_to_subscriber: "Your professional draft is ready!",
  generated_locked: "Your professional draft is ready!",
  attorney_review_upsell_shown: "Your professional draft is ready!",
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
  // Upsell banner: persists dismissal in sessionStorage so it doesn't re-pop on
  // every status refresh during the same session. The previous Dialog re-popped
  // every 5 minutes which felt like a paywall — the new banner appears once,
  // can be dismissed, and stays dismissed.
  const upsellDismissKey = `ttml.upsell-dismissed.letter-${letterId}`;
  const [upsellBannerOpen, setUpsellBannerOpen] = useState(false);
  const [upsellDismissed, setUpsellDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(upsellDismissKey) === "1";
    } catch {
      return false;
    }
  });

  const { data, isLoading, error } = trpc.letters.detail.useQuery(
    { id: letterId },
    {
      enabled: !!letterId,
      refetchInterval: query => {
        const letter = query.state.data?.letter as any;
        const status = letter?.subscriberDisplayStatus ?? letter?.status;
        return status && POLLING_STATUSES.includes(status) ? 10000 : false;
      },
    }
  );

  // Show the attorney-review upsell banner only when:
  //   1. Letter is on the free-preview path AND draft is unlocked
  //   2. Status is in a PRE-PAYMENT state (subscriber hasn't moved past the
  //      upsell point yet). Once the letter is in pending_review/under_review/
  //      approved/sent (paid path) or in client_approval flow, the upsell is
  //      irrelevant and would feel out of place.
  //   3. User hasn't already dismissed it this session.
  // The banner appears once with a soft 1.5s delay (lets the page settle).
  const UPSELL_ELIGIBLE_STATUSES = new Set([
    "letter_released_to_subscriber",
    "attorney_review_upsell_shown",
    "attorney_review_checkout_started",
    "generated_locked",
    "generated_unlocked",
  ]);
  useEffect(() => {
    if (upsellDismissed) return;
    if (upsellBannerOpen) return;

    if (data?.letter?.isFreePreview !== true) return;

    const aiDraftVersion = data?.versions?.find(
      (v: any) => v.versionType === "ai_draft"
    );
    const draftPreviewUnlocked =
      ((aiDraftVersion as any)?.draftPreview === true ||
        (aiDraftVersion as any)?.freePreview === true) &&
      Boolean(aiDraftVersion?.content);
    if (!draftPreviewUnlocked) return;

    const status = data?.letter?.status as string | undefined;
    if (!status || !UPSELL_ELIGIBLE_STATUSES.has(status)) return;

    const timer = setTimeout(() => {
      setUpsellBannerOpen(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    data?.letter?.isFreePreview,
    data?.letter?.status,
    data?.versions,
    upsellDismissed,
    upsellBannerOpen,
  ]);

  const dismissUpsellBanner = () => {
    setUpsellBannerOpen(false);
    setUpsellDismissed(true);
    try {
      sessionStorage.setItem(upsellDismissKey, "1");
    } catch {
      // sessionStorage may be unavailable (private browsing, etc.) — fine,
      // dismissal still holds for the React-state lifetime of this page.
    }
  };

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

  const utils = trpc.useUtils();
  const invalidate = () => utils.letters.detail.invalidate({ id: letterId });

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
      if (newStatus === "client_approval_pending") {
        setPreviewModalDismissed(false);
        setPreviewModalOpen(true);
      }
    },
  });

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
  const displayStatus = (letter as any).subscriberDisplayStatus ?? letter.status;
  const finalVersion = versions?.find(v => v.versionType === "final_approved");
  const aiDraftVersion = versions?.find(v => v.versionType === "ai_draft");
  const userVisibleActions = actions?.filter(
    a => a.noteVisibility === "user_visible" && a.noteText
  );
  const isPolling = POLLING_STATUSES.includes(displayStatus);
  const draftPreviewUnlocked =
    ((aiDraftVersion as any)?.draftPreview === true ||
      (aiDraftVersion as any)?.freePreview === true) &&
    Boolean(aiDraftVersion?.content);
  const freePreviewUnlocked = letter.isFreePreview === true && draftPreviewUnlocked;
  const isGeneratedLocked =
    (displayStatus === "generated_locked" ||
      displayStatus === "generated_unlocked" ||
      displayStatus === "letter_released_to_subscriber" ||
      displayStatus === "attorney_review_upsell_shown") &&
    !(letter as any).submittedByAdmin;
  const isApproved =
    letter.status === "approved" ||
    letter.status === "client_approved" ||
    letter.status === "sent";
  const pdfUrl = (letter as any).pdfUrl as string | null | undefined;

  // Draft-preview UI (DraftPreviewViewer / DraftPreviewWaiting) is a pre-review
  // lead magnet — it only makes sense BEFORE the letter has been submitted for
  // attorney review. Once the letter advances to `attorney_review_payment_
  // confirmed` or beyond (pending_review, under_review, approved, client_*,
  // sent, etc.), the upsell card and the watermarked draft become irrelevant
  // — the letter is already in / past the paid review pipeline. Without this
  // gate, the DraftPreviewViewer keeps rendering on top of the
  // ApprovedLetterPanel because `aiDraftVersion.draftPreview` is still `true`
  // (the server never clears the flag — the draft itself doesn't change).
  // Reproduced when admin force-transitions a draft-preview letter through the
  // payment statuses + attorney approves: subscriber sees the upsell stacked
  // on top of the approved letter view.
  const DRAFT_PREVIEW_VISIBLE_STATUSES = new Set([
    "free_preview_waiting",
    "ai_generation_completed_hidden",
    "letter_released_to_subscriber",
    "attorney_review_upsell_shown",
    "attorney_review_checkout_started",
    "generated_locked",
    "generated_unlocked",
    "pipeline_failed",
  ]);
  const isDraftPreviewPhase =
    Boolean((letter as any).freePreviewUnlockAt) &&
    DRAFT_PREVIEW_VISIBLE_STATUSES.has(displayStatus as string);

  return (
    <AppLayout
      breadcrumb={[
        { label: "My Letters", href: "/letters" },
        { label: letter.subject },
      ]}
    >
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

      <FreePreviewUpsellBanner
        open={upsellBannerOpen}
        onDismiss={dismissUpsellBanner}
      />

      <div
        className="max-w-3xl mx-auto space-y-5"
        style={{
          paddingBottom:
            letter.status === "client_approval_pending" ? "5rem" : undefined,
        }}
      >
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <LetterHeader
              subject={letter.subject}
              letterType={letter.letterType}
              jurisdictionState={letter.jurisdictionState}
              status={displayStatus}
              approvedByRole={letter.approvedByRole}
              createdAt={letter.createdAt}
              isPolling={isPolling}
            />
            <ActionButtons
              status={letter.status}
              previewModalDismissed={previewModalDismissed}
              onOpenPreview={() => {
                setPreviewModalDismissed(false);
                setPreviewModalOpen(true);
              }}
              isApproved={isApproved}
              hasFinalVersion={!!finalVersion}
              pdfUrl={pdfUrl}
              onCopy={handleCopy}
              onArchive={handleArchive}
              archivePending={archiveMutation.isPending}
            />
          </div>
        </div>

        {["client_approval_pending", "needs_changes"].includes(
          letter.status
        ) && <TransitionBanner status={letter.status} />}

        <LetterStatusDisplay
          status={displayStatus}
          isFreePreview={letter.isFreePreview === true}
          freePreviewUnlocked={freePreviewUnlocked}
        />

        {isDraftPreviewPhase && !draftPreviewUnlocked ? (
          <DraftPreviewWaiting subject={letter.subject} />
        ) : isDraftPreviewPhase && draftPreviewUnlocked ? (
          <DraftPreviewViewer
            letterId={letterId}
            subject={letter.subject}
            draftContent={aiDraftVersion?.content ?? ""}
            jurisdictionState={letter.jurisdictionState}
            letterType={letter.letterType}
          />
        ) : isGeneratedLocked ? (
          <LetterPaywall
            letterId={letterId}
            letterType={letter.letterType}
            subject={letter.subject}
            draftContent={aiDraftVersion?.content ?? undefined}
            qualityDegraded={letter.qualityDegraded === true}
            lastStatusChangedAt={(letter as any).lastStatusChangedAt ?? null}
            draftReadyEmailSent={(letter as any).draftReadyEmailSent === true}
            __isFreePreview={!!letter.isFreePreview}
          />
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

        <StatusSpecificBanners status={letter.status} pdfUrl={pdfUrl} />

        {!isGeneratedLocked && userVisibleActions && (
          <AttorneyNotes actions={userVisibleActions} />
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
            status={letter.status}
            onInvalidate={invalidate}
            onCopy={handleCopy}
          />
        )}

        <DeliveryConfirmation deliveryLogs={deliveryLogData || []} />

        <AttachmentsList attachments={attachments || []} />
      </div>
    </AppLayout>
  );
}

