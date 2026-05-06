import {
  createPipelineLesson,
  createLetterQualityScore,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  getReviewActions,
  getWorkflowJobsByLetterId,
  getActiveLessonsForScope,
  boostExistingLesson,
  updateLessonEffectivenessScores,
  getAverageQualityScoreForScope,
} from "./db";
import type { InsertPipelineLesson, PipelineLesson } from "../drizzle/schema";

type LetterType = InsertPipelineLesson["letterType"];
type LessonCategory = InsertPipelineLesson["category"];

const CATEGORY_DEFINITIONS: Record<string, string> = {
  citation_error: "Issues with legal citations, case references, statutes, or regulatory references being wrong, missing, or improperly formatted.",
  jurisdiction_error: "Wrong jurisdiction referenced, incorrect state-specific laws applied, or failure to account for jurisdictional differences.",
  tone_issue: "The tone of the letter is inappropriate — too aggressive, too passive, insufficiently formal, or mismatched with the letter type.",
  structure_issue: "Problems with the letter's organization, section ordering, paragraph structure, or logical flow.",
  factual_error: "Incorrect facts, inaccurate claims, wrong dates, or misrepresentation of client circumstances.",
  bloat_detected: "Unnecessary filler, verbose language, repetitive statements, or content that dilutes the letter's effectiveness.",
  missing_section: "A required section, clause, or piece of information is absent from the letter.",
  style_preference: "Attorney preferences for formatting, writing style, phrasing choices, or conventions.",
  legal_accuracy: "General legal accuracy concerns — incorrect legal principles, outdated law references, or legal reasoning errors.",
  general: "General feedback that doesn't fit a specific category above.",
};

function categorizeFromNoteKeyword(note: string): NonNullable<LessonCategory> {
  const lower = note.toLowerCase();
  if (lower.includes("citation") || lower.includes("cite") || lower.includes("statute"))
    return "citation_error";
  if (lower.includes("jurisdiction") || lower.includes("state law") || lower.includes("wrong state"))
    return "jurisdiction_error";
  if (lower.includes("tone") || lower.includes("aggressive") || lower.includes("softer"))
    return "tone_issue";
  if (lower.includes("structure") || lower.includes("section") || lower.includes("paragraph"))
    return "structure_issue";
  if (lower.includes("fact") || lower.includes("inaccurate") || lower.includes("incorrect"))
    return "factual_error";
  if (lower.includes("filler") || lower.includes("bloat") || lower.includes("verbose"))
    return "bloat_detected";
  if (lower.includes("missing") || lower.includes("add") || lower.includes("include"))
    return "missing_section";
  if (lower.includes("style") || lower.includes("format") || lower.includes("prefer"))
    return "style_preference";
  if (lower.includes("legal") || lower.includes("law") || lower.includes("accuracy"))
    return "legal_accuracy";
  return "general";
}

async function categorizeFromNote(note: string): Promise<NonNullable<LessonCategory>> {
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
      model: anthropic("claude-sonnet-4-20250514"),
      maxOutputTokens: 50,
      system: "You are a classifier. Respond with ONLY the category name, nothing else.",
      prompt: `Classify this attorney feedback into exactly one category:\n\nFeedback: "${note}"\n\nCategories:\n${categoryList}\n\nCategory:`,
      abortSignal: AbortSignal.timeout(10_000),
    });

    const category = result.text.trim().toLowerCase().replace(/[^a-z_]/g, "") as NonNullable<LessonCategory>;
    const validCategories = Object.keys(CATEGORY_DEFINITIONS);
    if (validCategories.includes(category)) {
      return category;
    }
    return categorizeFromNoteKeyword(note);
  } catch (err) {
    console.warn("[Learning] AI categorization failed, using keyword fallback:", err);
    return categorizeFromNoteKeyword(note);
  }
}

async function checkForDuplicateAndMerge(
  data: InsertPipelineLesson,
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
      .map((l, i) => `[ID:${l.id}] ${l.lessonText}`)
      .join("\n");

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      maxOutputTokens: 30,
      system: "You compare lesson texts for semantic similarity. Respond with ONLY the ID number of the matching lesson, or 'NONE' if no match. Nothing else.",
      prompt: `New lesson: "${data.lessonText}"\n\nExisting lessons:\n${existingList}\n\nDoes any existing lesson cover the same core feedback? Reply with the ID number or NONE:`,
      abortSignal: AbortSignal.timeout(10_000),
    });

    const response = result.text.trim();
    if (response === "NONE") return false;

    const matchId = parseInt(response.replace(/\D/g, ""));
    if (!matchId || isNaN(matchId)) return false;

    const matchedLesson = existing.find((l) => l.id === matchId);
    if (!matchedLesson) return false;

    await boostExistingLesson(matchId, Math.min((matchedLesson.weight ?? 50) + 5, 100));
    console.log(`[Learning] Deduplicated lesson — merged into existing lesson #${matchId} (hitCount boosted)`);
    return true;
  } catch (err) {
    console.warn("[Learning] Dedup check failed, proceeding with insert:", err);
    return false;
  }
}

