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
import { Link } from "wouter";

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
    key: "generated_locked",
    label: "Draft Complete",
    description: "Your letter draft is ready for review",
  },
] as const;

type StageStatus = "completed" | "active" | "pending" | "error";

function getStageStatus(currentStatus: string, stageKey: string): StageStatus {
  const order = [
    "submitted",
    "researching",
    "drafting",
    "PROCESSED_HIDDEN",
    "letter_released_to_subscriber",
    "generated_locked",
  ];
  const currentIdx = order.indexOf(currentStatus);

  // If status is PROCESSED_HIDDEN or letter_released_to_subscriber,
  // we count drafting as completed and generated_locked as the next/active state.
  if (
    currentStatus === "PROCESSED_HIDDEN" ||
    currentStatus === "letter_released_to_subscriber"
  ) {
    if (stageKey === "drafting") return "completed";
    if (stageKey === "generated_locked") return "completed";
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

  const { data } = trpc.letters.detail.useQuery(
    { id: letterId! },
    {
      enabled: open && !!letterId,
      refetchInterval: 3000, // Poll every 3 seconds during generation
    }
  );

  const currentStatus = data?.letter?.status ?? "submitted";
  const isComplete = [
    "generated_locked",
    "PROCESSED_HIDDEN",
    "letter_released_to_subscriber",
  ].includes(currentStatus);
  const isPipelineActive = ["submitted", "researching", "drafting"].includes(
    currentStatus
  );

  // Elapsed time counter
  useEffect(() => {
    if (!open || !isPipelineActive) return;
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [open, isPipelineActive]);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {isComplete ? "Letter Draft Ready!" : "Preparing Your Letter"}
          </DialogTitle>
          <DialogDescription>
            {isComplete
              ? "Your professional letter draft is complete. View details for the next steps."
              : `A professional draft is being prepared based on thorough research. This typically takes 1-2 minutes.`}
          </DialogDescription>
        </DialogHeader>

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
            Elapsed: {formatTime(elapsedSeconds)}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          {isComplete && letterId ? (
            <Button asChild>
              <Link href={`/letters/${letterId}`}>View Letter Draft</Link>
            </Button>
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
