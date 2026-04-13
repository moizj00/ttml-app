/**
 * LangGraph Research Node
 * 
 * Wraps the existing runResearchStage function with LangGraph-compatible
 * input/output handling. Manages state updates for research results,
 * citation registry building, and error tracking.
 */

import type { PipelineState, PipelineErrorInfo } from "../state";
import { buildPipelineContextFromState, extractStateUpdatesFromContext } from "../state";
import { runResearchStage } from "../../research";
import { buildCitationRegistry, revalidateCitationsWithPerplexity } from "../../citations";
import { createTokenAccumulator, calculateCost } from "../../providers";
import { setLetterResearchUnverified, updateLetterStatus } from "../../../db";
import { captureServerException } from "../../../sentry";
import { createLogger } from "../../../logger";
import { PipelineError, PIPELINE_ERROR_CODES } from "../../../../shared/types";

const nodeLogger = createLogger({ module: "LangGraphResearchNode" });

// ═══════════════════════════════════════════════════════
// RESEARCH NODE
// ═══════════════════════════════════════════════════════

export async function researchNode(
  state: PipelineState
): Promise<Partial<PipelineState>> {
  const { letterId, intake, researchRetries } = state;
  const newRetryCount = researchRetries + 1;

  nodeLogger.info(
    { letterId, attempt: newRetryCount },
    "[ResearchNode] Starting research stage"
  );

  // Build pipeline context from current state
  const pipelineCtx = buildPipelineContextFromState(state);

  try {
    // Update letter status to researching
    await updateLetterStatus(letterId, "researching", { force: true });

    // Run the actual research stage
    const { packet, provider } = await runResearchStage(letterId, intake, pipelineCtx);

    nodeLogger.info(
      { letterId, provider, citationCount: packet.citations?.length ?? 0 },
      "[ResearchNode] Research completed successfully"
    );

    // Build citation registry from research results
    let citationRegistry = buildCitationRegistry(packet);
    nodeLogger.info(
      { letterId, registrySize: citationRegistry.length },
      "[ResearchNode] Built citation registry"
    );

    // Revalidate citations if needed (skip for cached results or small registries)
    const citationTokens = createTokenAccumulator();
    const researchFromCache = provider === "kv-cache";
    const allHighConfidence =
      citationRegistry.length > 0 &&
      citationRegistry.every((r) => r.confidence === "high");
    const skipRevalidation =
      citationRegistry.length === 0 ||
      citationRegistry.length < 3 ||
      researchFromCache ||
      allHighConfidence;

    let citationRevalidationModelKey: string | undefined;

    if (!skipRevalidation) {
      const jurisdiction =
        intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
      const revalResult = await revalidateCitationsWithPerplexity(
        citationRegistry,
        jurisdiction,
        letterId,
        citationTokens
      );
      citationRegistry = revalResult.registry;
      citationRevalidationModelKey = revalResult.modelKey;
    } else {
      const reasons: string[] = [];
      if (citationRegistry.length === 0) reasons.push("no citations");
      if (citationRegistry.length > 0 && citationRegistry.length < 3)
        reasons.push(`only ${citationRegistry.length} citations`);
      if (researchFromCache) reasons.push("served from cache");
      if (allHighConfidence) reasons.push("all high confidence");
      nodeLogger.info(
        { letterId, reasons },
        "[ResearchNode] Skipping citation revalidation"
      );
    }

    // Mark research as verified
    await setLetterResearchUnverified(letterId, false);

    // Extract context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      research: packet,
      researchProvider: provider,
      currentStage: "drafting",
      researchRetries: newRetryCount,
      citationRegistry,
      webGrounded: true,
      researchUnverified: false,
      lastError: null,
      tokenUsage: {
        promptTokens: citationTokens.promptTokens,
        completionTokens: citationTokens.completionTokens,
        estimatedCostUsd: citationRevalidationModelKey
          ? parseFloat(calculateCost(citationRevalidationModelKey, citationTokens))
          : 0,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof PipelineError
        ? err.code
        : PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED;

    nodeLogger.error(
      { letterId, attempt: newRetryCount, error: errorMessage },
      "[ResearchNode] Research stage failed"
    );

    captureServerException(err, {
      tags: { pipeline_stage: "research", letter_id: String(letterId) },
      extra: { attempt: newRetryCount, errorMessage },
    });

    const errorInfo: PipelineErrorInfo = {
      code: errorCode,
      message: errorMessage,
      stage: "research",
      details: err instanceof PipelineError ? err.details : undefined,
      timestamp: new Date().toISOString(),
    };

    // Extract any partial context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      researchRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
      qualityWarnings: [
        `Research attempt ${newRetryCount} failed: ${errorMessage}`,
      ],
    };
  }
}
