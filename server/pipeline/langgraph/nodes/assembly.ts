/**
 * LangGraph Assembly Node
 * 
 * Wraps the existing runAssemblyStage function with LangGraph-compatible
 * input/output handling. Requires successful draft output in state.
 * 
 * When invoked after a vetting rejection (retry_assembly), incorporates
 * vetting feedback into the assembly prompt via assemblyVettingFeedback.
 */

import type { PipelineState, PipelineErrorInfo } from "../state";
import { buildPipelineContextFromState, extractStateUpdatesFromContext } from "../state";
import { buildVettingFeedbackForRetry } from "../edges";
import { runAssemblyStage } from "../../assembly";
import { captureServerException } from "../../../sentry";
import { createLogger } from "../../../logger";
import { PipelineError, PIPELINE_ERROR_CODES } from "../../../../shared/types";

const nodeLogger = createLogger({ module: "LangGraphAssemblyNode" });

// ═══════════════════════════════════════════════════════
// ASSEMBLY NODE
// ═══════════════════════════════════════════════════════

export async function assemblyNode(
  state: PipelineState
): Promise<Partial<PipelineState>> {
  const { letterId, intake, research, draft, assemblyRetries, vettingReport } = state;
  const newRetryCount = assemblyRetries + 1;

  // Research and draft are required for assembly
  if (!research) {
    const errorInfo: PipelineErrorInfo = {
      code: PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED,
      message: "Cannot start assembly: research packet is missing",
      stage: "assembly",
      timestamp: new Date().toISOString(),
    };

    nodeLogger.error(
      { letterId },
      "[AssemblyNode] Research packet missing - cannot assemble"
    );

    return {
      assemblyRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
    };
  }

  if (!draft) {
    const errorInfo: PipelineErrorInfo = {
      code: PIPELINE_ERROR_CODES.DRAFT_VALIDATION_FAILED,
      message: "Cannot start assembly: draft is missing",
      stage: "assembly",
      timestamp: new Date().toISOString(),
    };

    nodeLogger.error(
      { letterId },
      "[AssemblyNode] Draft missing - cannot assemble"
    );

    return {
      assemblyRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
    };
  }

  // Check if this is a retry after vetting rejection
  const isRetryAfterVetting = vettingReport !== null && assemblyRetries > 0;

  nodeLogger.info(
    { letterId, attempt: newRetryCount, isRetryAfterVetting },
    "[AssemblyNode] Starting assembly stage"
  );

  // Build pipeline context from current state
  const pipelineCtx = buildPipelineContextFromState(state);

  // If retrying after vetting, inject vetting feedback
  if (isRetryAfterVetting) {
    const vettingFeedback = buildVettingFeedbackForRetry(state);
    if (vettingFeedback) {
      pipelineCtx.assemblyVettingFeedback = vettingFeedback;
      nodeLogger.info(
        { letterId, feedbackLength: vettingFeedback.length },
        "[AssemblyNode] Injecting vetting feedback for retry"
      );
    }
  }

  try {
    // Run the actual assembly stage
    const assembledLetter = await runAssemblyStage(
      letterId,
      intake,
      research,
      draft,
      pipelineCtx
    );

    nodeLogger.info(
      { letterId, wordCount: assembledLetter.split(/\s+/).length },
      "[AssemblyNode] Assembly completed successfully"
    );

    // Extract context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      assembledLetter,
      currentStage: "vetting",
      assemblyRetries: newRetryCount,
      intermediateDraftContent: assembledLetter,
      // Clear vetting state for fresh vetting pass
      vettedLetter: null,
      vettingReport: null,
      vettingCritical: false,
      assemblyVettingFeedback: null,
      lastError: null,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof PipelineError
        ? err.code
        : PIPELINE_ERROR_CODES.ASSEMBLY_STRUCTURE_INVALID;

    nodeLogger.error(
      { letterId, attempt: newRetryCount, error: errorMessage },
      "[AssemblyNode] Assembly stage failed"
    );

    captureServerException(err, {
      tags: { pipeline_stage: "assembly", letter_id: String(letterId) },
      extra: { attempt: newRetryCount, errorMessage, isRetryAfterVetting },
    });

    const errorInfo: PipelineErrorInfo = {
      code: errorCode,
      message: errorMessage,
      stage: "assembly",
      details: err instanceof PipelineError ? err.details : undefined,
      timestamp: new Date().toISOString(),
    };

    // Extract any partial context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      assemblyRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
      qualityWarnings: [
        `Assembly attempt ${newRetryCount} failed: ${errorMessage}`,
      ],
    };
  }
}
