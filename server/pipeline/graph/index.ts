import { StateGraph, END, START } from "@langchain/langgraph";
import { createLogger } from "../../logger";
import { PipelineState, type PipelineStateType } from "./state";
import { initNode } from "./nodes/init";
import { researchNode } from "./nodes/research";
import { draftNode } from "./nodes/draft";
import { assemblyNode } from "./nodes/assembly";
import { vettingNode } from "./nodes/vetting";
import { finalizeNode, failNode } from "./nodes/finalize";
import {
  PIPELINE_ERROR_CATEGORY,
  PIPELINE_ERROR_CODES,
  type PipelineErrorCode,
} from "../../../shared/types/pipeline";

const log = createLogger({ module: "LangGraph:Graph" });

// ═══════════════════════════════════════════════════════
// CONDITIONAL ROUTING
// ═══════════════════════════════════════════════════════

/**
 * Strict union of route keys returned by routeAfterVetting().
 *
 * Keep this in sync with VETTING_ROUTE_MAP — the addConditionalEdges call
 * below relies on it being exhaustive. A misspelled key here would make
 * LangGraph throw at compile-time of the graph rather than at runtime.
 */
export type VettingRouteResult = "draft" | "finalize" | "finalize_degraded" | "fail";

/**
 * Exhaustive map of route keys → target node names. Exported so tests can
 * assert that every VettingRouteResult variant has a destination node.
 *
 * Typed with `as const satisfies` so the values are literal string types
 * (required by addConditionalEdges) while still enforcing all keys are present.
 */
export const VETTING_ROUTE_MAP = {
  draft: "draft",
  finalize: "finalize",
  finalize_degraded: "finalize",
  fail: "fail",
} as const satisfies Record<VettingRouteResult, string>;

/**
 * After vetting:
 *   - permanent error (API_KEY_MISSING / INTAKE_INCOMPLETE / …) → fail
 *   - too many transient node errors AND no draft → fail
 *   - too many transient node errors AND we have a draft → finalize_degraded
 *     (best-effort: surface qualityWarnings and still hand the attorney
 *     something to review rather than stranding the letter)
 *   - quality degraded but retries left → loop back to draft
 *   - everything else → finalize
 */
export function routeAfterVetting(state: PipelineStateType): VettingRouteResult {
  const {
    qualityDegraded,
    retryCount,
    errorRetryCount,
    assembledLetter,
    lastErrorCode,
  } = state;

  // Permanent error codes short-circuit retries — no point in re-running.
  if (lastErrorCode && lastErrorCode in PIPELINE_ERROR_CATEGORY) {
    if (PIPELINE_ERROR_CATEGORY[lastErrorCode as PipelineErrorCode] === "permanent") {
      log.error(
        { letterId: state.letterId, lastErrorCode },
        "[Graph] Permanent pipeline error — routing to fail"
      );
      return "fail";
    }
  }

  // No draft content was ever produced → hard fail.
  if (!assembledLetter) {
    log.error(
      { letterId: state.letterId, errorRetryCount, hasContent: false },
      "[Graph] Empty draft — routing to fail"
    );
    return "fail";
  }

  // Too many node errors but we DO have a draft → best-effort degraded finalize.
  if (errorRetryCount >= 3) {
    log.warn(
      { letterId: state.letterId, errorRetryCount },
      "[Graph] Error budget exhausted but assembledLetter exists — routing to finalize_degraded"
    );
    return "finalize_degraded";
  }

  if (qualityDegraded && retryCount < 2) {
    log.info(
      { letterId: state.letterId, retryCount, qualityDegraded },
      "[Graph] Vetting degraded — routing back to draft"
    );
    return "draft";
  }

  return "finalize";
}

// ─── Vetting router node (wraps vettingNode + increments retryCount on redraft) ───

async function vettingRouterNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const result = await vettingNode(state);

  // Increment retryCount for next draft iteration if quality is degraded
  const retryCount = result.qualityDegraded
    ? state.retryCount + 1
    : state.retryCount;

  return { ...result, retryCount };
}

// ─── Error recovery wrapper ───

/**
 * Map raw Errors thrown from a node into a typed PipelineErrorCode so the
 * router can distinguish permanent (API_KEY_MISSING, INTAKE_INCOMPLETE,
 * CONTENT_POLICY_VIOLATION, …) from transient (rate limits, timeouts, …)
 * failures. We intentionally read PipelineError.code when present and
 * otherwise sniff the message for well-known signals — same heuristic
 * used by isTransientError() in shared/types/pipeline.ts.
 */
function classifyNodeError(err: unknown): PipelineErrorCode {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code in PIPELINE_ERROR_CATEGORY) {
      return code as PipelineErrorCode;
    }
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (
    lower.includes("api key") ||
    lower.includes("api_key") ||
    lower.includes("apikey") ||
    lower.includes("anthropic_api_key not set") ||
    lower.includes("openai_api_key not set") ||
    lower.includes("perplexity_api_key not set")
  ) {
    return PIPELINE_ERROR_CODES.API_KEY_MISSING;
  }
  if (lower.includes("content policy") || lower.includes("content filter")) {
    return PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION;
  }
  if (
    lower.includes("intake validation failed") ||
    lower.includes("intake pre-flight") ||
    lower.includes("intake incomplete")
  ) {
    return PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE;
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return PIPELINE_ERROR_CODES.API_TIMEOUT;
  }
  if (lower.includes("rate limit")) {
    return PIPELINE_ERROR_CODES.RATE_LIMITED;
  }
  return PIPELINE_ERROR_CODES.UNKNOWN_ERROR;
}

