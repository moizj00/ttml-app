import { AIMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import {
  getDb,
  getLetterRequestById,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateWorkflowJob,
} from "../../../db";
import { letterRequests, letterVersions } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { PipelineStateType } from "../state";
import { dispatchFreePreviewIfReady } from "../../../freePreviewEmailCron";
import { breadcrumb, totalTokens } from "../memory";
import {
  isLetterPreviewGated,
  resolveDraftPreviewFinalStatus,
} from "../../preview-gate";
import { captureServerException } from "../../../sentry";

const log = createLogger({ module: "LangGraph:FinalizeNode" });

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: finalize
// Saves the vetted letter as a letter_versions record,
// updates letter_requests with quality flags, transitions
// status to 'generated_locked', and closes out the
// workflow_jobs row with aggregated token usage from the
// shared context so admin monitor shows totals.
//
// Hardening (audit phase):
//  - Idempotent: if a currentAiDraftVersionId already points at an
//    ai_draft for this letter and the letter is already in
//    generated_locked, no-op rather than creating a duplicate version.
//  - Atomic: insert + pointer update + flag update happen inside a
//    single db.transaction so a partial failure cannot leave a letter
//    with a version row but no pointer (or vice versa). Status
//    transition still goes through updateLetterStatus() so
//    ALLOWED_TRANSITIONS / audit logging continue to apply.
//  - Degraded visibility: when qualityDegraded is true OR the router
//    routed in via finalize_degraded (errorRetryCount >= 3 with content),
//    a structured [FINALIZED-DEGRADED] / [BEST-EFFORT-FINALIZE] warning
//    is appended to qualityWarnings AND persisted into the version
//    metadata, so the attorney UI can surface it.
// ═══════════════════════════════════════════════════════

function buildDegradedWarning(state: PipelineStateType): string {
  const score = state.vettingReport?.overallScore;
  const risk = state.vettingReport?.riskLevel;
  const parts = [
    `retryCount=${state.retryCount}`,
    `errorRetryCount=${state.errorRetryCount}`,
  ];
  if (typeof score === "number") parts.push(`vettingScore=${score}`);
  if (typeof risk === "string") parts.push(`risk=${risk}`);
  if (state.lastErrorCode) parts.push(`lastErrorCode=${state.lastErrorCode}`);
  if (state.lastErrorStage) parts.push(`lastErrorStage=${state.lastErrorStage}`);
  return `[FINALIZED-DEGRADED] ${parts.join(", ")}`;
}

function buildBestEffortWarning(state: PipelineStateType): string {
  const parts = [
    `errorRetryCount=${state.errorRetryCount}`,
    `lastErrorCode=${state.lastErrorCode || "UNKNOWN"}`,
    `lastErrorStage=${state.lastErrorStage || "unknown"}`,
  ];
  return `[BEST-EFFORT-FINALIZE] ${parts.join(", ")}`;
}

export async function finalizeNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const {
    letterId,
    vettedLetter,
    assembledLetter,
    qualityDegraded: vettingDegraded,
    researchUnverified,
    vettingReport,
    vettingReports,
    qualityWarnings,
    workflowJobId,
    sharedContext,
  } = state;

  // Best-effort path is taken when the router routed in despite errorRetryCount
  // >= 3 (it only does so when assembledLetter is non-empty). We coerce
  // qualityDegraded=true in that case so the attorney can see the warning.
  const isBestEffort = state.errorRetryCount >= 3;
  const qualityDegraded = vettingDegraded || isBestEffort;

  const finalContent = vettedLetter || assembledLetter;
  const tokenTotals = totalTokens(sharedContext.tokenUsage ?? []);

  // ─── Idempotency: bail out if this letter is already finalized ────────
  // Without this guard, a graph re-invocation (manual replay, supersede
  // race) could create a duplicate ai_draft row. Letter versions are
  // immutable so we never overwrite — we just no-op.
  try {
    const existing = await getLetterRequestById(letterId);
    if (
      existing &&
      existing.currentAiDraftVersionId &&
      (existing.status === "generated_locked" ||
        existing.status === "ai_generation_completed_hidden")
    ) {
      log.info(
        {
          letterId,
          existingStatus: existing.status,
          currentAiDraftVersionId: existing.currentAiDraftVersionId,
        },
        "[FinalizeNode] Letter already finalized — no-op"
      );
      return {
        currentStage: "done",
        messages: [
          new AIMessage(
            `[Finalize] Letter #${letterId} already finalized (version ${existing.currentAiDraftVersionId}) — no-op`
          ),
        ],
      };
    }
  } catch (err) {
    // Idempotency check failure is non-fatal — fall through to write.
    log.warn(
      { letterId, err: err instanceof Error ? err.message : String(err) },
      "[FinalizeNode] Idempotency lookup failed — proceeding with finalize"
    );
  }

  log.info(
    {
      letterId,
      chars: finalContent.length,
      qualityDegraded,
      bestEffort: isBestEffort,
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

  // Compose the warnings that get persisted with the version + on the letter.
  const persistedWarnings: string[] = [...(qualityWarnings ?? [])];
  if (isBestEffort) persistedWarnings.push(buildBestEffortWarning(state));
  if (qualityDegraded) persistedWarnings.push(buildDegradedWarning(state));

  // ─── Atomic write: version + pointer + quality flags in one tx ────────
  let versionId: number | null = null;
  // tx is typed by drizzle's transaction callback; cast to any here so
  // strict tsc passes even if Postgres-js drizzle types aren't on the
  // resolution path (they always are in CI; this is just a belt-and-braces).
  await db.transaction(async (tx: any) => {
    const [version] = await tx
      .insert(letterVersions)
      .values({
        letterRequestId: letterId,
        versionType: "ai_draft",
        content: finalContent,
        // actorTypeEnum has no "ai" — use "system" for AI-generated content
        createdByType: "system",
        metadataJson: {
          vettingReport,
          vettingReports: vettingReports ?? (vettingReport ? [vettingReport] : []),
          qualityWarnings: persistedWarnings,
          researchUnverified,
          qualityDegraded,
          bestEffort: isBestEffort,
          lastErrorCode: state.lastErrorCode || null,
          lastErrorStage: state.lastErrorStage || null,
          generatedBy: "langgraph-pipeline",
          generatedAt: new Date().toISOString(),
          tokenUsage: sharedContext.tokenUsage ?? [],
          totalTokens: tokenTotals.totalTokens,
          breadcrumbs: sharedContext.breadcrumbs ?? [],
        },
      })
      .returning({ id: letterVersions.id });

    versionId = version?.id ?? null;

    await tx
      .update(letterRequests)
      .set({
        researchUnverified,
        qualityDegraded,
        currentAiDraftVersionId: versionId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(letterRequests.id, letterId));
  });

  // The transaction handled the pointer update for us — but we still call
  // updateLetterVersionPointers as a defensive belt-and-braces in case a
  // concurrent writer raced with us. Cheap idempotent UPDATE.
  if (versionId !== null) {
    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: versionId,
    });
  }

  // Transition status via updateLetterStatus() — enforces ALLOWED_TRANSITIONS.
  // The 24h gate is DB-backed; never trust the graph state flag alone because
  // paid subscribers are also draft-visibility gated.
  const isDraftVisibilityGated = await isLetterPreviewGated(letterId);
  const finalStatus = resolveDraftPreviewFinalStatus(isDraftVisibilityGated);
  await updateLetterStatus(letterId, finalStatus);

  // Close out the workflow_jobs row so admin monitor shows this run as
  // completed with aggregated token totals. Wrapped in try/catch because
  // a transient DB hiccup here must not abort finalization.
  if (workflowJobId > 0) {
    try {
      // The job_status enum has only queued|running|completed|failed —
      // we use "completed" with a tagged errorMessage to surface degraded
      // finalization in the admin pipeline monitor without altering the
      // schema. The ops dashboard already filters by errorMessage prefix.
      const degradedTag = persistedWarnings
        .filter(
          w =>
            w.startsWith("[FINALIZED-DEGRADED]") ||
            w.startsWith("[BEST-EFFORT-FINALIZE]")
        )
        .join(" | ");
      await updateWorkflowJob(workflowJobId, {
        status: "completed",
        promptTokens: tokenTotals.promptTokens,
        completionTokens: tokenTotals.completionTokens,
        completedAt: new Date(),
        ...(qualityDegraded || isBestEffort
          ? { errorMessage: degradedTag || null }
          : {}),
      } as any);
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

  // Surface degraded finalization to Sentry as a breadcrumb / event so the
  // ops team can spot "everything finalizes but always degraded" patterns.
  if (qualityDegraded || isBestEffort) {
    try {
      captureServerException(
        new Error(
          `Letter #${letterId} finalized in degraded state (${isBestEffort ? "best-effort" : "vetting"})`
        ),
        {
          tags: {
            component: "langgraph-finalize",
            error_type: isBestEffort ? "best_effort_finalize" : "finalized_degraded",
          },
          extra: {
            letterId,
            retryCount: state.retryCount,
            errorRetryCount: state.errorRetryCount,
            lastErrorCode: state.lastErrorCode,
            lastErrorStage: state.lastErrorStage,
            vettingScore: vettingReport?.overallScore,
            riskLevel: vettingReport?.riskLevel,
          },
        }
      );
    } catch {
      /* non-fatal observability call */
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
      bestEffort: isBestEffort,
      researchUnverified,
      totalTokens: tokenTotals.totalTokens,
    },
    `[FinalizeNode] Letter finalized → ${finalStatus}`
  );

  return {
    currentStage: "done",
    qualityDegraded,
    qualityWarnings: persistedWarnings.slice((qualityWarnings ?? []).length),
    sharedContext: {
      breadcrumbs: [
        breadcrumb(
          "finalize",
          `Letter saved as version ${versionId}, totalTokens=${tokenTotals.totalTokens}, degraded=${qualityDegraded}, bestEffort=${isBestEffort}`
        ),
      ],
    } as any,
    messages: [
      new AIMessage(
        `[Finalize] Letter #${letterId} saved as version ${versionId} → ${finalStatus}${
          qualityDegraded || isBestEffort ? " (degraded)" : ""
        }`
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: fail
// Called when all retries are exhausted. Also closes out
// the workflow_jobs row as failed so admin monitor sees it.
//
// Persists structured failure context to letterRequests so the
// attorney/admin UI can surface it via qualityDegraded + the
// stored warnings on the most recent version (if one exists).
// ═══════════════════════════════════════════════════════

export async function failNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const {
    letterId,
    workflowJobId,
    lastErrorStage,
    lastErrorCode,
    lastErrorMessage,
    sharedContext,
  } = state;
  const tokenTotals = totalTokens(sharedContext.tokenUsage ?? []);

  log.error(
    {
      letterId,
      lastErrorStage,
      lastErrorCode,
      totalTokens: tokenTotals.totalTokens,
    },
    "[FailNode] Pipeline exhausted all retries → pipeline_failed"
  );

  try {
    const db = await getDb();
    if (db) {
      await db
        .update(letterRequests)
        .set({ qualityDegraded: true, updatedAt: new Date() })
        .where(eq(letterRequests.id, letterId));
    }
  } catch (err) {
    log.warn(
      { letterId, err: err instanceof Error ? err.message : String(err) },
      "[FailNode] Failed to flag qualityDegraded on letter — continuing"
    );
  }

  await updateLetterStatus(letterId, "pipeline_failed");

  // Surface to Sentry / admin so dashboards see the failure with code+stage.
  try {
    captureServerException(
      new Error(
        `LangGraph pipeline failed for letter #${letterId}: ${lastErrorMessage || "retries exhausted"}`
      ),
      {
        tags: {
          component: "langgraph-finalize",
          error_type: "pipeline_failed",
        },
        extra: {
          letterId,
          lastErrorCode,
          lastErrorStage,
          errorRetryCount: state.errorRetryCount,
          retryCount: state.retryCount,
        },
      }
    );
  } catch {
    /* non-fatal observability call */
  }

  if (workflowJobId > 0) {
    try {
      await updateWorkflowJob(workflowJobId, {
        status: "failed",
        promptTokens: tokenTotals.promptTokens,
        completionTokens: tokenTotals.completionTokens,
        errorMessage: lastErrorMessage
          ? `[${lastErrorCode || "UNKNOWN"}] ${lastErrorStage || "unknown"}: ${lastErrorMessage}`
          : lastErrorStage
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
          `Pipeline failed at stage=${lastErrorStage || "unknown"} code=${lastErrorCode || "UNKNOWN"}`
        ),
      ],
    } as any,
    messages: [new AIMessage(`[Fail] Letter #${letterId} → pipeline_failed`)],
  };
}
