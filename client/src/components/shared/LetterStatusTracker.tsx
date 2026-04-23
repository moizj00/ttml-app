import { CheckCircle, Loader2, XCircle, AlertTriangle } from "lucide-react";
import {
  LETTER_STAGES,
  getStageForStatus,
  getStageProgress,
  TERMINAL_ERROR_STATUSES,
} from "@/lib/letterStages";
import { useStepTransition, useProgressFill } from "@/hooks/useAnimations";

interface LetterStatusTrackerProps {
  status: string;
  size?: "compact" | "standard" | "expanded";
}

// ─── Sub-stage descriptions for expanded variant ──────────────────────────────
const STATUS_DESCRIPTIONS: Record<string, string> = {
  submitted: "Your request has been received and queued for processing.",
  researching:
    "We're researching relevant laws and regulations for your matter.",
  drafting: "Your letter is being drafted based on our research.",
  generated_locked:
    "Your draft is ready. Unlock to proceed with attorney review.",
  generated_unlocked: "Your draft is ready for attorney review.",
  pending_review:
    "Your letter is in the attorney review queue. A licensed attorney will pick it up shortly.",
  under_review:
    "A licensed attorney has claimed your letter and is actively reviewing and editing it.",
  needs_changes:
    "The reviewing attorney has requested additional information or corrections from you.",
  client_approval_pending:
    "The attorney has finalized your letter. Please review and approve it.",
  client_revision_requested:
    "Your revision request has been sent. The attorney will revise and return the letter.",
  approved:
    "Your letter has been approved by an attorney. Your PDF is ready to download.",
  client_approved:
    "You have approved this letter. Your PDF is ready or being generated.",
  sent: "Your letter has been sent. The process is complete.",
  pipeline_failed:
    "We encountered an issue processing your request. Our team has been notified and will follow up shortly.",
  rejected: "This letter request was not accepted for processing.",
  client_declined: "You declined the finalized letter.",
};

// ─── Compact: 5-segment horizontal bar (for My Letters rows) ──────────────────

