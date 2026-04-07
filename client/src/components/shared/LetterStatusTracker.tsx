import { CheckCircle } from "lucide-react";
import {
  LETTER_STAGES,
  TERMINAL_ERROR_STATUSES,
  TERMINAL_ERROR_CONFIG,
  getStageForStatus,
  getStageProgress,
  isActiveProcessing,
  Loader2,
} from "@/lib/letterStages";
import { useStepTransition, useProgressFill, useReducedMotion } from "@/hooks/useAnimations";

// ═══════════════════════════════════════════════════════
// UNIFIED LETTER STATUS TRACKER
// ═══════════════════════════════════════════════════════
//
// One component, three sizes:
//   compact  — segmented progress bar for My Letters list rows
//   standard — horizontal stepper for Dashboard letter cards
//   expanded — vertical timeline for Letter Detail page

interface LetterStatusTrackerProps {
  status: string;
  size: "compact" | "standard" | "expanded";
  className?: string;
}

export default function LetterStatusTracker({
  status,
  size,
  className = "",
}: LetterStatusTrackerProps) {
  const { stageIndex, isTerminalError, subStageDescription } = getStageForStatus(status);
  const isComplete = LETTER_STAGES[LETTER_STAGES.length - 1].statuses.includes(status as any);
  const active = isActiveProcessing(status);

  if (size === "compact") {
    return (
      <CompactTracker
        status={status}
        stageIndex={stageIndex}
        isTerminalError={isTerminalError}
        isComplete={isComplete}
        className={className}
      />
    );
  }

  if (size === "standard") {
    return (
      <StandardTracker
        status={status}
        stageIndex={stageIndex}
        isTerminalError={isTerminalError}
        isComplete={isComplete}
        isActive={active}
        subStageDescription={subStageDescription}
        className={className}
      />
    );
  }

  return (
    <ExpandedTracker
      status={status}
      stageIndex={stageIndex}
      isTerminalError={isTerminalError}
      isComplete={isComplete}
      isActive={active}
      subStageDescription={subStageDescription}
      className={className}
    />
  );
}

// ─── COMPACT: Segmented progress bar ────────────────────────────────────────

