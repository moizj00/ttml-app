/**
 * Learning — Lesson deduplication and creation helpers
 */
import {
  createPipelineLesson,
  getActiveLessonsForScope,
  boostExistingLesson,
  getAverageQualityScoreForScope,
} from "../db";
import type { InsertPipelineLesson } from "../../drizzle/schema";
import { logger } from "../logger";

/**
 * Computes word-level edit distance between two strings as a percentage (0-100).
 */
export function computeWordLevelEditDistance(a: string, b: string): number {
  const wordsA = a.split(/\s+/).filter(Boolean);
  const wordsB = b.split(/\s+/).filter(Boolean);
  const totalWords = Math.max(wordsA.length, wordsB.length);
  if (totalWords === 0) return 0;
  let matches = 0;
  const setB = new Set(wordsB);
  for (const word of wordsA) {
    if (setB.has(word)) {
      matches++;
      setB.delete(word);
    }
  }
  const similarity = matches / totalWords;
  return Math.round((1 - similarity) * 100);
}

/**
 * Checks if a semantically equivalent lesson already exists and merges into it.
 * Returns true if the lesson was merged (and should NOT be inserted separately).
 */
export async function checkForDuplicateAndMerge(
  data: InsertPipelineLesson
): Promise<boolean> {
  try {
    if (!data.letterType || !data.lessonText) return false;
    const existing = await getActiveLessonsForScope({
      letterType: data.letterType as string,
      jurisdiction: data.jurisdiction ?? undefined,
      pipelineStage: data.pipelineStage as string | undefined,
    });
    if (!existing || existing.length === 0) return false;

    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const { generateText } = await import("ai");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return false;

    const anthropic = createAnthropic({ apiKey });
    const existingList = existing
      .slice(0, 15)
      .map((l) => `[ID:${l.id}] ${l.lessonText}`)
      .join("\n");
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      maxOutputTokens: 30,
      system:
        "You compare lesson texts for semantic similarity. Respond with ONLY the ID number of the matching lesson, or 'NONE' if no match. Nothing else.",
      prompt: `New lesson: "${data.lessonText}"\n\nExisting lessons:\n${existingList}\n\nDoes any existing lesson cover the same core feedback? Reply with the ID number or NONE:`,
      abortSignal: AbortSignal.timeout(10_000),
    });
    const response = result.text.trim();
    if (response === "NONE") return false;
    const matchId = parseInt(response.replace(/\D/g, ""));
    if (!matchId || isNaN(matchId)) return false;
    const matchedLesson = existing.find((l) => l.id === matchId);
    if (!matchedLesson) return false;

    await boostExistingLesson(
      matchId,
      Math.min((matchedLesson.weight ?? 50) + 5, 100)
    );
    logger.info(
      `[Learning] Deduplicated lesson — merged into existing lesson #${matchId} (hitCount boosted)`
    );
    return true;
  } catch (err) {
    logger.warn({ err: err }, "[Learning] Dedup check failed, proceeding with insert:");
    return false;
  }
}

/**
 * Creates a new lesson, but first checks for semantic duplicates.
 * If a duplicate is found, boosts the existing lesson instead.
 */
export async function createLessonWithDedup(
  data: InsertPipelineLesson
): Promise<void> {
  const merged = await checkForDuplicateAndMerge(data);
  if (merged) return;
  const beforeScore = await getAverageQualityScoreForScope(
    data.letterType as string | undefined,
    data.jurisdiction ?? undefined
  );
  await createPipelineLesson({
    ...data,
    lettersBeforeAvgScore: beforeScore ?? undefined,
  });
}
