import "dotenv/config";
import { initServerSentry } from "./sentry";
initServerSentry();

import type { Job } from "pg-boss";
import {
  QUEUE_NAME,
  getBoss,
  type PipelineJobData,
  type RunPipelineJobData,
  type RetryFromStageJobData,
} from "./queue";
import { runFullPipeline, retryPipelineFromStage, bestEffortFallback, consumeIntermediateContent, preflightApiKeyCheck } from "./pipeline";
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
import { sendJobFailedAlertEmail, sendStatusUpdateEmail } from "./email";
import { captureServerException } from "./sentry";
import { getDb } from "./db";
import { logger } from "./logger";

const PIPELINE_MAX_RETRIES = 3;
const PIPELINE_BASE_DELAY_MS = 10_000;

export async function processRunPipeline(data: RunPipelineJobData): Promise<void> {
  const { letterId, intake, userId, appUrl, label, usageContext } = data;

  const lockAcquired = await acquirePipelineLock(letterId);
  if (!lockAcquired) {
    logger.warn(`[Worker] Letter #${letterId} pipeline lock already held — skipping duplicate run (${label})`);
    return;
  }

  const apiCheck = preflightApiKeyCheck("full");
  if (!apiCheck.ok) {
    const msg = `[Worker] API key preflight failed for letter #${letterId}: ${apiCheck.missing.join("; ")}`;
    logger.error(msg);
    try {
      await updateLetterStatus(letterId, "pipeline_failed", { force: true });
    } catch { /* ignore */ }
    await releasePipelineLock(letterId).catch(() => {});
    throw new PipelineError(
      "API_KEY_MISSING" as any,
      apiCheck.missing.join("; "),
      "pipeline",
      "No retries attempted — API keys must be configured first"
    );
  }

  let lastErr: unknown;
  try {
    await markPriorPipelineRunsSuperseded(letterId);

    for (let attempt = 0; attempt <= PIPELINE_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = PIPELINE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.info(`[Worker] Retry ${attempt}/${PIPELINE_MAX_RETRIES} for letter #${letterId} in ${delay}ms (${label})`);
          await new Promise(r => setTimeout(r, delay));
        }
        {
          const current = await getLetterRequestById(letterId);
          const retryableStatuses = ["submitted", "researching", "drafting", "pipeline_failed"];
          if (attempt > 0 && current && !retryableStatuses.includes(current.status)) {
            logger.info(`[Worker] Letter #${letterId} status changed to "${current.status}" during backoff, aborting retry (${label})`);
            return;
          }
          if (attempt === 0) {
            // First attempt: ensure status is submitted before starting
            if (!current || current.status !== "submitted") {
              await updateLetterStatus(letterId, "submitted", { force: true });
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
              logger.info(`[Worker] Retry ${attempt}: research already succeeded for letter #${letterId} — retrying from drafting stage`);
              await retryPipelineFromStage(letterId, intake as any, "drafting", userId);
              return;
            }
          } catch (stageCheckErr) {
            logger.warn({ err: stageCheckErr }, `[Worker] Stage-aware check failed for letter #${letterId}, falling back to full pipeline:`);
          }
        }

        await runFullPipeline(letterId, intake as any, undefined, userId);
        return;
      } catch (err) {
        lastErr = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg }, `[Worker] Attempt ${attempt + 1} failed for letter #${letterId} (${label}):`);
        captureServerException(err, { tags: { component: "pipeline-worker", error_type: "attempt_failed" }, extra: { letterId, attempt: attempt + 1 } });

        if (err instanceof PipelineError && err.category === "permanent") {
          logger.error(`[Worker] Permanent error (${err.code}) for letter #${letterId} — skipping remaining retries`);
          break;
        }
      }
    }

    logger.error(`[Worker] All ${PIPELINE_MAX_RETRIES + 1} attempts exhausted for letter #${letterId} (${label})`);

    // ── Best-effort fallback: attempt to deliver a degraded draft before failing ──
    // Only runs after retry exhaustion, never on the first attempt.
    {
      const lastErrCode = lastErr instanceof PipelineError ? lastErr.code : "UNKNOWN_ERROR";
      const lastErrMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
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
        logger.info(`[Worker] Degraded draft delivered for letter #${letterId} — skipping pipeline_failed`);
        return; // successfully delivered (degraded) — don't refund or notify failure
      }
    }

    if (userId && usageContext?.shouldRefundOnFailure) {
      try {
        if (usageContext.isFreeTrialSubmission) {
          await refundFreeTrialSlot(userId);
          logger.info(`[Worker] Refunded free trial slot for user #${userId} after pipeline failure on letter #${letterId}`);
        } else {
          await decrementLettersUsed(userId);
          logger.info(`[Worker] Refunded 1 letter usage for user #${userId} after pipeline failure on letter #${letterId}`);
        }
      } catch (refundErr) {
        logger.error({ err: refundErr }, "[Worker] Failed to refund usage after pipeline failure:");
        captureServerException(refundErr, { tags: { component: "pipeline-worker", error_type: "usage_refund_failed" } });
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
              errorMessage: lastErr instanceof Error ? lastErr.message : String(lastErr),
              appUrl,
            });
          }
        } catch (emailErr) {
          logger.error({ err: emailErr }, "[Worker] Failed to email admin:");
          captureServerException(emailErr, { tags: { component: "pipeline-worker", error_type: "admin_email_failed" } });
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
          logger.error({ err: notifErr }, "[Worker] Failed to create notification:");
          captureServerException(notifErr, { tags: { component: "pipeline-worker", error_type: "notification_failed" } });
        }
      }
    } catch (notifyErr) {
      logger.error({ err: notifyErr }, "[Worker] Failed to notify admins:");
      captureServerException(notifyErr, { tags: { component: "pipeline-worker", error_type: "notify_admins_failed" } });
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
            newStatus: "pipeline_failed",
            appUrl,
          }).catch(e => logger.error({ e: e }, `[Worker] Failed to send failure notification email to subscriber for letter #${letterId}:`));
        }
      }
    } catch (subEmailErr) {
      logger.error({ err: subEmailErr }, "[Worker] Failed to notify subscriber of pipeline failure:");
      captureServerException(subEmailErr, { tags: { component: "pipeline-worker", error_type: "subscriber_email_failed" } });
    }

    try {
      await updateLetterStatus(letterId, "pipeline_failed", { force: true });
    } catch (statusErr) {
      logger.error({ err: statusErr }, "[Worker] Failed to set pipeline_failed status:");
      captureServerException(statusErr, { tags: { component: "pipeline-worker", error_type: "status_update_failed" } });
    }

    throw new Error(`Pipeline failed after ${PIPELINE_MAX_RETRIES + 1} attempts for letter #${letterId}`);
  } finally {
    await releasePipelineLock(letterId).catch(e => logger.error({ e: e }, "[Worker] Failed to release pipeline lock:"));
  }
}