function CompactTracker({ status }: { status: string }) {
  const isError = TERMINAL_ERROR_STATUSES.includes(status);
  const { stageIndex } = getStageForStatus(status);
  const targetPercent = isError ? 0 : getStageProgress(status);
  const fill = useProgressFill(targetPercent);

  if (isError) {
    return (
      <div
        className="flex items-center gap-1 w-full"
        data-testid="letter-status-compact"
      >
        {LETTER_STAGES.map(stage => (
          <div
            key={stage.key}
            className="flex-1 h-1 rounded-full bg-destructive/40"
            data-testid={`stage-segment-${stage.key}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 w-full"
      data-testid="letter-status-compact"
    >
      {LETTER_STAGES.map((stage, idx) => {
        const isComplete = idx < stageIndex;
        const isCurrent = idx === stageIndex;

        return (
          <div
            key={stage.key}
            className="flex-1 h-1 rounded-full overflow-hidden bg-border"
            data-testid={`stage-segment-${stage.key}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isComplete
                  ? "bg-emerald-500"
                  : isCurrent
                    ? "bg-primary animate-pulse"
                    : "bg-transparent"
              }`}
              style={{
                width: isComplete
                  ? "100%"
                  : isCurrent
                    ? `${Math.min(100, Math.max(10, fill))}%`
                    : "0%",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Standard: 5 circles connected by lines (for Dashboard cards) ─────────────

function StandardTracker({ status }: { status: string }) {
  const isError = TERMINAL_ERROR_STATUSES.includes(status);
  const { stageIndex } = getStageForStatus(status);
  const { displayStep } = useStepTransition(stageIndex);

  const isActiveProcessing = [
    "researching",
    "drafting",
    "pending_review",
    "under_review",
  ].includes(status);
  const lastIdx = LETTER_STAGES.length - 1;

  return (
    <div
      className="flex items-center w-full"
      data-testid="letter-status-standard"
    >
      {LETTER_STAGES.map((stage, idx) => {
        const isComplete = !isError && idx < displayStep;
        const isCurrent = !isError && idx === displayStep;
        const isTerminalStage = isError && idx === lastIdx;
        const isLast = idx === lastIdx;
        const Icon = stage.icon;

        const showSpinner = isCurrent && isActiveProcessing;

        return (
          <div
            key={stage.key}
            className="flex items-center flex-1 last:flex-none"
          >
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isTerminalStage
                    ? "bg-destructive text-destructive-foreground ring-2 ring-destructive/20"
                    : isComplete
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
                        : "bg-muted text-muted-foreground/40"
                }`}
                data-testid={`stage-circle-${stage.key}`}
              >
                {isTerminalStage ? (
                  <XCircle className="w-4 h-4" />
                ) : isComplete ? (
                  <CheckCircle className="w-4 h-4" />
                ) : showSpinner ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>

              {/* Labels: short on all mobile, full on md+ */}
              <span
                className={`text-[10px] mt-1 text-center leading-tight max-w-[52px] ${
                  isTerminalStage
                    ? "text-destructive font-semibold"
                    : isComplete
                      ? "text-emerald-600 font-medium"
                      : isCurrent
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground/40"
                }`}
                data-testid={`stage-label-${stage.key}`}
              >
                <span className="md:hidden">{stage.shortLabel}</span>
                <span className="hidden md:inline">{stage.label}</span>
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                className={`flex-1 h-0.5 mx-1 rounded transition-all duration-300 ${
                  idx < displayStep && !isError ? "bg-emerald-500" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Expanded: vertical timeline (for Letter Detail) ─────────────────────────

function ExpandedTracker({ status }: { status: string }) {
  const isError = TERMINAL_ERROR_STATUSES.includes(status);
  const { stageIndex } = getStageForStatus(status);
  const { displayStep } = useStepTransition(stageIndex);

  const isActiveProcessing = [
    "researching",
    "drafting",
    "pending_review",
    "under_review",
  ].includes(status);
  const lastIdx = LETTER_STAGES.length - 1;

  const errorStageLabel =
    status === "rejected"
      ? "Rejected"
      : status === "client_declined"
        ? "Declined"
        : "Pipeline Failed";

  const errorDescription =
    status === "rejected"
      ? "Your letter was not approved. Please contact support or resubmit."
      : status === "client_declined"
        ? "You declined this letter. It is now closed."
        : "The pipeline encountered an error. You may resubmit.";

  return (
    <div className="flex flex-col gap-0" data-testid="letter-status-expanded">
      {LETTER_STAGES.map((stage, idx) => {
        const isComplete = !isError && idx < displayStep;
        const isCurrent = !isError && idx === displayStep;
        const isTerminalStage = isError && idx === lastIdx;
        const isLast = idx === lastIdx;
        const Icon = stage.icon;

        const showSpinner = isCurrent && isActiveProcessing;

        const description = isCurrent
          ? (STATUS_DESCRIPTIONS[status] ?? stage.description)
          : isTerminalStage
            ? errorDescription
            : stage.description;

        return (
          <div key={stage.key} className="flex gap-4">
            {/* Left: icon + vertical line */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex flex-shrink-0 items-center justify-center transition-all duration-300 ${
                  isTerminalStage
                    ? "bg-destructive/10 text-destructive"
                    : isComplete
                      ? "bg-violet-100 text-violet-600"
                      : isCurrent
                        ? "bg-violet-600 text-white shadow-md"
                        : "bg-muted text-muted-foreground/40"
                }`}
                data-testid={`stage-expanded-${stage.key}`}
              >
                {isTerminalStage ? (
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : isComplete ? (
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : showSpinner ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </div>
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 my-1 min-h-[20px] sm:min-h-[28px] rounded-full transition-all duration-300 ${
                    isComplete && !isError ? "bg-violet-300" : "bg-border"
                  }`}
                />
              )}
            </div>

            {/* Right: label + description */}
            <div className="pb-5 sm:pb-6 flex-1 min-w-0">
              <p
                className={`text-xs sm:text-sm font-semibold leading-tight ${
                  isTerminalStage
                    ? "text-destructive"
                    : isComplete
                      ? "text-violet-700"
                      : isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                }`}
                data-testid={`stage-expanded-label-${stage.key}`}
              >
                {isCurrent && (
                  <span className="inline-block bg-violet-600 text-white text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded mr-1.5 sm:mr-2">
                    {stage.label}
                  </span>
                )}
                {!isCurrent &&
                  (isTerminalStage ? errorStageLabel : stage.label)}
              </p>
              <p
                className={`text-[10px] sm:text-xs mt-1 leading-snug sm:leading-relaxed ${
                  isCurrent || isTerminalStage
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40"
                }`}
              >
                {description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function LetterStatusTracker({
  status,
  size = "standard",
}: LetterStatusTrackerProps) {
  if (size === "compact") return <CompactTracker status={status} />;
  if (size === "expanded") return <ExpandedTracker status={status} />;
  return <StandardTracker status={status} />;
}