async function createLessonWithDedup(data: InsertPipelineLesson): Promise<void> {
  const merged = await checkForDuplicateAndMerge(data);
  if (merged) return;

  const beforeScore = await getAverageQualityScoreForScope(
    data.letterType as string | undefined,
    data.jurisdiction ?? undefined,
  );
  await createPipelineLesson({
    ...data,
    lettersBeforeAvgScore: beforeScore ?? undefined,
  });
}

function computeWordLevelEditDistance(a: string, b: string): number {
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

export async function extractLessonFromApproval(
  letterId: number,
  finalContent: string,
  reviewerId: number,
  internalNote?: string,
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    const versions = await getLetterVersionsByRequestId(letterId, true);
    const aiDraft = versions?.find((v) => v.versionType === "ai_draft");

    if (aiDraft && aiDraft.content) {
      const editDistance = computeWordLevelEditDistance(aiDraft.content, finalContent);
      if (editDistance > 15) {
        const lessonText = internalNote
          ? `Attorney made significant edits (${editDistance}% change) during approval. Notes: ${internalNote}`
          : `Attorney made significant edits (${editDistance}% word-level change) during approval. The AI draft needed substantial revision for this ${letter.letterType} letter in ${letter.jurisdictionState ?? "unknown"} jurisdiction.`;

        const category = await categorizeFromNote(internalNote ?? lessonText);
        await createLessonWithDedup({
          letterType: letter.letterType as LetterType,
          jurisdiction: letter.jurisdictionState,
          pipelineStage: "assembly",
          category,
          lessonText,
          sourceLetterRequestId: letterId,
          sourceAction: "attorney_approval",
          createdByUserId: reviewerId,
          weight: Math.min(editDistance, 100),
        });
      }
    }

    if (internalNote && internalNote.length > 20) {
      const category = await categorizeFromNote(internalNote);
      await createLessonWithDedup({
        letterType: letter.letterType as LetterType,
        jurisdiction: letter.jurisdictionState,
        pipelineStage: "drafting",
        category,
        lessonText: `Approval note for ${letter.letterType}: ${internalNote}`,
        sourceLetterRequestId: letterId,
        sourceAction: "attorney_approval",
        createdByUserId: reviewerId,
        weight: 40,
      });
    }
  } catch (err) {
    console.error(`[Learning] Failed to extract lesson from approval for letter #${letterId}:`, err);
  }
}

export async function extractLessonFromRejection(
  letterId: number,
  reason: string,
  reviewerId: number,
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    const category = await categorizeFromNote(reason);
    await createLessonWithDedup({
      letterType: letter.letterType as LetterType,
      jurisdiction: letter.jurisdictionState,
      pipelineStage: "drafting",
      category,
      lessonText: `REJECTION: ${reason}`,
      sourceLetterRequestId: letterId,
      sourceAction: "attorney_rejection",
      createdByUserId: reviewerId,
      weight: 80,
    });
  } catch (err) {
    console.error(`[Learning] Failed to extract lesson from rejection for letter #${letterId}:`, err);
  }
}

export async function extractLessonFromChangesRequest(
  letterId: number,
  internalNote: string | undefined,
  userVisibleNote: string,
  reviewerId: number,
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    const noteToUse = internalNote || userVisibleNote;
    const category = await categorizeFromNote(noteToUse);
    await createLessonWithDedup({
      letterType: letter.letterType as LetterType,
      jurisdiction: letter.jurisdictionState,
      pipelineStage: "drafting",
      category,
      lessonText: `CHANGES REQUESTED: ${noteToUse}`,
      sourceLetterRequestId: letterId,
      sourceAction: "attorney_changes",
      createdByUserId: reviewerId,
      weight: 60,
    });
  } catch (err) {
    console.error(`[Learning] Failed to extract lesson from changes request for letter #${letterId}:`, err);
  }
}

