import { getActiveLessons, incrementLessonInjectionStats } from "../db";
import type { PipelineErrorCode } from "../../shared/types";
import { createPipelineError, PIPELINE_ERROR_CODES } from "../../shared/types";
import { captureServerException } from "../sentry";
import { isOpenAIFailoverAvailable } from "./providers";

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
  provider: "primary" | "openai-failover";
  failoverTriggered: boolean;
}

/**
 * Wraps a primary AI generation function with an OpenAI GPT-4o fallback.
 * On rate-limit, 429, credits-depleted, quota, billing, overloaded, or
 * token/context-length-exceeded errors from the primary model, transparently
 * retries the same operation using the fallback function (GPT-4o).
 *
 * If OPENAI_API_KEY is not set, skips failover and re-throws the original error.
 * All other error types (timeout, parse failure, content policy) are re-thrown
 * immediately without attempting failover.
 *
 * @param stage - Pipeline stage name (used for logging)
 * @param letterId - Letter ID (used for logging)
 * @param primaryFn - The primary generation function to call first
 * @param fallbackFn - The OpenAI GPT-4o fallback function
 */
export async function withModelFailover<T>(
  stage: string,
  letterId: number,
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
): Promise<FailoverResult<T>> {
  try {
    const result = await primaryFn();
    return { result, provider: "primary", failoverTriggered: false };
  } catch (primaryErr) {
    if (!isFailoverCandidate(primaryErr)) {
      throw primaryErr;
    }

    if (!isOpenAIFailoverAvailable()) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.error(
        `[Pipeline] ${stage} for letter #${letterId}: rate-limit/credits error detected but OPENAI_API_KEY is not set — failover unavailable. Original error: ${msg}`
      );
      throw primaryErr;
    }

    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
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
        `[Pipeline] ${stage} for letter #${letterId}: OpenAI GPT-4o failover also failed (all providers exhausted): ${fallbackMsg}`
      );
      captureServerException(fallbackErr, {
        tags: {
          component: "pipeline",
          error_type: "failover_also_failed",
          pipeline_stage: stage,
          all_providers_exhausted: "true",
        },
        extra: { letterId, primaryError: primaryMsg, fallbackError: fallbackMsg },
      });
      // Re-throw as a descriptive error so callers / classifyErrorCode can identify
      // "all providers exhausted" vs. "primary throttled but not yet tried failover".
      throw new Error(
        `All providers exhausted for ${stage} (letter #${letterId}). ` +
        `Primary error: ${primaryMsg}. Failover error: ${fallbackMsg}`
      );
    }
  }
}

export async function buildLessonsPromptBlock(
  letterType: string,
  jurisdiction: string | null,
  stage: string,
): Promise<string> {
  try {
    const lessons = await getActiveLessons({
      letterType,
      jurisdiction: jurisdiction ?? undefined,
      pipelineStage: stage,
      limit: 10,
    });
    if (!lessons || lessons.length === 0) return "";

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
