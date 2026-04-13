/**
 * LangGraph Pipeline Graph Builder
 * 
 * Constructs and compiles the StateGraph for the letter generation pipeline.
 * This is the core orchestration layer that connects all pipeline nodes
 * with conditional routing for retries and failover.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { PipelineStateAnnotation } from "./state";
import { researchNode } from "./nodes/research";
import { draftingNode } from "./nodes/drafting";
import { assemblyNode } from "./nodes/assembly";
import { vettingNode } from "./nodes/vetting";
import { fallbackNode } from "./nodes/fallback";
import {
  routeAfterResearch,
  routeAfterDrafting,
  routeAfterAssembly,
  routeAfterVetting,
} from "./edges";
import { createLogger } from "../../logger";

const graphLogger = createLogger({ module: "LangGraphBuilder" });

// ═══════════════════════════════════════════════════════
// GRAPH CONSTRUCTION
// ═══════════════════════════════════════════════════════

/**
 * Builds and compiles the pipeline StateGraph.
 * 
 * Graph structure:
 * 
 *   START
 *     │
 *     ▼
 *   research ──┬── [success] ──▶ drafting ──┬── [success] ──▶ assembly ──┬── [success] ──▶ vetting ──┬── [success] ──▶ END
 *              │                            │                            │                          │
 *              │ [retry]                    │ [retry]                    │ [retry]                  │ [critical]
 *              └──▶ research                └──▶ drafting                └──▶ assembly              └──▶ assembly
 *              │                            │                            │                          │
 *              │ [exhausted]                │ [exhausted]                │ [exhausted]              │ [exhausted]
 *              └──▶ fallback ──▶ END        └──▶ fallback ──▶ END        └──▶ fallback ──▶ END      └──▶ fallback ──▶ END
 */
export function buildPipelineGraph() {
  graphLogger.info("[Graph] Building LangGraph pipeline");

  const graph = new StateGraph(PipelineStateAnnotation)
    // ── Add nodes ──
    .addNode("research", researchNode)
    .addNode("drafting", draftingNode)
    .addNode("assembly", assemblyNode)
    .addNode("vetting", vettingNode)
    .addNode("fallback", fallbackNode)

    // ── Entry edge: START → research ──
    .addEdge(START, "research")

    // ── Conditional edges with retry logic ──
    .addConditionalEdges("research", routeAfterResearch, {
      drafting: "drafting",
      retry_research: "research",
      fallback: "fallback",
    })
    .addConditionalEdges("drafting", routeAfterDrafting, {
      assembly: "assembly",
      retry_drafting: "drafting",
      fallback: "fallback",
    })
    .addConditionalEdges("assembly", routeAfterAssembly, {
      vetting: "vetting",
      retry_assembly: "assembly",
      fallback: "fallback",
    })
    .addConditionalEdges("vetting", routeAfterVetting, {
      complete: END,
      retry_assembly: "assembly",
      fallback: "fallback",
    })

    // ── Fallback always ends ──
    .addEdge("fallback", END);

  graphLogger.info("[Graph] Pipeline graph built successfully");

  return graph.compile();
}

// ═══════════════════════════════════════════════════════
// COMPILED GRAPH SINGLETON
// ═══════════════════════════════════════════════════════

/**
 * Pre-compiled graph instance for reuse.
 * The graph is stateless — state is passed in at invocation time.
 */
let _compiledGraph: ReturnType<typeof buildPipelineGraph> | null = null;

export function getPipelineGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildPipelineGraph();
  }
  return _compiledGraph;
}

/**
 * Force rebuild of the graph (useful for testing or hot-reload scenarios).
 */
export function rebuildPipelineGraph() {
  _compiledGraph = buildPipelineGraph();
  return _compiledGraph;
}
