// ═══════════════════════════════════════════════════════
// server/pipeline/langgraph.ts
//
// Compatibility shim: exposes the LangGraph pipeline under
// the module path that orchestrator.ts already imports from.
//
// The underlying implementation lives in ./graph/ as a
// LangGraph StateGraph with these nodes:
//   research → draft → assembly → vetting → finalize
//
// This shim adapts my graph/index.ts signature to the one
// orchestrator.ts (and PIPELINE_MODE=langgraph) expects:
//
//   runPipeline(letterId, intake, userId) → PipelineResult
// ═══════════════════════════════════════════════════════

import type { IntakeJson } from "../../shared/types";
import { createLogger } from "../logger";
import { runLangGraphPipeline } from "./graph";

const log = createLogger({ module: "LangGraph:Shim" });

// ─── Public types ──────────────────────────────────────────────────────────

export interface PipelineResult {
  success: boolean;
  vettedLetter?: string;
  errorCode?: string;
  error?: string;
}

export interface PipelineStreamEvent {
  type: "stage_start" | "stage_end" | "token" | "error" | "complete";
  stage?: string;
  data?: unknown;
  error?: string;
}

// ─── Preflight: check API keys needed by the LangGraph pipeline ────────────

export function preflightApiKeyCheck(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  // Perplexity is preferred for research but the graph will fall back to
  // Claude haiku if missing — so we only warn, not fail.
  if (!process.env.PERPLEXITY_API_KEY) {
    log.warn(
      "[LangGraph] PERPLEXITY_API_KEY not set — research will fall back to Claude"
    );
  }
  return { ok: missing.length === 0, missing };
}

// ─── Main entrypoint ───────────────────────────────────────────────────────

export async function runPipeline(
  letterId: number,
  intake: IntakeJson,
  userId?: number,
  isFreePreview?: boolean
): Promise<PipelineResult> {
  const pre = preflightApiKeyCheck();
  if (!pre.ok) {
    return {
      success: false,
      errorCode: "API_KEY_MISSING",
      error: `Missing required API keys: ${pre.missing.join(", ")}`,
    };
  }

  try {
    log.info(
      { letterId, userId, isFreePreview },
      "[LangGraph Shim] Invoking runLangGraphPipeline"
    );
    const finalState = await runLangGraphPipeline({
      letterId,
      userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      intake: intake as any,
      isFreePreview,
    });

    // runLangGraphPipeline returns the final StateGraph state which should
    // include vettedLetter and/or assembledLetter. Defensive access.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (finalState ?? {}) as any;
    const vettedLetter: string | undefined =
      state.vettedLetter || state.assembledLetter || undefined;

    return {
      success: true,
      vettedLetter,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ letterId, err: msg }, "[LangGraph Shim] Pipeline failed");
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      error: msg,
    };
  }
}

// ─── Streaming variant (placeholder) ────────────────────────────────────────
// LangGraph's streamEvents() yields per-node events. For now this wraps
// runPipeline and emits a single complete event once done. The actual
// per-token streaming happens via pipeline_stream_chunks → Supabase Realtime,
// consumed by the client's useLetterStream hook.

export async function* runPipelineStreaming(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): AsyncGenerator<PipelineStreamEvent, PipelineResult, void> {
  yield { type: "stage_start", stage: "research" };
  const result = await runPipeline(letterId, intake, userId);
  if (result.success) {
    yield { type: "complete", data: { vettedLetter: result.vettedLetter } };
  } else {
    yield { type: "error", error: result.error };
  }
  return result;
}