export async function extractLessonFromEdit(
  letterId: number,
  editContent: string,
  note: string | undefined,
  reviewerId: number,
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    const versions = await getLetterVersionsByRequestId(letterId, true);
    const aiDraft = versions?.find((v) => v.versionType === "ai_draft");

    if (aiDraft?.content) {
      const editDistance = computeWordLevelEditDistance(aiDraft.content, editContent);
      if (editDistance > 10) {
        const lessonText = note
          ? `Attorney edit (${editDistance}% change): ${note}`
          : `Attorney made ${editDistance}% word-level edits to ${letter.letterType} letter in ${letter.jurisdictionState ?? "unknown"} jurisdiction.`;

        const category = await categorizeFromNote(note ?? lessonText);
        await createLessonWithDedup({
          letterType: letter.letterType as LetterType,
          jurisdiction: letter.jurisdictionState,
          pipelineStage: "assembly",
          category,
          lessonText,
          sourceLetterRequestId: letterId,
          sourceAction: "attorney_edit",
          createdByUserId: reviewerId,
          weight: Math.min(editDistance, 80),
        });
      }
    }
  } catch (err) {
    console.error(`[Learning] Failed to extract lesson from edit for letter #${letterId}:`, err);
  }
}

export async function extractLessonFromSubscriberFeedback(
  letterId: number,
  additionalContext: string,
  subscriberId: number,
  sourceAction: "subscriber_update" | "subscriber_retry",
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    if (!additionalContext || additionalContext.trim().length < 10) return;

    const category = await categorizeFromNote(additionalContext);
    await createLessonWithDedup({
      letterType: letter.letterType as LetterType,
      jurisdiction: letter.jurisdictionState,
      pipelineStage: "drafting",
      category,
      lessonText: `SUBSCRIBER FEEDBACK (${sourceAction}): ${additionalContext}`,
      sourceLetterRequestId: letterId,
      sourceAction,
      createdByUserId: subscriberId,
      weight: 35,
    });
  } catch (err) {
    console.error(`[Learning] Failed to extract lesson from subscriber feedback for letter #${letterId}:`, err);
  }
}

