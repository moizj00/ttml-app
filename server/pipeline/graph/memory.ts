/**
 * Shared memory helpers for the LangGraph multi-agent pipeline.
 *
 * Every node in the graph (research → draft → assembly → vetting → finalize)
 * receives the full PipelineState and may contribute to / read from the
 * SharedContext object. This module centralizes:
 *
 *   1. `normalizeIntake(intake)` — the single source of truth for derived
 *      values like jurisdiction, letterType, subject. Eliminates the
 *      per-node fallback chain that drifted between nodes.
 *
 *   2. `recordTokenUsage(...)` — append-only TokenUsage entry for cross-stage
 *      cost reporting. Finalize aggregates into workflow_jobs.
 *
 *   3. `buildLessonsBlock(lessons)` — formats pipelineLessons rows for
 *      injection into system prompts so the recursive-learning loop flows
 *      through the LangGraph path too (classic pipeline already does this).
 *
 *   4. `mergeSharedContext(current, update)` — LangGraph reducer for the
 *      `sharedContext` annotation. Shallow merges so any node can add a
 *      single field without clobbering unrelated keys.
 *
 * The philosophy: all agents see the same context. No node re-derives
 * values from `intake` — they read from `sharedContext`. That way if a
 * normalizer changes, every agent picks it up automatically.
 */

export interface NormalizedIntake {
  jurisdiction: string;
  jurisdictionState: string | null;
  jurisdictionCountry: string;
  letterType: string;
  subject: string;
  description: string;
  desiredOutcome: string;
  tonePreference: string;
  senderName: string;
  senderEmail: string | null;
  recipientName: string;
  recipientEmail: string | null;
  recipientAddress: string | null;
  additionalContext: string;
  financials: Record<string, any> | null;
}

export interface TokenUsageEntry {
  stage: "research" | "draft" | "assembly" | "vetting" | "finalize";
  provider: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  timestamp: string; // ISO
}

export interface LessonRecord {
  id: number;
  lessonText: string;
  letterType?: string | null;
  jurisdiction?: string | null;
  pipelineStage?: string | null;
}

export interface SharedContext {
  /** Derived / normalized intake values — set once at graph entry, read by every node */
  normalized: NormalizedIntake;

  /** Cross-stage token usage — append-only */
  tokenUsage: TokenUsageEntry[];

  /** Recursive-learning lessons fetched at graph entry and injected into prompts */
  lessons: LessonRecord[];

  /** Arbitrary breadcrumbs any node may write for debugging / observability */
  breadcrumbs: Array<{ stage: string; note: string; at: string }>;
}

// ═══════════════════════════════════════════════════════
// normalizeIntake — single source of truth
// ═══════════════════════════════════════════════════════

/**
 * Derive canonical values from the raw intake JSON.
 *
 * Previously every node had its own fallback chain:
 *   `intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US"`
 * That shape drifted between nodes (research/draft/vetting each had a
 * slightly different chain) and made it impossible to evolve the intake
 * shape safely. This function is the ONLY place that reads raw intake
 * keys — every node reads from the returned NormalizedIntake instead.
 */
export function normalizeIntake(intake: Record<string, any> | undefined): NormalizedIntake {
  const safe = intake ?? {};
  const jState: string | null =
    safe.jurisdiction?.state ?? safe.jurisdictionState ?? null;
  const jCountry: string =
    safe.jurisdiction?.country ?? safe.jurisdictionCountry ?? "US";
  const jurisdiction = jState ?? jCountry ?? "US";

  return {
    jurisdiction,
    jurisdictionState: jState,
    jurisdictionCountry: jCountry,
    letterType: safe.letterType ?? safe.matter?.category ?? "legal",
    subject: safe.matter?.subject ?? safe.subject ?? "Legal Matter",
    description: safe.matter?.description ?? safe.description ?? "",
    desiredOutcome: safe.desiredOutcome ?? "Favorable resolution",
    tonePreference: safe.tonePreference ?? "professional",
    senderName: safe.sender?.name ?? "Sender",
    senderEmail: safe.sender?.email ?? null,
    recipientName: safe.recipient?.name ?? "Recipient",
    recipientEmail: safe.recipient?.email ?? null,
    recipientAddress: safe.recipient?.address ?? null,
    additionalContext: safe.additionalContext ?? "",
    financials: safe.financials ?? null,
  };
}

// ═══════════════════════════════════════════════════════
// recordTokenUsage — helper to build an append-only entry
// ═══════════════════════════════════════════════════════

export function recordTokenUsage(
  stage: TokenUsageEntry["stage"],
  provider: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  model?: string,
): TokenUsageEntry {
  return {
    stage,
    provider,
    model,
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════
// buildLessonsBlock — inject recursive-learning lessons
// ═══════════════════════════════════════════════════════

/**
 * Format a lessons array as a plain-text system-prompt block.
 * Returns empty string when there are no lessons so nodes can
 * unconditionally concatenate the result.
 */
export function buildLessonsBlock(lessons: LessonRecord[] | undefined): string {
  if (!lessons || lessons.length === 0) return "";
  const bullets = lessons
    .slice(0, 10) // cap to 10 so the prompt doesn't balloon
    .map((l, i) => `  ${i + 1}. ${l.lessonText}`)
    .join("\n");
  return `\n\nPrior lessons from attorney reviews (apply these):\n${bullets}`;
}

// ═══════════════════════════════════════════════════════
// mergeSharedContext — LangGraph reducer
// ═══════════════════════════════════════════════════════

/**
 * Reducer for the sharedContext annotation.
 *
 * Shallow-merges the two objects. For the append-only arrays
 * (`tokenUsage`, `breadcrumbs`) the reducer concatenates so a node
 * can add a single entry without losing prior entries. Scalars and
 * objects (like `normalized` and `lessons`) are replaced wholesale
 * when the update provides them, unchanged otherwise.
 */
export function mergeSharedContext(
  current: SharedContext | undefined,
  update: Partial<SharedContext> | undefined,
): SharedContext {
  const base: SharedContext = current ?? emptySharedContext();
  if (!update) return base;

  return {
    normalized: update.normalized ?? base.normalized,
    lessons: update.lessons ?? base.lessons,
    tokenUsage: [
      ...(base.tokenUsage ?? []),
      ...(update.tokenUsage ?? []),
    ],
    breadcrumbs: [
      ...(base.breadcrumbs ?? []),
      ...(update.breadcrumbs ?? []),
    ],
  };
}

export function emptySharedContext(): SharedContext {
  return {
    normalized: normalizeIntake({}),
    tokenUsage: [],
    lessons: [],
    breadcrumbs: [],
  };
}

// ═══════════════════════════════════════════════════════
// breadcrumb — small helper for node observability
// ═══════════════════════════════════════════════════════

export function breadcrumb(
  stage: string,
  note: string,
): SharedContext["breadcrumbs"][number] {
  return { stage, note, at: new Date().toISOString() };
}

// ═══════════════════════════════════════════════════════
// totalTokens / totalCostRough — finalize aggregation helpers
// ═══════════════════════════════════════════════════════

export function totalTokens(entries: TokenUsageEntry[]): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  let prompt = 0;
  let completion = 0;
  for (const e of entries) {
    prompt += e.promptTokens;
    completion += e.completionTokens;
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
}
