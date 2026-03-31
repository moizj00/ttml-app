#!/usr/bin/env npx tsx
/**
 * Backfill embeddings for approved letter versions that have no embedding yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts
 *
 * Environment variables required:
 *   DATABASE_URL          — Postgres connection string
 *   OPENAI_API_KEY        — For generating embeddings
 *
 * Optional (enables Vertex AI Vector Search dual-write):
 *   GCP_PROJECT_ID
 *   GCP_REGION
 *   VERTEX_SEARCH_INDEX_ID
 *   VERTEX_SEARCH_INDEX_ENDPOINT_ID
 *   VERTEX_SEARCH_DEPLOYED_INDEX_ID
 *   GOOGLE_APPLICATION_CREDENTIALS
 */

import { sql } from "drizzle-orm";
import { getDb } from "../server/db/core";
import { generateEmbedding, storeEmbedding } from "../server/pipeline/embeddings";
import { isVertexSearchConfigured, upsertToVertexSearch } from "../server/pipeline/vertex-search";

const BATCH_SIZE = 10;
const RATE_LIMIT_DELAY_MS = 200;

interface PendingVersion {
  id: number;
  content: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPendingVersions(): Promise<PendingVersion[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.execute(
    sql`
      SELECT lv.id, lv.content
      FROM letter_versions lv
      JOIN letter_requests lr ON lr.id = lv.letter_request_id
      WHERE lv.embedding IS NULL
        AND lv.version_type = 'final_approved'
      ORDER BY lv.id ASC
    `
  );

  return rows as unknown as PendingVersion[];
}

async function processVersion(version: PendingVersion): Promise<void> {
  console.log(`[Backfill] Processing version #${version.id}...`);

  const embedding = await generateEmbedding(version.content);
  await storeEmbedding(version.id, embedding);
  console.log(`[Backfill] pgvector stored for version #${version.id}`);

  if (isVertexSearchConfigured()) {
    try {
      await upsertToVertexSearch(String(version.id), embedding);
      console.log(`[Backfill] Vertex Search upserted for version #${version.id}`);
    } catch (err) {
      console.warn(`[Backfill] Vertex Search upsert failed for version #${version.id} (continuing):`, err);
    }
  }
}

async function main(): Promise<void> {
  console.log("[Backfill] Starting embedding backfill...");
  console.log(`[Backfill] Vertex AI Vector Search: ${isVertexSearchConfigured() ? "enabled" : "disabled (pgvector only)"}`);

  const pending = await fetchPendingVersions();
  console.log(`[Backfill] Found ${pending.length} approved letter versions without embeddings`);

  if (pending.length === 0) {
    console.log("[Backfill] Nothing to do. Exiting.");
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    console.log(`[Backfill] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (versions ${i + 1}–${Math.min(i + BATCH_SIZE, pending.length)} of ${pending.length})`);

    for (const version of batch) {
      try {
        await processVersion(version);
        processed++;
      } catch (err) {
        console.error(`[Backfill] Failed to process version #${version.id}:`, err);
        failed++;
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  console.log(`[Backfill] Done. Processed: ${processed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[Backfill] Unexpected error:", err);
  process.exit(1);
});
