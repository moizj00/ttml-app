import { sql } from "drizzle-orm";
import { getDb } from "../db/core";
import { fineTuneRuns } from "../../drizzle/schema";
import { captureServerException } from "../sentry";

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
      console.warn(`[FineTune] Failed to read ${uri}, skipping:`, downloadErr);
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

export async function checkAndTriggerFineTune(): Promise<void> {
  if (!isVertexConfigured()) {
    console.warn("[FineTune] Vertex AI not configured — skipping fine-tune check. Set GCP_PROJECT_ID, GCP_REGION, and GCS_TRAINING_BUCKET.");
    return;
  }

  try {
    const inProgress = await hasSubmittedRunInProgress();
    if (inProgress) {
      console.log("[FineTune] A fine-tune run is already in progress — skipping.");
      return;
    }

    const exampleCount = await countTrainingExamplesSinceLastTune();
    console.log(`[FineTune] ${exampleCount} training examples since last fine-tune (threshold: ${FINE_TUNE_THRESHOLD})`);

    if (exampleCount < FINE_TUNE_THRESHOLD) return;

    const trainingPaths = await getAllTrainingGcsPathsSinceLastTune();
    if (trainingPaths.length === 0) {
      console.warn("[FineTune] No training files found in training_log — cannot trigger fine-tune");
      return;
    }

    console.log(`[FineTune] Threshold met (${exampleCount} >= ${FINE_TUNE_THRESHOLD}). Merging ${trainingPaths.length} training files...`);

    const mergedUri = await mergeTrainingFiles(trainingPaths);
    console.log(`[FineTune] Merged training file: ${mergedUri}`);

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

    console.log(`[FineTune] Vertex AI fine-tuning job submitted: ${vertexJobId}`);
  } catch (err) {
    console.error("[FineTune] Failed to check/trigger fine-tune:", err);
    captureServerException(err, {
      tags: { component: "fine_tune", error_type: "trigger_failed" },
    });
  }
}
