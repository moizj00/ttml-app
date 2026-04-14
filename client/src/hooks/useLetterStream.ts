import { useEffect, useRef, useCallback, useState } from "react";
import { getOrCreateChannel, removeChannel } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════
// useLetterStream
//
// Subscribes to pipeline_stream_chunks via Supabase Realtime
// postgres_changes so the user sees the letter being written
// in real-time as the LangGraph draft node streams tokens.
//
// Usage:
//   const { streamedText, isStreaming, stage } = useLetterStream({ letterId: 42 });
// ═══════════════════════════════════════════════════════

export type StreamChunk = {
  id: number;
  letter_id: number;
  chunk_text: string;
  stage: string;
  sequence_number: number;
  created_at: string;
};

type UseLetterStreamOptions = {
  /** Letter ID to stream for. Pass null/undefined to disable. */
  letterId?: number | null;
  /** Whether the subscription is active. Defaults to true. */
  enabled?: boolean;
  /** Called when a new chunk arrives */
  onChunk?: (chunk: StreamChunk) => void;
  /** Called when the draft stage completes (stage === 'draft_complete') */
  onComplete?: (fullText: string) => void;
};

type UseLetterStreamResult = {
  /** Full accumulated text so far */
  streamedText: string;
  /** True while chunks are arriving */
  isStreaming: boolean;
  /** Current stage name from the latest chunk */
  stage: string | null;
  /** Number of chunks received */
  chunkCount: number;
  /** Reset stream state (e.g. when starting a new letter) */
  reset: () => void;
};

export function useLetterStream({
  letterId,
  enabled = true,
  onChunk,
  onComplete,
}: UseLetterStreamOptions): UseLetterStreamResult {
  const [streamedText, setStreamedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);

  // Buffer for ordered chunk assembly
  const chunksRef = useRef<Map<number, string>>(new Map());
  const nextExpectedRef = useRef(0);
  const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStreamedText("");
    setIsStreaming(false);
    setStage(null);
    setChunkCount(0);
    chunksRef.current = new Map();
    nextExpectedRef.current = 0;
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current);
      streamingTimeoutRef.current = null;
    }
  }, []);

  // Reset when letterId changes
  useEffect(() => {
    reset();
  }, [letterId, reset]);

  useEffect(() => {
    if (!letterId || !enabled) return;

    const channelKey = `letter-stream-${letterId}`;
    setIsStreaming(true);

    const channel = getOrCreateChannel(channelKey, (client) =>
      client
        .channel(channelKey)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "pipeline_stream_chunks",
            filter: `letter_id=eq.${letterId}`,
          },
          (payload) => {
            const chunk = payload.new as StreamChunk;

            // Store chunk by sequence number for ordered assembly
            chunksRef.current.set(chunk.sequence_number, chunk.chunk_text);
            setStage(chunk.stage);
            onChunk?.(chunk);
            setChunkCount((c) => c + 1);

            // Drain ordered chunks from buffer
            let assembled = "";
            while (chunksRef.current.has(nextExpectedRef.current)) {
              assembled += chunksRef.current.get(nextExpectedRef.current)!;
              chunksRef.current.delete(nextExpectedRef.current);
              nextExpectedRef.current += 1;
            }

            if (assembled) {
              setStreamedText((prev) => {
                const next = prev + assembled;
                return next;
              });
            }

            // Mark streaming complete when 'draft_complete' stage arrives
            if (chunk.stage === "draft_complete") {
              setIsStreaming(false);
              setStreamedText((current) => {
                onComplete?.(current);
                return current;
              });
              if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
                streamingTimeoutRef.current = null;
              }
            }

            // Auto-detect streaming end: if no new chunk for 10s, mark done
            if (streamingTimeoutRef.current) {
              clearTimeout(streamingTimeoutRef.current);
            }
            streamingTimeoutRef.current = setTimeout(() => {
              setIsStreaming(false);
              setStreamedText((current) => {
                onComplete?.(current);
                return current;
              });
            }, 10_000);
          },
        )
        .subscribe(),
    );

    return () => {
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
        streamingTimeoutRef.current = null;
      }
      removeChannel(channelKey);
    };
  }, [letterId, enabled, onChunk, onComplete]);

  return { streamedText, isStreaming, stage, chunkCount, reset };
}
