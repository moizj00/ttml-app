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
import { runFullPipeline, retryPipelineFromStage } from "./pipeline";
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

const PIPELINE_MAX_RETRIES = 2;
const PIPELINE_BASE_DELAY_MS = 10_000;

async function processRunPipeline(data: RunPipelineJobData): Promise<void> {
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

async function processRetryFromStage(data: RetryFromStageJobData): Promise<void> {
  const { letterId, intake, stage, userId } = data;
  await retryPipelineFromStage(letterId, intake as any, stage, userId);
}

async function processJob(job: Job<PipelineJobData>): Promise<void> {
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
