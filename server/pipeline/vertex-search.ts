import { captureServerException } from "../sentry";
import { logger } from "../logger";

const VERTEX_SEARCH_TIMEOUT_MS = 5_000;

export interface VertexSearchConfig {
  projectId: string;
  region: string;
  indexId: string;
  indexEndpointId: string;
  deployedIndexId: string;
}

export interface VertexSearchMatch {
  id: string;
  distance: number;
}

function getConfig(): VertexSearchConfig | null {
  const projectId = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION;
  const indexId = process.env.VERTEX_SEARCH_INDEX_ID;
  const indexEndpointId = process.env.VERTEX_SEARCH_INDEX_ENDPOINT_ID;
  const deployedIndexId = process.env.VERTEX_SEARCH_DEPLOYED_INDEX_ID;

  if (!projectId || !region || !indexId || !indexEndpointId || !deployedIndexId) {
    return null;
  }

  return { projectId, region, indexId, indexEndpointId, deployedIndexId };
}

export function isVertexSearchConfigured(): boolean {
  if (!getConfig()) return false;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return false;
  return true;
}

export function getVertexSearchMissingVars(): string[] {
  const missing: string[] = [];
  if (!process.env.GCP_PROJECT_ID) missing.push("GCP_PROJECT_ID");
  if (!process.env.GCP_REGION) missing.push("GCP_REGION");
  if (!process.env.VERTEX_SEARCH_INDEX_ID) missing.push("VERTEX_SEARCH_INDEX_ID");
  if (!process.env.VERTEX_SEARCH_INDEX_ENDPOINT_ID) missing.push("VERTEX_SEARCH_INDEX_ENDPOINT_ID");
  if (!process.env.VERTEX_SEARCH_DEPLOYED_INDEX_ID) missing.push("VERTEX_SEARCH_DEPLOYED_INDEX_ID");
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) missing.push("GOOGLE_APPLICATION_CREDENTIALS");
  return missing;
}

async function getAccessToken(): Promise<string> {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required for Vertex AI Vector Search");
  }

  const { readFile } = await import("fs/promises");
  const credRaw = await readFile(credPath, "utf-8");
  const creds = JSON.parse(credRaw);

  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error("Failed to obtain Google access token");
  }
  return tokenResponse.token;
}

export async function upsertToVertexSearch(
  id: string,
  embedding: number[],
): Promise<void> {
  const config = getConfig();
  if (!config) return;

  try {
    const token = await getAccessToken();

    const endpointHost = `${config.region}-aiplatform.googleapis.com`;
    const url = `https://${endpointHost}/v1/projects/${config.projectId}/locations/${config.region}/indexes/${config.indexId}:upsertDatapoints`;

    const body = {
      datapoints: [
        {
          datapointId: id,
          featureVector: embedding,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VERTEX_SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      throw new Error(`Vertex AI upsert returned ${response.status}: ${errText}`);
    }

    logger.info(`[VertexSearch] Upserted datapoint id=${id}`);
  } catch (err) {
    logger.error(`[VertexSearch] upsertToVertexSearch failed for id=${id}:`, err);
    captureServerException(err, {
      tags: { component: "vertex-search", error_type: "upsert_failed" },
      extra: { id },
    });
    throw err;
  }
}

export async function queryVertexSearch(
  embedding: number[],
  neighborCount: number = 3,
): Promise<VertexSearchMatch[]> {
  const config = getConfig();
  if (!config) {
    throw new Error("Vertex AI Vector Search is not configured");
  }

  try {
    const token = await getAccessToken();

    const endpointHost = `${config.region}-aiplatform.googleapis.com`;
    const url = `https://${endpointHost}/v1/projects/${config.projectId}/locations/${config.region}/indexEndpoints/${config.indexEndpointId}:findNeighbors`;

    const body = {
      deployedIndexId: config.deployedIndexId,
      queries: [
        {
          datapoint: {
            featureVector: embedding,
          },
          neighborCount,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VERTEX_SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      throw new Error(`Vertex AI findNeighbors returned ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const nearestNeighbors = result.nearestNeighbors?.[0]?.neighbors ?? [];

    return nearestNeighbors.map((n: { datapoint: { datapointId: string }; distance: number }) => ({
      id: n.datapoint.datapointId,
      distance: n.distance,
    }));
  } catch (err) {
    logger.error("[VertexSearch] queryVertexSearch failed:", err);
    captureServerException(err, {
      tags: { component: "vertex-search", error_type: "query_failed" },
      extra: { neighborCount },
    });
    throw err;
  }
}
