import "dotenv/config";
import { initServerSentry } from "./sentry";
initServerSentry();

import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAME,
  buildRedisConnection,
  type PipelineJobData,
  type RunPipelineJobData,
  type RetryFromStageJobData,
} from "./queue";
import { runFullPipeline, retryPipelineFromStage, bestEffortFallback, consumeIntermediateContent } from "./pipeline";
import { PipelineError } from "../shared/types";
import {
  acquirePipelineLock,
  releasePipelineLock,
  markPriorPipelineRunsSuperseded,
  getLetterRequestById,
  updateLetterStatus,
  getAllUsers,
  createNotification,
  decrementLettersUsed,
  refundFreeTrialSlot,
} from "./db";
import { sendJobFailedAlertEmail } from "./email";
import { captureServerException } from "./sentry";
import { getDb } from "./db";

const PIPELINE_MAX_RETRIES = 3;
const PIPELINE_BASE_DELAY_MS = 10_000;

export async function processRunPipeline(data: RunPipelineJobData): Promise<void> {
  const { letterId, intake, userId, appUrl, label, usageContext } = data;

  const lockAcquired = await acquirePipelineLock(letterId);
  if (!lockAcquired) {
    console.warn(`[Worker] Letter #${letterId} pipeline lock already held — skipping duplicate run (${label})`);
    return;
  }

  let lastErr: unknown;
  try {
    await markPriorPipelineRunsSuperseded(letterId);

    for (let attempt = 0; attempt <= PIPELINE_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = PIPELINE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[Worker] Retry ${attempt}/${PIPELINE_MAX_RETRIES} for letter #${letterId} in ${delay}ms (${label})`);
          await new Promise(r => setTimeout(r, delay));
        }
        {
          const current = await getLetterRequestById(letterId);
          const retryableStatuses = ["submitted", "researching", "drafting", "pipeline_failed"];
          if (attempt > 0 && current && !retryableStatuses.includes(current.status)) {
            console.log(`[Worker] Letter #${letterId} status changed to "${current.status}" during backoff, aborting retry (${label})`);
            return;
          }
          if (!current || current.status !== "submitted") {
            await updateLetterStatus(letterId, "submitted", { force: true });
          }
        }

        if (attempt > 0) {
          // Stage-aware retry: if research already succeeded, retry from drafting stage
          // to avoid re-running successful (expensive) research
          try {
            const { getLatestResearchRun } = await import("./db");
            const latestResearch = await getLatestResearchRun(letterId);
            if (latestResearch?.resultJson) {
              console.log(`[Worker] Retry ${attempt}: research already succeeded for letter #${letterId} — retrying from drafting stage`);
              await retryPipelineFromStage(letterId, intake as any, "drafting", userId);
              return;
            }
          } catch (stageCheckErr) {
            console.warn(`[Worker] Stage-aware check failed for letter #${letterId}, falling back to full pipeline:`, stageCheckErr);
          }
        }

        await runFullPipeline(letterId, intake as any, undefined, userId);
        return;
      } catch (err) {
        lastErr = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Worker] Attempt ${attempt + 1} failed for letter #${letterId} (${label}):`, errMsg);
        captureServerException(err, { tags: { component: "pipeline-worker", error_type: "attempt_failed" }, extra: { letterId, attempt: attempt + 1 } });

        if (err instanceof PipelineError && err.category === "permanent") {
          console.error(`[Worker] Permanent error (${err.code}) for letter #${letterId} — skipping remaining retries`);
          break;
        }
      }
    }

    console.error(`[Worker] All ${PIPELINE_MAX_RETRIES + 1} attempts exhausted for letter #${letterId} (${label})`);

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
        console.log(`[Worker] Degraded draft delivered for letter #${letterId} — skipping pipeline_failed`);
        return; // successfully delivered (degraded) — don't refund or notify failure
      }
    }

    if (userId && usageContext?.shouldRefundOnFailure) {
      try {
        if (usageContext.isFreeTrialSubmission) {
          await refundFreeTrialSlot(userId);
          console.log(`[Worker] Refunded free trial slot for user #${userId} after pipeline failure on letter #${letterId}`);
        } else {
          await decrementLettersUsed(userId);
          console.log(`[Worker] Refunded 1 letter usage for user #${userId} after pipeline failure on letter #${letterId}`);
        }
      } catch (refundErr) {
        console.error("[Worker] Failed to refund usage after pipeline failure:", refundErr);
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
          console.error("[Worker] Failed to email admin:", emailErr);
          captureServerException(emailErr, { tags: { component: "pipeline-worker", error_type: "admin_email_failed" } });
        }
        try {
          await createNotification({
            userId: admin.id,
            type: "job_failed",
            category: "letters",
            title: `Pipeline failed for letter #${letterId}`,
            body: lastErr instanceof Error ? lastErr.message : String(lastErr),
            link: `/admin/jobs`,
          });
        } catch (notifErr) {
          console.error("[Worker] Failed to create notification:", notifErr);
          captureServerException(notifErr, { tags: { component: "pipeline-worker", error_type: "notification_failed" } });
        }
      }
    } catch (notifyErr) {
      console.error("[Worker] Failed to notify admins:", notifyErr);
      captureServerException(notifyErr, { tags: { component: "pipeline-worker", error_type: "notify_admins_failed" } });
    }

    try {
      await updateLetterStatus(letterId, "pipeline_failed", { force: true });
    } catch (statusErr) {
      console.error("[Worker] Failed to set pipeline_failed status:", statusErr);
      captureServerException(statusErr, { tags: { component: "pipeline-worker", error_type: "status_update_failed" } });
    }

    throw new Error(`Pipeline failed after ${PIPELINE_MAX_RETRIES + 1} attempts for letter #${letterId}`);
  } finally {
    await releasePipelineLock(letterId).catch(e => console.error("[Worker] Failed to release pipeline lock:", e));
  }
}

