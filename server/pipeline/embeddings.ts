import { sql } from "drizzle-orm";
import { getDb } from "../db/core";
import { captureServerException } from "../sentry";
import {
  isVertexSearchConfigured,
  upsertToVertexSearch,
  queryVertexSearch,
} from "./vertex-search";
import { logger } from "../logger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for embedding generation");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text.slice(0, 8000),
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`OpenAI embedding API returned ${response.status}: ${errText}`);
  }

  const result: OpenAIEmbeddingResponse = await response.json();
  return result.data[0].embedding;
}

export async function storeEmbedding(versionId: number, embedding: number[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const vectorStr = `[${embedding.join(",")}]`;
  await db.execute(
    sql`UPDATE letter_versions SET embedding = ${vectorStr}::vector WHERE id = ${versionId}`
  );
}

function upsertToVertexSearchFireAndForget(versionId: number, embedding: number[]): void {
  if (!isVertexSearchConfigured()) return;

  upsertToVertexSearch(String(versionId), embedding).catch((err) => {
    logger.warn(`[Embeddings] Vertex Search upsert failed for version #${versionId} (non-blocking):`, err);
    captureServerException(err, {
      tags: { component: "embeddings", error_type: "vertex_upsert_failed" },
      extra: { versionId },
    });
  });
}

export async function embedAndStoreLetterVersion(versionId: number, content: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    await storeEmbedding(versionId, embedding);
    upsertToVertexSearchFireAndForget(versionId, embedding);
    logger.info(`[Embeddings] Stored embedding for version #${versionId} (${EMBEDDING_DIMENSIONS} dims, vertex=${isVertexSearchConfigured()})`);
  } catch (err) {
    logger.error({ err: err }, `[Embeddings] Failed to embed version #${versionId}:`);
    captureServerException(err, {
      tags: { component: "embeddings", error_type: "embed_and_store_failed" },
      extra: { versionId },
    });
    throw err;
  }
}

export interface SimilarLetter {
  id: number;
  letter_request_id: number;
  content: string;
  similarity: number;
}

async function findSimilarLettersViaVertexSearch(
  queryEmbedding: number[],
  matchCount: number,
  matchThreshold: number,
): Promise<SimilarLetter[]> {
  const start = Date.now();
  const matches = await queryVertexSearch(queryEmbedding, matchCount);
  const latencyMs = Date.now() - start;
  logger.info(`[Embeddings] Vertex Search returned ${matches.length} neighbors in ${latencyMs}ms`);

  if (matches.length === 0) return [];

  const ids = matches
    .filter((m) => {
      const similarity = 1 - m.distance;
      return similarity >= matchThreshold;
    })
    .map((m) => parseInt(m.id, 10))
    .filter((id) => !isNaN(id));

  if (ids.length === 0) return [];

  const db = await getDb();
  if (!db) return [];

  const results = await db.execute(
    sql`SELECT lv.id, lv.letter_request_id, lv.content FROM letter_versions lv WHERE lv.id = ANY(${ids}::int[])`
  );

  const rowMap = new Map<number, { id: number; letter_request_id: number; content: string }>();
  for (const row of results as unknown as Array<{ id: number; letter_request_id: number; content: string }>) {
    rowMap.set(row.id, row);
  }

  return ids
    .map((id) => {
      const row = rowMap.get(id);
      if (!row) return null;
      const match = matches.find((m) => parseInt(m.id, 10) === id);
      const similarity = match ? 1 - match.distance : 0;
      return {
        id: row.id,
        letter_request_id: row.letter_request_id,
        content: row.content,
        similarity,
      };
    })
    .filter((r): r is SimilarLetter => r !== null);
}

async function findSimilarLettersViaPgvector(
  queryEmbedding: number[],
  matchCount: number,
  matchThreshold: number,
): Promise<SimilarLetter[]> {
  const db = await getDb();
  if (!db) return [];

  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const results = await db.execute(
    sql`SELECT * FROM match_letters(${vectorStr}::vector, ${matchThreshold}, ${matchCount})`
  );

  const rows = results as unknown as SimilarLetter[];
  return rows.map((r) => ({
    id: r.id,
    letter_request_id: r.letter_request_id,
    content: r.content,
    similarity: typeof r.similarity === "string" ? parseFloat(r.similarity) : r.similarity,
  }));
}

export async function findSimilarLetters(
  queryText: string,
  matchCount: number = 3,
  matchThreshold: number = 0.7,
): Promise<SimilarLetter[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const queryEmbedding = await generateEmbedding(queryText);

    if (isVertexSearchConfigured()) {
      try {
        const start = Date.now();
        const results = await findSimilarLettersViaVertexSearch(queryEmbedding, matchCount, matchThreshold);
        const latencyMs = Date.now() - start;
        logger.info(`[Embeddings] findSimilarLetters via Vertex Search: ${results.length} results in ${latencyMs}ms`);
        return results;
      } catch (vertexErr) {
        logger.warn({ err: vertexErr }, "[Embeddings] Vertex Search query failed, falling back to pgvector:");
        captureServerException(vertexErr, {
          tags: { component: "embeddings", error_type: "vertex_search_fallback" },
        });
      }
    }

    return await findSimilarLettersViaPgvector(queryEmbedding, matchCount, matchThreshold);
  } catch (err) {
    logger.error({ err: err }, "[Embeddings] findSimilarLetters failed:");
    captureServerException(err, {
      tags: { component: "embeddings", error_type: "similar_search_failed" },
    });
    return [];
  }
}
