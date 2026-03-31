import { getActiveLessons, incrementLessonInjectionStats } from "../db";
import type { PipelineErrorCode } from "../../shared/types";
import { createPipelineError, PIPELINE_ERROR_CODES } from "../../shared/types";
import { captureServerException } from "../sentry";
import { isOpenAIFailoverAvailable, isGroqFallbackAvailable } from "./providers";

export function formatStructuredError(
  code: PipelineErrorCode,
  message: string,
  stage: string,
  details?: string,
): string {
  return JSON.stringify(createPipelineError(code, message, stage, details));
}

/**
 * Classify an error into a pipeline error code.
 *
 * When `failoverExhausted` is true, rate-limit style errors are classified as
 * RATE_LIMITED (all providers tried and exhausted). When false (default), such
 * errors are still RATE_LIMITED but callers know to attempt failover first.
 */
export function classifyErrorCode(err: unknown, failoverExhausted = false): PipelineErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  // "All providers exhausted" is emitted by withModelFailover when both primary and GPT-4o fail.
  // This is the authoritative signal that no more failover is possible.
  if (lower.includes("all providers exhausted")) return PIPELINE_ERROR_CODES.RATE_LIMITED;
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abortcontroller") || lower.includes("econnreset")) return PIPELINE_ERROR_CODES.API_TIMEOUT;
  // Rate-limit, credits-depleted, and token/context-limit all map to RATE_LIMITED.
  // Use `failoverExhausted` context to distinguish "try failover" vs "all providers done".
  if (
    lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests") ||
    lower.includes("credits") || lower.includes("quota") || lower.includes("billing") ||
    lower.includes("insufficient_quota") || lower.includes("overloaded") || lower.includes("capacity") ||
    lower.includes("context_length_exceeded") || lower.includes("maximum context length") ||
    lower.includes("context window") || lower.includes("token limit") || lower.includes("max_tokens")
  ) return PIPELINE_ERROR_CODES.RATE_LIMITED;
  if (lower.includes("content policy") || lower.includes("safety") || lower.includes("content filter") || lower.includes("refused")) return PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION;
  if (lower.includes("api key") || lower.includes("apikey") || lower.includes("unauthorized") || lower.includes("authentication") || lower.includes("api_key")) return PIPELINE_ERROR_CODES.API_KEY_MISSING;
  if (lower.includes("intake validation") || lower.includes("intake pre-flight")) return PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE;
  if (lower.includes("grounding") || lower.includes("ungrounded citation")) return PIPELINE_ERROR_CODES.GROUNDING_CHECK_FAILED;
  if (lower.includes("word count") || lower.includes("too short") || lower.includes("too long")) return PIPELINE_ERROR_CODES.WORD_COUNT_EXCEEDED;
  if (lower.includes("citation") && (lower.includes("validation") || lower.includes("audit"))) return PIPELINE_ERROR_CODES.CITATION_VALIDATION_FAILED;
  if (lower.includes("jurisdiction mismatch")) return PIPELINE_ERROR_CODES.JURISDICTION_MISMATCH;
  if (lower.includes("json") || lower.includes("parse")) return PIPELINE_ERROR_CODES.JSON_PARSE_FAILED;
  if (lower.includes("vetting") || lower.includes("vetted")) return PIPELINE_ERROR_CODES.VETTING_REJECTED;
  if (lower.includes("assembly") || lower.includes("final letter")) return PIPELINE_ERROR_CODES.ASSEMBLY_STRUCTURE_INVALID;
  if (lower.includes("draft validation") || lower.includes("draft output")) return PIPELINE_ERROR_CODES.DRAFT_VALIDATION_FAILED;
  if (lower.includes("research validation") || lower.includes("research packet")) return PIPELINE_ERROR_CODES.RESEARCH_VALIDATION_FAILED;
  return PIPELINE_ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Returns true if the error represents a situation where failover should be
 * attempted: rate-limit, 429, credits-depleted, quota, billing, overloaded,
 * or token/context-length exceeded from either Anthropic or OpenAI SDKs.
 *
 * Intentionally does NOT catch timeouts, parse errors, or content policy
 * violations — those should propagate without attempting a different provider.
 */
