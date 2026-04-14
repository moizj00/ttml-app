import { StateGraph, END, START } from "@langchain/langgraph";
import { createLogger } from "../../logger";
import { PipelineState, type PipelineStateType } from "./state";
import { researchNode } from "./nodes/research";
import { draftNode } from "./nodes/draft";
import { assemblyNode } from "./nodes/assembly";
import { vettingNode } from "./nodes/vetting";
import { finalizeNode, failNode } from "./nodes/finalize";

const log = createLogger({ module: "LangGraph:Graph" });

// ═══════════════════════════════════════════════════════
// CONDITIONAL ROUTING
// ═══════════════════════════════════════════════════════

/** After vetting: loop back to draft (max 2 retries), fail on errors, or finalize */
function routeAfterVetting(state: PipelineStateType): string {
  const { qualityDegraded, retryCount, errorRetryCount, assembledLetter } = state;

  // If too many node errors or no draft content was ever produced → fail fast
  if (errorRetryCount >= 3 || !assembledLetter) {
    log.error(
      { letterId: state.letterId, errorRetryCount, hasContent: !!assembledLetter },
      "[Graph] Too many errors or empty draft — routing to fail",
    );
    return "fail";
  }

  if (qualityDegraded && retryCount < 2) {
    log.info(
      { letterId: state.letterId, retryCount, qualityDegraded },
      "[Graph] Vetting degraded — routing back to draft",
    );
    return "draft";
  }

  return "finalize";
}

// ─── Vetting router node (wraps vettingNode + increments retryCount on redraft) ───

async function vettingRouterNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const result = await vettingNode(state);

  // Increment retryCount for next draft iteration if quality is degraded
  const retryCount = result.qualityDegraded ? state.retryCount + 1 : state.retryCount;

  return { ...result, retryCount };
}

// ─── Error recovery wrapper ───

function withErrorRecovery(
  nodeName: string,
  nodeFn: (state: PipelineStateType) => Promise<Partial<PipelineStateType>>,
) {
  return async (state: PipelineStateType): Promise<Partial<PipelineStateType>> => {
    try {
      return await nodeFn(state);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error({ letterId: state.letterId, node: nodeName, err: errMsg }, "[Graph] Node error");
      return {
        lastErrorStage: nodeName,
        errorRetryCount: state.errorRetryCount + 1,
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
    .addNode("research", withErrorRecovery("research", researchNode))
    .addNode("draft", withErrorRecovery("draft", draftNode))
    .addNode("assembly", withErrorRecovery("assembly", assemblyNode))
    .addNode("vetting", withErrorRecovery("vetting", vettingRouterNode))
    .addNode("finalize", finalizeNode)
    .addNode("fail", failNode)

    // ─── Entry point ──────────────────────────────────────
    .addEdge(START, "research")

    // ─── Linear edges ─────────────────────────────────────
    .addEdge("research", "draft")
    .addEdge("draft", "assembly")
    .addEdge("assembly", "vetting")

    // ─── Conditional: after vetting → redraft, finalize, or fail ──
    .addConditionalEdges("vetting", routeAfterVetting, {
      draft: "draft",
      finalize: "finalize",
      fail: "fail",
    })

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
}

/**
 * Run the LangGraph pipeline for a letter.
 *
 * This is a parallel entry point to runFullPipeline() — the worker
 * can call this when LANGGRAPH_PIPELINE=true is set in env,
 * or it can be called directly for testing.
 */
export async function runLangGraphPipeline(
  opts: RunLangGraphPipelineOptions,
): Promise<PipelineStateType> {
  const { letterId, userId = 0, intake } = opts;

  log.info({ letterId }, "[Graph] Starting LangGraph pipeline");

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
    "[Graph] LangGraph pipeline completed",
  );

  return finalState as PipelineStateType;
}

/**
 * Stream the LangGraph pipeline events (useful for observability/debugging).
 * Yields state snapshots after each node completes.
 */
export async function* streamLangGraphPipeline(
  opts: RunLangGraphPipelineOptions,
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

  for await (const event of await graph.streamEvents(initialState, { version: "v2" })) {
    if (event.event === "on_chain_end" && event.name !== "LangGraph") {
      yield { node: event.name, state: event.data?.output as Partial<PipelineStateType> };
    }
  }
}
