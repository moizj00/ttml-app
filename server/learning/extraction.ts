/**
 * Learning — Lesson extraction from attorney review actions
 */
import {
  getLetterRequestById,
  getLetterVersionsByRequestId,
} from "../db";
import type { InsertPipelineLesson } from "../../drizzle/schema";
import { logger } from "../logger";
import { categorizeFromNote } from "./categories";
import { createLessonWithDedup, computeWordLevelEditDistance } from "./dedup";

type LetterType = InsertPipelineLesson["letterType"];

export async function extractLessonFromApproval(
  letterId: number,
  internalNote: string | undefined,
  reviewerId: number
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;

    const versions = await getLetterVersionsByRequestId(letterId, true);
    const aiDraft = versions?.find((v) => v.versionType === "ai_draft");
    const finalVersion = versions?.find(
      (v) =>
        v.versionType === "attorney_edit" ||
        v.versionType === "final_approved"
    );

    if (aiDraft?.content && finalVersion?.content) {
      const editDistance = computeWordLevelEditDistance(
        aiDraft.content,
        finalVersion.content
      );
      if (editDistance > 5) {
        await createLessonWithDedup({
          letterType: letter.letterType as LetterType,
          jurisdiction: letter.jurisdictionState,
          pipelineStage: "assembly",
          category: "general",
          lessonText: `Attorney approved with ${editDistance}% word-level edits to ${letter.letterType} letter in ${letter.jurisdictionState ?? "unknown"} jurisdiction.`,
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
    logger.error({ err: err }, `[Learning] Failed to extract lesson from approval for letter #${letterId}:`);
  }
}

export async function extractLessonFromRejection(
  letterId: number,
  reason: string,
  reviewerId: number
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
    logger.error({ err: err }, `[Learning] Failed to extract lesson from rejection for letter #${letterId}:`);
  }
}

export async function extractLessonFromChangesRequest(
  letterId: number,
  internalNote: string | undefined,
  userVisibleNote: string,
  reviewerId: number
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
    logger.error({ err: err }, `[Learning] Failed to extract lesson from changes request for letter #${letterId}:`);
  }
}

export async function extractLessonFromEdit(
  letterId: number,
  editContent: string,
  note: string | undefined,
  reviewerId: number
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;
    const versions = await getLetterVersionsByRequestId(letterId, true);
    const aiDraft = versions?.find((v) => v.versionType === "ai_draft");
    if (aiDraft?.content) {
      const editDistance = computeWordLevelEditDistance(
        aiDraft.content,
        editContent
      );
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
    logger.error({ err: err }, `[Learning] Failed to extract lesson from edit for letter #${letterId}:`);
  }
}

export async function extractLessonFromSubscriberFeedback(
  letterId: number,
  additionalContext: string,
  subscriberId: number,
  sourceAction: "subscriber_update" | "subscriber_retry"
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
    logger.error({ err: err }, `[Learning] Failed to extract lesson from subscriber feedback for letter #${letterId}:`);
  }
}