export function isFailoverCandidate(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // HTTP 429 and explicit rate-limit signals
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) return true;

  // Credits / quota / billing exhaustion (Anthropic, OpenAI)
  if (lower.includes("credits") || lower.includes("quota") || lower.includes("billing") ||
      lower.includes("insufficient_quota") || lower.includes("payment_required")) return true;

  // Capacity / overload signals
  if (lower.includes("overloaded") || lower.includes("capacity") || lower.includes("service unavailable") ||
      lower.includes("529")) return true;

  // Token / context-length limits — the model cannot process the request at all.
  // For Claude: "prompt is too long", "context_length_exceeded"
  // For OpenAI: "context_length_exceeded", "maximum context length", "max_tokens"
  if (lower.includes("prompt is too long") || lower.includes("context_length_exceeded") ||
      lower.includes("maximum context length") || lower.includes("context window") ||
      lower.includes("token limit") || lower.includes("max_tokens")) return true;

  // Check for numeric HTTP status codes on error objects (Anthropic SDK pattern)
  const errObj = err as Record<string, unknown>;
  const status = typeof errObj?.status === "number" ? errObj.status : undefined;
  if (status === 429 || status === 529 || status === 402 || status === 503) return true;

  return false;
}

// ═══════════════════════════════════════════════════════
// MODEL FAILOVER UTILITY
// ═══════════════════════════════════════════════════════

export interface FailoverResult<T> {
  result: T;
  provider: "primary" | "openai-failover" | "groq-oss-fallback";
  failoverTriggered: boolean;
}

/**
 * Wraps a primary AI generation function with an OpenAI GPT-4o fallback and an
 * optional Groq Llama 3.3 70B OSS last-resort fallback.
 *
 * Three-tier failover:
 *   1. primaryFn — primary model (Perplexity / Claude Opus)
 *   2. fallbackFn — OpenAI GPT-4o (existing)
 *   3. ossLastResortFn (optional) — Groq Llama 3.3 70B (free OSS, last resort)
 *
 * On rate-limit, 429, credits-depleted, quota, billing, overloaded, or
 * token/context-length-exceeded errors from the primary model, transparently
 * retries the same operation using the OpenAI fallback. If that also fails, and
 * ossLastResortFn is provided and GROQ_API_KEY is set, tries Groq before throwing.
 *
 * If OPENAI_API_KEY is not set, skips OpenAI failover and attempts OSS fallback directly.
 * If GROQ_API_KEY is not set, logs a warning and skips the OSS tier.
 * All other error types (timeout, parse failure, content policy) are re-thrown
 * immediately without attempting failover.
 *
 * @param stage - Pipeline stage name (used for logging)
 * @param letterId - Letter ID (used for logging)
 * @param primaryFn - The primary generation function to call first
 * @param fallbackFn - The OpenAI GPT-4o fallback function
 * @param ossLastResortFn - Optional Groq Llama 3.3 OSS last-resort function
 */
