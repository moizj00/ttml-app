import "dotenv/config";

// Force IPv4 DNS resolution — Railway's network cannot reach Supabase's
// shared pooler via IPv6 (ENETUNREACH). This must be set before any
// database connections are established.
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { initServerSentry } from "./sentry";
initServerSentry();

import type { Job } from "pg-boss";
import {
  QUEUE_NAME,
  getBoss,
  enqueueDraftPreviewReleaseJob,
  type PipelineJobData,
  type RunPipelineJobData,
  type RetryFromStageJobData,
  type ReleaseDraftPreviewJobData,
} from "./queue";
import {
  runFullPipeline,
  retryPipelineFromStage,
  bestEffortFallback,
  consumeIntermediateContent,
  preflightApiKeyCheck,
} from "./pipeline";
import { runLangGraphPipeline } from "./pipeline/graph";
import { PipelineError } from "../shared/types";
import {
  acquirePipelineLock,
  releasePipelineLock,
  markPriorPipelineRunsSuperseded,
  getLetterRequestById,
  getUserById,
  updateLetterStatus,
  getAllUsers,
  createNotification,
  decrementLettersUsed,
  refundFreeTrialSlot,
} from "./db";
import { LETTER_STATUS } from "../shared/types/letter";
import { sendJobFailedAlertEmail, sendStatusUpdateEmail } from "./email";
import { captureServerException } from "./sentry";
import { getDb } from "./db";
import { dispatchFreePreviewIfReady } from "./freePreviewEmailCron";
import { logger } from "./logger";

const PIPELINE_MAX_RETRIES = 3;
const PIPELINE_BASE_DELAY_MS = 10_000;
const DRAFT_PREVIEW_RELEASE_RETRY_MS = 10 * 60 * 1000;