function CompactTracker({
  status,
  stageIndex,
  isTerminalError,
  isComplete,
  className,
}: {
  status: string;
  stageIndex: number;
  isTerminalError: boolean;
  isComplete: boolean;
  className: string;
}) {
  const targetPercent = getStageProgress(status);
  const fill = useProgressFill(targetPercent, 200);

  return (
    <div className={`flex items-center gap-0.5 w-full max-w-[160px] ${className}`}>
      {LETTER_STAGES.map((stage, idx) => {
        const segmentComplete = isComplete || idx < stageIndex;
        const segmentActive = !isComplete && !isTerminalError && idx === stageIndex;
        const isPaywall = segmentActive && stage.key === "draft_ready";
        const segmentError = isTerminalError && idx === LETTER_STAGES.length - 1;

        return (
          <div
            key={stage.key}
            className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
              segmentComplete
                ? "bg-emerald-500"
                : segmentError
                  ? "bg-red-400"
                  : isPaywall
                    ? "bg-amber-400 animate-pulse"
                    : segmentActive
                      ? "bg-blue-500 animate-pulse"
                      : "bg-muted"
            }`}
          />
        );
      })}
    </div>
  );
}

// ─── STANDARD: Horizontal 5-circle stepper ──────────────────────────────────

function StandardTracker({
  status,
  stageIndex,
  isTerminalError,
  isComplete,
  isActive,
  subStageDescription,
  className,
}: {
  status: string;
  stageIndex: number;
  isTerminalError: boolean;
  isComplete: boolean;
  isActive: boolean;
  subStageDescription?: string;
  className: string;
}) {
  const { displayStep, transitioning } = useStepTransition(stageIndex);
  const reduced = useReducedMotion();
  const errorConfig = isTerminalError ? TERMINAL_ERROR_CONFIG[status] : null;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center w-full">
        {LETTER_STAGES.map((stage, idx) => {
          const stepComplete = isComplete || idx < displayStep;
          const stepCurrent = !isComplete && !isTerminalError && idx === displayStep;
          const stepError = isTerminalError && idx === LETTER_STAGES.length - 1;
          const isPaywall = stepCurrent && stage.key === "draft_ready";
          const stepActive = stepCurrent && isActive;

          const Icon = stage.icon;

          const circleColor = stepComplete
            ? "bg-emerald-500 text-white"
            : stepError
              ? "bg-red-500 text-white ring-2 ring-red-200"
              : isPaywall
                ? "bg-amber-500 text-white ring-2 ring-amber-200"
                : stepActive
                  ? "bg-blue-500 text-white ring-2 ring-blue-200"
                  : stepCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
                    : "bg-muted text-muted-foreground/40";

          const labelColor = stepComplete
            ? "text-emerald-600 font-medium"
            : stepError
              ? "text-red-600 font-semibold"
              : isPaywall
                ? "text-amber-600 font-semibold"
                : stepActive
                  ? "text-blue-600 font-semibold"
                  : stepCurrent
                    ? "text-foreground font-medium"
                    : "text-muted-foreground/40";

          return (
            <div
              key={stage.key}
              className="flex items-center flex-1 last:flex-none"
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${circleColor} ${
                    transitioning && !reduced ? "scale-95 opacity-80" : ""
                  } ${isPaywall && !reduced ? "animate-pulse" : ""}`}
                >
                  {stepComplete ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : stepActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : stepError ? (
                    (() => {
                      const ErrIcon = errorConfig?.icon ?? stage.icon;
                      return <ErrIcon className="w-4 h-4" />;
                    })()
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-[10px] mt-1 text-center leading-tight ${labelColor}`}
                >
                  <span className="sm:hidden">{stage.shortLabel}</span>
                  <span className="hidden sm:inline">
                    {stepError && errorConfig ? errorConfig.label : stage.label}
                  </span>
                </span>
              </div>
              {/* Connector line */}
              {idx < LETTER_STAGES.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 rounded transition-all duration-500 ${
                    stepComplete ? "bg-emerald-500" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Sub-stage description line */}
      {(subStageDescription || (isTerminalError && errorConfig)) && (
        <p className="text-xs text-muted-foreground mt-2 text-center transition-all duration-300">
          {isTerminalError && errorConfig
            ? errorConfig.description
            : subStageDescription}
        </p>
      )}
    </div>
  );
}

// ─── EXPANDED: Vertical timeline ────────────────────────────────────────────

function ExpandedTracker({
  status,
  stageIndex,
  isTerminalError,
  isComplete,
  isActive,
  subStageDescription,
  className,
}: {
  status: string;
  stageIndex: number;
  isTerminalError: boolean;
  isComplete: boolean;
  isActive: boolean;
  subStageDescription?: string;
  className: string;
}) {
  const errorConfig = isTerminalError ? TERMINAL_ERROR_CONFIG[status] : null;

  return (
    <div className={`space-y-1 ${className}`}>
      <h4 className="text-sm font-semibold text-muted-foreground mb-3">
        Progress
      </h4>
      <div className="relative">
        {LETTER_STAGES.map((stage, idx) => {
          const stepComplete = isComplete || idx < stageIndex;
          const stepCurrent = !isComplete && !isTerminalError && idx === stageIndex;
          const stepActive = stepCurrent && isActive;
          const isPaywall = stepCurrent && stage.key === "draft_ready";
          const isReview = stepCurrent && stage.key === "attorney_review";

          const Icon = stage.icon;

          return (
            <div key={stage.key} className="flex items-start gap-3 relative">
              {/* Vertical connector line */}
              {idx < LETTER_STAGES.length - 1 && (
                <div
                  className={`absolute left-[11px] top-[24px] w-0.5 h-6 transition-all duration-500 ${
                    stepComplete ? "bg-emerald-500" : "bg-border"
                  }`}
                />
              )}
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {stepComplete ? (
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                ) : stepActive ? (
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                ) : isPaywall ? (
                  <Icon className="w-6 h-6 text-amber-500" />
                ) : isReview ? (
                  <Icon className="w-6 h-6 text-amber-500" />
                ) : stepCurrent ? (
                  <Icon className="w-6 h-6 text-blue-500" />
                ) : (
                  <Icon className="w-6 h-6 text-muted-foreground/30" />
                )}
              </div>
              {/* Label + description */}
              <div className="pb-5">
                <span
                  className={`text-sm block ${
                    stepComplete
                      ? "text-emerald-600 font-medium"
                      : isPaywall
                        ? "text-amber-700 font-semibold"
                        : stepActive
                          ? "text-blue-600 font-semibold"
                          : stepCurrent
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground/50"
                  }`}
                >
                  {stage.label}
                  {stepActive && (
                    <span className="ml-2 text-xs text-blue-400">
                      (in progress...)
                    </span>
                  )}
                  {isPaywall && (
                    <span className="ml-2 text-xs text-amber-500">
                      (payment required)
                    </span>
                  )}
                </span>
                {stepCurrent && (
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    {subStageDescription ?? stage.description}
                  </span>
                )}
                {stepComplete && idx === stageIndex && !isComplete && (
                  <span className="text-xs text-emerald-500 mt-0.5 block">
                    Completed
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Terminal error status */}
        {isTerminalError && errorConfig && (
          <div className="flex items-start gap-3 relative">
            <div className="flex-shrink-0 mt-0.5">
              {(() => {
                const ErrIcon = errorConfig.icon;
                return <ErrIcon className={`w-6 h-6 ${errorConfig.color}`} />;
              })()}
            </div>
            <div className="pb-4">
              <span className={`text-sm font-semibold block ${errorConfig.color}`}>
                {errorConfig.label}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5 block">
                {errorConfig.description}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