export async function withModelFailover<T>(
  stage: string,
  letterId: number,
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  ossLastResortFn?: () => Promise<T>,
): Promise<FailoverResult<T>> {
  try {
    const result = await primaryFn();
    return { result, provider: "primary", failoverTriggered: false };
  } catch (primaryErr) {
    if (!isFailoverCandidate(primaryErr)) {
      throw primaryErr;
    }

    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    if (!isOpenAIFailoverAvailable()) {
      console.error(
        `[Pipeline] ${stage} for letter #${letterId}: rate-limit/credits error detected but OPENAI_API_KEY is not set — skipping OpenAI failover. Original error: ${primaryMsg}`
      );
      // Skip straight to OSS fallback if available
    } else {
      console.warn(
        `[Pipeline] ${stage} for letter #${letterId}: primary model rate-limited/credits-depleted — switching to OpenAI GPT-4o failover. Original error: ${primaryMsg}`
      );

      try {
        const result = await fallbackFn();
        console.log(
          `[Pipeline] ${stage} for letter #${letterId}: OpenAI GPT-4o failover succeeded (provider=openai-failover)`
        );
        return { result, provider: "openai-failover", failoverTriggered: true };
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error(
          `[Pipeline] ${stage} for letter #${letterId}: OpenAI GPT-4o failover also failed — attempting OSS last resort. Fallback error: ${fallbackMsg}`
        );

        if (!ossLastResortFn) {
          captureServerException(fallbackErr, {
            tags: {
              component: "pipeline",
              error_type: "failover_also_failed",
              pipeline_stage: stage,
              all_providers_exhausted: "true",
            },
            extra: { letterId, primaryError: primaryMsg, fallbackError: fallbackMsg },
          });
          throw new Error(
            `All providers exhausted for ${stage} (letter #${letterId}). ` +
            `Primary error: ${primaryMsg}. Failover error: ${fallbackMsg}`
          );
        }

        if (!isGroqFallbackAvailable()) {
          console.warn(
            `[Pipeline] ${stage} for letter #${letterId}: GROQ_API_KEY is not set — OSS last resort unavailable. All providers exhausted.`
          );
          captureServerException(fallbackErr, {
            tags: {
              component: "pipeline",
              error_type: "all_providers_exhausted",
              pipeline_stage: stage,
              all_providers_exhausted: "true",
              oss_skipped: "no_api_key",
            },
            extra: { letterId, primaryError: primaryMsg, fallbackError: fallbackMsg },
          });
          throw new Error(
            `All providers exhausted for ${stage} (letter #${letterId}). ` +
            `Primary error: ${primaryMsg}. Failover error: ${fallbackMsg}`
          );
        }

        console.warn(
          `[Pipeline] ${stage} for letter #${letterId}: switching to Groq Llama 3.3 70B OSS last resort.`
        );
        try {
          const result = await ossLastResortFn();
          console.log(
            `[Pipeline] ${stage} for letter #${letterId}: Groq Llama 3.3 OSS last resort succeeded (provider=groq-oss-fallback)`
          );
          return { result, provider: "groq-oss-fallback", failoverTriggered: true };
        } catch (ossErr) {
          const ossMsg = ossErr instanceof Error ? ossErr.message : String(ossErr);
          console.error(
            `[Pipeline] ${stage} for letter #${letterId}: Groq OSS last resort also failed (all 3 providers exhausted): ${ossMsg}`
          );
          captureServerException(ossErr, {
            tags: {
              component: "pipeline",
              error_type: "all_providers_exhausted",
              pipeline_stage: stage,
              all_providers_exhausted: "true",
              tiers_attempted: "3",
            },
            extra: { letterId, primaryError: primaryMsg, fallbackError: fallbackMsg, ossError: ossMsg },
          });
          throw new Error(
            `All providers exhausted for ${stage} (letter #${letterId}). ` +
            `Primary error: ${primaryMsg}. OpenAI error: ${fallbackMsg}. Groq OSS error: ${ossMsg}`
          );
        }
      }
    }

    // OpenAI was unavailable — try OSS fallback directly
    if (!ossLastResortFn) {
      throw primaryErr;
    }

    if (!isGroqFallbackAvailable()) {
      console.warn(
        `[Pipeline] ${stage} for letter #${letterId}: GROQ_API_KEY is not set — OSS last resort unavailable. Original error: ${primaryMsg}`
      );
      throw primaryErr;
    }

    console.warn(
      `[Pipeline] ${stage} for letter #${letterId}: OpenAI unavailable — switching directly to Groq Llama 3.3 70B OSS last resort. Original error: ${primaryMsg}`
    );
    try {
      const result = await ossLastResortFn();
      console.log(
        `[Pipeline] ${stage} for letter #${letterId}: Groq Llama 3.3 OSS last resort succeeded (provider=groq-oss-fallback)`
      );
      return { result, provider: "groq-oss-fallback", failoverTriggered: true };
    } catch (ossErr) {
      const ossMsg = ossErr instanceof Error ? ossErr.message : String(ossErr);
      console.error(
        `[Pipeline] ${stage} for letter #${letterId}: Groq OSS last resort also failed: ${ossMsg}`
      );
      captureServerException(ossErr, {
        tags: {
          component: "pipeline",
          error_type: "all_providers_exhausted",
          pipeline_stage: stage,
          all_providers_exhausted: "true",
        },
        extra: { letterId, primaryError: primaryMsg, ossError: ossMsg },
      });
      throw new Error(
        `All providers exhausted for ${stage} (letter #${letterId}). ` +
        `Primary error: ${primaryMsg}. Groq OSS error: ${ossMsg}`
      );
    }
  }
}

