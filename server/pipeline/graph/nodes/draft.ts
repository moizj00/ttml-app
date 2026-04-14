import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../../../logger";
import { updateLetterStatus } from "../../../db";
import type { PipelineStateType } from "../state";

const log = createLogger({ module: "LangGraph:DraftNode" });

const DRAFT_TIMEOUT_MS = 120_000;
const STREAM_FLUSH_INTERVAL_MS = 300; // Flush buffer to Supabase every 300ms
const STREAM_MIN_BUFFER_CHARS = 50;  // Min chars before flushing mid-stream

// ─── Supabase service role client (server-side only) ───
// Use `any` generic so TypeScript doesn't require the
// pipeline_stream_chunks table in the generated DB types.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;

function getSupabaseServiceClient(): AnySupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for streaming");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as AnySupabaseClient;
}

// ─── Stream chunks to Supabase with buffering ───

async function flushBufferToSupabase(
  supabase: AnySupabaseClient,
  letterId: number,
  buffer: string,
  sequenceNumber: number,
  stage: string,
): Promise<void> {
  if (!buffer) return;
  const { error } = await supabase.from("pipeline_stream_chunks").insert({
    letter_id: letterId,
    chunk_text: buffer,
    stage,
    sequence_number: sequenceNumber,
  });
  if (error) {
    log.warn({ letterId, err: error.message }, "[DraftNode] Failed to insert stream chunk");
  }
}

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: draft (streaming)
// ═══════════════════════════════════════════════════════

export async function draftNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const { letterId, intake, researchPacket, researchUnverified } = state;
  log.info({ letterId }, "[DraftNode] Starting draft stage");

  // Update letter status to 'drafting'
  await updateLetterStatus(letterId, "drafting");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — drafting stage cannot proceed");

  const llm = new ChatAnthropic({
    apiKey,
    model: "claude-opus-4-5",
    maxTokens: 4000,
    streaming: true,
  });

  const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
  const letterType = intake.letterType ?? "legal";
  const subject = intake.matter?.subject ?? "Legal Matter";

  const researchContext = researchPacket
    ? `\n\nResearch findings:\n${JSON.stringify(researchPacket, null, 2)}`
    : "";
  const unverifiedWarning = researchUnverified
    ? "\n\nNOTE: Research was not web-grounded. Proceed with standard legal caution."
    : "";

  const systemPrompt = `You are an expert legal letter writer. Draft professional, persuasive legal correspondence.
Format: Formal legal letter with proper salutation, body paragraphs, and closing.
Jurisdiction: ${jurisdiction}
Letter type: ${letterType}
${researchContext}${unverifiedWarning}`;

  const userPrompt = `Draft a ${letterType} legal letter with:
Subject: ${subject}
Issue: ${intake.matter?.description ?? ""}
Sender: ${JSON.stringify(intake.sender ?? {})}
Recipient: ${JSON.stringify(intake.recipient ?? {})}
Desired outcome: ${intake.desiredOutcome ?? "Favorable resolution"}
Tone: ${intake.tonePreference ?? "professional"}
${intake.financials ? `Financial details: ${JSON.stringify(intake.financials)}` : ""}
${intake.additionalContext ? `Additional context: ${intake.additionalContext}` : ""}`;

  // ─── Stream tokens with buffered Supabase inserts ───

  let supabase: AnySupabaseClient | null = null;
  let streamingEnabled = false;

  try {
    supabase = getSupabaseServiceClient();
    streamingEnabled = true;
  } catch (supabaseErr) {
    log.warn({ letterId, err: String(supabaseErr) }, "[DraftNode] Supabase streaming disabled — missing env vars");
  }

  let fullContent = "";
  let buffer = "";
  let sequenceNumber = 0;
  let lastFlushTime = Date.now();

  // Stream via LangGraph's streamEvents
  const stream = await llm.stream(
    [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ],
    { signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS) },
  );

  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (!text) continue;

    fullContent += text;
    buffer += text;

    // Flush buffer to Supabase on interval or when buffer is large enough
    const now = Date.now();
    const shouldFlush =
      streamingEnabled &&
      supabase &&
      buffer.length >= STREAM_MIN_BUFFER_CHARS &&
      now - lastFlushTime >= STREAM_FLUSH_INTERVAL_MS;

    if (shouldFlush) {
      await flushBufferToSupabase(supabase!, letterId, buffer, sequenceNumber++, "draft");
      buffer = "";
      lastFlushTime = now;
    }
  }

  // Final flush of any remaining buffer
  if (streamingEnabled && supabase && buffer.length > 0) {
    await flushBufferToSupabase(supabase, letterId, buffer, sequenceNumber++, "draft_complete");
  }

  log.info({ letterId, chars: fullContent.length, chunks: sequenceNumber }, "[DraftNode] Draft streaming completed");

  return {
    assembledLetter: fullContent,
    currentStage: "assembly",
    messages: [new AIMessage(fullContent.slice(0, 200) + "…")],
  };
}
