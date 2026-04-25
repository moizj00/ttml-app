import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Clock, Loader2 } from "lucide-react";

interface LetterSubmitProgressModalProps {
  open: boolean;
  letterId?: number;
  onClose: () => void;
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 120_000;
const POLL_INTERVAL_MS = 15_000;

export function LetterSubmitProgressModal({
  open,
  letterId,
  onClose,
  durationMs = DEFAULT_DURATION_MS,
}: LetterSubmitProgressModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.ceil(durationMs / 1000)
  );

  trpc.letters.detail.useQuery(
    { id: letterId ?? 0 },
    {
      enabled: open && typeof letterId === "number",
      refetchInterval: open ? POLL_INTERVAL_MS : false,
      retry: false,
    }
  );

  useEffect(() => {
    if (!open) {
      setSecondsRemaining(Math.ceil(durationMs / 1000));
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setSecondsRemaining(
        Math.max(0, Math.ceil((durationMs - elapsed) / 1000))
      );
      if (elapsed >= durationMs) {
        onClose();
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [durationMs, onClose, open]);

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        data-testid="letter-submit-progress-modal"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-amber-600" />
            Your letter will be drafted in less than 24 hours.
          </DialogTitle>
          <DialogDescription>
            We received your intake. You will be redirected to My Letters
            shortly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
          <span>
            Finishing up and redirecting in {secondsRemaining} second
            {secondsRemaining === 1 ? "" : "s"}.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LetterSubmitProgressModal;
