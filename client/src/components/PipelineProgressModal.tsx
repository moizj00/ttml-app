import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle,
  Loader2,
  Circle,
  AlertCircle,
  FileText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

interface PipelineProgressModalProps {
  open: boolean;
  onClose: () => void;
  letterId: number | null;
}

const PIPELINE_STAGES = [
  {
    key: "submitted",
    label: "Request Submitted",
    description: "Your letter request has been received",
  },
  {
    key: "researching",
    label: "Legal Research",
    description: "Analyzing relevant laws and precedents",
  },
  {
    key: "drafting",
    label: "Professional Drafting",
    description: "Our drafting systems are composing your legal letter",
  },
  {
    key: "ai_generation_completed_hidden",
    label: "Draft Complete",
    description: "Your letter draft is ready and will be released after review",
  },
] as const;

type StageStatus = "completed" | "active" | "pending" | "error";

function getStageStatus(currentStatus: string, stageKey: string): StageStatus {
  const order = [
    "submitted",
    "researching",
    "drafting",
    "ai_generation_completed_hidden",
    "letter_released_to_subscriber",
    "generated_locked",
  ];
  const currentIdx = order.indexOf(currentStatus);

  // If status is ai_generation_completed_hidden or letter_released_to_subscriber,
  // we count drafting as completed and the final stage as completed.
  if (
    currentStatus === "ai_generation_completed_hidden" ||
    currentStatus === "letter_released_to_subscriber" ||
    currentStatus === "generated_locked"
  ) {
    if (stageKey === "drafting") return "completed";
    if (stageKey === "ai_generation_completed_hidden") return "completed";
  }

  const stageIdx = order.indexOf(stageKey);

  if (currentIdx < 0) return "pending";
  if (stageIdx < currentIdx) return "completed";
  if (stageIdx === currentIdx) return "active";
  return "pending";
}

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case "active":
      return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    case "error":
      return <AlertCircle className="w-5 h-5 text-destructive" />;
    default:
      return <Circle className="w-5 h-5 text-muted-foreground/40" />;
  }
}

export default function PipelineProgressModal({
  open,
  onClose,
  letterId,
}: PipelineProgressModalProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [, navigate] = useLocation();

  const { data } = trpc.letters.detail.useQuery(
    { id: letterId! },
    {
      enabled: open && !!letterId,
      refetchInterval: 3000, // Poll every 3 seconds during generation
    }
  );

  const currentStatus = data?.letter?.status ?? "submitted";
  const subscriberDisplayStatus = (data?.letter as any)?.subscriberDisplayStatus ?? currentStatus;
  
  const isComplete = [
    "generated_locked",
    "ai_generation_completed_hidden",
    "letter_released_to_subscriber",
  ].includes(currentStatus);
  
  const isPipelineActive = ["submitted", "researching", "drafting"].includes(
    currentStatus
  );

  // Estimated total duration for pipeline: ~120 seconds
  const ESTIMATED_DURATION_SECONDS = 120;
  const progressPercent = isComplete 
    ? 100 
    : Math.min(100, Math.round((elapsedSeconds / ESTIMATED_DURATION_SECONDS) * 100));

  // Elapsed time counter
  useEffect(() => {
    if (!open || !isPipelineActive) return;
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [open, isPipelineActive]);

  // Auto-navigate to letter detail when pipeline is complete and letter is released
  useEffect(() => {
    if (open && isComplete && letterId && currentStatus === "letter_released_to_subscriber") {
      const timer = setTimeout(() => {
        navigate(`/letters/${letterId}`);
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [open, isComplete, letterId, currentStatus, navigate, onClose]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {isComplete ? "Letter Draft Ready!" : "Preparing Your Letter"}
          </DialogTitle>
          <DialogDescription>
            {isComplete
              ? currentStatus === "ai_generation_completed_hidden"
                ? "Your professional letter draft is complete. It will be available for review within 24 hours."
                : "Your professional letter draft is complete. View details for the next steps."
              : `A professional draft is being prepared based on thorough research. This typically takes 1-2 minutes (${formatTime(ESTIMATED_DURATION_SECONDS)}).`}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        {isPipelineActive && (
          <div className="w-full bg-muted rounded-full h-2.5 mb-2">
            <div 
              className="bg-primary h-2.5 rounded-full transition-all duration-1000 ease-linear" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Progress stages */}
        <div className="space-y-1 py-4">
          {PIPELINE_STAGES.map((stage, idx) => {
            const status = getStageStatus(currentStatus, stage.key);
            return (
              <div key={stage.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <StageIcon status={status} />
                  {idx < PIPELINE_STAGES.length - 1 && (
                    <div
                      className={`w-0.5 h-8 mt-1 ${
                        status === "completed"
                          ? "bg-green-500"
                          : "bg-muted-foreground/20"
                      }`}
                    />
                  )}
                </div>
                <div className="pb-6">
                  <p
                    className={`text-sm font-medium ${
                      status === "active"
                        ? "text-primary"
                        : status === "completed"
                          ? "text-green-700"
                          : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stage.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Timer */}
        {isPipelineActive && (
          <div className="text-center text-xs text-muted-foreground">
            Elapsed: {formatTime(elapsedSeconds)} / ~{formatTime(ESTIMATED_DURATION_SECONDS)}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          {isComplete && letterId ? (
            currentStatus === "letter_released_to_subscriber" ? (
              <Button asChild>
                <Link href={`/letters/${letterId}`}>View Letter Draft</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={onClose}>
                Continue in Background
              </Button>
            )
          ) : (
            <Button variant="outline" onClick={onClose}>
              Continue in Background
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
