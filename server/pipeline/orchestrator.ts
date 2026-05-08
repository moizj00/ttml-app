/**
 * Global registry for intermediate pipeline results (drafts and vetted letters).
 * Used for RAG training data capture and near-real-time visibility.
 */
export const _intermediateContentRegistry = new Map<
  number,
  { content: string; qualityWarnings: string[] }
>();

import {
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
  getLetterRequestById as getLetterById,
  markPriorPipelineRunsSuperseded,
  getLatestResearchRun,
} from "../db";
import type {
  IntakeJson,
  ResearchPacket,
  DraftOutput,
  PipelineContext,
  PipelineErrorCode,
} from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { captureServerException } from "../sentry";
import { createLogger } from "../logger";
import { formatStructuredError, classifyErrorCode } from "./shared";
import { calculateCost } from "./providers";
import { addValidationResult, validateIntakeCompleteness } from "./validators";
import { autoAdvanceIfPreviouslyUnlocked } from "./fallback";
import { runResearchStage } from "./research/index";
import { runDraftingStage } from "./drafting";

import { runAssemblyVettingLoop, finalizeLetterAfterVetting } from "./vetting";
import { runPipeline as runLangGraphPipeline } from "./langgraph";
import { runSimplePipeline } from "./simple";

// Modularized imports
import { applyResearchGroundingAndRevalidate } from "./orchestration/grounding";
import {
  setIntermediateContent,
  consumeIntermediateContent,
} from "./orchestration/registry";
import {
  preflightApiKeyCheck,
  validatePipelinePreflight,
} from "./orchestration/preflight";
import { triggerN8nWorkflow } from "./orchestration/n8n";
import { handlePipelineError } from "./orchestration/errors";
import { updatePipelineJobStatus } from "./orchestration/status";

const orchLogger = createLogger({ module: "PipelineOrchestrator" });

// ── Per-stage timeout configuration ──────────────────────────────────────────
// Each stage has its own timeout. The overall job expiry (60 min) is a
// backstop — these catch stuck stages earlier and with better diagnostics.
const STAGE_TIMEOUTS = {
  research: parseInt(process.env.PIPELINE_RESEARCH_TIMEOUT_MS ?? "600000", 10),     // 10 min
  drafting: parseInt(process.env.PIPELINE_DRAFTING_TIMEOUT_MS ?? "900000", 10),     // 15 min
  assembly: parseInt(process.env.PIPELINE_ASSEMBLY_TIMEOUT_MS ?? "900000", 10),     // 15 min
  finalization: parseInt(process.env.PIPELINE_FINALIZATION_TIMEOUT_MS ?? "300000", 10), // 5 min
};

/** Wrap a pipeline stage with a timeout. Throws PipelineError on timeout. */
async function withStageTimeout<T>(
  stageName: string,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new PipelineError(
          PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED,
          `Stage "${stageName}" timed out after ${timeoutMs}ms`,
          "pipeline",
          `Per-stage timeout exceeded. Consider increasing PIPELINE_${stageName.toUpperCase()}_TIMEOUT_MS.`
        )
      );
    }, timeoutMs);

    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

// Re-export common functions for backward compatibility/external use
export { preflightApiKeyCheck };
export { consumeIntermediateContent };

/**
 * FULL PIPELINE ORCHESTRATOR
 */