function withErrorRecovery(
  nodeName: string,
  nodeFn: (state: PipelineStateType) => Promise<Partial<PipelineStateType>>
) {
  return async (
    state: PipelineStateType
  ): Promise<Partial<PipelineStateType>> => {
    try {
      return await nodeFn(state);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = classifyNodeError(err);
      const isPermanent =
        PIPELINE_ERROR_CATEGORY[errCode] === "permanent";
      log.error(
        {
          letterId: state.letterId,
          node: nodeName,
          err: errMsg,
          errCode,
          permanent: isPermanent,
        },
        "[Graph] Node error"
      );
      return {
        lastErrorStage: nodeName,
        lastErrorCode: errCode,
        lastErrorMessage: errMsg,
        // Permanent errors burn the entire retry budget so the router
        // routes straight to fail without retrying identical work.
        errorRetryCount: isPermanent ? 3 : state.errorRetryCount + 1,
        currentStage: "error",
      };
    }
  };
}

// ═══════════════════════════════════════════════════════
// BUILD GRAPH
// ═══════════════════════════════════════════════════════

function buildPipelineGraph() {
  const graph = new StateGraph(PipelineState)
    // ─── Add nodes ───────────────────────────────────────
    // Init runs first: normalizes intake into sharedContext.normalized,
    // creates a workflow_jobs row for admin monitor visibility, and
    // fetches recursive-learning lessons once for this letterType +
    // jurisdiction so downstream prompts can inject them.
    .addNode("init", withErrorRecovery("init", initNode))
    .addNode("research", withErrorRecovery("research", researchNode))
    .addNode("draft", withErrorRecovery("draft", draftNode))
    .addNode("assembly", withErrorRecovery("assembly", assemblyNode))
    .addNode("vetting", withErrorRecovery("vetting", vettingRouterNode))
    .addNode("finalize", finalizeNode)
    .addNode("fail", failNode)

    // ─── Entry point ──────────────────────────────────────
    .addEdge(START, "init")

    // ─── Linear edges ─────────────────────────────────────
    .addEdge("init", "research")
    .addEdge("research", "draft")
    .addEdge("draft", "assembly")
    .addEdge("assembly", "vetting")

    // ─── Conditional: after vetting → redraft, finalize, or fail ──
    // VETTING_ROUTE_MAP is the single source of truth — any new
    // VettingRouteResult variant must also appear here, or LangGraph
    // will throw at compile time. Tests assert exhaustiveness.
    .addConditionalEdges("vetting", routeAfterVetting, VETTING_ROUTE_MAP)

    // ─── Terminal edges ────────────────────────────────────
    .addEdge("finalize", END)
    .addEdge("fail", END);

  return graph.compile();
}

// Compiled graph singleton (lazy)
let _compiledGraph: ReturnType<typeof buildPipelineGraph> | null = null;

function getCompiledGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildPipelineGraph();
  }
  return _compiledGraph;
}

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

export interface RunLangGraphPipelineOptions {
  letterId: number;
  userId?: number;
  intake: Record<string, any>;
  isFreePreview?: boolean;
}

/**
 * Run the LangGraph pipeline for a letter.
 *
 * This is a parallel entry point to runFullPipeline() — the worker
 * can call this when LANGGRAPH_PIPELINE=true is set in env,
 * or it can be called directly for testing.
 */
export async function runLangGraphPipeline(
  opts: RunLangGraphPipelineOptions
): Promise<PipelineStateType> {
  const { letterId, userId = 0, intake, isFreePreview = false } = opts;

  log.info({ letterId, isFreePreview }, "[Graph] Starting LangGraph pipeline");

  const graph = getCompiledGraph();

  const initialState: Partial<PipelineStateType> = {
    letterId,
    userId,
    intake,
    isFreePreview,
    messages: [],
    retryCount: 0,
    errorRetryCount: 0,
    qualityWarnings: [],
    currentStage: "init",
  };

  const finalState = await graph.invoke(initialState);

  if (finalState.currentStage === "failed") {
    throw new Error(`LangGraph pipeline failed for letter #${letterId}`);
  }

  log.info(
    {
      letterId,
      finalStage: finalState.currentStage,
      qualityDegraded: finalState.qualityDegraded,
      researchUnverified: finalState.researchUnverified,
      retryCount: finalState.retryCount,
    },
    "[Graph] LangGraph pipeline completed"
  );

  return finalState as PipelineStateType;
}

/**
 * Stream the LangGraph pipeline events (useful for observability/debugging).
 * Yields state snapshots after each node completes.
 */
export async function* streamLangGraphPipeline(
  opts: RunLangGraphPipelineOptions
): AsyncGenerator<{ node: string; state: Partial<PipelineStateType> }> {
  const { letterId, userId = 0, intake } = opts;
  const graph = getCompiledGraph();

  const initialState: Partial<PipelineStateType> = {
    letterId,
    userId,
    intake,
    messages: [],
    retryCount: 0,
    errorRetryCount: 0,
    qualityWarnings: [],
    currentStage: "research",
  };

  for await (const event of await graph.streamEvents(initialState, {
    version: "v2",
  })) {
    if (event.event === "on_chain_end" && event.name !== "LangGraph") {
      yield {
        node: event.name,
        state: event.data?.output as Partial<PipelineStateType>,
      };
    }
  }
}
