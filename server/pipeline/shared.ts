import { getActiveLessons, incrementLessonInjectionStats } from "../db";
import type { PipelineErrorCode } from "../../shared/types";
import { createPipelineError, PIPELINE_ERROR_CODES } from "../../shared/types";
import { captureServerException } from "../sentry";

export function formatStructuredError(
  code: PipelineErrorCode,
  message: string,
  stage: string,
  details?: string,
): string {
  return JSON.stringify(createPipelineError(code, message, stage, details));
}

export function classifyErrorCode(err: unknown): PipelineErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abortcontroller") || lower.includes("econnreset")) return PIPELINE_ERROR_CODES.API_TIMEOUT;
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) return PIPELINE_ERROR_CODES.RATE_LIMITED;
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
