import { sql, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/core";
import { fineTuneRuns } from "../../drizzle/schema";
import { captureServerException } from "../sentry";
import { logger } from "../logger";

const FINE_TUNE_THRESHOLD = 50;
const BASE_MODEL = "gemini-1.5-flash-002";

function isVertexConfigured(): boolean {
  return !!(
    process.env.GCP_PROJECT_ID &&
    process.env.GCP_REGION &&
    process.env.GCS_TRAINING_BUCKET
  );
}

async function countTrainingExamplesSinceLastTune(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.execute(
    sql`SELECT count_training_examples_since_last_tune() as cnt`
  );

  const rows = result as unknown as Array<{ cnt: string | number }>;
  return typeof rows[0]?.cnt === "number" ? rows[0].cnt : parseInt(String(rows[0]?.cnt ?? "0"), 10);
}

async function getAllTrainingGcsPathsSinceLastTune(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT gcs_path FROM training_log
    WHERE gcs_path IS NOT NULL
      AND created_at > COALESCE(
        (SELECT MAX(started_at) FROM fine_tune_runs WHERE status != 'failed'),
        '1970-01-01'::timestamptz
      )
    ORDER BY created_at ASC
  `);

  const rows = result as unknown as Array<{ gcs_path: string }>;
  return rows.map(r => r.gcs_path);
}

async function hasSubmittedRunInProgress(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM fine_tune_runs
    WHERE status IN ('submitted', 'running')
  `);

  const rows = result as unknown as Array<{ cnt: string | number }>;
  const cnt = typeof rows[0]?.cnt === "number" ? rows[0].cnt : parseInt(String(rows[0]?.cnt ?? "0"), 10);
  return cnt > 0;
}

async function mergeTrainingFiles(gcsPaths: string[]): Promise<string> {
  const bucket = process.env.GCS_TRAINING_BUCKET!;
  const project = process.env.GCP_PROJECT_ID!;

  const { Storage } = await import("@google-cloud/storage");
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const storageOpts: Record<string, unknown> = { projectId: project };
  if (credentialsPath) {
    storageOpts.keyFilename = credentialsPath;
  }

  const storage = new Storage(storageOpts);
  const bucketRef = storage.bucket(bucket);

  const uniquePaths = Array.from(new Set(gcsPaths));
  const allLines: string[] = [];
  for (const uri of uniquePaths) {
    const path = uri.replace(`gs://${bucket}/`, "");
    try {
      const [content] = await bucketRef.file(path).download();
      const lines = content.toString("utf-8").trim().split("\n").filter(Boolean);
      allLines.push(...lines);
    } catch (downloadErr) {
      logger.warn({ err: downloadErr }, `[FineTune] Failed to read ${uri}, skipping:`);
    }
  }

  const mergedPath = `fine-tune-datasets/${new Date().toISOString().slice(0, 10)}-merged.jsonl`;
  const mergedContent = allLines.join("\n") + "\n";
  await bucketRef.file(mergedPath).save(mergedContent, { contentType: "application/jsonl" });

  return `gs://${bucket}/${mergedPath}`;
}