export async function processRetryFromStage(data: RetryFromStageJobData): Promise<void> {
  const { letterId, stage, userId } = data;
  let { intake } = data;

  const lockAcquired = await acquirePipelineLock(letterId);
  if (!lockAcquired) {
    logger.warn(`[Worker] Letter #${letterId} pipeline lock already held — skipping duplicate retry-from-stage run (stage=${stage})`);
    return;
  }

  try {
    if (!intake || typeof intake !== "object") {
      logger.warn(`[Worker] Retry job for letter #${letterId}: intake is null/invalid — will attempt recovery from database`);
      try {
        const letter = await getLetterRequestById(letterId);
        if (letter?.intakeJson && typeof letter.intakeJson === "object") {
          intake = letter.intakeJson;
          logger.info(`[Worker] Recovered intake from database for letter #${letterId}`);
        }
      } catch (e) {
        logger.error({ e: e }, `[Worker] Failed to recover intake for letter #${letterId}:`);
      }
    }

    await retryPipelineFromStage(letterId, intake as any, stage, userId);
  } finally {
    await releasePipelineLock(letterId).catch(e => logger.error({ e: e }, "[Worker] Failed to release pipeline lock (retry-from-stage):"));
  }
}

export async function processJob(job: Job<PipelineJobData>): Promise<void> {
  const startTime = Date.now();
  logger.info(`[Worker] Processing job ${job.id} (type=${job.data.type}, letterId=${job.data.letterId})`);

  try {
    switch (job.data.type) {
      case "runPipeline":
        await processRunPipeline(job.data);
        break;
      case "retryPipelineFromStage":
        await processRetryFromStage(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${(job.data as any).type}`);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[Worker] Job ${job.id} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.error({ err: err instanceof Error ? err.message : err }, `[Worker] Job ${job.id} failed after ${elapsed}s:`);
    throw err;
  }
}

async function startWorker() {
  // ── OPENAI_API_KEY availability check — required for model failover ──
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length === 0) {
    logger.warn(
      "[Worker] WARNING: OPENAI_API_KEY is not set. Model failover is unavailable. " +
      "If Perplexity or Claude hit rate limits, their errors will be treated as fatal. " +
      "Set OPENAI_API_KEY to enable automatic failover to GPT-4o."
    );
  } else {
    logger.info("[Worker] OPENAI_API_KEY detected — model failover to GPT-4o is enabled for all pipeline stages.");
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
      (credentialsOk ? ", GOOGLE_APPLICATION_CREDENTIALS: set" : ", GOOGLE_APPLICATION_CREDENTIALS: using ADC (Application Default Credentials)")
    );
  }

  // ── Vertex AI Vector Search availability check ──
  {
    const { isVertexSearchConfigured, getVertexSearchMissingVars } = await import("./pipeline/vertex-search");
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
        (missing.length > 0 ? `Missing env vars: ${missing.join(", ")}` : "Unknown configuration issue.")
      );
    }
  }

  // ── Fine-tune status polling (every 30 minutes when GCP is configured) ──
  if (process.env.GCP_PROJECT_ID && process.env.GCP_REGION && process.env.GCS_TRAINING_BUCKET) {
    const POLL_INTERVAL_MS = 30 * 60 * 1000;
    const runPoll = async () => {
      try {
        const { pollFineTuneRunStatuses } = await import("./pipeline/fine-tune");
        await pollFineTuneRunStatuses();
      } catch (pollErr) {
        logger.warn({ err: pollErr }, "[Worker] Fine-tune poll error:");
      }
    };
    // Initial poll on startup (deferred slightly to let DB warm up)
    setTimeout(runPoll, 10_000);
    // Then every 30 minutes
    setInterval(runPoll, POLL_INTERVAL_MS);
    logger.info("[Worker] Fine-tune status polling scheduled every 30 minutes.");
  }

  logger.info("[Worker] Warming up database connection...");
  await getDb().catch((err) => {
    logger.error({ err: err }, "[Worker] Database warmup failed:");
    captureServerException(err, { tags: { component: "worker", error_type: "db_warmup_failed" } });
  });

  const boss = await getBoss();

  // Register the job handler — pg-boss calls this with an array of jobs
  await boss.work<PipelineJobData>(QUEUE_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      await processJob(job);
    }
  });

  boss.on("error", (err) => {
    logger.error({ err: err.message }, "[Worker] pg-boss error:");
  });

  const shutdown = async (signal: string) => {
    logger.info(`[Worker] Received ${signal}, shutting down gracefully...`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  logger.info(`[Worker] Pipeline worker started (queue=${QUEUE_NAME}, concurrency=1, backend=pg-boss)`);
}

startWorker().catch((err) => {
  logger.error({ err: err }, "[Worker] Failed to start:");
  process.exit(1);
});
