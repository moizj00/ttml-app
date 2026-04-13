import { generateText } from "ai";
import {
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, CitationRegistryEntry, PipelineContext, TokenUsage, PipelineErrorCode } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { buildNormalizedPromptInput, type NormalizedPromptInput } from "../intake-normalizer";
import { captureServerException } from "../sentry";
import { createLogger } from "../logger";
import { formatStructuredError, classifyErrorCode, withModelFailover } from "./shared";

import { getAssemblyModel, getAssemblyModelFallback, ASSEMBLY_TIMEOUT_MS, createTokenAccumulator, accumulateTokens, calculateCost } from "./providers";

import { validateFinalLetter, validateContentConsistency, retryOnValidationFailure, addValidationResult } from "./validators";
import { buildCitationRegistryPromptBlock } from "./citations";
import { buildLessonsPromptBlock } from "./shared";
import { buildAssemblySystemPrompt, buildAssemblyUserPrompt } from "./prompts";

const assemblyLogger = createLogger({ module: "PipelineAssembly" });

// ═══════════════════════════════════════════════════════
// STAGE 3: CLAUDE FINAL LETTER ASSEMBLY
// ═══════════════════════════════════════════════════════

export async function runAssemblyStage(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput,
  pipelineCtx?: PipelineContext
): Promise<string> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "assembly",
    provider: "anthropic",
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      stage: "final_assembly",
      sender: intake.sender,
      recipient: intake.recipient,
    },
  });
  const jobId = (job as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });

  const citationRegistryBlock = pipelineCtx?.citationRegistry
    ? buildCitationRegistryPromptBlock(pipelineCtx.citationRegistry)
    : "";
  const lessonsBlockAssembly = await buildLessonsPromptBlock(intake.letterType, intake.jurisdiction?.state ?? null, "assembly", undefined, pipelineCtx);
  const assemblySystem = buildAssemblySystemPrompt() + citationRegistryBlock + lessonsBlockAssembly;
  const vettingFeedbackBlock = pipelineCtx?.assemblyVettingFeedback
    ? `\n\n## VETTING FEEDBACK FROM PREVIOUS ATTEMPT\n${pipelineCtx.assemblyVettingFeedback}\n\nYou MUST address every issue listed above in this assembly attempt. Do NOT repeat the same errors.\n`
    : "";
  const assemblyUser = buildAssemblyUserPrompt(intake, research, draft) + vettingFeedbackBlock;

  const { LETTER_TYPE_CONFIG } = await import("../../shared/types");
  const letterTypeConfig = LETTER_TYPE_CONFIG[intake.letterType];
  const targetWordCount = letterTypeConfig?.targetWordCount ?? 450;

  const assemblyTokens = createTokenAccumulator();
  let assemblyProvider = "anthropic";
  let assemblyModelKey = "claude-sonnet-4-6-20250514";

  const generateAssembly = async (errorFeedback?: string): Promise<string> => {
    // Reset provider to primary on each retry to avoid tier collapse
    // (previous failover mutations would otherwise make retry start on the fallback model)
    assemblyProvider = "anthropic";
    assemblyModelKey = "claude-sonnet-4-6-20250514";
    const promptWithFeedback = errorFeedback
      ? assemblyUser + errorFeedback
      : assemblyUser;
    const { result: assemblyResult, failoverTriggered: retryFailover } = await withModelFailover(
      "Stage 3 (assembly retry)",
      letterId,
      async () => {
        const model = assemblyProvider === "openai-failover" ? getAssemblyModelFallback() : getAssemblyModel();
        const r = await generateText({
          model,
          system: assemblySystem,
          prompt: promptWithFeedback,
          maxOutputTokens: 10000,
          abortSignal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS),
        });
        accumulateTokens(assemblyTokens, r.usage);
        return r;
      },
      async () => {
        assemblyProvider = "openai-failover";
        assemblyModelKey = "gpt-4o-mini";
        const r = await generateText({
          model: getAssemblyModelFallback(),
          system: assemblySystem,
          prompt: promptWithFeedback,
          maxOutputTokens: 10000,
          abortSignal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS),
        });
        accumulateTokens(assemblyTokens, r.usage);
        return r;
      }
    );
    if (retryFailover && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("ASSEMBLY_FAILOVER"))) {
        pipelineCtx.qualityWarnings.push(
          `ASSEMBLY_FAILOVER: Claude was rate-limited during assembly retry. Switched to OpenAI GPT-4o-mini. Legal structure and tone may differ slightly. Heightened attorney scrutiny recommended.`
        );
      }
    }
    return assemblyResult.text;
  };

  const normalizedIntake = buildNormalizedPromptInput(
    {
      subject: intake.matter?.subject ?? "Legal Matter",
      issueSummary: intake.matter?.description,
      jurisdictionCountry: intake.jurisdiction?.country,
      jurisdictionState: intake.jurisdiction?.state,
      jurisdictionCity: intake.jurisdiction?.city,
      letterType: intake.letterType,
    },
    intake
  );

  const runAllAssemblyValidations = (letter: string) => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    const structureValidation = validateFinalLetter(letter);
    allErrors.push(...structureValidation.errors);

    const wc = letter.split(/\s+/).filter(w => w.length > 0).length;
    if (wc < minWords) {
      allErrors.push(`Letter is too short: ${wc} words (minimum ${minWords} words, target ${targetWordCount})`);
    }
    if (wc > maxWords) {
      allErrors.push(`Letter is too long: ${wc} words (maximum ${maxWords} words, target ${targetWordCount})`);
    }

    const consistency = validateContentConsistency(letter, normalizedIntake);
    if (consistency.jurisdictionMismatch) {
      allWarnings.push(`JURISDICTION WARNING: Final letter references "${consistency.foundJurisdiction}" but intake specifies "${consistency.expectedJurisdiction}". Stage 4 vetting will enforce this as a hard gate.`);
    }

    return { allErrors, allWarnings, structureValidation, wordCount: wc, consistency };
  };

  const minWords = Math.floor(targetWordCount * 0.6);
  const maxWords = Math.floor(targetWordCount * 2.0);

  try {
    assemblyLogger.info({ letterId }, "[Pipeline] Stage 3: Claude final assembly starting");

    const { result: firstAssemblyResult, failoverTriggered: assemblyFailover } = await withModelFailover(
      "Stage 3 (assembly)",
      letterId,
      () => {
        const model = getAssemblyModel();
        return generateText({
          model,
          system: assemblySystem,
          prompt: assemblyUser,
          maxOutputTokens: 10000,
          abortSignal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS),
        });
      },
      () => {
        assemblyProvider = "openai-failover";
        assemblyModelKey = "gpt-4o-mini";
        const model = getAssemblyModelFallback();
        return generateText({
          model,
          system: assemblySystem,
          prompt: assemblyUser,
          maxOutputTokens: 10000,
          abortSignal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS),
        });
      }
    );

    if (assemblyFailover) {
      assemblyLogger.warn({ letterId, provider: assemblyProvider }, "[Pipeline] Stage 3: Claude rate-limited — switched to OpenAI GPT-4o-mini");
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `ASSEMBLY_FAILOVER: Primary assembly model (Claude) was rate-limited. Final assembly generated by OpenAI GPT-4o-mini. Legal structure and tone may differ slightly. Heightened attorney scrutiny recommended.`
        );
      }
    }

    accumulateTokens(assemblyTokens, firstAssemblyResult.usage);
    let rawFinalLetter = firstAssemblyResult.text;

    let checks = runAllAssemblyValidations(rawFinalLetter);
    let didRetry = false;

    if (checks.allErrors.length > 0) {
      didRetry = true;
      addValidationResult(pipelineCtx, {
        stage: "final_assembly",
        check: "first_attempt_validation",
        passed: false,
        errors: checks.allErrors,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      assemblyLogger.warn({ letterId, errors: checks.allErrors }, "[Pipeline] Stage 3: First attempt failed validation — retrying (1 of 1)");
      const retryLetter = await retryOnValidationFailure(
        generateAssembly,
        checks.allErrors,
        "Stage 3 (consolidated retry)"
      );
      rawFinalLetter = retryLetter;
      checks = runAllAssemblyValidations(rawFinalLetter);
    }

    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "letter_validation",
      passed: checks.structureValidation.valid,
      errors: checks.structureValidation.errors,
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "word_count",
      passed: checks.wordCount >= minWords && checks.wordCount <= maxWords,
      errors: checks.wordCount < minWords
        ? [`Letter is too short: ${checks.wordCount} words (minimum ${minWords})`]
        : checks.wordCount > maxWords
          ? [`Letter is too long: ${checks.wordCount} words (maximum ${maxWords})`]
          : [],
      warnings: [`Word count: ${checks.wordCount} (target: ${targetWordCount})`],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "content_consistency",
      passed: checks.consistency.passed,
      errors: checks.consistency.jurisdictionMismatch
        ? [`Jurisdiction mismatch: expected "${checks.consistency.expectedJurisdiction}" but found "${checks.consistency.foundJurisdiction}"`]
        : [],
      warnings: checks.consistency.warnings,
      timestamp: new Date().toISOString(),
    });

    if (checks.allErrors.length > 0) {
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: formatStructuredError(
          PIPELINE_ERROR_CODES.ASSEMBLY_STRUCTURE_INVALID,
          `Final letter validation failed${didRetry ? " after retry" : ""}`,
          "assembly",
          checks.allErrors.join("; ")
        ),
        completedAt: new Date(),
        responsePayloadJson: {
          validationErrors: checks.allErrors,
          retried: didRetry,
          validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "final_assembly"),
          consistencyReport: checks.consistency,
        },
      });
      throw new PipelineError(
        PIPELINE_ERROR_CODES.ASSEMBLY_STRUCTURE_INVALID,
        `Final letter validation failed${didRetry ? " after retry" : ""}`,
        "assembly",
        checks.allErrors.join("; ")
      );
    }

    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: assemblyTokens.promptTokens,
      completionTokens: assemblyTokens.completionTokens,
      estimatedCostUsd: calculateCost(assemblyModelKey, assemblyTokens),
      responsePayloadJson: {
        provider: assemblyProvider,
        failoverUsed: assemblyProvider === "openai-failover",
        consistencyReport: checks.consistency,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "final_assembly"),
        wordCount: rawFinalLetter.split(/\s+/).filter(w => w.length > 0).length,
        targetWordCount,
      },
    });

    assemblyLogger.info({ letterId, provider: assemblyProvider }, "[Pipeline] Stage 3 complete — assembled letter ready for vetting");
    return rawFinalLetter;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assemblyLogger.error({ err, letterId }, "[Pipeline] Stage 3 failed");
    captureServerException(err, {
      tags: { pipeline_stage: "assembly", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    });
    const assemblyErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: formatStructuredError(assemblyErrCode, msg, "assembly"),
      completedAt: new Date(),
      promptTokens: assemblyTokens.promptTokens,
      completionTokens: assemblyTokens.completionTokens,
      estimatedCostUsd: assemblyTokens.promptTokens > 0 ? calculateCost(assemblyModelKey, assemblyTokens) : undefined,
      responsePayloadJson: {
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "final_assembly"),
      },
    });
    throw err instanceof PipelineError ? err : new PipelineError(assemblyErrCode, msg, "assembly");
  }
}
