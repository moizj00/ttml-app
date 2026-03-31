import { sql } from "drizzle-orm";
import { getDb } from "../db/core";
import { captureServerException } from "../sentry";

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

export async function embedAndStoreLetterVersion(versionId: number, content: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    await storeEmbedding(versionId, embedding);
    console.log(`[Embeddings] Stored embedding for version #${versionId} (${EMBEDDING_DIMENSIONS} dims)`);
  } catch (err) {
    console.error(`[Embeddings] Failed to embed version #${versionId}:`, err);
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

export async function findSimilarLetters(
  queryText: string,
  matchCount: number = 3,
  matchThreshold: number = 0.7,
): Promise<SimilarLetter[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const queryEmbedding = await generateEmbedding(queryText);
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
  } catch (err) {
    console.error("[Embeddings] findSimilarLetters failed:", err);
    captureServerException(err, {
      tags: { component: "embeddings", error_type: "similar_search_failed" },
    });
    return [];
  }
}