export async function processRunPipeline(
  data: RunPipelineJobData
): Promise<void> {
  const { letterId, intake, userId, appUrl, label, usageContext } = data;
  const isPreviewGatedSubmission =
    usageContext?.isPreviewGatedSubmission ??
    usageContext?.isFreeTrialSubmission ??
    false;

  const lockAcquired = await acquirePipelineLock(letterId);
  if (!lockAcquired) {
    logger.warn(
      `[Worker] Letter #${letterId} pipeline lock already held — skipping duplicate run (${label})`
    );
    return;
  }

  const apiCheck = preflightApiKeyCheck("full");
  if (!apiCheck.ok) {
    const msg = `[Worker] API key preflight failed for letter #${letterId}: ${apiCheck.missing.join("; ")}`;
    logger.error(msg);
    try {
      await updateLetterStatus(letterId, LETTER_STATUS.pipeline_failed, { force: true });
    } catch {
      /* ignore */
    }
    await releasePipelineLock(letterId).catch(() => {});
    throw new PipelineError(
      "API_KEY_MISSING" as any,
      apiCheck.missing.join("; "),
      "pipeline",
      "No retries attempted — API keys must be configured first"
    );
  }

  // ── LangGraph pipeline route (opt-in via LANGGRAPH_PIPELINE=true) ──────────
  // When enabled, the LangGraph StateGraph handles the full 4-stage pipeline
  // with streaming tokens to pipeline_stream_chunks for real-time frontend display.
  // The existing runFullPipeline() remains the default for stability.
  if (process.env.LANGGRAPH_PIPELINE === "true") {
    logger.info(
      `[Worker] LANGGRAPH_PIPELINE=true — routing letter #${letterId} through LangGraph StateGraph`
    );
    try {
      await runLangGraphPipeline({
        letterId,
        userId,
        intake: intake as Record<string, any>,
        isFreePreview: isPreviewGatedSubmission,
      });
      logger.info(
        `[Worker] LangGraph pipeline completed for letter #${letterId}`
      );
      return;
    } catch (lgErr) {
      const lgMsg = lgErr instanceof Error ? lgErr.message : String(lgErr);
      logger.warn(
        { err: lgMsg },
        `[Worker] LangGraph pipeline failed for letter #${letterId} — falling back to standard pipeline`
      );
      // Fall through to the standard pipeline below
    } finally {
      await releasePipelineLock(letterId).catch(e =>
        logger.error(
          { e },
          "[Worker] Failed to release pipeline lock after LangGraph:"
        )
      );
    }
    // If we reach here, LangGraph failed — release was already called, re-acquire for standard pipeline
    const reAcquired = await acquirePipelineLock(letterId);
    if (!reAcquired) {
      // BUG FIX: previously returned silently leaving the letter stranded in
      // researching/drafting with no pipeline_failed status and no admin alert.
      logger.warn(
        `[Worker] Could not re-acquire lock for letter #${letterId} after LangGraph fallback — marking pipeline_failed`
      );
      await updateLetterStatus(letterId, LETTER_STATUS.pipeline_failed, {
        force: true,
      }).catch(e =>
        logger.error(
          { e },
          `[Worker] Failed to set pipeline_failed for letter #${letterId} after lock loss`
        )
      );
      return;
    }
  }

  let lastErr: unknown;
  try {
    await markPriorPipelineRunsSuperseded(letterId);

    for (let attempt = 0; attempt <= PIPELINE_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = PIPELINE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.info(
            `[Worker] Retry ${attempt}/${PIPELINE_MAX_RETRIES} for letter #${letterId} in ${delay}ms (${label})`
          );
          await new Promise(r => setTimeout(r, delay));
        }
        {
          const current = await getLetterRequestById(letterId);
          const retryableStatuses: string[] = [
            LETTER_STATUS.submitted,
            LETTER_STATUS.researching,
            LETTER_STATUS.drafting,
            LETTER_STATUS.pipeline_failed,
          ];
          if (
            attempt > 0 &&
            current &&
            !retryableStatuses.includes(current.status)
          ) {
            logger.info(
              `[Worker] Letter #${letterId} status changed to "${current.status}" during backoff, aborting retry (${label})`
            );
            return;
          }
          if (attempt === 0) {
            // First attempt: ensure status is submitted before starting
            if (!current || current.status !== LETTER_STATUS.submitted) {
              await updateLetterStatus(letterId, LETTER_STATUS.submitted, { force: true });
            }
          }
          // On retries, skip resetting to submitted — the letter is already in researching/drafting
          // which are valid retryable states. Resetting would cause oscillation visible via Supabase realtime.
        }

        if (attempt > 0) {
          // Stage-aware retry: if research already succeeded, retry from drafting stage
          // to avoid re-running successful (expensive) research
          try {
            const { getLatestResearchRun } = await import("./db");
            const latestResearch = await getLatestResearchRun(letterId);
            if (latestResearch?.resultJson) {
              logger.info(
                `[Worker] Retry ${attempt}: research already succeeded for letter #${letterId} — retrying from drafting stage`
              );
              await retryPipelineFromStage(
                letterId,
                intake as any,
                "drafting",
                userId
              );
              return;
            }
          } catch (stageCheckErr) {
            logger.warn(
              { err: stageCheckErr },
              `[Worker] Stage-aware check failed for letter #${letterId}, falling back to full pipeline:`
            );
          }
        }

        await runFullPipeline(
          letterId,
          intake as any,
          undefined,
          userId,
          isPreviewGatedSubmission
        );
        return;
      } catch (err) {
        lastErr = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(
          { err: errMsg },
          `[Worker] Attempt ${attempt + 1} failed for letter #${letterId} (${label}):`
        );
        captureServerException(err, {
          tags: { component: "pipeline-worker", error_type: "attempt_failed" },
          extra: { letterId, attempt: attempt + 1 },
        });

        if (err instanceof PipelineError && err.category === "permanent") {
          logger.error(
            `[Worker] Permanent error (${err.code}) for letter #${letterId} — skipping remaining retries`
          );
          break;
        }
      }
    }

    logger.error(
      `[Worker] All ${PIPELINE_MAX_RETRIES + 1} attempts exhausted for letter #${letterId} (${label})`
    );

    // ── Best-effort fallback: attempt to deliver a degraded draft before failing ──
    // Only runs after retry exhaustion, never on the first attempt.
    {
      const lastErrCode =
        lastErr instanceof PipelineError ? lastErr.code : "UNKNOWN_ERROR";
      const lastErrMsg =
        lastErr instanceof Error ? lastErr.message : String(lastErr);
      const intermediate = consumeIntermediateContent(letterId);
      const fallbackDelivered = await bestEffortFallback({
        letterId,
        intake: intake as any,
        intermediateDraftContent: intermediate.content,
        qualityWarnings: intermediate.qualityWarnings,
        pipelineErrorCode: lastErrCode,
        errorMessage: lastErrMsg,
      });
      if (fallbackDelivered) {
        logger.info(
          `[Worker] Degraded draft delivered for letter #${letterId} — skipping pipeline_failed`
        );
        return; // successfully delivered (degraded) — don't refund or notify failure
      }
    }

    if (userId && usageContext?.shouldRefundOnFailure) {
      try {
        if (usageContext.isFreeTrialSubmission) {
          await refundFreeTrialSlot(userId);
          logger.info(
            `[Worker] Refunded free trial slot for user #${userId} after pipeline failure on letter #${letterId}`
          );
        } else {
          await decrementLettersUsed(userId);
          logger.info(
            `[Worker] Refunded 1 letter usage for user #${userId} after pipeline failure on letter #${letterId}`
          );
        }
      } catch (refundErr) {
        logger.error(
          { err: refundErr },
          "[Worker] Failed to refund usage after pipeline failure:"
        );
        captureServerException(refundErr, {
          tags: {
            component: "pipeline-worker",
            error_type: "usage_refund_failed",
          },
        });
      }
    }

    try {
      const admins = await getAllUsers("admin");
      for (const admin of admins) {
        try {
          if (admin.email) {
            await sendJobFailedAlertEmail({
              to: admin.email,
              name: admin.name ?? "Admin",
              letterId,
              jobType: "generation_pipeline",
              errorMessage:
                lastErr instanceof Error ? lastErr.message : String(lastErr),
              appUrl,
            });
          }
        } catch (emailErr) {
          logger.error({ err: emailErr }, "[Worker] Failed to email admin:");
          captureServerException(emailErr, {
            tags: {
              component: "pipeline-worker",
              error_type: "admin_email_failed",
            },
          });
        }
        try {
          await createNotification({
            userId: admin.id,
            type: "job_failed",
            category: "letters",
            title: `Pipeline failed for letter #${letterId}`,
            body: lastErr instanceof Error ? lastErr.message : String(lastErr),
            link: `/admin/letters/${letterId}`,
          });
        } catch (notifErr) {
          logger.error(
            { err: notifErr },
            "[Worker] Failed to create notification:"
          );
          captureServerException(notifErr, {
            tags: {
              component: "pipeline-worker",
              error_type: "notification_failed",
            },
          });
        }
      }
    } catch (notifyErr) {
      logger.error({ err: notifyErr }, "[Worker] Failed to notify admins:");
      captureServerException(notifyErr, {
        tags: {
          component: "pipeline-worker",
          error_type: "notify_admins_failed",
        },
      });
    }

    // ── Subscriber notification on total failure ────────────────────────────────
    try {
      const failedLetter = await getLetterRequestById(letterId);
      if (failedLetter && failedLetter.userId != null) {
        const subscriber = await getUserById(failedLetter.userId);
        if (subscriber?.email) {
          sendStatusUpdateEmail({
            to: subscriber.email,
            name: subscriber.name ?? "Subscriber",
            subject: failedLetter.subject,
            letterId,
            newStatus: LETTER_STATUS.pipeline_failed,
            appUrl,
          }).catch(e =>
            logger.error(
              { e: e },
              `[Worker] Failed to send failure notification email to subscriber for letter #${letterId}:`
            )
          );
        }
      }
    } catch (subEmailErr) {
      logger.error(
        { err: subEmailErr },
        "[Worker] Failed to notify subscriber of pipeline failure:"
      );
      captureServerException(subEmailErr, {
        tags: {
          component: "pipeline-worker",
          error_type: "subscriber_email_failed",
        },
      });
    }

    try {
      await updateLetterStatus(letterId, LETTER_STATUS.pipeline_failed, { force: true });
    } catch (statusErr) {
      logger.error(
        { err: statusErr },
        "[Worker] Failed to set pipeline_failed status:"
      );
      captureServerException(statusErr, {
        tags: {
          component: "pipeline-worker",
          error_type: "status_update_failed",
        },
      });
    }

    throw new Error(
      `Pipeline failed after ${PIPELINE_MAX_RETRIES + 1} attempts for letter #${letterId}`
    );
  } finally {
    await releasePipelineLock(letterId).catch(e =>
      logger.error({ e: e }, "[Worker] Failed to release pipeline lock:")
    );
  }
}

