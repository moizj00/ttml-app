import {
  createPipelineLesson,
  createLetterQualityScore,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  getReviewActions,
  getWorkflowJobsByLetterId,
} from "./db";
import type { InsertPipelineLesson } from "../drizzle/schema";

type LetterType = InsertPipelineLesson["letterType"];

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

function categorizeFromNote(note: string): InsertPipelineLesson["category"] {
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

        await createPipelineLesson({
          letterType: letter.letterType as LetterType,
          jurisdiction: letter.jurisdictionState,
          pipelineStage: "assembly",
          category: categorizeFromNote(internalNote ?? lessonText),
          lessonText,
          sourceLetterRequestId: letterId,
          sourceAction: "attorney_approval",
          createdByUserId: reviewerId,
          weight: Math.min(editDistance, 100),
        });
      }
    }

    if (internalNote && internalNote.length > 20) {
      await createPipelineLesson({
        letterType: letter.letterType as LetterType,
        jurisdiction: letter.jurisdictionState,
        pipelineStage: "drafting",
        category: categorizeFromNote(internalNote),
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

    await createPipelineLesson({
      letterType: letter.letterType as LetterType,
      jurisdiction: letter.jurisdictionState,
      pipelineStage: "drafting",
      category: categorizeFromNote(reason),
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
    await createPipelineLesson({
      letterType: letter.letterType as LetterType,
      jurisdiction: letter.jurisdictionState,
      pipelineStage: "drafting",
      category: categorizeFromNote(noteToUse),
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

        await createPipelineLesson({
          letterType: letter.letterType as LetterType,
          jurisdiction: letter.jurisdictionState,
          pipelineStage: "assembly",
          category: categorizeFromNote(note ?? lessonText),
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

    await createPipelineLesson({
      letterType: letter.letterType as LetterType,
      jurisdiction: letter.jurisdictionState,
      pipelineStage: "drafting",
      category: categorizeFromNote(additionalContext),
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

    console.log(
      `[Learning] Quality score computed for letter #${letterId}: ${Math.round(computedScore)}/100 ` +
      `(firstPass=${firstPassApproved}, revisions=${revisionCount}, editDist=${editDistance ?? "N/A"})`
    );
  } catch (err) {
    console.error(`[Learning] Failed to compute quality score for letter #${letterId}:`, err);
  }
}