export async function processRetryFromStage(data: RetryFromStageJobData): Promise<void> {
  const { letterId, intake, stage, userId } = data;
  await retryPipelineFromStage(letterId, intake as any, stage, userId);
}

export async function processJob(job: Job<PipelineJobData>): Promise<void> {
  const startTime = Date.now();
  console.log(`[Worker] Processing job ${job.id} (type=${job.data.type}, letterId=${job.data.letterId})`);

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
    console.log(`[Worker] Job ${job.id} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Worker] Job ${job.id} failed after ${elapsed}s:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

async function startWorker() {
  // ── OPENAI_API_KEY availability check — required for model failover ──
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length === 0) {
    console.warn(
      "[Worker] WARNING: OPENAI_API_KEY is not set. Model failover is unavailable. " +
      "If Perplexity or Claude hit rate limits, their errors will be treated as fatal. " +
      "Set OPENAI_API_KEY to enable automatic failover to GPT-4o."
    );
  } else {
    console.log("[Worker] OPENAI_API_KEY detected — model failover to GPT-4o is enabled for all pipeline stages.");
  }

  // ── GCS/Vertex AI availability checks ──
  if (!process.env.GCP_PROJECT_ID) {
    console.warn(
      "[Worker] WARNING: GCP_PROJECT_ID is not set. Training capture to GCS and Vertex AI fine-tuning are disabled. " +
      "Set GCP_PROJECT_ID, GCS_TRAINING_BUCKET, and GCP_REGION to enable."
    );
  } else {
    const gcsOk = !!process.env.GCS_TRAINING_BUCKET;
    const vertexOk = !!process.env.GCP_REGION;
    const credentialsOk = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    console.log(
      `[Worker] GCP_PROJECT_ID detected — GCS training capture: ${gcsOk ? "enabled" : "DISABLED (set GCS_TRAINING_BUCKET)"}, ` +
      `Vertex AI fine-tuning: ${vertexOk ? "enabled" : "DISABLED (set GCP_REGION)"}` +
      (credentialsOk ? ", GOOGLE_APPLICATION_CREDENTIALS: set" : ", GOOGLE_APPLICATION_CREDENTIALS: using ADC (Application Default Credentials)")
    );
  }

  // ── Vertex AI Vector Search availability check ──
  {
    const { isVertexSearchConfigured, getVertexSearchMissingVars } = await import("./pipeline/vertex-search");
    if (isVertexSearchConfigured()) {
      console.log(
        `[Worker] Vertex AI Vector Search: ENABLED (index=${process.env.VERTEX_SEARCH_INDEX_ID}, ` +
        `endpoint=${process.env.VERTEX_SEARCH_INDEX_ENDPOINT_ID}, ` +
        `deployedIndex=${process.env.VERTEX_SEARCH_DEPLOYED_INDEX_ID})`
      );
    } else {
      const missing = getVertexSearchMissingVars();
      console.warn(
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
        console.warn("[Worker] Fine-tune poll error:", pollErr);
      }
    };
    // Initial poll on startup (deferred slightly to let DB warm up)
    setTimeout(runPoll, 10_000);
    // Then every 30 minutes
    setInterval(runPoll, POLL_INTERVAL_MS);
    console.log("[Worker] Fine-tune status polling scheduled every 30 minutes.");
  }

  console.log("[Worker] Warming up database connection...");
  await getDb().catch((err) => {
    console.error("[Worker] Database warmup failed:", err);
    captureServerException(err, { tags: { component: "worker", error_type: "db_warmup_failed" } });
  });

  const connection = buildRedisConnection();

  const worker = new Worker<PipelineJobData>(QUEUE_NAME, processJob, {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    stalledInterval: 300_000,
  });

  worker.on("ready", () => {
    console.log("[Worker] Pipeline worker is ready and listening for jobs");
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    captureServerException(err, {
      tags: { component: "pipeline-worker", error_type: "job_failed" },
      extra: { jobId: job?.id, jobData: job?.data },
    });
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err.message);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log(`[Worker] Pipeline worker started (queue=${QUEUE_NAME}, concurrency=1)`);
}

startWorker().catch((err) => {
  console.error("[Worker] Failed to start:", err);
  process.exit(1);
});