async function findSimilarLessons(
  queryText: string,
  letterType: string,
  jurisdiction: string | null,
  stage: string,
  limit: number = 5,
): Promise<any[]> {
  try {
    const { generateEmbedding } = await import("./embeddings");
    const { getDb } = await import("../db/core");
    const { sql } = await import("drizzle-orm");

    const embedding = await generateEmbedding(queryText);
    const db = await getDb();
    if (!db) return [];

    const vectorStr = `[${embedding.join(",")}]`;
    const results = await db.execute(sql`
      SELECT * FROM match_lessons(
        ${vectorStr}::vector,
        0.65,
        ${limit},
        ${letterType},
        ${jurisdiction ?? null},
        ${stage}
      )
    `);
    return results as any[];
  } catch (err) {
    console.warn("[Pipeline] Semantic lesson search failed, skipping:", err);
    return [];
  }
}

export async function buildLessonsPromptBlock(
  letterType: string,
  jurisdiction: string | null,
  stage: string,
  queryContext?: string,
): Promise<string> {
  try {
    const primaryLessons = await getActiveLessons({
      letterType,
      jurisdiction: jurisdiction ?? undefined,
      pipelineStage: stage,
      limit: 10,
    });

    // Secondary retrieval: semantic similarity across all letter types/jurisdictions
    // when a query context (e.g. the intake summary) is provided or OPENAI_API_KEY is set
    let semanticLessons: any[] = [];
    if (queryContext && process.env.OPENAI_API_KEY) {
      semanticLessons = await findSimilarLessons(queryContext, letterType, jurisdiction, stage, 5);
    }

    // Merge: primary lessons first, then semantic additions not already covered
    const primaryIds = new Set((primaryLessons ?? []).map((l: any) => l.id));
    const additionalSemantic = semanticLessons.filter((l: any) => !primaryIds.has(l.id));
    const lessons = [...(primaryLessons ?? []), ...additionalSemantic];

    if (lessons.length === 0) return "";

    const lessonIds = lessons.map((l: any) => l.id).filter(Boolean);
    if (lessonIds.length > 0) {
      incrementLessonInjectionStats(lessonIds).catch((err) =>
        console.warn("[Pipeline] Failed to increment injection stats:", err)
      );
    }

    const grouped: Record<string, string[]> = {};
    for (const l of lessons as any[]) {
      const cat = l.category ?? "general";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(l.lesson_text ?? l.lessonText);
    }

    const sections = Object.entries(grouped).map(([cat, texts]) => {
      const catLabel = cat.replace(/_/g, " ").toUpperCase();
      const items = texts.map((t, i) => `  ${i + 1}. ${t}`).join("\n");
      return `### ${catLabel}\n${items}`;
    });

    return `\n\n## LESSONS FROM PAST ATTORNEY REVIEWS\nThe following lessons have been extracted from attorney feedback on similar letters. Apply them:\n\n${sections.join("\n\n")}\n`;
  } catch (err) {
    console.error("[Pipeline] Failed to load lessons for prompt injection:", err);
    captureServerException(err, { tags: { component: "pipeline", error_type: "lessons_load_failed" } });
    return "";
  }
}
