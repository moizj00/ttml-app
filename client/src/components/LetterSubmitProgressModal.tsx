/**
 * LetterSubmitProgressModal
 *
 * Post-submit experience for the first-letter free-preview lead-magnet path.
 *
 * When a subscriber submits their first letter via the free-trial path, the
 * actual pipeline runs server-side via pg-boss (can take anywhere from 60s
 * to a few minutes). We show this modal with a fake-timer progress bar and
 * rotating status labels to communicate that something is happening without
 * blocking on the real pipeline. After ~90 seconds the modal reveals the
 * "we'll email you in 24 hours" confirmation and the primary CTA routes
 * the subscriber to their letters dashboard.
 *
 * Why a fake timer?
 *   - The subscriber will receive the email 24h later regardless of when
 *     the pipeline actually finishes (could be 60s, could be 5 min).
 *   - Showing a real-time pipeline status here would leak implementation
 *     detail and require a streaming endpoint. The 24h cooling window
 *     makes the actual pipeline time irrelevant to this UI.
 *   - The 90s duration is long enough to feel "thorough" (research,
 *     drafting, quality review) without being annoying.
 *
 * Props:
 *   open: whether the modal is visible (controlled by parent)
 *   letterId: id of the just-submitted letter (passed through so the CTA
 *     can link to the letter detail page if desired)
 *   onClose: called when the subscriber clicks "Got it" after the 90s
 *     timer completes. Parent is responsible for navigating.
 *   durationMs: override for the total duration (default 90_000 ms). Useful
 *     for tests and Storybook.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, Scale, Sparkles } from "lucide-react";

interface LetterSubmitProgressModalProps {
  open: boolean;
  letterId?: number;
  onClose: () => void;
  durationMs?: number;
}

// Each stage runs for roughly a quarter of the total duration. We intentionally
// cap at 99% until the timer completes — the last 1% is revealed with the
// "all set" message so the subscriber gets a small satisfaction beat.
const STAGES: Array<{
  label: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
  cap: number; // percentage to reach at the end of this stage
}> = [
  {
    label: "Gathering your details",
    subtitle: "Reading your intake and attached exhibits.",
    Icon: FileText,
    cap: 25,
  },
  {
    label: "Researching your jurisdiction",
    subtitle: "Pulling state-specific statutes and recent case law.",
    Icon: Scale,
    cap: 55,
  },
  {
    label: "Drafting your letter",
    subtitle: "Applying firm style, tone, and your desired outcome.",
    Icon: Sparkles,
    cap: 85,
  },
  {
    label: "Final quality pass",
    subtitle: "Checking citations, formatting, and clarity.",
    Icon: CheckCircle2,
    cap: 99,
  },
];

const TICK_MS = 100;

export function LetterSubmitProgressModal({
  open,
  letterId,
  onClose,
  durationMs = 90_000,
}: LetterSubmitProgressModalProps) {
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset when the modal closes so a repeat submission starts at zero.
      setProgress(0);
      setStageIndex(0);
      setComplete(false);
      startedAtRef.current = null;
      return;
    }

    startedAtRef.current = Date.now();
    const interval = window.setInterval(() => {
      if (startedAtRef.current == null) return;
      const elapsed = Date.now() - startedAtRef.current;
      const pct = Math.min(99, (elapsed / durationMs) * 99);
      setProgress(pct);

      // Advance the stage once progress crosses that stage's cap.
      const nextStage = STAGES.findIndex((s) => pct < s.cap);
      if (nextStage !== -1) {
        setStageIndex(nextStage);
      }

      if (elapsed >= durationMs) {
        window.clearInterval(interval);
        setProgress(100);
        setStageIndex(STAGES.length - 1);
        setComplete(true);
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, durationMs]);

  const currentStage = STAGES[Math.min(stageIndex, STAGES.length - 1)];
  const { Icon } = currentStage;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Only allow the dialog to close after the timer completes — the
        // subscriber's Got it / Dismiss click drives the onClose handler.
        if (!next && complete) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        // Prevent "escape to close" and overlay-click dismissal until complete.
        onEscapeKeyDown={(e) => {
          if (!complete) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (!complete) e.preventDefault();
        }}
        data-testid="letter-submit-progress-modal"
        showCloseButton={complete}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {complete ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Your letter is on its way
              </>
            ) : (
              <>
                <Icon className="h-5 w-5 text-amber-600" />
                Preparing your draft
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {complete
              ? "Your intake has been received — we'll email you in 24 hours when your draft is ready to preview."
              : "This usually takes about 90 seconds. Please keep this window open."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!complete ? (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900">
                    {currentStage.label}
                  </span>
                  <span
                    className="tabular-nums text-gray-500"
                    data-testid="letter-submit-progress-percent"
                  >
                    {Math.floor(progress)}%
                  </span>
                </div>
                <Progress value={progress} data-testid="letter-submit-progress-bar" />
                <p className="mt-2 text-xs text-gray-500">
                  {currentStage.subtitle}
                </p>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  What happens next
                </p>
                <p className="mt-1 text-amber-800">
                  We'll email you in 24 hours when your draft is ready to
                  preview. The preview is a full read-only look at your draft —
                  attorney review is the next step after that.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-medium">
                  Look out for an email in 24 hours
                </p>
                <p className="mt-1 text-emerald-800">
                  It'll contain a link to preview your full draft. You can read
                  the entire letter before deciding whether to submit it for
                  licensed attorney review.
                </p>
              </div>
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900">Reminder:</p>
                <p>
                  The preview is not yet attorney-reviewed. Do not rely on it as
                  legal advice or send it anywhere until it has been reviewed.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant={complete ? "default" : "outline"}
              disabled={!complete}
              onClick={onClose}
              data-testid="letter-submit-progress-continue"
            >
              {complete
                ? letterId
                  ? "View my letters"
                  : "Got it"
                : "Please wait..."}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LetterSubmitProgressModal;
