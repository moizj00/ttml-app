/**
 * LangGraph Pipeline Entry Point
 * 
 * Main export for the LangGraph-based letter generation pipeline.
 * Provides both synchronous and streaming execution modes.
 */

import { getPipelineGraph, rebuildPipelineGraph } from "./graph";
import {
  PipelineStateAnnotation,
  createInitialState,
  type PipelineState,
  type TokenUsageSummary,
  type PipelineErrorInfo,
} from "./state";
import {
  updateLetterStatus,
  markPriorPipelineRunsSuperseded,
  createWorkflowJob,
  updateWorkflowJob,
} from "../../db";
import { validateIntakeCompleteness, addValidationResult } from "../validators";
import { autoAdvanceIfPreviouslyUnlocked } from "../fallback";
import { finalizeLetterAfterVetting } from "../vetting";
import { captureServerException } from "../../sentry";
import { createLogger } from "../../logger";
import { formatStructuredError, classifyErrorCode } from "../shared";
import { calculateCost } from "../providers";
import { PipelineError, PIPELINE_ERROR_CODES } from "../../../shared/types";
import type { IntakeJson } from "../../../shared/types";

const pipelineLogger = createLogger({ module: "LangGraphPipeline" });

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface PipelineResult {
  success: boolean;
  vettedLetter?: string;
  error?: string;
  errorCode?: string;
  tokenUsage?: TokenUsageSummary;
  qualityWarnings?: string[];
  finalState?: PipelineState;
}

export interface PipelineStreamEvent {
  stage: string;
  state: Partial<PipelineState>;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════
// API KEY PREFLIGHT
// ═══════════════════════════════════════════════════════

export function preflightApiKeyCheck(stage: "research" | "drafting" | "full"): {
  ok: boolean;
  missing: string[];
  canResearch: boolean;
  canDraft: boolean;
} {
  const missing: string[] = [];
  const hasPerplexity = !!(process.env.PERPLEXITY_API_KEY?.trim());
  const hasOpenAI = !!(process.env.OPENAI_API_KEY?.trim());
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY?.trim());
  const hasGroq = !!(process.env.GROQ_API_KEY?.trim());

  const canResearch = hasPerplexity || hasOpenAI || hasAnthropic || hasGroq;
  const canDraft = hasAnthropic || hasOpenAI || hasGroq;

  if (!canResearch) {
    missing.push("No research provider available (need PERPLEXITY_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY)");
  }
  if ((stage === "drafting" || stage === "full") && !canDraft) {
    missing.push("No drafting provider available (need ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY)");
  }

  const ok = stage === "research" ? canResearch : stage === "drafting" ? canDraft : (canResearch && canDraft);
  return { ok, missing, canResearch, canDraft };
}

// ═══════════════════════════════════════════════════════
// SYNCHRONOUS PIPELINE EXECUTION
// ═══════════════════════════════════════════════════════

/**
 * Run the full letter generation pipeline synchronously.
 * 
 * This is the main entry point for invoking the LangGraph pipeline.
 * It handles:
 * - Intake validation
 * - API key preflight checks
 * - Pipeline execution via LangGraph
 * - Letter finalization
 * - Auto-unlock for previously paid letters
 * 
 * @param letterId - Database ID of the letter request
 * @param intake - Validated intake JSON from user submission
 * @param userId - Optional user ID for notifications
 * @returns Pipeline result with success status and final letter
 */
