import {
  FileText,
  Search,
  Lock,
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════
// UNIFIED 5-STAGE MODEL FOR LETTER STATUS DISPLAY
// ═══════════════════════════════════════════════════════
//
// Single source of truth replacing scattered stage definitions across
// Dashboard (7-step PipelineStepper), LetterDetail (4-step LetterProgressBar),
// and StatusTimeline (6-step vertical timeline).
//
// Maps all 15+ letter statuses into 5 logical stages that honestly represent
// the pipeline flow. Used by LetterStatusTracker in compact/standard/expanded variants.

export const LETTER_STAGES = [
  {
    key: "submitted",
    label: "Submitted",
    shortLabel: "Sub",
    icon: FileText,
    description: "Your request has been received and queued for processing.",
    statuses: ["submitted"],
  },
  {
    key: "research_draft",
    label: "Research & Draft",
    shortLabel: "R&D",
    icon: Search,
    description: "Our team is researching applicable laws and drafting your letter.",
    statuses: ["researching", "drafting"],
    subStageDescriptions: {
      researching: "Researching applicable laws and precedents...",
      drafting: "Drafting your professional legal letter...",
    } as Record<string, string>,
  },
  {
    key: "draft_ready",
    label: "Draft Ready",
    shortLabel: "Pay",
    icon: Lock,
    description: "Your draft letter is complete. Pay to unlock attorney review.",
    statuses: ["generated_locked", "generated_unlocked"],
    isPaywall: true,
  },
  {
    key: "attorney_review",
    label: "Attorney Review",
    shortLabel: "Rev",
    icon: ShieldCheck,
    description: "A licensed attorney is reviewing your letter.",
    statuses: [
      "pending_review",
      "under_review",
      "needs_changes",
      "client_approval_pending",
      "client_revision_requested",
    ],
    subStageDescriptions: {
      pending_review: "Queued for attorney review...",
      under_review: "Attorney actively reviewing your letter...",
      needs_changes: "Attorney requested additional information.",
      client_approval_pending: "Attorney approved — awaiting your final approval.",
      client_revision_requested: "Your revision request is being processed.",
    } as Record<string, string>,
  },
  {
    key: "complete",
    label: "Complete",
    shortLabel: "Done",
    icon: CheckCircle,
    description: "Your letter is approved and ready to download.",
    statuses: ["approved", "client_approved", "sent"],
    subStageDescriptions: {
      approved: "Approved by attorney.",
      client_approved: "Approved — PDF is being generated.",
      sent: "Sent to recipient.",
    } as Record<string, string>,
  },
] as const;

export type LetterStage = (typeof LETTER_STAGES)[number];

export const TERMINAL_ERROR_STATUSES = ["rejected", "client_declined", "pipeline_failed"];

export const TERMINAL_ERROR_CONFIG: Record<
  string,
  { label: string; icon: typeof XCircle; color: string; description: string }
> = {
  rejected: {
    label: "Rejected",
    icon: XCircle,
    color: "text-red-500",
    description: "The reviewing attorney rejected this request.",
  },
  client_declined: {
    label: "Declined",
    icon: XCircle,
    color: "text-red-500",
    description: "You declined this letter.",
  },
  pipeline_failed: {
    label: "Processing Failed",
    icon: AlertTriangle,
    color: "text-red-500",
    description: "An error occurred during processing. You can retry from your dashboard.",
  },
};

/**
 * Get the stage index and metadata for a given letter status.
 */
export function getStageForStatus(status: string): {
  stageIndex: number;
  stage: LetterStage | null;
  isTerminalError: boolean;
  subStageDescription?: string;
} {
  if (TERMINAL_ERROR_STATUSES.includes(status)) {
    // pipeline_failed occurs early (during research/drafting), so show failure at stage 1
    // rejected/client_declined occur late (after attorney review), so show at last stage
    const errorStageIndex = status === "pipeline_failed" ? 1 : LETTER_STAGES.length - 1;
    return { stageIndex: errorStageIndex, stage: null, isTerminalError: true };
  }

  for (let i = 0; i < LETTER_STAGES.length; i++) {
    const stage = LETTER_STAGES[i];
    if ((stage.statuses as readonly string[]).includes(status)) {
      const subDesc = (stage as any).subStageDescriptions?.[status];
      return { stageIndex: i, stage, isTerminalError: false, subStageDescription: subDesc };
    }
  }

  // Fallback: unknown status → treat as submitted
  return { stageIndex: 0, stage: LETTER_STAGES[0], isTerminalError: false };
}

/**
 * Get a 0-100 percentage for the compact progress bar.
 * Each of the 5 stages occupies 20% of the bar.
 * Sub-statuses within a stage place the progress partway through.
 */
export function getStageProgress(status: string): number {
  const progressMap: Record<string, number> = {
    submitted: 10,
    researching: 25,
    drafting: 35,
    generated_locked: 50,
    generated_unlocked: 50,
    pending_review: 60,
    under_review: 70,
    needs_changes: 65,
    client_approval_pending: 80,
    client_revision_requested: 75,
    approved: 90,
    client_approved: 95,
    sent: 100,
    // Terminal errors
    rejected: 90,
    client_declined: 90,
    pipeline_failed: 20,
  };
  return progressMap[status] ?? 0;
}

/**
 * Whether the given status represents active processing (spinning loader).
 */
export function isActiveProcessing(status: string): boolean {
  return ["submitted", "researching", "drafting", "pending_review", "under_review", "client_revision_requested"].includes(status);
}

/**
 * Whether the status requires subscriber action.
 */
export function isActionRequired(status: string): boolean {
  return ["generated_locked", "needs_changes", "client_approval_pending"].includes(status);
}

// Re-export icons for use in components
export { Loader2 };
