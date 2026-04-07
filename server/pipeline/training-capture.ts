import { eq } from "drizzle-orm";
import { getDb } from "../db/core";
import { letterRequests, trainingLog, users } from "../../drizzle/schema";
import { captureServerException } from "../sentry";
import type { IntakeJson } from "../../shared/types";

function getGcsBucket(): string {
  const bucket = process.env.GCS_TRAINING_BUCKET;
  if (!bucket) throw new Error("GCS_TRAINING_BUCKET is not set");
  return bucket;
}

function getGcpProject(): string {
  const project = process.env.GCP_PROJECT_ID;
  if (!project) throw new Error("GCP_PROJECT_ID is not set");
  return project;
}

function isGcsConfigured(): boolean {
  return !!(process.env.GCS_TRAINING_BUCKET && process.env.GCP_PROJECT_ID);
}

interface TrainingExample {
  messages: Array<{ role: string; content: string }>;
}

function buildTrainingExample(
  intake: IntakeJson,
  approvedContent: string,
): TrainingExample {
  const systemMsg = `You are a legal letter drafting assistant. Given the intake details, produce a professional legal letter.`;

  const userMsg = [
    `Letter Type: ${intake.letterType}`,
    `Subject: ${intake.matter?.subject ?? "Legal Matter"}`,
    intake.jurisdiction?.state ? `Jurisdiction: ${intake.jurisdiction.state}, ${intake.jurisdiction.country ?? "US"}` : "",
    `Issue: ${intake.matter?.description ?? ""}`,
    intake.desiredOutcome ? `Desired Outcome: ${intake.desiredOutcome}` : "",
    intake.sender?.name ? `Sender: ${intake.sender.name}` : "",
    intake.recipient?.name ? `Recipient: ${intake.recipient.name}` : "",
  ].filter(Boolean).join("\n");

  return {
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
      { role: "assistant", content: approvedContent },
    ],
  };
}

function getPerExamplePath(letterId: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const ts = now.getTime();
  return `training-data/${year}/${month}/${day}/letter-${letterId}-${ts}.jsonl`;
}

async function uploadToGcs(gcsPath: string, content: string): Promise<void> {
  const bucket = getGcsBucket();
  const project = getGcpProject();

  const { Storage } = await import("@google-cloud/storage");

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const storageOpts: Record<string, unknown> = { projectId: project };
  if (credentialsPath) {
    storageOpts.keyFilename = credentialsPath;
  }

  const storage = new Storage(storageOpts);
  await storage.bucket(bucket).file(gcsPath).save(content, {
    contentType: "application/jsonl",
  });
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function captureTrainingExample(
  letterId: number,
  letterType: string,
  jurisdiction: string | null,
  intake: IntakeJson,
  approvedContent: string,
): Promise<void> {
  try {
    // Check user consent before capturing training data
    const db = await getDb();
    if (db) {
      const letter = await db
        .select({ userId: letterRequests.userId })
        .from(letterRequests)
        .where(eq(letterRequests.id, letterId))
        .limit(1);
      const userId = letter[0]?.userId;
      if (!userId) {
        console.log(`[TrainingCapture] Skipping letter #${letterId} — letter not found or missing userId`);
        return;
      }
      const user = await db
        .select({ consentToTraining: users.consentToTraining })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user[0]?.consentToTraining) {
        console.log(`[TrainingCapture] Skipping letter #${letterId} — user has not consented to training data usage`);
        return;
      }
    }
    const example = buildTrainingExample(intake, approvedContent);
    const jsonlLine = JSON.stringify(example);
    const gcsPath = getPerExamplePath(letterId);
    const tokenCount = estimateTokenCount(jsonlLine);

    let uploadedGcsUri: string | null = null;

    if (isGcsConfigured()) {
      try {
        const bucket = getGcsBucket();
        await uploadToGcs(gcsPath, jsonlLine + "\n");
        uploadedGcsUri = `gs://${bucket}/${gcsPath}`;
        console.log(`[TrainingCapture] Uploaded example for letter #${letterId} to ${uploadedGcsUri}`);
      } catch (gcsErr) {
        console.error(`[TrainingCapture] GCS upload failed for letter #${letterId}:`, gcsErr);
        captureServerException(gcsErr, {
          tags: { component: "training_capture", error_type: "gcs_upload_failed" },
          extra: { letterId, gcsPath },
        });
      }
    } else {
      console.warn(`[TrainingCapture] GCS not configured — skipping upload for letter #${letterId}. Set GCS_TRAINING_BUCKET and GCP_PROJECT_ID.`);
    }

    const dbForLog = await getDb();
    if (dbForLog) {
      await dbForLog.insert(trainingLog).values({
        letterRequestId: letterId,
        letterType,
        jurisdiction,
        gcsPath: uploadedGcsUri,
        tokenCount,
      });
      console.log(`[TrainingCapture] Logged training example for letter #${letterId} (${tokenCount} tokens)`);
    }
  } catch (err) {
    console.error(`[TrainingCapture] Failed to capture training example for letter #${letterId}:`, err);
    captureServerException(err, {
      tags: { component: "training_capture", error_type: "capture_failed" },
      extra: { letterId },
    });
  }
}
