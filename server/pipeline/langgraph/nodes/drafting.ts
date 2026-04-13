/**
 * LangGraph Drafting Node
 * 
 * Wraps the existing runDraftingStage function with LangGraph-compatible
 * input/output handling. Requires successful research output in state.
 */

import type { PipelineState, PipelineErrorInfo } from "../state";
import { buildPipelineContextFromState, extractStateUpdatesFromContext } from "../state";
import { runDraftingStage } from "../../drafting";
import { updateLetterStatus } from "../../../db";
import { captureServerException } from "../../../sentry";
import { createLogger } from "../../../logger";
import { PipelineError, PIPELINE_ERROR_CODES } from "../../../../shared/types";

const nodeLogger = createLogger({ module: "LangGraphDraftingNode" });

// ═══════════════════════════════════════════════════════
// DRAFTING NODE
// ═══════════════════════════════════════════════════════

export async function draftingNode(
  state: PipelineState
): Promise<Partial<PipelineState>> {
  const { letterId, intake, research, draftingRetries } = state;
  const newRetryCount = draftingRetries + 1;

  // Research is required for drafting
  if (!research) {
    const errorInfo: PipelineErrorInfo = {
      code: PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED,
      message: "Cannot start drafting: research packet is missing",
      stage: "drafting",
      timestamp: new Date().toISOString(),
    };

    nodeLogger.error(
      { letterId },
      "[DraftingNode] Research packet missing - cannot draft"
    );

    return {
      draftingRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
    };
  }

  nodeLogger.info(
    { letterId, attempt: newRetryCount },
    "[DraftingNode] Starting drafting stage"
  );

  // Build pipeline context from current state
  const pipelineCtx = buildPipelineContextFromState(state);

  try {
    // Update letter status
    await updateLetterStatus(letterId, "drafting", { force: true });

    // Run the actual drafting stage
    const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);

    nodeLogger.info(
      { letterId, hasCounterArgs: !!draft.counterArguments?.length },
      "[DraftingNode] Drafting completed successfully"
    );

    // Extract context updates (includes RAG metadata)
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      draft,
      currentStage: "assembly",
      draftingRetries: newRetryCount,
      counterArguments: draft.counterArguments ?? null,
      intermediateDraftContent: draft.draftLetter,
      lastError: null,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof PipelineError
        ? err.code
        : PIPELINE_ERROR_CODES.DRAFT_VALIDATION_FAILED;

    nodeLogger.error(
      { letterId, attempt: newRetryCount, error: errorMessage },
      "[DraftingNode] Drafting stage failed"
    );

    captureServerException(err, {
      tags: { pipeline_stage: "drafting", letter_id: String(letterId) },
      extra: { attempt: newRetryCount, errorMessage },
    });

    const errorInfo: PipelineErrorInfo = {
      code: errorCode,
      message: errorMessage,
      stage: "drafting",
      details: err instanceof PipelineError ? err.details : undefined,
      timestamp: new Date().toISOString(),
    };

    // Extract any partial context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      draftingRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
      qualityWarnings: [
        `Drafting attempt ${newRetryCount} failed: ${errorMessage}`,
      ],
    };
  }
}
