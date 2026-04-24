import {
  FileText,
  FlaskConical,
  FileCheck,
  Gavel,
  CheckCircle2,
} from "lucide-react";

export type StageKey =
  | "submitted"
  | "research_draft"
  | "draft_ready"
  | "attorney_review"
  | "complete";

export interface LetterStage {
  key: StageKey;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  statuses: string[];
}

export const LETTER_STAGES: LetterStage[] = [
  {
    key: "submitted",
    label: "Submitted",
    shortLabel: "Submit",
    description: "Your request has been received and queued for processing.",
    icon: FileText,
    statuses: ["submitted"],
  },
  {
    key: "research_draft",
    label: "Research & Draft",
    shortLabel: "Research",
    description: "Legal research and initial drafting are being conducted.",
    icon: FlaskConical,
    statuses: ["researching", "drafting", "PROCESSED_HIDDEN"],
  },
  {
    key: "draft_ready",
    label: "Draft Ready",
    shortLabel: "Draft",
    description: "Your letter is ready for attorney review.",
    icon: FileCheck,
    statuses: [
      "letter_released_to_subscriber",
      "generated_locked",
      "generated_unlocked",
      "attorney_review_upsell_shown",
      "attorney_review_checkout_started",
      "attorney_review_payment_confirmed",
    ],
  },
  {
    key: "attorney_review",
    label: "Attorney Review",
    shortLabel: "Review",
    description:
      "An attorney is reviewing, finalizing, and preparing your letter.",
    icon: Gavel,
    statuses: [
      "pending_review",
      "under_review",
      "needs_changes",
      "client_approval_pending",
      "client_revision_requested",
      "client_approved",
    ],
  },
  {
    key: "complete",
    label: "Complete",
    shortLabel: "Done",
    description:
      "Your letter has been approved by an attorney. Your PDF is ready.",
    icon: CheckCircle2,
    statuses: ["approved", "sent"],
  },
];

export const TERMINAL_ERROR_STATUSES = [
  "rejected",
  "client_declined",
  "pipeline_failed",
];

export function getStageForStatus(status: string): {
  stageIndex: number;
  stage: LetterStage | null;
} {
  if (TERMINAL_ERROR_STATUSES.includes(status)) {
    const lastIdx = LETTER_STAGES.length - 1;
    return { stageIndex: lastIdx, stage: LETTER_STAGES[lastIdx] };
  }
  const idx = LETTER_STAGES.findIndex(s => s.statuses.includes(status));
  return {
    stageIndex: idx >= 0 ? idx : 0,
    stage: idx >= 0 ? LETTER_STAGES[idx] : LETTER_STAGES[0],
  };
}

export function getStageProgress(status: string): number {
  if (TERMINAL_ERROR_STATUSES.includes(status)) return 0;
  if (status === "sent" || status === "approved") return 100;

  const { stageIndex } = getStageForStatus(status);
  if (stageIndex < 0) return 0;

  const total = LETTER_STAGES.length;
  const perStage = 100 / total;
  return Math.round(perStage * stageIndex + perStage * 0.5);
}
