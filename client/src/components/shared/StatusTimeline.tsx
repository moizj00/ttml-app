import { CheckCircle2, Circle, Clock, AlertTriangle, XCircle, Loader2, FileCheck, Gavel } from "lucide-react";

/**
 * Simplified status timeline — single-path flow:
 *   submitted → researching → drafting → generated_locked → pending_review → under_review → approved/rejected/needs_changes
 *
 * generated_locked: paywall — subscriber must pay to unlock attorney review.
 * No generated_unlocked step (removed in Phase 69).
 */
const STATUS_STEPS = [
  { key: "submitted",        label: "Submitted",       description: "Intake received" },
  { key: "researching",      label: "Researching",     description: "Legal research in progress" },
  { key: "drafting",         label: "Drafting",        description: "Letter being drafted" },
  { key: "generated_locked", label: "Draft Ready",     description: "Pay to submit for review" },
  { key: "pending_review",   label: "Awaiting Review", description: "In the attorney queue" },
  { key: "under_review",     label: "Under Review",    description: "Attorney reviewing" },
] as const;

const TERMINAL_STATUSES: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  approved:                   { label: "Approved",            icon: CheckCircle2,  color: "text-emerald-500" },
  client_approval_pending:    { label: "Awaiting Your Approval", icon: Clock,      color: "text-teal-500" },
  client_revision_requested:  { label: "Revision Requested",  icon: AlertTriangle, color: "text-violet-500" },
  client_approved:            { label: "Client Approved",      icon: CheckCircle2,  color: "text-emerald-500" },
  client_declined:            { label: "Declined",             icon: XCircle,       color: "text-red-500" },
  sent:                       { label: "Sent",                 icon: CheckCircle2,  color: "text-sky-500" },
  rejected:                   { label: "Rejected",             icon: XCircle,       color: "text-red-500" },
  needs_changes:              { label: "Changes Requested",    icon: AlertTriangle, color: "text-amber-500" },
};

interface StatusTimelineProps {
  currentStatus: string;
  className?: string;
}

export default function StatusTimeline({ currentStatus, className }: StatusTimelineProps) {
  // Map legacy generated_unlocked to generated_locked for display purposes
  const displayStatus = currentStatus === "generated_unlocked" ? "generated_locked" : currentStatus;
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === displayStatus);
  const isTerminal = displayStatus in TERMINAL_STATUSES;

  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Progress</h4>
      <div className="relative">
        {STATUS_STEPS.map((step, idx) => {
          const isComplete = currentIdx > idx || isTerminal;
          const isCurrent = currentIdx === idx && !isTerminal;
          const isInProgress = isCurrent && (step.key === "researching" || step.key === "drafting");
          const isDraftReady = isCurrent && step.key === "generated_locked";
          const isWaiting = isCurrent && (step.key === "pending_review" || step.key === "under_review");

          return (
            <div key={step.key} className="flex items-start gap-3 relative">
              {/* Vertical connector line */}
              {idx < STATUS_STEPS.length - 1 && (
                <div
                  className={`absolute left-[11px] top-[24px] w-0.5 h-6 ${
                    isComplete ? "bg-emerald-500" : "bg-border"
                  }`}
                />
              )}
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {isComplete ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                ) : isCurrent ? (
                  isInProgress ? (
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  ) : isDraftReady ? (
                    <FileCheck className="w-6 h-6 text-yellow-500" />
                  ) : isWaiting ? (
                    <Gavel className="w-6 h-6 text-amber-500" />
                  ) : (
                    <Clock className="w-6 h-6 text-blue-500" />
                  )
                ) : (
                  <Circle className="w-6 h-6 text-muted-foreground/30" />
                )}
              </div>
              {/* Label */}
              <div className="pb-4">
                <span
                  className={`text-sm block ${
                    isComplete
                      ? "text-emerald-600 font-medium"
                      : isDraftReady
                      ? "text-yellow-700 font-semibold"
                      : isWaiting
                      ? "text-amber-600 font-semibold"
                      : isCurrent
                      ? "text-blue-600 font-semibold"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                  {isInProgress && <span className="ml-2 text-xs text-blue-400">(in progress...)</span>}
                  {isDraftReady && <span className="ml-2 text-xs text-yellow-500">(payment required)</span>}
                </span>
                {isCurrent && (
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Terminal status */}
        {isTerminal && (
          <div className="flex items-start gap-3 relative">
            <div className="flex-shrink-0 mt-0.5">
              {(() => {
                const terminal = TERMINAL_STATUSES[displayStatus];
                if (!terminal) return null;
                const TIcon = terminal.icon;
                return <TIcon className={`w-6 h-6 ${terminal.color}`} />;
              })()}
            </div>
            <span className={`text-sm font-semibold ${TERMINAL_STATUSES[displayStatus]?.color ?? ""}`}>
              {TERMINAL_STATUSES[displayStatus]?.label ?? displayStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