async function submitVertexFineTuningJob(
  trainingFileUri: string,
): Promise<string> {
  const project = process.env.GCP_PROJECT_ID!;
  const region = process.env.GCP_REGION!;

  const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/tuningJobs`;

  const { GoogleAuth } = await import("google-auth-library");
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const authOpts: Record<string, unknown> = {
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  };
  if (credentialsPath) {
    authOpts.keyFilename = credentialsPath;
  }

  const auth = new GoogleAuth(authOpts);
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token ?? "";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      baseModel: BASE_MODEL,
      supervisedTuningSpec: {
        trainingDatasetUri: trainingFileUri,
      },
      tunedModelDisplayName: `ttml-legal-${new Date().toISOString().slice(0, 10)}`,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`Vertex AI tuning API returned ${response.status}: ${errText}`);
  }

  const result: Record<string, unknown> = await response.json();
  const jobName = (result.name ?? (result.tuningJob as Record<string, unknown> | undefined)?.name ?? "unknown") as string;
  return jobName;
}

/**
 * Dry-run mode: validates GCP connectivity, counts examples, and logs what
 * would happen — without actually submitting a job or writing to the DB.
 */
export async function dryRunFineTuneCheck(): Promise<{
  gcpConfigured: boolean;
  exampleCount: number;
  thresholdMet: boolean;
  trainingFilesCount: number;
  inProgress: boolean;
  wouldSubmit: boolean;
  notes: string[];
}> {
  const notes: string[] = [];
  const gcpConfigured = isVertexConfigured();

  if (!gcpConfigured) {
    notes.push("GCP not configured: set GCP_PROJECT_ID, GCP_REGION, GCS_TRAINING_BUCKET.");
    return { gcpConfigured: false, exampleCount: 0, thresholdMet: false, trainingFilesCount: 0, inProgress: false, wouldSubmit: false, notes };
  }

  const inProgress = await hasSubmittedRunInProgress();
  if (inProgress) {
    notes.push("A fine-tune run is already submitted/running — would skip.");
  }

  const exampleCount = await countTrainingExamplesSinceLastTune();
  const thresholdMet = exampleCount >= FINE_TUNE_THRESHOLD;
  notes.push(`Training examples since last tune: ${exampleCount} (threshold: ${FINE_TUNE_THRESHOLD})`);

  let trainingFilesCount = 0;
  if (thresholdMet && !inProgress) {
    const paths = await getAllTrainingGcsPathsSinceLastTune();
    trainingFilesCount = paths.length;
    notes.push(`Training files available in GCS: ${trainingFilesCount}`);
    if (trainingFilesCount === 0) {
      notes.push("No training files found in training_log — cannot submit job.");
    }
  }

  // Verify GCP credentials are reachable
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const authOpts: Record<string, unknown> = { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
    if (credentialsPath) authOpts.keyFilename = credentialsPath;
    const auth = new GoogleAuth(authOpts);
    const client = await auth.getClient();
    await client.getAccessToken();
    notes.push("GCP credentials: OK (access token obtained).");
  } catch (credErr) {
    notes.push(`GCP credentials: FAILED — ${credErr instanceof Error ? credErr.message : String(credErr)}`);
  }

  const wouldSubmit = gcpConfigured && thresholdMet && !inProgress && trainingFilesCount > 0;
  notes.push(wouldSubmit ? "DRY RUN: would submit Vertex AI fine-tuning job." : "DRY RUN: would NOT submit a job.");

  logger.info({ notes_join: notes.join(" | ") }, "[FineTune][DryRun]");
  return { gcpConfigured, exampleCount, thresholdMet, trainingFilesCount, inProgress, wouldSubmit, notes };
}

export async function checkAndTriggerFineTune(opts?: { dryRun?: boolean }): Promise<void> {
  if (opts?.dryRun) {
    await dryRunFineTuneCheck();
    return;
  }

  if (!isVertexConfigured()) {
    logger.warn("[FineTune] Vertex AI not configured — skipping fine-tune check. Set GCP_PROJECT_ID, GCP_REGION, and GCS_TRAINING_BUCKET.");
    return;
  }

  try {
    const inProgress = await hasSubmittedRunInProgress();
    if (inProgress) {
      logger.info("[FineTune] A fine-tune run is already in progress — skipping.");
      return;
    }

    const exampleCount = await countTrainingExamplesSinceLastTune();
    logger.info(`[FineTune] ${exampleCount} training examples since last fine-tune (threshold: ${FINE_TUNE_THRESHOLD})`);

    if (exampleCount < FINE_TUNE_THRESHOLD) return;

    const trainingPaths = await getAllTrainingGcsPathsSinceLastTune();
    if (trainingPaths.length === 0) {
      logger.warn("[FineTune] No training files found in training_log — cannot trigger fine-tune");
      return;
    }

    logger.info(`[FineTune] Threshold met (${exampleCount} >= ${FINE_TUNE_THRESHOLD}). Merging ${trainingPaths.length} training files...`);

    const mergedUri = await mergeTrainingFiles(trainingPaths);
    logger.info(`[FineTune] Merged training file: ${mergedUri}`);

    const vertexJobId = await submitVertexFineTuningJob(mergedUri);

    const db = await getDb();
    if (db) {
      await db.insert(fineTuneRuns).values({
        vertexJobId,
        baseModel: BASE_MODEL,
        trainingExampleCount: exampleCount,
        status: "submitted",
        gcsTrainingFile: mergedUri,
      });
    }

    logger.info(`[FineTune] Vertex AI fine-tuning job submitted: ${vertexJobId}`);
  } catch (err) {
    logger.error({ err: err }, "[FineTune] Failed to check/trigger fine-tune:");
    captureServerException(err, {
      tags: { component: "fine_tune", error_type: "trigger_failed" },
    });
  }
}

/**
 * Poll Vertex AI for the status of all submitted/running fine-tune jobs and
 * update `fine_tune_runs` accordingly.
 */
export async function pollFineTuneRunStatuses(): Promise<void> {
  if (!isVertexConfigured()) return;

  const db = await getDb();
  if (!db) return;

  try {
    const activeRuns = await db
      .select()
      .from(fineTuneRuns)
      .where(inArray(fineTuneRuns.status, ["submitted", "running"]));

    if (activeRuns.length === 0) return;

    logger.info(`[FineTune] Polling ${activeRuns.length} active fine-tune run(s)...`);

    const { GoogleAuth } = await import("google-auth-library");
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const authOpts: Record<string, unknown> = { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
    if (credentialsPath) authOpts.keyFilename = credentialsPath;

    const auth = new GoogleAuth(authOpts);
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token ?? "";

    for (const run of activeRuns) {
      if (!run.vertexJobId) continue;

      try {
        const region = process.env.GCP_REGION!;
        const jobUrl = run.vertexJobId.startsWith("projects/")
          ? `https://${region}-aiplatform.googleapis.com/v1/${run.vertexJobId}`
          : `https://${region}-aiplatform.googleapis.com/v1/${run.vertexJobId}`;

        const resp = await fetch(jobUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) {
          logger.warn(`[FineTune] Failed to poll job ${run.vertexJobId}: HTTP ${resp.status}`);
          continue;
        }

        const jobData: Record<string, unknown> = await resp.json();
        const state = (jobData.state ?? "") as string;

        // Vertex AI tuning job states:
        // JOB_STATE_QUEUED, JOB_STATE_PENDING, JOB_STATE_RUNNING,
        // JOB_STATE_SUCCEEDED, JOB_STATE_FAILED, JOB_STATE_CANCELLED
        let newStatus: string | null = null;
        let resultModelId: string | null = null;
        let errorMessage: string | null = null;

        if (state === "JOB_STATE_RUNNING" || state === "JOB_STATE_PENDING" || state === "JOB_STATE_QUEUED") {
          newStatus = "running";
        } else if (state === "JOB_STATE_SUCCEEDED") {
          newStatus = "completed";
          const tunedModel = jobData.tunedModel as Record<string, unknown> | undefined;
          resultModelId = (tunedModel?.model ?? tunedModel?.endpoint ?? null) as string | null;
        } else if (state === "JOB_STATE_FAILED" || state === "JOB_STATE_CANCELLED") {
          newStatus = "failed";
          const errObj = jobData.error as Record<string, unknown> | undefined;
          errorMessage = errObj?.message ? String(errObj.message) : `Vertex AI job ended with state: ${state}`;
        }

        if (newStatus && newStatus !== run.status) {
          logger.info(`[FineTune] Job ${run.vertexJobId}: ${run.status} → ${newStatus}`);
          await db
            .update(fineTuneRuns)
            .set({
              status: newStatus,
              ...(resultModelId ? { resultModelId } : {}),
              ...(errorMessage ? { errorMessage } : {}),
              ...(newStatus === "completed" || newStatus === "failed" ? { completedAt: new Date() } : {}),
            } as any)
            .where(eq(fineTuneRuns.id, run.id));
        } else {
          logger.info(`[FineTune] Job ${run.vertexJobId}: status unchanged (${run.status})`);
        }
      } catch (pollErr) {
        logger.warn({ err: pollErr }, `[FineTune] Error polling job ${run.vertexJobId}:`);
        captureServerException(pollErr, {
          tags: { component: "fine_tune", error_type: "poll_failed" },
          extra: { runId: run.id, vertexJobId: run.vertexJobId },
        });
      }
    }
  } catch (err) {
    logger.error({ err: err }, "[FineTune] pollFineTuneRunStatuses failed:");
    captureServerException(err, { tags: { component: "fine_tune", error_type: "poll_setup_failed" } });
  }
}