export async function processRetryFromStage(
  data: RetryFromStageJobData
): Promise<void> {
  const { letterId, stage, userId } = data;
  let { intake } = data;

  const lockAcquired = await acquirePipelineLock(letterId);
  if (!lockAcquired) {
    logger.warn(
      `[Worker] Letter #${letterId} pipeline lock already held — skipping duplicate retry-from-stage run (stage=${stage})`
    );
    return;
  }

  try {
    if (!intake || typeof intake !== "object") {
      logger.warn(
        `[Worker] Retry job for letter #${letterId}: intake is null/invalid — will attempt recovery from database`
      );
      try {
        const letter = await getLetterRequestById(letterId);
        if (letter?.intakeJson && typeof letter.intakeJson === "object") {
          intake = letter.intakeJson;
          logger.info(
            `[Worker] Recovered intake from database for letter #${letterId}`
          );
        }
      } catch (e) {
        logger.error(
          { e: e },
          `[Worker] Failed to recover intake for letter #${letterId}:`
        );
      }
    }

    await retryPipelineFromStage(letterId, intake as any, stage, userId);
  } finally {
    await releasePipelineLock(letterId).catch(e =>
      logger.error(
        { e: e },
        "[Worker] Failed to release pipeline lock (retry-from-stage):"
      )
    );
  }
}

