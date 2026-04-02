import { useCallback } from "react";
import { Mic, MicOff } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { cn } from "@/lib/utils";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  fieldId?: string;
  className?: string;
}

export function VoiceInputButton({ onTranscript, fieldId, className }: VoiceInputButtonProps) {
  const { isListening, interimTranscript, isSupported, startListening, stopListening } =
    useSpeechRecognition({ onFinalResult: onTranscript });

  const handleClick = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  if (!isSupported) {
    return (
      <span
        className="inline-flex items-center text-[10px] text-muted-foreground italic shrink-0"
        title="Voice input isn't supported in this browser."
        data-testid={fieldId ? `mic-unsupported-${fieldId}` : "mic-unsupported"}
      >
        No mic
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        aria-label={isListening ? "Stop voice input" : "Start voice input"}
        aria-pressed={isListening}
        data-testid={fieldId ? `mic-button-${fieldId}` : "mic-button"}
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-200",
          isListening
            ? "bg-red-500 border-red-500 text-white animate-pulse shadow-md shadow-red-200 dark:shadow-red-900"
            : "bg-background border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5",
          className
        )}
        title={isListening ? "Tap to stop recording" : "Tap to dictate"}
      >
        {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      </button>
      {isListening && interimTranscript && (
        <span className="text-[10px] text-muted-foreground italic max-w-[12rem] truncate">
          {interimTranscript}
        </span>
      )}
    </span>
  );
}
