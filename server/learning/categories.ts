/**
 * Learning — Lesson category definitions and AI/keyword classification
 */
import type { InsertPipelineLesson } from "../../drizzle/schema";
import { logger } from "../logger";

export type LessonCategory = InsertPipelineLesson["category"];

export const CATEGORY_DEFINITIONS: Record<string, string> = {
  citation_error:
    "Issues with legal citations, case references, statutes, or regulatory references being wrong, missing, or improperly formatted.",
  jurisdiction_error:
    "Wrong jurisdiction referenced, incorrect state-specific laws applied, or failure to account for jurisdictional differences.",
  tone_issue:
    "The tone of the letter is inappropriate — too aggressive, too passive, insufficiently formal, or mismatched with the letter type.",
  structure_issue:
    "Problems with the letter's organization, section ordering, paragraph structure, or logical flow.",
  factual_error:
    "Incorrect facts, inaccurate claims, wrong dates, or misrepresentation of client circumstances.",
  bloat_detected:
    "Unnecessary filler, verbose language, repetitive statements, or content that dilutes the letter's effectiveness.",
  missing_section:
    "A required section, clause, or piece of information is absent from the letter.",
  style_preference:
    "Attorney preferences for formatting, writing style, phrasing choices, or conventions.",
  legal_accuracy:
    "General legal accuracy concerns — incorrect legal principles, outdated law references, or legal reasoning errors.",
  general: "General feedback that doesn't fit a specific category above.",
};

export function categorizeFromNoteKeyword(
  note: string
): NonNullable<LessonCategory> {
  const lower = note.toLowerCase();
  if (
    lower.includes("citation") ||
    lower.includes("cite") ||
    lower.includes("statute")
  )
    return "citation_error";
  if (
    lower.includes("jurisdiction") ||
    lower.includes("state law") ||
    lower.includes("wrong state")
  )
    return "jurisdiction_error";
  if (
    lower.includes("tone") ||
    lower.includes("aggressive") ||
    lower.includes("softer")
  )
    return "tone_issue";
  if (
    lower.includes("structure") ||
    lower.includes("section") ||
    lower.includes("paragraph")
  )
    return "structure_issue";
  if (
    lower.includes("fact") ||
    lower.includes("inaccurate") ||
    lower.includes("incorrect")
  )
    return "factual_error";
  if (
    lower.includes("filler") ||
    lower.includes("bloat") ||
    lower.includes("verbose")
  )
    return "bloat_detected";
  if (
    lower.includes("missing") ||
    lower.includes("add") ||
    lower.includes("include")
  )
    return "missing_section";
  if (
    lower.includes("style") ||
    lower.includes("format") ||
    lower.includes("prefer")
  )
    return "style_preference";
  if (
    lower.includes("legal") ||
    lower.includes("law") ||
    lower.includes("accuracy")
  )
    return "legal_accuracy";
  return "general";
}

export async function categorizeFromNote(
  note: string
): Promise<NonNullable<LessonCategory>> {
  try {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const { generateText } = await import("ai");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return categorizeFromNoteKeyword(note);
    const anthropic = createAnthropic({ apiKey });
    const categoryList = Object.entries(CATEGORY_DEFINITIONS)
      .map(([key, desc]) => `- ${key}: ${desc}`)
      .join("\n");
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      maxOutputTokens: 50,
      system:
        "You are a classifier. Respond with ONLY the category name, nothing else.",
      prompt: `Classify this attorney feedback into exactly one category:\n\nFeedback: "${note}"\n\nCategories:\n${categoryList}\n\nCategory:`,
      abortSignal: AbortSignal.timeout(10_000),
    });
    const category = result.text
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "") as NonNullable<LessonCategory>;
    const validCategories = Object.keys(CATEGORY_DEFINITIONS);
    if (validCategories.includes(category)) {
      return category;
    }
    return categorizeFromNoteKeyword(note);
  } catch (err) {
    logger.warn({ err: err }, "[Learning] AI categorization failed, using keyword fallback:");
    return categorizeFromNoteKeyword(note);
  }
}