export async function processReleaseDraftPreview(
  data: ReleaseDraftPreviewJobData
): Promise<void> {
  const letter = await getLetterRequestById(data.letterId);
  if (!letter) {
    logger.warn(
      `[Worker] Draft preview release skipped — letter #${data.letterId} not found`
    );
    return;
  }

  if (letter.isFreePreview !== true) {
    logger.info(
      `[Worker] Draft preview release skipped for letter #${data.letterId} — not preview gated`
    );
    return;
  }

  if (letter.freePreviewEmailSentAt) {
    logger.info(
      `[Worker] Draft preview release skipped for letter #${data.letterId} — already released`
    );
    return;
  }

  const unlockAt = letter.freePreviewUnlockAt
    ? new Date(letter.freePreviewUnlockAt).getTime()
    : NaN;
  if (!Number.isFinite(unlockAt)) {
    logger.warn(
      `[Worker] Draft preview release skipped for letter #${data.letterId} — missing/invalid unlock time`
    );
    return;
  }

  const now = Date.now();
  if (unlockAt > now) {
    await enqueueDraftPreviewReleaseJob(
      data.letterId,
      new Date(unlockAt),
      data.attempt ?? 0
    );
    logger.info(
      `[Worker] Draft preview release for letter #${data.letterId} re-scheduled at unlock time`
    );
    return;
  }

  if (!letter.currentAiDraftVersionId) {
    if (letter.status === LETTER_STATUS.pipeline_failed) {
      logger.warn(
        `[Worker] Draft preview release skipped for letter #${data.letterId} — pipeline failed before draft was saved`
      );
      return;
    }
    const nextAttempt = (data.attempt ?? 0) + 1;
    await enqueueDraftPreviewReleaseJob(
      data.letterId,
      new Date(now + DRAFT_PREVIEW_RELEASE_RETRY_MS),
      nextAttempt
    );
    logger.info(
      `[Worker] Draft preview release for letter #${data.letterId} waiting for ai_draft (attempt=${nextAttempt})`
    );
    return;
  }

  const result = await dispatchFreePreviewIfReady(data.letterId, {
    requireDraft: true,
  });
  if (result.status === "error") {
    const nextAttempt = (data.attempt ?? 0) + 1;
    await enqueueDraftPreviewReleaseJob(
      data.letterId,
      new Date(now + DRAFT_PREVIEW_RELEASE_RETRY_MS),
      nextAttempt
    );
    throw new Error(
      `Draft preview release failed for letter #${data.letterId}: ${result.reason ?? "unknown error"}`
    );
  }

  logger.info(
    `[Worker] Draft preview release for letter #${data.letterId}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`
  );
}