export async function runPipeline(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): Promise<PipelineResult> {
  pipelineLogger.info({ letterId, letterType: intake.letterType }, "[LangGraph] Starting pipeline");

  // ── Intake validation ──
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    pipelineLogger.error({ letterId, errors: intakeCheck.errors }, "[LangGraph] Intake pre-flight failed");
    return {
      success: false,
      error: `Intake validation failed: ${intakeCheck.errors.join("; ")}`,
      errorCode: PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
    };
  }

  // ── API key preflight ──
  const apiCheck = preflightApiKeyCheck("full");
  if (!apiCheck.ok) {
    const msg = `API key preflight failed: ${apiCheck.missing.join("; ")}`;
    pipelineLogger.error({ letterId, err: msg }, "[LangGraph] API key preflight failed");
    return {
      success: false,
      error: msg,
      errorCode: PIPELINE_ERROR_CODES.API_KEY_MISSING,
    };
  }

  // ── Mark stale pipeline runs as superseded ──
  await markPriorPipelineRunsSuperseded(letterId);

  // ── Create pipeline workflow job ──
  const pipelineJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "generation_pipeline",
    provider: "langgraph",
    requestPayloadJson: {
      letterId,
      stages: ["research", "drafting", "assembly", "vetting"],
      mode: "langgraph",
    },
  });
  const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;
  await updateWorkflowJob(pipelineJobId, {
    status: "running",
    startedAt: new Date(),
  });

  // ── Build initial state ──
  const initialState = createInitialState(letterId, intake, userId);

  try {
    // ── Execute pipeline ──
    const graph = getPipelineGraph();
    const finalState = await graph.invoke(initialState) as PipelineState;

    pipelineLogger.info(
      {
        letterId,
        finalStage: finalState.currentStage,
        hasVettedLetter: !!finalState.vettedLetter,
        errors: finalState.errors.length,
      },
      "[LangGraph] Pipeline execution completed"
    );

    // ── Handle success ──
    if (finalState.currentStage === "complete" && finalState.vettedLetter) {
      // Finalize the letter
      await finalizeLetterAfterVetting(
        letterId,
        finalState.vettedLetter,
        finalState.vettingReport!,
        {
          letterId,
          userId: userId ?? 0,
          intake,
          qualityWarnings: finalState.qualityWarnings,
          validationResults: finalState.validationResults,
          counterArguments: finalState.counterArguments ?? undefined,
          ragExampleCount: finalState.ragExampleCount,
          ragSimilarityScores: finalState.ragSimilarityScores,
          ragAbGroup: finalState.ragAbGroup,
        }
      );

      // Update workflow job
      await updateWorkflowJob(pipelineJobId, {
        status: "completed",
        completedAt: new Date(),
        promptTokens: finalState.tokenUsage.promptTokens,
        completionTokens: finalState.tokenUsage.completionTokens,
        estimatedCostUsd: String(finalState.tokenUsage.estimatedCostUsd.toFixed(4)),
        responsePayloadJson: {
          validationResults: finalState.validationResults,
          qualityWarnings: finalState.qualityWarnings,
          vettingReport: finalState.vettingReport,
          mode: "langgraph",
        },
      });

      // Auto-unlock if previously paid
      try {
        await autoAdvanceIfPreviouslyUnlocked(letterId);
      } catch (autoUnlockErr) {
        pipelineLogger.error(
          { err: autoUnlockErr, letterId },
          "[LangGraph] Auto-unlock check failed (pipeline still succeeded)"
        );
        captureServerException(autoUnlockErr, {
          tags: { component: "langgraph", error_type: "auto_unlock_failed" },
          extra: { letterId },
        });
      }

      pipelineLogger.info(
        { letterId, riskLevel: finalState.vettingReport?.riskLevel },
        "[LangGraph] Pipeline completed successfully"
      );

      return {
        success: true,
        vettedLetter: finalState.vettedLetter,
        tokenUsage: finalState.tokenUsage,
        qualityWarnings: finalState.qualityWarnings,
        finalState,
      };
    }

    // ── Handle failure ──
    const lastError = finalState.lastError;
    const errorMsg = lastError?.message ?? "Pipeline failed without specific error";

    pipelineLogger.error(
      { letterId, stage: finalState.currentStage, error: errorMsg },
      "[LangGraph] Pipeline failed"
    );

    await Promise.all([
      updateWorkflowJob(pipelineJobId, {
        status: "failed",
        errorMessage: formatStructuredError(
          lastError?.code ?? "PIPELINE_FAILED",
          errorMsg,
          "pipeline"
        ),
        completedAt: new Date(),
        promptTokens: finalState.tokenUsage.promptTokens,
        completionTokens: finalState.tokenUsage.completionTokens,
        responsePayloadJson: {
          errors: finalState.errors,
          qualityWarnings: finalState.qualityWarnings,
          mode: "langgraph",
        },
      }),
      updateLetterStatus(letterId, "submitted"), // Revert to allow retry
    ]);

    return {
      success: false,
      error: errorMsg,
      errorCode: lastError?.code,
      tokenUsage: finalState.tokenUsage,
      qualityWarnings: finalState.qualityWarnings,
      finalState,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);

    pipelineLogger.error(
      { letterId, error: errorMessage },
      "[LangGraph] Pipeline threw exception"
    );

    captureServerException(err, {
      tags: { component: "langgraph", letter_id: String(letterId) },
      extra: { pipelineJobId, errorMessage },
    });

    await Promise.all([
      updateWorkflowJob(pipelineJobId, {
        status: "failed",
        errorMessage: formatStructuredError(errorCode, errorMessage, "pipeline"),
        completedAt: new Date(),
      }),
      updateLetterStatus(letterId, "submitted"),
    ]);

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

// ═══════════════════════════════════════════════════════
// STREAMING PIPELINE EXECUTION
// ═══════════════════════════════════════════════════════

/**
 * Run the pipeline with streaming updates.
 * 
 * Yields events as each node completes, enabling real-time progress
 * updates to the UI. Use this for long-running pipelines where
 * user feedback is important.
 * 
 * @param letterId - Database ID of the letter request
 * @param intake - Validated intake JSON
 * @param userId - Optional user ID
 * @yields Pipeline stream events with stage and state updates
 */
export async function* runPipelineStreaming(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): AsyncGenerator<PipelineStreamEvent, PipelineResult, unknown> {
  pipelineLogger.info({ letterId }, "[LangGraph] Starting streaming pipeline");

  // ── Intake validation ──
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    return {
      success: false,
      error: `Intake validation failed: ${intakeCheck.errors.join("; ")}`,
      errorCode: PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
    };
  }

  // ── API key preflight ──
  const apiCheck = preflightApiKeyCheck("full");
  if (!apiCheck.ok) {
    return {
      success: false,
      error: `API key preflight failed: ${apiCheck.missing.join("; ")}`,
      errorCode: PIPELINE_ERROR_CODES.API_KEY_MISSING,
    };
  }

  // ── Mark stale runs ──
  await markPriorPipelineRunsSuperseded(letterId);

  // ── Build initial state ──
  const initialState = createInitialState(letterId, intake, userId);

  try {
    const graph = getPipelineGraph();
    const stream = await graph.stream(initialState);

    let finalState: PipelineState | null = null;

    for await (const event of stream) {
      const stageName = Object.keys(event)[0];
      const stateUpdate = Object.values(event)[0] as Partial<PipelineState>;

      yield {
        stage: stageName,
        state: stateUpdate,
        timestamp: new Date().toISOString(),
      };

      // Capture final state
      if (stateUpdate.currentStage === "complete" || stateUpdate.currentStage === "failed") {
        finalState = { ...initialState, ...stateUpdate } as PipelineState;
      }
    }

    // Return final result
    if (finalState?.currentStage === "complete" && finalState.vettedLetter) {
      return {
        success: true,
        vettedLetter: finalState.vettedLetter,
        tokenUsage: finalState.tokenUsage,
        qualityWarnings: finalState.qualityWarnings,
        finalState,
      };
    }

    return {
      success: false,
      error: finalState?.lastError?.message ?? "Pipeline failed",
      errorCode: finalState?.lastError?.code,
      finalState: finalState ?? undefined,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    pipelineLogger.error(
      { letterId, error: errorMessage },
      "[LangGraph] Streaming pipeline threw exception"
    );

    captureServerException(err, {
      tags: { component: "langgraph-streaming", letter_id: String(letterId) },
    });

    return {
      success: false,
      error: errorMessage,
      errorCode: err instanceof PipelineError ? err.code : classifyErrorCode(err),
    };
  }
}

// ═══════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════

export {
  PipelineStateAnnotation,
  createInitialState,
  type PipelineState,
  type TokenUsageSummary,
  type PipelineErrorInfo,
} from "./state";

export { getPipelineGraph, rebuildPipelineGraph } from "./graph";

export {
  MAX_RESEARCH_RETRIES,
  MAX_DRAFTING_RETRIES,
  MAX_ASSEMBLY_RETRIES,
  MAX_VETTING_RETRIES,
} from "./edges";
