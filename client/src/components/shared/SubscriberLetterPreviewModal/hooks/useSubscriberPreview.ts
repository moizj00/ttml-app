import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const MAX_REVISIONS = 5;
const WARN_REVISIONS = 3;
const REVISION_FEE_USD = 20;

export type SubscriberAction = "send" | "revision" | "decline" | null;

export function useSubscriberPreview(letterId: number, open: boolean) {
  const utils = trpc.useUtils();

  // Fetch letter detail (subscriber-safe)
  const { data, isLoading, error } = trpc.letters.detail.useQuery(
    { id: letterId },
    {
      enabled: open && !!letterId,
      refetchInterval: (query) => {
        const status = query.state.data?.letter?.status;
        if (status && ["client_approval_pending", "client_revision_requested"].includes(status)) {
          return 10000;
        }
        return false;
      },
    }
  );

  // Action panel state
  const [activeAction, setActiveAction] = useState<SubscriberAction>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  // Send dialog state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subjectOverride, setSubjectOverride] = useState("");
  const [sendNote, setSendNote] = useState("");

  const invalidate = useCallback(() => {
    utils.letters.detail.invalidate({ id: letterId });
    utils.letters.myLetters.invalidate();
  }, [utils, letterId]);

  // Mutations
  const clientApprove = trpc.letters.clientApprove.useMutation({
    onSuccess: (res) => {
      const result = res as {
        success: boolean;
        pdfUrl?: string;
        recipientSent?: boolean;
        recipientSendError?: string;
      };
      if (result.recipientSent) {
        toast.success("Letter approved & sent!", {
          description: "Your PDF has been generated and the letter sent to the recipient.",
        });
      } else if (result.recipientSendError) {
        toast.warning("Letter approved, but sending failed", {
          description: "Your PDF is ready for download. You can retry sending later.",
        });
      } else {
        toast.success("Letter approved!", {
          description: "Your PDF is being generated and will be available for download shortly.",
        });
      }
      setActiveAction(null);
      setRecipientEmail("");
      setSubjectOverride("");
      setSendNote("");
      invalidate();
    },
    onError: (err) => toast.error("Approval failed", { description: err.message }),
  });

  const clientRequestRevision = trpc.letters.clientRequestRevision.useMutation({
    onSuccess: (res) => {
      const result = res as {
        success: boolean;
        requiresPayment?: boolean;
        checkoutUrl?: string;
        revisionCount?: number;
        revisionWarning?: string;
      };
      if (result.requiresPayment && result.checkoutUrl) {
        toast.info("Redirecting to payment", {
          description: `A $${REVISION_FEE_USD} revision consultation fee applies.`,
        });
        setTimeout(() => {
          window.location.href = result.checkoutUrl!;
        }, 1500);
        return;
      }
      if (result.revisionWarning) {
        toast.warning("Revision requested", { description: result.revisionWarning });
      } else {
        toast.success("Revision requested", {
          description: "Your feedback has been sent to the attorney.",
        });
      }
      setActiveAction(null);
      setRevisionNotes("");
      invalidate();
    },
    onError: (err) => toast.error("Request failed", { description: err.message }),
  });

  const clientDecline = trpc.letters.clientDecline.useMutation({
    onSuccess: () => {
      toast.info("Letter declined", { description: "The letter has been declined." });
      setActiveAction(null);
      setDeclineReason("");
      invalidate();
    },
    onError: (err) => toast.error("Decline failed", { description: err.message }),
  });

  // Derived data
  const letter = data?.letter;
  const versions = data?.versions ?? [];
  const actions = data?.actions ?? [];
  const finalVersion = versions.find((v) => v.versionType === "final_approved");
  const userVisibleActions = actions.filter(
    (a) => a.noteVisibility === "user_visible" && a.noteText
  );

  const revisionCount = (letter as any)?.clientRevisionCount ?? 0;
  const revisionsRemaining = MAX_REVISIONS - revisionCount;
  const revisionLimitReached = revisionCount >= MAX_REVISIONS;
  const revisionLimitWarning = revisionCount >= WARN_REVISIONS && !revisionLimitReached;

  const isClientApprovalPending = letter?.status === "client_approval_pending";
  const isBusy =
    clientApprove.isPending ||
    clientRequestRevision.isPending ||
    clientDecline.isPending;

  const resetState = () => {
    setActiveAction(null);
    setRevisionNotes("");
    setDeclineReason("");
    setRecipientEmail("");
    setSubjectOverride("");
    setSendNote("");
  };

  return {
    // Data
    letter,
    versions,
    finalVersion,
    userVisibleActions,
    isLoading,
    error,
    // Status flags
    isClientApprovalPending,
    isBusy,
    // Revision limits
    revisionCount,
    revisionsRemaining,
    revisionLimitReached,
    revisionLimitWarning,
    // Action state
    activeAction,
    setActiveAction,
    revisionNotes,
    setRevisionNotes,
    declineReason,
    setDeclineReason,
    // Send dialog state
    recipientEmail,
    setRecipientEmail,
    subjectOverride,
    setSubjectOverride,
    sendNote,
    setSendNote,
    // Mutations
    clientApprove,
    clientRequestRevision,
    clientDecline,
    // Helpers
    invalidate,
    resetState,
    REVISION_FEE_USD,
  };
}