export async function processJob(job: Job<PipelineJobData>): Promise<void> {
  const startTime = Date.now();
  logger.info(
    `[Worker] Processing job ${job.id} (type=${job.data.type}, letterId=${job.data.letterId})`
  );

  try {
    switch (job.data.type) {
      case "runPipeline":
        await processRunPipeline(job.data);
        break;
      case "retryPipelineFromStage":
        await processRetryFromStage(job.data);
        break;
      case "releaseDraftPreview":
        await processReleaseDraftPreview(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${(job.data as any).type}`);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[Worker] Job ${job.id} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.error(
      { err: err instanceof Error ? err.message : err },
      `[Worker] Job ${job.id} failed after ${elapsed}s:`
    );
    throw err;
  }
}

async function startWorker() {
  // ── OPENAI_API_KEY availability check — required for model failover ──
  if (
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY.trim().length === 0
  ) {
    logger.warn(
      "[Worker] WARNING: OPENAI_API_KEY is not set. Model failover is unavailable. " +
        "If Perplexity or Claude hit rate limits, their errors will be treated as fatal. " +
        "Set OPENAI_API_KEY to enable automatic failover to GPT-4o."
    );
  } else {
    logger.info(
      "[Worker] OPENAI_API_KEY detected — model failover to GPT-4o is enabled for all pipeline stages."
    );
  }

  // ── GCS/Vertex AI availability checks ──
  if (!process.env.GCP_PROJECT_ID) {
    logger.warn(
      "[Worker] WARNING: GCP_PROJECT_ID is not set. Training capture to GCS and Vertex AI fine-tuning are disabled. " +
        "Set GCP_PROJECT_ID, GCS_TRAINING_BUCKET, and GCP_REGION to enable."
    );
  } else {
    const gcsOk = !!process.env.GCS_TRAINING_BUCKET;
    const vertexOk = !!process.env.GCP_REGION;
    const credentialsOk = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    logger.info(
      `[Worker] GCP_PROJECT_ID detected — GCS training capture: ${gcsOk ? "enabled" : "DISABLED (set GCS_TRAINING_BUCKET)"}, ` +
        `Vertex AI fine-tuning: ${vertexOk ? "enabled" : "DISABLED (set GCP_REGION)"}` +
        (credentialsOk
          ? ", GOOGLE_APPLICATION_CREDENTIALS: set"
          : ", GOOGLE_APPLICATION_CREDENTIALS: using ADC (Application Default Credentials)")
    );
  }

  // ── Vertex AI Vector Search availability check ──
  {
    const { isVertexSearchConfigured, getVertexSearchMissingVars } =
      await import("./pipeline/vertex-search");
    if (isVertexSearchConfigured()) {
      logger.info(
        `[Worker] Vertex AI Vector Search: ENABLED (index=${process.env.VERTEX_SEARCH_INDEX_ID}, ` +
          `endpoint=${process.env.VERTEX_SEARCH_INDEX_ENDPOINT_ID}, ` +
          `deployedIndex=${process.env.VERTEX_SEARCH_DEPLOYED_INDEX_ID})`
      );
    } else {
      const missing = getVertexSearchMissingVars();
      logger.warn(
        `[Worker] Vertex AI Vector Search: disabled — falling back to pgvector. ` +
          (missing.length > 0
            ? `Missing env vars: ${missing.join(", ")}`
            : "Unknown configuration issue.")
      );
    }
  }

  // ── Fine-tune status polling (every 30 minutes when GCP is configured) ──
  if (
    process.env.GCP_PROJECT_ID &&
    process.env.GCP_REGION &&
    process.env.GCS_TRAINING_BUCKET
  ) {
    const POLL_INTERVAL_MS = 30 * 60 * 1000;
    const runPoll = async () => {
      try {
        const { pollFineTuneRunStatuses } =
          await import("./pipeline/fine-tune");
        await pollFineTuneRunStatuses();
      } catch (pollErr) {
        logger.warn({ err: pollErr }, "[Worker] Fine-tune poll error:");
      }
    };
    // Initial poll on startup (deferred slightly to let DB warm up)
    setTimeout(runPoll, 10_000);
    // Then every 30 minutes
    setInterval(runPoll, POLL_INTERVAL_MS);
    logger.info(
      "[Worker] Fine-tune status polling scheduled every 30 minutes."
    );
  }

  logger.info("[Worker] Warming up database connection...");
  await getDb().catch(err => {
    logger.error({ err: err }, "[Worker] Database warmup failed:");
    captureServerException(err, {
      tags: { component: "worker", error_type: "db_warmup_failed" },
    });
  });

  const boss = await getBoss();

  // Register the job handler — pg-boss calls this with an array of jobs
  await boss.work(
    QUEUE_NAME,
    { localConcurrency: 1 },
    async (job: Job<PipelineJobData>) => {
      await processJob(job);
    }
  );

  boss.on("error", (err: unknown) => {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      "[Worker] pg-boss error:"
    );
  });

  const shutdown = async (signal: string) => {
    logger.info(`[Worker] Received ${signal}, shutting down gracefully...`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  logger.info(
    `[Worker] Pipeline worker started (queue=${QUEUE_NAME}, concurrency=1, backend=pg-boss)`
  );
}

startWorker().catch(err => {
  logger.error({ err: err }, "[Worker] Failed to start:");
  process.exit(1);
});
