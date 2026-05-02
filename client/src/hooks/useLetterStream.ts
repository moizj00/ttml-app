import { useEffect, useRef, useCallback, useState } from "react";
import { getOrCreateChannel, getSupabaseClient, removeChannel } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════
// useLetterStream
//
// Subscribes to pipeline_stream_chunks via Supabase Realtime
// postgres_changes so the user sees the letter being written
// in real-time as the LangGraph draft node streams tokens.
//
// Resilience (audit phase):
//  - Tracks lastSeenSequence so a reconnect / resubscribe can
//    fetch any chunks the client missed while the socket was
//    disconnected. Missed chunks are merged into the buffered
//    Map and drained in-order — duplicates are de-duped by
//    sequence_number, and out-of-order arrivals stay buffered
//    until the next expected sequence is present.
//  - Hydrates initial state by fetching all existing chunks for
//    the letter on mount so the user sees what's already been
//    streamed before the realtime subscription was attached.
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

/**
 * Fetch any chunks for letterId with sequence_number > afterSeq, sorted
 * ascending. Used both on initial mount (afterSeq = -1) and after a
 * realtime reconnect to backfill the gap.
 */
async function fetchChunksAfter(
  letterId: number,
  afterSeq: number
): Promise<StreamChunk[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("pipeline_stream_chunks")
    .select("id,letter_id,chunk_text,stage,sequence_number,created_at")
    .eq("letter_id", letterId)
    .gt("sequence_number", afterSeq)
    .order("sequence_number", { ascending: true });
  if (error) {
    // Surface to console but don't throw — realtime updates will eventually
    // fill the gap if the REST fetch was temporarily blocked (e.g. token
    // refresh in progress).
    console.warn("[useLetterStream] resync fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as StreamChunk[];
}

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
  const lastSeenSeqRef = useRef(-1);
  const seenSeqsRef = useRef<Set<number>>(new Set());
  const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStreamedText("");
    setIsStreaming(false);
    setStage(null);
    setChunkCount(0);
    chunksRef.current = new Map();
    nextExpectedRef.current = 0;
    lastSeenSeqRef.current = -1;
    seenSeqsRef.current = new Set();
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current);
      streamingTimeoutRef.current = null;
    }
  }, []);

  const ingestChunk = useCallback(
    (chunk: StreamChunk) => {
      // Dedupe by sequence_number — both the realtime push and a resync
      // fetch can deliver the same chunk; drop the second arrival.
      if (seenSeqsRef.current.has(chunk.sequence_number)) return;
      seenSeqsRef.current.add(chunk.sequence_number);

      chunksRef.current.set(chunk.sequence_number, chunk.chunk_text);
      if (chunk.sequence_number > lastSeenSeqRef.current) {
        lastSeenSeqRef.current = chunk.sequence_number;
      }
      setStage(chunk.stage);
      onChunk?.(chunk);
      setChunkCount(c => c + 1);

      // Drain ordered chunks from buffer
      let assembled = "";
      while (chunksRef.current.has(nextExpectedRef.current)) {
        assembled += chunksRef.current.get(nextExpectedRef.current)!;
        chunksRef.current.delete(nextExpectedRef.current);
        nextExpectedRef.current += 1;
      }
      if (assembled) {
        setStreamedText(prev => prev + assembled);
      }

      if (chunk.stage === "draft_complete") {
        setIsStreaming(false);
        setStreamedText(current => {
          onComplete?.(current);
          return current;
        });
        if (streamingTimeoutRef.current) {
          clearTimeout(streamingTimeoutRef.current);
          streamingTimeoutRef.current = null;
        }
        return;
      }

      // Auto-detect streaming end: if no new chunk for 10s, mark done
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
      }
      streamingTimeoutRef.current = setTimeout(() => {
        setIsStreaming(false);
        setStreamedText(current => {
          onComplete?.(current);
          return current;
        });
      }, 10_000);
    },
    [onChunk, onComplete]
  );

  // Reset when letterId changes
  useEffect(() => {
    reset();
  }, [letterId, reset]);

  useEffect(() => {
    if (!letterId || !enabled) return;
    let cancelled = false;

    const channelKey = `letter-stream-${letterId}`;
    setIsStreaming(true);

    // ─── Initial hydration (replay anything we missed before mount) ───
    // Important when the LangGraph draft node started streaming before the
    // user navigated to the letter view.
    void (async () => {
      const initial = await fetchChunksAfter(letterId, -1);
      if (cancelled) return;
      for (const chunk of initial) ingestChunk(chunk);
    })();

    const channel = getOrCreateChannel(channelKey, client =>
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
          payload => {
            const chunk = payload.new as StreamChunk;
            ingestChunk(chunk);
          }
        )
        // Resync after every (re)subscribe — Supabase Realtime emits
        // SUBSCRIBED on initial connect and again after a reconnect, so
        // this single hook covers both cases. We fetch every chunk with
        // sequence_number > lastSeen and ingest in order; ingestChunk
        // dedupes against seenSeqsRef so we never double-count.
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && letterId && !cancelled) {
            const missed = await fetchChunksAfter(
              letterId,
              lastSeenSeqRef.current
            );
            if (cancelled) return;
            for (const chunk of missed) ingestChunk(chunk);
          }
        })
    );

    void channel; // keep reference alive

    return () => {
      cancelled = true;
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
        streamingTimeoutRef.current = null;
      }
      removeChannel(channelKey);
    };
  }, [letterId, enabled, ingestChunk]);

  return { streamedText, isStreaming, stage, chunkCount, reset };
}