export async function computeAndStoreQualityScore(
  letterId: number,
  outcome: "approved" | "rejected",
  finalContent?: string,
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    const versions = await getLetterVersionsByRequestId(letterId, true);
    const reviewActionsList = await getReviewActions(letterId, true);
    const workflowJobsList = await getWorkflowJobsByLetterId(letterId);

    const revisionCount = versions?.length ?? 0;

    const vettingJobs = workflowJobsList?.filter((j) => {
      const meta = j.requestPayloadJson as Record<string, unknown> | null;
      return j.jobType === "generation_pipeline" ||
        j.jobType === "retry" ||
        (meta?.stage === "vetting");
    }) ?? [];
    const vettingPassCount = vettingJobs.filter((j) => j.status === "completed").length;
    const vettingFailCount = vettingJobs.filter((j) => j.status === "failed").length;

    let editDistance: number | undefined;
    if (outcome === "approved" && finalContent) {
      const aiDraft = versions?.find((v) => v.versionType === "ai_draft");
      if (aiDraft?.content) {
        editDistance = computeWordLevelEditDistance(aiDraft.content, finalContent);
      }
    }

    const changesRequestedActions = reviewActionsList?.filter((a) =>
      a.action === "requested_changes" || a.action === "rejected"
    ) ?? [];
    const firstPassApproved = changesRequestedActions.length === 0 && outcome === "approved";

    let timeToFirstReviewMs: number | undefined;
    let timeToApprovalMs: number | undefined;

    const sortedActions = [...(reviewActionsList ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const submittedAction = sortedActions.find((a) =>
      a.toStatus === "submitted" || a.toStatus === "under_review"
    );
    const firstClaim = sortedActions.find((a) => a.action === "claimed_for_review");
    const finalAction = sortedActions.find((a) =>
      a.action === "approved" || a.action === "rejected"
    );

    const baseTime = submittedAction
      ? new Date(submittedAction.createdAt).getTime()
      : (letter.createdAt ? new Date(letter.createdAt).getTime() : undefined);

    if (firstClaim && baseTime) {
      timeToFirstReviewMs = new Date(firstClaim.createdAt).getTime() - baseTime;
    }
    if (finalAction && baseTime) {
      timeToApprovalMs = new Date(finalAction.createdAt).getTime() - baseTime;
    }

    let computedScore = 100;
    if (!firstPassApproved) computedScore -= 30;
    if (revisionCount > 1) computedScore -= Math.min(revisionCount * 5, 20);
    if (vettingFailCount > 0) computedScore -= Math.min(vettingFailCount * 10, 20);
    if (editDistance !== undefined && editDistance > 20) computedScore -= Math.min(editDistance / 2, 20);
    if (outcome === "rejected") computedScore = Math.min(computedScore, 20);
    computedScore = Math.max(0, Math.min(100, computedScore));

    await createLetterQualityScore({
      letterRequestId: letterId,
      firstPassApproved,
      revisionCount,
      vettingPassCount,
      vettingFailCount,
      attorneyEditDistance: editDistance,
      timeToFirstReviewMs,
      timeToApprovalMs,
      computedScore: Math.round(computedScore),
    });

    try {
      const { getActiveLessonsForScope } = await import("./db");
      const activeLessons = await getActiveLessonsForScope({
        letterType: letter.letterType as string,
        jurisdiction: letter.jurisdictionState ?? undefined,
      });
      const injectedIds = (activeLessons ?? [])
        .filter((l) => (l.timesInjected ?? 0) > 0)
        .map((l) => l.id);
      if (injectedIds.length > 0) {
        await updateLessonEffectivenessScores(injectedIds, Math.round(computedScore));
      }
    } catch (effErr) {
      console.warn("[Learning] Failed to update effectiveness scores:", effErr);
    }

    console.log(
      `[Learning] Quality score computed for letter #${letterId}: ${Math.round(computedScore)}/100 ` +
      `(firstPass=${firstPassApproved}, revisions=${revisionCount}, editDist=${editDistance ?? "N/A"})`
    );
  } catch (err) {
    console.error(`[Learning] Failed to compute quality score for letter #${letterId}:`, err);
  }
}

export async function consolidateLessonsForScope(
  letterType: string,
  jurisdiction: string | null,
): Promise<{ consolidated: number; deactivated: number }> {
  const lessons = await getActiveLessonsForScope({
    letterType,
    jurisdiction: jurisdiction ?? undefined,
  });

  if (!lessons || lessons.length < 2) {
    return { consolidated: 0, deactivated: 0 };
  }

  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const { generateText } = await import("ai");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for consolidation");

  const anthropic = createAnthropic({ apiKey });
  const lessonList = lessons.map((l) => `[ID:${l.id}] [${l.category}] ${l.lessonText}`).join("\n");

  const result = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    maxOutputTokens: 4000,
    system: `You are a legal operations AI. You consolidate overlapping lessons into cleaner, non-redundant combined lessons. Output ONLY valid JSON.`,
    prompt: `Given these lessons for "${letterType}" letters${jurisdiction ? ` in ${jurisdiction}` : ""}:\n\n${lessonList}\n\nGroup semantically similar lessons and write one improved, combined lesson per group. Lessons that are unique should remain as-is.\n\nReturn JSON array:\n[\n  {\n    "combinedText": "the merged lesson text",\n    "category": "one of: citation_error, jurisdiction_error, tone_issue, structure_issue, factual_error, bloat_detected, missing_section, style_preference, legal_accuracy, general",\n    "sourceIds": [1, 2, 3],\n    "weight": 60\n  }\n]\n\nOnly group lessons that truly overlap. Keep unique lessons separate (sourceIds will have one ID).`,
    abortSignal: AbortSignal.timeout(30_000),
  });

  let groups: Array<{
    combinedText: string;
    category: string;
    sourceIds: number[];
    weight: number;
  }>;

  try {
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");
    groups = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse consolidation response from AI");
  }

  const validIds = new Set(lessons.map((l) => l.id));
  const validCategories = new Set([
    "citation_error", "jurisdiction_error", "tone_issue", "structure_issue",
    "factual_error", "bloat_detected", "missing_section", "style_preference",
    "legal_accuracy", "general",
  ]);

  let consolidated = 0;
  let deactivated = 0;

  const { updatePipelineLesson } = await import("./db");

  for (const group of groups) {
    if (!group.combinedText || typeof group.combinedText !== "string" || group.combinedText.length < 5) continue;
    if (!Array.isArray(group.sourceIds)) continue;

    const verifiedIds = group.sourceIds.filter((id) => typeof id === "number" && validIds.has(id));
    if (verifiedIds.length <= 1) continue;

    const safeCategory = validCategories.has(group.category) ? group.category : "general";
    const safeWeight = Math.max(10, Math.min(typeof group.weight === "number" ? group.weight : 50, 100));

    await createPipelineLesson({
      letterType: letterType as LetterType,
      jurisdiction,
      pipelineStage: lessons.find((l) => verifiedIds.includes(l.id))?.pipelineStage ?? null,
      category: safeCategory as NonNullable<LessonCategory>,
      lessonText: group.combinedText,
      sourceAction: "consolidation",
      weight: safeWeight,
      consolidatedFromIds: verifiedIds,
      hitCount: verifiedIds.length,
    });

    for (const sourceId of verifiedIds) {
      await updatePipelineLesson(sourceId, { isActive: false });
    }

    consolidated++;
    deactivated += verifiedIds.length;
  }

  console.log(`[Learning] Consolidation complete: ${consolidated} new lessons, ${deactivated} deactivated`);
  return { consolidated, deactivated };
}

export {
  runAutomatedConsolidation,
  archiveIneffectiveLessons,
} from "./learning/quality";
