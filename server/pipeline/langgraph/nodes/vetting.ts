/**
 * LangGraph Vetting Node
 * 
 * Wraps the existing runVettingStage function with LangGraph-compatible
 * input/output handling. Evaluates assembled letter quality and
 * sets vettingCritical flag for routing decisions.
 */

import type { PipelineState, PipelineErrorInfo } from "../state";
import { buildPipelineContextFromState, extractStateUpdatesFromContext } from "../state";
import { runVettingStage } from "../../vetting";
import { captureServerException } from "../../../sentry";
import { createLogger } from "../../../logger";
import { PipelineError, PIPELINE_ERROR_CODES } from "../../../../shared/types";

const nodeLogger = createLogger({ module: "LangGraphVettingNode" });

// ═══════════════════════════════════════════════════════
// VETTING NODE
// ═══════════════════════════════════════════════════════

export async function vettingNode(
  state: PipelineState
): Promise<Partial<PipelineState>> {
  const { letterId, intake, research, assembledLetter, vettingRetries } = state;
  const newRetryCount = vettingRetries + 1;

  // Assembled letter is required for vetting
  if (!assembledLetter) {
    const errorInfo: PipelineErrorInfo = {
      code: PIPELINE_ERROR_CODES.ASSEMBLY_STRUCTURE_INVALID,
      message: "Cannot start vetting: assembled letter is missing",
      stage: "vetting",
      timestamp: new Date().toISOString(),
    };

    nodeLogger.error(
      { letterId },
      "[VettingNode] Assembled letter missing - cannot vet"
    );

    return {
      vettingRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
    };
  }

  if (!research) {
    const errorInfo: PipelineErrorInfo = {
      code: PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED,
      message: "Cannot start vetting: research packet is missing",
      stage: "vetting",
      timestamp: new Date().toISOString(),
    };

    nodeLogger.error(
      { letterId },
      "[VettingNode] Research packet missing - cannot vet"
    );

    return {
      vettingRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
    };
  }

  nodeLogger.info(
    { letterId, attempt: newRetryCount },
    "[VettingNode] Starting vetting stage"
  );

  // Build pipeline context from current state
  const pipelineCtx = buildPipelineContextFromState(state);

  try {
    // Run the actual vetting stage
    const { vettedLetter, vettingReport, critical } = await runVettingStage(
      letterId,
      assembledLetter,
      intake,
      research,
      pipelineCtx
    );

    nodeLogger.info(
      {
        letterId,
        riskLevel: vettingReport.riskLevel,
        critical,
        changesApplied: vettingReport.changesApplied?.length ?? 0,
        citationsFlagged: vettingReport.citationsFlagged?.length ?? 0,
      },
      "[VettingNode] Vetting completed"
    );

    // Extract context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    // Build quality warnings from vetting issues
    const additionalWarnings: string[] = [];
    if (critical) {
      const criticalIssues = [
        ...(vettingReport.jurisdictionIssues ?? []),
        ...(vettingReport.citationsFlagged ?? []),
        ...(vettingReport.factualIssuesFound ?? []),
      ];
      additionalWarnings.push(
        ...criticalIssues.map((i) => `VETTING_CRITICAL: ${i}`)
      );
    }

    return {
      ...contextUpdates,
      vettedLetter,
      vettingReport,
      vettingCritical: critical,
      currentStage: critical ? "assembly" : "complete",
      vettingRetries: newRetryCount,
      intermediateDraftContent: vettedLetter,
      lastError: null,
      qualityWarnings: additionalWarnings,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      err instanceof PipelineError
        ? err.code
        : PIPELINE_ERROR_CODES.VETTING_REJECTED;

    nodeLogger.error(
      { letterId, attempt: newRetryCount, error: errorMessage },
      "[VettingNode] Vetting stage failed"
    );

    captureServerException(err, {
      tags: { pipeline_stage: "vetting", letter_id: String(letterId) },
      extra: { attempt: newRetryCount, errorMessage },
    });

    const errorInfo: PipelineErrorInfo = {
      code: errorCode,
      message: errorMessage,
      stage: "vetting",
      details: err instanceof PipelineError ? err.details : undefined,
      timestamp: new Date().toISOString(),
    };

    // Extract any partial context updates
    const contextUpdates = extractStateUpdatesFromContext(pipelineCtx);

    return {
      ...contextUpdates,
      vettingRetries: newRetryCount,
      lastError: errorInfo,
      errors: [errorInfo],
      qualityWarnings: [
        `Vetting attempt ${newRetryCount} failed: ${errorMessage}`,
      ],
    };
  }
}
