/**
 * LangGraph Pipeline State Schema
 * 
 * Defines the shared state annotation for the letter generation pipeline.
 * Uses LangGraph's Annotation system with reducers for accumulated values.
 */

import { Annotation } from "@langchain/langgraph";
import type {
  IntakeJson,
  ResearchPacket,
  DraftOutput,
  ValidationResult,
  CitationRegistryEntry,
  PipelineContext,
} from "../../../shared/types";
import type { VettingReport } from "../vetting-prompts";

// ═══════════════════════════════════════════════════════
// TOKEN USAGE TRACKING
// ═══════════════════════════════════════════════════════

export interface TokenUsageSummary {
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}

// ═══════════════════════════════════════════════════════
// ERROR TRACKING
// ═══════════════════════════════════════════════════════

export interface PipelineErrorInfo {
  code: string;
  message: string;
  stage: "research" | "drafting" | "assembly" | "vetting" | "fallback";
  details?: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════
// PIPELINE STATE ANNOTATION
// ═══════════════════════════════════════════════════════

export const PipelineStateAnnotation = Annotation.Root({
  // ── Input (immutable after initialization) ──
  letterId: Annotation<number>,
  intake: Annotation<IntakeJson>,
  userId: Annotation<number | undefined>,

  // ── Stage outputs (set by each node) ──
  research: Annotation<ResearchPacket | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  researchProvider: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  draft: Annotation<DraftOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  assembledLetter: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  vettedLetter: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  vettingReport: Annotation<VettingReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── Pipeline progression ──
  currentStage: Annotation<
    "research" | "drafting" | "assembly" | "vetting" | "complete" | "failed"
  >({
    reducer: (_, next) => next,
    default: () => "research",
  }),

  // ── Grounding & citations ──
  citationRegistry: Annotation<CitationRegistryEntry[]>({
    reducer: (prev, next) => (next.length > 0 ? next : prev),
    default: () => [],
  }),
  webGrounded: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => true,
  }),
  researchUnverified: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // ── Retry counters ──
  researchRetries: Annotation<number>({
    reducer: (prev, next) => (typeof next === "number" ? next : prev + 1),
    default: () => 0,
  }),
  draftingRetries: Annotation<number>({
    reducer: (prev, next) => (typeof next === "number" ? next : prev + 1),
    default: () => 0,
  }),
  assemblyRetries: Annotation<number>({
    reducer: (prev, next) => (typeof next === "number" ? next : prev + 1),
    default: () => 0,
  }),
  vettingRetries: Annotation<number>({
    reducer: (prev, next) => (typeof next === "number" ? next : prev + 1),
    default: () => 0,
  }),

  // ── Validation results (accumulated) ──
  validationResults: Annotation<ValidationResult[]>({
    reducer: (prev, next) => {
      if (!Array.isArray(next)) return prev;
      return [...prev, ...next];
    },
    default: () => [],
  }),

  // ── Quality warnings (accumulated) ──
  qualityWarnings: Annotation<string[]>({
    reducer: (prev, next) => {
      if (!Array.isArray(next)) return prev;
      // Deduplicate warnings
      const combined = [...prev, ...next];
      return [...new Set(combined)];
    },
    default: () => [],
  }),

  // ── Token usage (accumulated across all stages) ──
  tokenUsage: Annotation<TokenUsageSummary>({
    reducer: (prev, next) => ({
      promptTokens: prev.promptTokens + (next?.promptTokens ?? 0),
      completionTokens: prev.completionTokens + (next?.completionTokens ?? 0),
      estimatedCostUsd: prev.estimatedCostUsd + (next?.estimatedCostUsd ?? 0),
    }),
    default: () => ({ promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 }),
  }),

  // ── Error tracking ──
  lastError: Annotation<PipelineErrorInfo | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  errors: Annotation<PipelineErrorInfo[]>({
    reducer: (prev, next) => {
      if (!Array.isArray(next)) return prev;
      return [...prev, ...next];
    },
    default: () => [],
  }),

  // ── Intermediate content (for fallback recovery) ──
  intermediateDraftContent: Annotation<string | null>({
    reducer: (prev, next) => next ?? prev,
    default: () => null,
  }),

  // ── Vetting feedback for assembly retry ──
  assemblyVettingFeedback: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── RAG metadata ──
  ragExampleCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  ragSimilarityScores: Annotation<number[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  ragAbGroup: Annotation<"test" | "control">({
    reducer: (_, next) => next,
    default: () => "test",
  }),

  // ── Counter arguments from drafting ──
  counterArguments: Annotation<string[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── Critical vetting flag (triggers assembly retry) ──
  vettingCritical: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
});

// ═══════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════

export type PipelineState = typeof PipelineStateAnnotation.State;

/**
 * Helper to create initial pipeline state from letter request data.
 */
export function createInitialState(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): Partial<PipelineState> {
  return {
    letterId,
    intake,
    userId,
    currentStage: "research",
  };
}

/**
 * Helper to build a PipelineContext from LangGraph state.
 * Used to pass to existing stage functions that expect PipelineContext.
 */
export function buildPipelineContextFromState(state: PipelineState): PipelineContext {
  return {
    letterId: state.letterId,
    userId: state.userId ?? 0,
    intake: state.intake,
    citationRegistry: state.citationRegistry,
    researchProvider: state.researchProvider ?? undefined,
    researchUnverified: state.researchUnverified,
    webGrounded: state.webGrounded,
    qualityWarnings: state.qualityWarnings,
    validationResults: state.validationResults,
    counterArguments: state.counterArguments ?? undefined,
    ragExampleCount: state.ragExampleCount,
    ragSimilarityScores: state.ragSimilarityScores,
    ragAbGroup: state.ragAbGroup,
    assemblyVettingFeedback: state.assemblyVettingFeedback ?? undefined,
    _intermediateDraftContent: state.intermediateDraftContent ?? undefined,
  };
}

/**
 * Helper to extract state updates from a modified PipelineContext.
 */
export function extractStateUpdatesFromContext(
  ctx: PipelineContext
): Partial<PipelineState> {
  return {
    citationRegistry: ctx.citationRegistry,
    qualityWarnings: ctx.qualityWarnings,
    validationResults: ctx.validationResults,
    counterArguments: ctx.counterArguments,
    ragExampleCount: ctx.ragExampleCount,
    ragSimilarityScores: ctx.ragSimilarityScores,
    ragAbGroup: ctx.ragAbGroup,
    intermediateDraftContent: ctx._intermediateDraftContent,
  };
}
