import { AIMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import {
  getDb,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateWorkflowJob,
} from "../../../db";
import { letterRequests, letterVersions } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { PipelineStateType } from "../state";
import { dispatchFreePreviewIfReady } from "../../../freePreviewEmailCron";
import { breadcrumb, totalTokens } from "../memory";
import { resolveDraftPreviewFinalStatus } from "../../preview-gate";

const log = createLogger({ module: "LangGraph:FinalizeNode" });

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: finalize
// Saves the vetted letter as a letter_versions record,
// updates letter_requests with quality flags, transitions
// status to 'generated_locked', and closes out the
// workflow_jobs row with aggregated token usage from the
// shared context so admin monitor shows totals.
// ═══════════════════════════════════════════════════════

export async function finalizeNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const {
    letterId,
    vettedLetter,
    assembledLetter,
    qualityDegraded,
    researchUnverified,
    vettingReport,
    qualityWarnings,
    workflowJobId,
    sharedContext,
  } = state;

  const finalContent = vettedLetter || assembledLetter;
  const tokenTotals = totalTokens(sharedContext.tokenUsage ?? []);
  log.info(
    {
      letterId,
      chars: finalContent.length,
      qualityDegraded,
      totalTokens: tokenTotals.totalTokens,
      stages: (sharedContext.tokenUsage ?? []).length,
    },
    "[FinalizeNode] Saving final letter version"
  );

  const db = await getDb();
  if (!db) {
    throw new Error(
      "[FinalizeNode] Database connection unavailable — cannot finalize letter"
    );
  }

  // Insert letter version (immutable record)
  // actorTypeEnum does not have "ai" — use "system" for AI-generated content
  const [version] = await db
    .insert(letterVersions)
    .values({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: finalContent,
      createdByType: "system",
      metadataJson: {
        vettingReport,
        qualityWarnings,
        researchUnverified,
        qualityDegraded,
        generatedBy: "langgraph-pipeline",
        generatedAt: new Date().toISOString(),
        tokenUsage: sharedContext.tokenUsage ?? [],
        totalTokens: tokenTotals.totalTokens,
        breadcrumbs: sharedContext.breadcrumbs ?? [],
      },
    })
    .returning({ id: letterVersions.id });

  const versionId = version?.id ?? null;

  // Update quality flags first (independent of status transition)
  await db
    .update(letterRequests)
    .set({
      researchUnverified,
      qualityDegraded,
      updatedAt: new Date(),
    })
    .where(eq(letterRequests.id, letterId));

  // Update the version pointer via the canonical helper
  if (versionId !== null) {
    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: versionId,
    });
  }

  // Transition status via updateLetterStatus() — enforces ALLOWED_TRANSITIONS
  // If this is a free preview, set status to ai_generation_completed_hidden (Procedure 4)
  const finalStatus = resolveDraftPreviewFinalStatus(state.isFreePreview);
  await updateLetterStatus(letterId, finalStatus);

  // Close out the workflow_jobs row so admin monitor shows this run as
  // completed with aggregated token totals. Wrapped in try/catch because
  // a transient DB hiccup here must not abort finalization.
  if (workflowJobId > 0) {
    try {
      await updateWorkflowJob(workflowJobId, {
        status: "completed",
        promptTokens: tokenTotals.promptTokens,
        completionTokens: tokenTotals.completionTokens,
        completedAt: new Date(),
      });
    } catch (err) {
      log.warn(
        {
          letterId,
          workflowJobId,
          err: err instanceof Error ? err.message : String(err),
        },
        "[FinalizeNode] Failed to close workflow_jobs row — letter finalized anyway"
      );
    }
  }

  // Free-preview hook: for letters on the lead-magnet path whose unlock
  // window has already elapsed (admin-forced), fire the "your preview is
  // ready" email immediately now that the draft is saved. For normal
  // letters the 24h unlockAt is still in the future and the dispatcher
  // no-ops; the cron will pick them up when the window elapses.
  // Fire-and-forget — a dispatch failure must never abort the pipeline.
  dispatchFreePreviewIfReady(letterId).catch(err =>
    log.warn(
      { letterId, err: err instanceof Error ? err.message : String(err) },
      "[FinalizeNode] dispatchFreePreviewIfReady threw (non-fatal)"
    )
  );

  log.info(
    {
      letterId,
      versionId,
      qualityDegraded,
      researchUnverified,
      totalTokens: tokenTotals.totalTokens,
    },
    `[FinalizeNode] Letter finalized → ${finalStatus}`
  );

  return {
    currentStage: "done",
    sharedContext: {
      breadcrumbs: [
        breadcrumb(
          "finalize",
          `Letter saved as version ${versionId}, totalTokens=${tokenTotals.totalTokens}`
        ),
      ],
    } as any,
    messages: [
      new AIMessage(
        `[Finalize] Letter #${letterId} saved as version ${versionId} → ${finalStatus}`
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: fail
// Called when all retries are exhausted. Also closes out
// the workflow_jobs row as failed so admin monitor sees it.
// ═══════════════════════════════════════════════════════

export async function failNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const { letterId, workflowJobId, lastErrorStage, sharedContext } = state;
  const tokenTotals = totalTokens(sharedContext.tokenUsage ?? []);
  log.error(
    { letterId, lastErrorStage, totalTokens: tokenTotals.totalTokens },
    "[FailNode] Pipeline exhausted all retries → pipeline_failed"
  );

  await updateLetterStatus(letterId, "pipeline_failed");

  if (workflowJobId > 0) {
    try {
      await updateWorkflowJob(workflowJobId, {
        status: "failed",
        promptTokens: tokenTotals.promptTokens,
        completionTokens: tokenTotals.completionTokens,
        errorMessage: lastErrorStage
          ? `Failed at stage: ${lastErrorStage}`
          : "Pipeline retries exhausted",
        completedAt: new Date(),
      });
    } catch (err) {
      log.warn(
        {
          letterId,
          workflowJobId,
          err: err instanceof Error ? err.message : String(err),
        },
        "[FailNode] Failed to close workflow_jobs row"
      );
    }
  }

  return {
    currentStage: "failed",
    sharedContext: {
      breadcrumbs: [
        breadcrumb(
          "fail",
          `Pipeline failed at stage=${lastErrorStage || "unknown"}`
        ),
      ],
    } as any,
    messages: [new AIMessage(`[Fail] Letter #${letterId} → pipeline_failed`)],
  };
}
