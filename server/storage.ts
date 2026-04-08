// Storage helpers for Cloudflare R2 (S3-compatible API)
// Uses @aws-sdk/client-s3 pointed at R2's S3-compatible endpoint.

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from './_core/env';
import { logger } from "./logger";

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey } = ENV;

  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error(
      "Cloudflare R2 credentials missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY"
    );
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });

  return cachedClient;
}

function getR2Bucket(): string {
  const bucket = ENV.r2BucketName;
  if (!bucket) {
    throw new Error("Cloudflare R2 bucket name missing: set R2_BUCKET_NAME");
  }
  return bucket;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildPublicUrl(key: string): string {
  const base = ENV.r2PublicUrl.replace(/\/+$/, "");
  return `${base}/${key}`;
}

async function generatePresignedUrl(key: string): Promise<string> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

async function resolveUrl(key: string): Promise<string> {
  if (ENV.r2PublicUrl) {
    return buildPublicUrl(key);
  }
  return generatePresignedUrl(key);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = normalizeKey(relKey);

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = await resolveUrl(key);
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const url = await resolveUrl(key);
  return { key, url };
}

let r2Healthy: boolean | null = null;

export function getR2HealthStatus(): boolean | null {
  return r2Healthy;
}

export async function checkR2Connectivity(): Promise<void> {
  if (!ENV.r2AccountId || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey || !ENV.r2BucketName) {
    logger.warn("[R2] Cloudflare R2 credentials not fully configured — storage uploads will fail.");
    r2Healthy = false;
    return;
  }

  try {
    const client = getR2Client();
    const bucket = getR2Bucket();
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    r2Healthy = true;
    logger.info("[R2] Cloudflare R2 connectivity check passed.");
  } catch (err: any) {
    r2Healthy = false;
    logger.error("[R2] Cloudflare R2 connectivity check FAILED:", err?.message ?? err);
  }
}
