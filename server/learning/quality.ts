/**
 * Learning — Quality score computation and lesson consolidation
 */
import {
  createLetterQualityScore,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  getReviewActions,
  getWorkflowJobsByLetterId,
  getActiveLessonsForScope,
  updateLessonEffectivenessScores,
  getDistinctLessonScopes,
  archiveStaleIneffectiveLessons,
  createPipelineLesson,
} from "../db";
import { addServerBreadcrumb, captureServerException } from "../sentry";
import type { InsertPipelineLesson } from "../../drizzle/schema";
import { logger } from "../logger";
import { computeWordLevelEditDistance } from "./dedup";
import type { LessonCategory } from "./categories";

type LetterType = InsertPipelineLesson["letterType"];

export async function computeAndStoreQualityScore(
  letterId: number,
  outcome: "approved" | "rejected",
  finalContent?: string
): Promise<void> {
  try {
    const letter = await getLetterRequestById(letterId);
    if (!letter) return;
    const versions = await getLetterVersionsByRequestId(letterId, true);
    const reviewActionsList = await getReviewActions(letterId, true);
    const workflowJobsList = await getWorkflowJobsByLetterId(letterId);
    const revisionCount = versions?.length ?? 0;
    const vettingJobs =
      workflowJobsList?.filter((j) => {
        const meta = j.requestPayloadJson as Record<string, unknown> | null;
        return (
          j.jobType === "generation_pipeline" ||
          j.jobType === "retry" ||
          (meta?.stage === "vetting")
        );
      }) ?? [];
    const vettingPassCount = vettingJobs.filter(
      (j) => j.status === "completed"
    ).length;
    const vettingFailCount = vettingJobs.filter(
      (j) => j.status === "failed"
    ).length;

    let editDistance: number | undefined;
    if (outcome === "approved" && finalContent) {
      const aiDraft = versions?.find((v) => v.versionType === "ai_draft");
      if (aiDraft?.content) {
        editDistance = computeWordLevelEditDistance(
          aiDraft.content,
          finalContent
        );
      }
    }

    const changesRequestedActions =
      reviewActionsList?.filter(
        (a) => a.action === "requested_changes" || a.action === "rejected"
      ) ?? [];
    const firstPassApproved =
      changesRequestedActions.length === 0 && outcome === "approved";

    let timeToFirstReviewMs: number | undefined;
    let timeToApprovalMs: number | undefined;
    const sortedActions = [...(reviewActionsList ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const submittedAction = sortedActions.find(
      (a) => a.toStatus === "submitted" || a.toStatus === "under_review"
    );
    const firstClaim = sortedActions.find(
      (a) => a.action === "claimed_for_review"
    );
    const finalAction = sortedActions.find(
      (a) => a.action === "approved" || a.action === "rejected"
    );
    const baseTime = submittedAction
      ? new Date(submittedAction.createdAt).getTime()
      : letter.createdAt
      ? new Date(letter.createdAt).getTime()
      : undefined;

    if (firstClaim && baseTime) {
      timeToFirstReviewMs =
        new Date(firstClaim.createdAt).getTime() - baseTime;
    }
    if (finalAction && baseTime) {
      timeToApprovalMs = new Date(finalAction.createdAt).getTime() - baseTime;
    }

    let computedScore = 100;
    if (!firstPassApproved) computedScore -= 30;
    if (revisionCount > 1) computedScore -= Math.min(revisionCount * 5, 20);
    if (vettingFailCount > 0)
      computedScore -= Math.min(vettingFailCount * 10, 20);
    if (editDistance !== undefined && editDistance > 20)
      computedScore -= Math.min(editDistance / 2, 20);
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
      const activeLessons = await getActiveLessonsForScope({
        letterType: letter.letterType as string,
        jurisdiction: letter.jurisdictionState ?? undefined,
      });
      const injectedIds = (activeLessons ?? [])
        .filter((l) => (l.timesInjected ?? 0) > 0)
        .map((l) => l.id);
      if (injectedIds.length > 0) {
        await updateLessonEffectivenessScores(
          injectedIds,
          Math.round(computedScore)
        );
      }
    } catch (effErr) {
      logger.warn({ err: effErr }, "[Learning] Failed to update effectiveness scores:");
    }

    logger.info(
      `[Learning] Quality score computed for letter #${letterId}: ${Math.round(computedScore)}/100 ` +
        `(firstPass=${firstPassApproved}, revisions=${revisionCount}, editDist=${editDistance ?? "N/A"})`
    );
  } catch (err) {
    logger.error({ err: err }, `[Learning] Failed to compute quality score for letter #${letterId}:`);
  }
}

export async function consolidateLessonsForScope(
  letterType: string,
  jurisdiction: string | null
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
  const lessonList = lessons
    .map((l) => `[ID:${l.id}] [${l.category}] ${l.lessonText}`)
    .join("\n");
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
    "citation_error",
    "jurisdiction_error",
    "tone_issue",
    "structure_issue",
    "factual_error",
    "bloat_detected",
    "missing_section",
    "style_preference",
    "legal_accuracy",
    "general",
  ]);
  let consolidated = 0;
  let deactivated = 0;
  const { updatePipelineLesson } = await import("../db");

  for (const group of groups) {
    if (
      !group.combinedText ||
      typeof group.combinedText !== "string" ||
      group.combinedText.length < 5
    )
      continue;
    if (!Array.isArray(group.sourceIds)) continue;
    const verifiedIds = group.sourceIds.filter(
      (id) => typeof id === "number" && validIds.has(id)
    );
    if (verifiedIds.length <= 1) continue;
    const safeCategory = validCategories.has(group.category)
      ? group.category
      : "general";
    const safeWeight = Math.max(
      10,
      Math.min(
        typeof group.weight === "number" ? group.weight : 50,
        100
      )
    );
    await createPipelineLesson({
      letterType: letterType as LetterType,
      jurisdiction,
      pipelineStage:
        lessons.find((l) => verifiedIds.includes(l.id))?.pipelineStage ??
        null,
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

  logger.info(
    `[Learning] Consolidation complete for ${letterType}/${jurisdiction ?? "all"}: ${consolidated} new lessons, ${deactivated} deactivated`
  );
  addServerBreadcrumb("learning", "Lesson consolidation completed", {
    letterType,
    jurisdiction,
    consolidated,
    deactivated,
  });
  return { consolidated, deactivated };
}

export async function runAutomatedConsolidation(): Promise<{
  scopesProcessed: number;
  totalConsolidated: number;
  totalDeactivated: number;
  errors: number;
}> {
  const scopes = await getDistinctLessonScopes(5);
  let scopesProcessed = 0;
  let totalConsolidated = 0;
  let totalDeactivated = 0;
  let errors = 0;

  logger.info(
    `[Learning] Automated consolidation starting — ${scopes.length} scope(s) with 5+ active lessons`
  );
  addServerBreadcrumb("learning", "Automated consolidation starting", {
    scopeCount: scopes.length,
    scopes: scopes.map(
      (s) => `${s.letterType}/${s.jurisdiction ?? "all"} (${s.count})`
    ),
  });

  for (const scope of scopes) {
    try {
      const result = await consolidateLessonsForScope(
        scope.letterType,
        scope.jurisdiction
      );
      scopesProcessed++;
      totalConsolidated += result.consolidated;
      totalDeactivated += result.deactivated;
    } catch (err) {
      errors++;
      logger.error({ err: err }, `[Learning] Consolidation failed for ${scope.letterType}/${scope.jurisdiction ?? "all"}:`);
      captureServerException(err, {
        tags: { component: "learning", job: "consolidation" },
        extra: {
          letterType: scope.letterType,
          jurisdiction: scope.jurisdiction,
        },
      });
    }
  }

  logger.info(
    `[Learning] Automated consolidation complete — scopes: ${scopesProcessed}, consolidated: ${totalConsolidated}, deactivated: ${totalDeactivated}, errors: ${errors}`
  );
  addServerBreadcrumb("learning", "Automated consolidation complete", {
    scopesProcessed,
    totalConsolidated,
    totalDeactivated,
    errors,
  });
  return { scopesProcessed, totalConsolidated, totalDeactivated, errors };
}

export async function archiveIneffectiveLessons(): Promise<{
  archived: number;
  reasons: Record<string, number>;
}> {
  const archivedRows = await archiveStaleIneffectiveLessons();
  const reasons: Record<string, number> = {};
  if (archivedRows.length === 0) {
    logger.info("[Learning] Auto-archival: no stale/ineffective lessons found");
    return { archived: 0, reasons };
  }
  for (const row of archivedRows) {
    const reason = row.archival_reason;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const ids = archivedRows.map((r) => r.id);
  const reasonSummary = Object.entries(reasons)
    .map(([r, c]) => `${r}: ${c}`)
    .join(", ");
  logger.info(
    `[Learning] Auto-archival complete: ${archivedRows.length} lessons deactivated (${reasonSummary})`
  );
  addServerBreadcrumb("learning", "Auto-archival of ineffective lessons", {
    archived: archivedRows.length,
    reasons,
    archivedIds: ids.slice(0, 20),
  });
  return { archived: archivedRows.length, reasons };
}
