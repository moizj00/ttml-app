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
  getOrCreateChannel,
  getSupabaseClient,
  removeChannel,
} from "@/lib/supabase";
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
    key: "pending",
    label: "Request Submitted",
    description: "Your letter request has been received",
  },
  {
    key: "research",
    label: "Legal Research",
    description: "Analyzing relevant laws and precedents",
  },
  {
    key: "draft",
    label: "Professional Drafting",
    description: "Our drafting systems are composing your legal letter",
  },
  {
    key: "assembly",
    label: "Assembly",
    description: "Refining structure, citations, and tone",
  },
  {
    key: "vetting",
    label: "Quality Review",
    description: "Checking legal accuracy and factual consistency",
  },
  {
    key: "completed",
    label: "Draft Complete",
    description: "Your letter draft is ready and will be released after review",
  },
] as const;

type StageStatus = "completed" | "active" | "pending" | "error";
type PipelineRecord = {
  pipeline_id: number;
  status: string;
  current_step: string;
  progress: number;
  error_message?: string | null;
  updated_at?: string;
};

function normalizeStep(status: string, currentStep?: string): string {
  if (currentStep && currentStep !== "pending") return currentStep;
  if (status === "submitted") return "pending";
  if (status === "researching") return "research";
  if (status === "drafting") return "draft";
  if (
    status === "ai_generation_completed_hidden" ||
    status === "letter_released_to_subscriber" ||
    status === "generated_locked"
  ) {
    return "completed";
  }
  return currentStep || status || "pending";
}

function getStageStatus(currentStep: string, pipelineStatus: string, stageKey: string): StageStatus {
  if (pipelineStatus === "completed") return "completed";
  if (pipelineStatus === "failed") {
    return stageKey === currentStep || (currentStep === "failed" && stageKey === "completed")
      ? "error"
      : "pending";
  }

  const order = [
    "pending",
    "init",
    "research",
    "draft",
    "assembly",
    "vetting",
    "finalize",
    "completed",
  ];
  const normalizedCurrent = currentStep === "init" ? "pending" : currentStep;
  const normalizedStage = stageKey === "completed" && currentStep === "finalize"
    ? "finalize"
    : stageKey;
  const currentIdx = order.indexOf(normalizedCurrent);

  const stageIdx = order.indexOf(normalizedStage);

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
  const [pipelineRecord, setPipelineRecord] = useState<PipelineRecord | null>(null);
  const [, navigate] = useLocation();

  const { data } = trpc.letters.detail.useQuery(
    { id: letterId! },
    {
      enabled: open && !!letterId,
      refetchInterval: 3000, // Fallback when Supabase Realtime is unavailable
    }
  );

  useEffect(() => {
    if (!open || !letterId) {
      setPipelineRecord(null);
      return;
    }

    const channelKey = `pipeline-record-${letterId}`;
    const client = getSupabaseClient();

    client
      ?.from("pipeline_records")
      .select("pipeline_id,status,current_step,progress,error_message,updated_at")
      .eq("pipeline_id", letterId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPipelineRecord(data as PipelineRecord);
      });

    const channel = getOrCreateChannel(channelKey, realtimeClient =>
      realtimeClient
        .channel(channelKey)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pipeline_records",
            filter: `pipeline_id=eq.${letterId}`,
          },
          payload => {
            setPipelineRecord(payload.new as PipelineRecord);
          }
        )
        .subscribe()
    );

    if (!channel) return;

    return () => {
      removeChannel(channelKey);
    };
  }, [open, letterId]);

  const currentStatus = data?.letter?.status ?? "submitted";
  const pipelineStatus = pipelineRecord?.status ?? currentStatus;
  const currentStep = normalizeStep(currentStatus, pipelineRecord?.current_step);
  const subscriberDisplayStatus = (data?.letter as any)?.subscriberDisplayStatus ?? currentStatus;
  
  const isComplete = [
    "generated_locked",
    "ai_generation_completed_hidden",
    "letter_released_to_subscriber",
  ].includes(currentStatus) || pipelineStatus === "completed";

  const isFailed = pipelineStatus === "failed" || currentStatus === "pipeline_failed";
  
  const isPipelineActive =
    !isComplete &&
    !isFailed &&
    ["pending", "running", "researching", "drafting", "assembling", "vetting", "submitted", "researching", "drafting"].includes(
      pipelineStatus
    );

  // Estimated total duration for pipeline: ~120 seconds
  const ESTIMATED_DURATION_SECONDS = 120;
  const progressPercent = isComplete 
    ? 100 
    : pipelineRecord?.progress ?? Math.min(100, Math.round((elapsedSeconds / ESTIMATED_DURATION_SECONDS) * 100));

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
            {isFailed ? "Letter Processing Failed" : isComplete ? "Letter Draft Ready!" : "Preparing Your Letter"}
          </DialogTitle>
          <DialogDescription>
            {isFailed
              ? pipelineRecord?.error_message ?? "The background pipeline could not complete. The team has been notified."
              : isComplete
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
            const status = getStageStatus(currentStep, pipelineStatus, stage.key);
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
          {(isComplete || isFailed) && letterId ? (
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
