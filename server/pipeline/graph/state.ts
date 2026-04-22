import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import {
  emptySharedContext,
  mergeSharedContext,
  type SharedContext,
} from "./memory";

// ═══════════════════════════════════════════════════════
// TTML LangGraph Pipeline State
// Mirrors the PipelineContext shape but uses Annotation.Root
// so LangGraph can track state across nodes and apply
// per-field reducers correctly.
//
// Shared-memory component: the `sharedContext` annotation is a
// SINGLE cohesive object that every node reads and writes. It
// holds:
//   - `normalized` — derived intake values (jurisdiction, letterType, …)
//   - `tokenUsage` — append-only cross-stage token/cost entries
//   - `lessons`    — recursive-learning lessons loaded once at entry
//   - `breadcrumbs`— append-only observability notes
//
// See `memory.ts` for the helper functions (normalizeIntake,
// recordTokenUsage, buildLessonsBlock, mergeSharedContext).
// ═══════════════════════════════════════════════════════

export const PipelineState = Annotation.Root({
  /** The letter_requests.id being processed */
  letterId: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /** The owner's user_id (used for notifications) */
  userId: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /** Raw intake JSON from letter_requests.intake_json */
  intake: Annotation<Record<string, any>>({
    reducer: (_, update) => update,
    default: () => ({}),
  }),

  /** Conversation messages — append-only reducer so nodes can add messages */
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  /**
   * Shared memory object that flows through every agent.
   *
   * The reducer (mergeSharedContext) shallow-merges while concatenating
   * the append-only arrays (tokenUsage, breadcrumbs) — so any node can
   * contribute one entry without clobbering prior contributions.
   */
  sharedContext: Annotation<SharedContext>({
    reducer: (current, update) => mergeSharedContext(current, update as Partial<SharedContext>),
    default: emptySharedContext,
  }),

  /** Research output from Perplexity / Claude fallback */
  researchPacket: Annotation<Record<string, any> | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /** Provider used for research (e.g. "perplexity", "anthropic-fallback") */
  researchProvider: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  /** True when research fell back to Claude (no web grounding) */
  researchUnverified: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  /** The assembled final letter text */
  assembledLetter: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  /** The vetted letter text (after vetting pass) */
  vettedLetter: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  /** True when vetting found quality issues requiring a redraft */
  qualityDegraded: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  /** Number of draft/assembly retries taken so far */
  retryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /** Number of pipeline-level retries (for error recovery routing) */
  errorRetryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /** Which stage last errored — used for error recovery routing */
  lastErrorStage: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  /** Accumulated quality warnings from vetting */
  qualityWarnings: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  /** Vetting report JSON from the vetting stage */
  vettingReport: Annotation<Record<string, any> | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * workflow_jobs.id for the active generation job.
   *
   * Set by the init step so admin pipeline monitor can see LangGraph
   * runs (previously LangGraph runs were invisible because only the
   * simple / fallback pipelines created workflow_jobs rows).
   */
  workflowJobId: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /** Current pipeline stage name — used in error routing */
  currentStage: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "init",
  }),
});

export type PipelineStateType = typeof PipelineState.State;
