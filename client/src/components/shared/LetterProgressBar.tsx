import { CheckCircle2, Clock, FileCheck, Gavel, XCircle, AlertTriangle } from "lucide-react";

/**
 * Horizontal 4-step progress bar for the subscriber letter detail view.
 *
 * Steps:
 *   1. Intake Received   — submitted, researching, drafting
 *   2. Draft Ready       — generated_locked
 *   3. Under Review      — pending_review, under_review, client_approval_pending, needs_changes
 *   4. Approved          — approved, client_approved
 *
 * rejected: terminal failure shown on step 4.
 */

const STEPS = [
  {
    key: "intake",
    label: "Intake Received",
    icon: Clock,
    statuses: ["submitted", "researching", "drafting"],
  },
  {
    key: "draft",
    label: "Draft Ready",
    icon: FileCheck,
    statuses: ["generated_locked"],
  },
  {
    key: "review",
    label: "Attorney Review",
    icon: Gavel,
    statuses: ["pending_review", "under_review", "client_approval_pending", "needs_changes"],
  },
  {
    key: "approved",
    label: "Approved",
    icon: CheckCircle2,
    statuses: ["approved", "client_approved"],
  },
] as const;

function getStepIndex(status: string): number {
  for (let i = 0; i < STEPS.length; i++) {
    if ((STEPS[i].statuses as readonly string[]).includes(status)) return i;
  }
  return -1;
}

interface LetterProgressBarProps {
  status: string;
}

export default function LetterProgressBar({ status }: LetterProgressBarProps) {
  const currentIdx = getStepIndex(status);
  const isRejected = status === "rejected";
  const isApproved = status === "approved" || status === "client_approved";
  const isNeedsChanges = status === "needs_changes";

  return (
    <div className="w-full">
      <div className="flex items-center w-full">
        {STEPS.map((step, idx) => {
          const isComplete = isApproved
            ? true
            : isRejected
            ? idx < STEPS.length - 1
            : currentIdx > idx;
          const isCurrent = !isApproved && !isRejected && currentIdx === idx;
          const isPending = !isComplete && !isCurrent;

          const Icon = step.icon;

          const circleClass = isComplete
            ? "bg-emerald-500 border-emerald-500 text-white"
            : isCurrent
            ? isNeedsChanges && idx === 2
              ? "bg-amber-50 border-amber-400 text-amber-600"
              : "bg-primary/10 border-primary text-primary"
            : isRejected && idx === STEPS.length - 1
            ? "bg-red-50 border-red-400 text-red-500"
            : "bg-muted border-border text-muted-foreground/40";

          const labelClass = isComplete
            ? "text-emerald-600 font-semibold"
            : isCurrent
            ? isNeedsChanges && idx === 2
              ? "text-amber-700 font-semibold"
              : "text-primary font-semibold"
            : isRejected && idx === STEPS.length - 1
            ? "text-red-500 font-semibold"
            : "text-muted-foreground/50";

          const connectorClass =
            idx < STEPS.length - 1
              ? isComplete || (isApproved && idx < STEPS.length - 1)
                ? "bg-emerald-400"
                : "bg-border"
              : "";

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${circleClass}`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isRejected && idx === STEPS.length - 1 ? (
                    <XCircle className="w-5 h-5" />
                  ) : isNeedsChanges && idx === 2 ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span className={`text-xs text-center leading-tight px-0.5 ${labelClass}`}>
                  {isRejected && idx === STEPS.length - 1
                    ? "Rejected"
                    : isNeedsChanges && idx === 2
                    ? "Changes Requested"
                    : step.label}
                </span>
              </div>

              {/* Connector line */}
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full ${connectorClass}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