export async function runFullPipeline(
  letterId: number,
  intake: IntakeJson,
  dbFields?: {
    subject: string;
    issueSummary?: string | null;
    jurisdictionCountry?: string | null;
    jurisdictionState?: string | null;
    jurisdictionCity?: string | null;
    letterType: string;
  },
  userId?: number,
  isFreePreview?: boolean
): Promise<void> {
  const normalizedInput = await validatePipelinePreflight(
    letterId,
    intake,
    dbFields
  );

  // ── LangGraph Pipeline Routing ──────────────────────────────────────────────

  const useLangGraph = process.env.PIPELINE_MODE === "langgraph";
  if (useLangGraph) {
    orchLogger.info(
      { letterId },
      "[Pipeline] Using LangGraph pipeline (PIPELINE_MODE=langgraph)"
    );
    const result = await runLangGraphPipeline(
      letterId,
      intake,
      userId,
      isFreePreview
    );
    if (!result.success) {
      throw new PipelineError(
        (result.errorCode as PipelineErrorCode) ??
          PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED,
        result.error ?? "LangGraph pipeline failed",
        "pipeline"
      );
    }
    orchLogger.info(
      { letterId, hasLetter: !!result.vettedLetter },
      "[Pipeline] LangGraph pipeline completed"
    );
    return;
  }

  // ── Simple Pipeline Routing ──────────────────────────────────────────────────
  const useSimple = process.env.PIPELINE_MODE === "simple";
  if (useSimple) {
    orchLogger.info(
      { letterId },
      "[Pipeline] Using simple pipeline (PIPELINE_MODE=simple)"
    );
    const result = await runSimplePipeline(letterId, intake, userId);
    if (!result.success) {
      throw new PipelineError(
        PIPELINE_ERROR_CODES.DRAFTING_PROVIDER_FAILED,
        result.error ?? "Simple pipeline failed",
        "pipeline"
      );
    }
    orchLogger.info({ letterId }, "[Pipeline] Simple pipeline completed");
    return;
  }

  // ── Try n8n workflow first (primary path if N8N_PRIMARY=true) ────────────────

  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL ?? "";
  const n8nCallbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";
  const useN8nPrimary =
    process.env.N8N_PRIMARY === "true" &&
    !!n8nWebhookUrl &&
    n8nWebhookUrl.startsWith("https://");

  if (useN8nPrimary) {
    const n8nResult = await triggerN8nWorkflow({
      letterId,
      intake,
      normalizedInput,
      n8nWebhookUrl,
      n8nCallbackSecret,
    });

    if (n8nResult.success) {
      return; // n8n callback will finish the job
    }
    // else fallback to in-app
  }

  // ── API key preflight for direct pipeline ────────────────────────────────────
  const apiCheck = preflightApiKeyCheck("full");
  if (!apiCheck.ok) {
    const msg = `API key preflight failed: ${apiCheck.missing.join("; ")}`;
    orchLogger.error(
      { letterId, err: msg },
      "[Pipeline] API key preflight failed"
    );
    throw new PipelineError(
      PIPELINE_ERROR_CODES.API_KEY_MISSING,
      msg,
      "pipeline",
      apiCheck.missing.join("; ")
    );
  }

  // ── Mark stale pipeline runs as superseded before starting fresh ──────────
  await markPriorPipelineRunsSuperseded(letterId);

  // ── Fallback: In-app 4-stage pipeline ─────────────────────────────────────
  const pipelineJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "generation_pipeline",
    provider: "multi-provider",
    requestPayloadJson: {
      letterId,
      stages: [
        "perplexity-sonar-research",
        "openai-gpt4o-mini-draft",
        "openai-gpt4o-mini-assembly",
        "anthropic-sonnet-vetting",
      ],
      normalizedInput,
    },
  });
  const rawPipelineJobId = (pipelineJob as any)?.insertId;
  const pipelineJobId = rawPipelineJobId ?? 0;
  await updateWorkflowJob(pipelineJobId, {
    status: "running",
    startedAt: new Date(),
  });

  const pipelineCtx: PipelineContext = {
    letterId,
    userId: userId ?? 0,
    intake,
    isFreePreview,
  };

  try {
    // Stage 1: Perplexity Research
    pipelineCtx.validationResults = [];

    const { packet: research, provider: researchProvider } =
      await withStageTimeout(
        "research",
        STAGE_TIMEOUTS.research,
        () => runResearchStage(letterId, intake, pipelineCtx)
      );

    addValidationResult(pipelineCtx, {
      stage: "intake",
      check: "intake_completeness",
      passed: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    await applyResearchGroundingAndRevalidate(
      letterId,
      intake,
      researchProvider,
      research,
      pipelineCtx
    );

    const draft = await withStageTimeout(
      "drafting",
      STAGE_TIMEOUTS.drafting,
      () => runDraftingStage(letterId, intake, research, pipelineCtx)
    );
    // Capture the initial draft for best-effort fallback
    pipelineCtx._intermediateDraftContent = draft.draftLetter;
    pipelineCtx.counterArguments = draft.counterArguments;
    setIntermediateContent(
      letterId,
      draft.draftLetter,
      pipelineCtx.qualityWarnings ?? []
    );

    const { vettingResult, assemblyRetries } = await withStageTimeout(
      "assembly",
      STAGE_TIMEOUTS.assembly,
      () => runAssemblyVettingLoop(letterId, intake, research, draft, pipelineCtx)
    );
    // Assembly/vetting produced a higher-quality version — prefer it
    pipelineCtx._intermediateDraftContent = vettingResult.vettedLetter;
    setIntermediateContent(
      letterId,
      vettingResult.vettedLetter,
      pipelineCtx.qualityWarnings ?? []
    );

    if (vettingResult.critical) {
      const criticalIssues = vettingResult.vettingReport.jurisdictionIssues
        .concat(vettingResult.vettingReport.citationsFlagged)
        .concat(vettingResult.vettingReport.factualIssuesFound);
      orchLogger.warn(
        { letterId, assemblyRetries, issues: criticalIssues },
        "[Pipeline] Vetting critical issues — saving degraded draft and proceeding to generated_locked"
      );
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      pipelineCtx.qualityWarnings.push(
        ...criticalIssues.map(i => `VETTING_CRITICAL: ${i}`)
      );
    }

    await finalizeLetterAfterVetting(
      letterId,
      vettingResult.vettedLetter,
      vettingResult.vettingReport,
      pipelineCtx
    );

    await updatePipelineJobStatus(
      pipelineJobId,
      pipelineCtx,
      vettingResult,
      assemblyRetries
    );

    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch (autoUnlockErr) {
      orchLogger.error(
        { err: autoUnlockErr, letterId },
        "[Pipeline] Auto-unlock check failed"
      );
    }
  } catch (err) {
    await handlePipelineError(letterId, pipelineJobId, err);
  }
}


// ═══════════════════════════════════════════════════════
// BEST-EFFORT FALLBACK (called by worker after retry exhaustion)
// ═══════════════════════════════════════════════════════
// Implementation extracted to ./fallback.ts — re-exported here for callers
// that import directly from orchestrator (e.g. worker.ts).
export {
  bestEffortFallback,
  autoAdvanceIfPreviouslyUnlocked,
  FALLBACK_EXCLUDED_CODES,
} from "./fallback";

// ═══════════════════════════════════════════════════════
// LANGGRAPH PIPELINE (new architecture)
// ═══════════════════════════════════════════════════════
// Re-export LangGraph pipeline for callers that prefer the new architecture.
// Enable via PIPELINE_MODE=langgraph environment variable.
export {
  runPipeline as runLangGraphFullPipeline,
  runPipelineStreaming as runLangGraphStreamingPipeline,
  preflightApiKeyCheck as langGraphPreflightCheck,
  type PipelineResult as LangGraphPipelineResult,
  type PipelineStreamEvent as LangGraphStreamEvent,
} from "./langgraph";

// ═══════════════════════════════════════════════════════
// RETRY LOGIC
// ═══════════════════════════════════════════════════════

export async function retryPipelineFromStage(
  letterId: number,
  intake: IntakeJson,
  stage: "research" | "drafting",
  userId?: number
): Promise<void> {
  if (!intake || typeof intake !== "object") {
    const letter = await getLetterById(letterId);
    if (letter?.intakeJson && typeof letter.intakeJson === "object") {
      intake = letter.intakeJson as IntakeJson;
      orchLogger.warn(
        { letterId },
        "[Pipeline] Retry: intake was null/invalid in job data — recovered from database"
      );
    } else {
      throw new PipelineError(
        PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
        `Intake data is missing or corrupted for letter #${letterId} and could not be recovered from the database`,
        "pipeline",
        "intake is null/undefined in both job data and database"
      );
    }
  }

  const apiCheck = preflightApiKeyCheck(stage);
  if (!apiCheck.ok) {
    const msg = `API key preflight failed for ${stage} retry: ${apiCheck.missing.join("; ")}`;
    orchLogger.error(
      { letterId, err: msg },
      "[Pipeline] API key preflight failed for retry"
    );
    throw new PipelineError(
      PIPELINE_ERROR_CODES.API_KEY_MISSING,
      msg,
      "pipeline",
      apiCheck.missing.join("; ")
    );
  }

  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    throw new PipelineError(
      PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
      `Intake validation failed: ${intakeCheck.errors.join("; ")}`,
      "pipeline",
      intakeCheck.errors.join("; ")
    );
  }

  const retryJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "retry",
    provider: "multi-provider",
    requestPayloadJson: { letterId, stage, userId },
  });
  const rawRetryJobId = (retryJob as any)?.insertId;
  if (rawRetryJobId == null) {
    orchLogger.warn(
      { letterId },
      "[Pipeline] createWorkflowJob returned nullish insertId for retry job, falling back to jobId=0"
    );
  }
  const retryJobId = rawRetryJobId ?? 0;
  await updateWorkflowJob(retryJobId, {
    status: "running",
    startedAt: new Date(),
  });

  const pipelineCtx: PipelineContext = {
    letterId,
    userId: userId ?? 0,
    intake,
    validationResults: [],
  };

  const runVettingAndFinalize = async (
    research: ResearchPacket,
    draft: DraftOutput
  ) => {
    pipelineCtx._intermediateDraftContent = draft.draftLetter;
    pipelineCtx.counterArguments = draft.counterArguments;
    _intermediateContentRegistry.set(letterId, {
      content: draft.draftLetter,
      qualityWarnings: pipelineCtx.qualityWarnings ?? [],
    });

    const { vettingResult, assemblyRetries } = await runAssemblyVettingLoop(
      letterId,
      intake,
      research,
      draft,
      pipelineCtx
    );
    pipelineCtx._intermediateDraftContent = vettingResult.vettedLetter;
    _intermediateContentRegistry.set(letterId, {
      content: vettingResult.vettedLetter,
      qualityWarnings: pipelineCtx.qualityWarnings ?? [],
    });

    if (vettingResult.critical) {
      const criticalIssues = vettingResult.vettingReport.jurisdictionIssues
        .concat(vettingResult.vettingReport.citationsFlagged)
        .concat(vettingResult.vettingReport.factualIssuesFound);
      orchLogger.warn(
        { letterId, assemblyRetries, issues: criticalIssues },
        "[Pipeline] Retry vetting critical issues — saving degraded draft"
      );
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      pipelineCtx.qualityWarnings.push(
        ...criticalIssues.map(i => `VETTING_CRITICAL: ${i}`)
      );
      pipelineCtx.qualityWarnings.push(
        `Vetting found critical issues after ${assemblyRetries} assembly retries. Attorney scrutiny required.`
      );
    }
    await finalizeLetterAfterVetting(
      letterId,
      vettingResult.vettedLetter,
      vettingResult.vettingReport,
      pipelineCtx
    );
    return vettingResult;
  };

  try {
    if (stage === "research") {
      await updateLetterStatus(letterId, "submitted", { force: true });
      const { packet: research, provider: researchProvider } =
        await runResearchStage(letterId, intake, pipelineCtx);
      await applyResearchGroundingAndRevalidate(
        letterId,
        intake,
        researchProvider,
        research,
        pipelineCtx
      );
      const draft = await runDraftingStage(
        letterId,
        intake,
        research,
        pipelineCtx
      );
      await runVettingAndFinalize(research, draft);
    } else {
      const latestResearch = await getLatestResearchRun(letterId);
      if (!latestResearch?.resultJson)
        throw new Error("No completed research run found for retry");
      const research = latestResearch.resultJson as ResearchPacket;
      const provider = latestResearch.provider ?? "perplexity";
      await applyResearchGroundingAndRevalidate(
        letterId,
        intake,
        provider,
        research,
        pipelineCtx,
        {
          researchFromCache: latestResearch.cacheHit === true,
        }
      );
      await updateLetterStatus(letterId, "drafting", { force: true });
      const draft = await runDraftingStage(
        letterId,
        intake,
        research,
        pipelineCtx
      );
      await runVettingAndFinalize(research, draft);
    }
    const retryCitationTokens = pipelineCtx.citationRevalidationTokens;
    const isRetryDegraded = (pipelineCtx.qualityWarnings?.length ?? 0) > 0;
    await updateWorkflowJob(retryJobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: retryCitationTokens?.promptTokens ?? 0,
      completionTokens: retryCitationTokens?.completionTokens ?? 0,
      estimatedCostUsd: retryCitationTokens
        ? calculateCost(
            pipelineCtx.citationRevalidationModelKey ??
              "llama-3.3-70b-versatile",
            retryCitationTokens
          )
        : "0",
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
        ...(isRetryDegraded && {
          qualityDegraded: true,
          degradationReasons: pipelineCtx.qualityWarnings,
        }),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryErrCode = classifyErrorCode(err);
    await updateWorkflowJob(retryJobId, {
      status: "failed",
      errorMessage: formatStructuredError(
        retryErrCode,
        msg,
        "citation_revalidation"
      ),
      completedAt: new Date(),
    });
    throw err;
  }
}
