import { generateText } from "ai";
import {
  createWorkflowJob,
  createLetterVersion,
  updateWorkflowJob,
  updateLetterStatus,
  updateLetterVersionPointers,
  getLatestResearchRun,
  logReviewAction,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, PipelineContext } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { buildNormalizedPromptInput } from "../intake-normalizer";
import { captureServerException } from "../sentry";
import { createLogger } from "../logger";

import { formatStructuredError, classifyErrorCode, withModelFailover } from "./shared";
import { getDraftModel, getDraftModelFallback, DRAFT_TIMEOUT_MS, createTokenAccumulator, accumulateTokens, calculateCost } from "./providers";
import { parseAndValidateDraftLlmOutput, validateDraftGrounding, validateContentConsistency, retryOnValidationFailure, addValidationResult } from "./validators";
import { buildCitationRegistryPromptBlock } from "./citations";
import { buildLessonsPromptBlock } from "./shared";
import { buildDraftingSystemPrompt, buildDraftingUserPrompt } from "./prompts";

const draftLogger = createLogger({ module: "PipelineDrafting" });

// ═══════════════════════════════════════════════════════
// STAGE 2: OPENAI DRAFT GENERATION (OpenAI primary, Claude fallback)
// ═══════════════════════════════════════════════════════

export async function runDraftingStage(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  pipelineCtx?: PipelineContext
): Promise<DraftOutput> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "draft_generation",
    provider: "openai",
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      stage: "initial_draft",
      letterType: intake.letterType,
      sender: intake.sender,
      recipient: intake.recipient,
    },
  });
  const jobId = (job as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });
  await updateLetterStatus(letterId, "drafting", { force: true });
  logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "status_changed",
    noteText: "Pipeline started drafting stage.",
    noteVisibility: "internal",
    fromStatus: "researching",
    toStatus: "drafting",
  }).catch(e => draftLogger.error({ err: e, letterId }, "[Pipeline] Failed to log researching→drafting action"));
  try {
    const { notifyAdmins } = await import("../db");
    await notifyAdmins({
      category: "letters",
      type: "pipeline_drafting",
      title: `Letter #${letterId} entering drafting stage`,
      body: `AI pipeline is now drafting letter #${letterId}.`,
      link: `/admin/letters/${letterId}`,
    });
  } catch (err) {
    draftLogger.error({ err }, "[notifyAdmins] pipeline_drafting");
    captureServerException(err, { tags: { component: "pipeline", error_type: "notify_admins_drafting" } });
  }

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
  const citationRegistryBlock = pipelineCtx?.citationRegistry
    ? buildCitationRegistryPromptBlock(pipelineCtx.citationRegistry)
    : "";
  const lessonsBlockDrafting = await buildLessonsPromptBlock(intake.letterType, intake.jurisdiction?.state ?? null, "drafting", undefined, pipelineCtx);

  let ragBlock = "";
  let ragExampleCount = 0;
  let ragSimilarityScores: number[] = [];
  let ragAbGroup: "test" | "control" = "test";

  const controlPct = Math.max(0, Math.min(100, parseInt(process.env.RAG_AB_TEST_CONTROL_PCT ?? "0", 10)));
  const isControlRun = controlPct > 0 && Math.random() * 100 < controlPct;
  if (isControlRun) {
    ragAbGroup = "control";
    draftLogger.info({ letterId, controlPct }, "[Pipeline] Stage 2: A/B control group — skipping RAG injection");
  } else {
    try {
      const { findSimilarLetters } = await import("./embeddings");
      const intakeText = [
        intake.matter?.subject,
        intake.matter?.description,
        intake.letterType,
        intake.jurisdiction?.state,
        intake.desiredOutcome,
      ].filter(Boolean).join(" ");

      if (intakeText.length > 20) {
        const similarLetters = await findSimilarLetters(intakeText, 3, 0.7);
        if (similarLetters.length > 0) {
          ragExampleCount = similarLetters.length;
          ragSimilarityScores = similarLetters.map((sl: { similarity: number }) => sl.similarity);
          ragBlock = "\n\n## Previously Approved Similar Letters (for reference — adapt style and structure, do NOT copy verbatim)\n\n" +
            similarLetters.map((sl: { content: string; similarity: number }, i: number) =>
              `### Example ${i + 1} (similarity: ${(sl.similarity * 100).toFixed(0)}%)\n${sl.content.slice(0, 2000)}`
            ).join("\n\n");
          draftLogger.info({ letterId, count: similarLetters.length }, "[Pipeline] Stage 2: Injected RAG examples");
        }
      }
    } catch (ragErr) {
      draftLogger.warn({ err: ragErr, letterId }, "[Pipeline] Stage 2: RAG retrieval failed (non-blocking)");
    }
  }

  if (pipelineCtx) {
    pipelineCtx.ragExampleCount = ragExampleCount;
    pipelineCtx.ragSimilarityScores = ragSimilarityScores;
    pipelineCtx.ragAbGroup = ragAbGroup;
  }

  const draftSystemPrompt = buildDraftingSystemPrompt() + citationRegistryBlock + lessonsBlockDrafting + ragBlock;
  const { LETTER_TYPE_CONFIG } = await import("../../shared/types");
  const letterTypeConfig = LETTER_TYPE_CONFIG[intake.letterType];
  const targetWordCount = letterTypeConfig?.targetWordCount ?? 450;
  draftLogger.info({ letterId, targetWordCount, letterType: intake.letterType }, "[Pipeline] Stage 2: target word count determined");
  const draftUserPrompt = buildDraftingUserPrompt(
    normalizedIntake,
    targetWordCount,
    research
  );

  const draftTokens = createTokenAccumulator();
  let draftProvider = "openai";
  let draftModelKey = "gpt-4o";

  const callPrimary = async (prompt: string) => {
    const result = await generateText({
      model: getDraftModel(),
      system: draftSystemPrompt,
      prompt,
      maxOutputTokens: 8000,
      abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
    accumulateTokens(draftTokens, result.usage);
    return result;
  };

  const callFallback = async (prompt: string) => {
    const result = await generateText({
      model: getDraftModelFallback(),
      system: draftSystemPrompt,
      prompt,
      maxOutputTokens: 8000,
      abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
    accumulateTokens(draftTokens, result.usage);
    return result;
  };

  const generateDraft = async (errorFeedback?: string): Promise<{ text: string }> => {
    const promptWithFeedback = errorFeedback
      ? draftUserPrompt + errorFeedback
      : draftUserPrompt;
    const { result, provider: retryProvider, failoverTriggered: retryFailover } = await withModelFailover(
      "Stage 2 (drafting retry)",
      letterId,
      async () => {
        const model = draftProvider === "anthropic-failover" ? getDraftModelFallback() : getDraftModel();
        const r = await generateText({
          model,
          system: draftSystemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 8000,
          abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        });
        accumulateTokens(draftTokens, r.usage);
        return r;
      },
      async () => {
        draftProvider = "anthropic-failover";
        draftModelKey = "claude-sonnet-4";
        const r = await generateText({
          model: getDraftModelFallback(),
          system: draftSystemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 8000,
          abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        });
        accumulateTokens(draftTokens, r.usage);
        return r;
      },
    );
    if (retryFailover && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("DRAFTING_FAILOVER"))) {
        pipelineCtx.qualityWarnings.push(
          `DRAFTING_FAILOVER: Switched to Claude Sonnet during draft retry due to rate limit on primary OpenAI model.`
        );
      }
    }
    return result;
  };

  const runAllDraftValidations = (draft: DraftOutput) => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    const grounding = validateDraftGrounding(draft.draftLetter, research);
    if (!grounding.passed) {
      allErrors.push(`${grounding.ungroundedCitations.length} ungrounded citations: ${grounding.ungroundedCitations.join("; ")}. Use ONLY citations from the research packet.`);
    } else if (grounding.ungroundedCitations.length > 0) {
      allWarnings.push(`${grounding.ungroundedCitations.length} ungrounded citation(s): ${grounding.ungroundedCitations.join("; ")}`);
    }

    const consistency = validateContentConsistency(draft.draftLetter, normalizedIntake);
    if (consistency.jurisdictionMismatch) {
      allErrors.push(`JURISDICTION MISMATCH: Letter references "${consistency.foundJurisdiction}" law but intake specifies "${consistency.expectedJurisdiction}". ALL legal citations MUST be for ${consistency.expectedJurisdiction}.`);
    }
    allWarnings.push(...consistency.warnings);

    return { allErrors, allWarnings, grounding, consistency };
  };

  try {
    draftLogger.info({ letterId }, "[Pipeline] Stage 2: OpenAI structured drafting starting");

    const { result: initialDraftResult, provider: initialDraftProvider, failoverTriggered: draftFailover } = await withModelFailover(
      "Stage 2 (drafting)",
      letterId,
      () => callPrimary(draftUserPrompt),
      () => {
        draftProvider = "anthropic-failover";
        draftModelKey = "claude-sonnet-4";
        return callFallback(draftUserPrompt);
      },
    );

    if (draftFailover) {
      draftLogger.warn({ letterId, provider: draftProvider }, "[Pipeline] Stage 2: Switched to Claude Sonnet fallback");
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `DRAFTING_FAILOVER: Primary drafting model (OpenAI GPT-4o) was rate-limited. Draft generated by Claude Sonnet fallback.`
        );
      }
    }

    let { text } = initialDraftResult;
    let validation = parseAndValidateDraftLlmOutput(text);

    let needsRetry = false;
    let retryErrors: string[] = [];

    if (!validation.valid || !validation.data) {
      needsRetry = true;
      retryErrors = validation.errors;
    } else {
      const checks = runAllDraftValidations(validation.data);
      if (checks.allErrors.length > 0) {
        needsRetry = true;
        retryErrors = checks.allErrors;
      }
    }

    if (needsRetry) {
      addValidationResult(pipelineCtx, {
        stage: "draft_generation",
        check: "first_attempt_validation",
        passed: false,
        errors: retryErrors,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      draftLogger.warn({ letterId, errors: retryErrors }, "[Pipeline] Stage 2: First attempt failed validation — retrying (1 of 1)");
      const retryResult = await retryOnValidationFailure(
        async (feedback) => {
          const r = await generateDraft(feedback);
          return parseAndValidateDraftLlmOutput(r.text);
        },
        retryErrors,
        "Stage 2 (consolidated retry)"
      );
      validation = retryResult;
    }

    if (!validation.valid || !validation.data) {
      addValidationResult(pipelineCtx, {
        stage: "draft_generation",
        check: "parse_and_validate",
        passed: false,
        errors: validation.errors,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: formatStructuredError(
          PIPELINE_ERROR_CODES.DRAFT_VALIDATION_FAILED,
          `Draft validation failed${needsRetry ? " after retry" : ""}`,
          "drafting",
          validation.errors.join("; ")
        ),
        completedAt: new Date(),
        responsePayloadJson: { validationErrors: validation.errors, retried: needsRetry },
      });
      throw new PipelineError(
        PIPELINE_ERROR_CODES.DRAFT_VALIDATION_FAILED,
        `Draft output validation failed${needsRetry ? " after retry" : ""}`,
        "drafting",
        validation.errors.join("; ")
      );
    }

    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "parse_and_validate",
      passed: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    let draft = validation.data;

    const { allErrors: finalErrors, allWarnings: finalWarnings, grounding: finalGrounding, consistency: finalConsistency } = runAllDraftValidations(draft);

    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "citation_grounding",
      passed: finalGrounding.passed,
      errors: finalGrounding.passed ? [] : [`${finalGrounding.ungroundedCitations.length} ungrounded citations: ${finalGrounding.ungroundedCitations.join("; ")}`],
      warnings: finalGrounding.ungroundedCitations.length > 0 && finalGrounding.ungroundedCitations.length <= 2
        ? [`${finalGrounding.ungroundedCitations.length} ungrounded citation(s): ${finalGrounding.ungroundedCitations.join("; ")}`]
        : [],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "content_consistency",
      passed: finalConsistency.passed,
      errors: finalConsistency.jurisdictionMismatch
        ? [`Jurisdiction mismatch: expected "${finalConsistency.expectedJurisdiction}" but found "${finalConsistency.foundJurisdiction}"`]
        : [],
      warnings: finalConsistency.warnings,
      timestamp: new Date().toISOString(),
    });

    if (finalConsistency.jurisdictionMismatch) {
      draftLogger.warn({ letterId, found: finalConsistency.foundJurisdiction, expected: finalConsistency.expectedJurisdiction }, "[Pipeline] Stage 2: Jurisdiction mismatch — attaching as quality warning and continuing");
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `JURISDICTION_WARNING: Draft references "${finalConsistency.foundJurisdiction}" but intake specifies "${finalConsistency.expectedJurisdiction}". Attorney review required.`
        );
      }
    }

    if (!finalGrounding.passed) {
      draft.groundingWarnings = finalGrounding.ungroundedCitations;
      draftLogger.warn({ letterId, count: finalGrounding.ungroundedCitations.length }, "[Pipeline] Stage 2: Ungrounded citations found — storing with groundingWarnings");
    }

    if (pipelineCtx) {
      pipelineCtx.groundingReport = finalGrounding;
      pipelineCtx.consistencyReport = finalConsistency;
    }

    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: draft.draftLetter,
      createdByType: "system",
      metadataJson: {
        provider: draftProvider,
        stage: "draft_generation",
        failoverUsed: draftProvider === "anthropic-failover",
        attorneyReviewSummary: draft.attorneyReviewSummary,
        openQuestions: draft.openQuestions,
        riskFlags: draft.riskFlags,
        reviewNotes: draft.reviewNotes,
        counterArguments: draft.counterArguments,
        citationRegistrySize: pipelineCtx?.citationRegistry?.length ?? 0,
        researchUnverified: pipelineCtx?.researchUnverified ?? false,
        webGrounded: pipelineCtx?.webGrounded ?? true,
        groundingWarnings: draft.groundingWarnings,
        groundingReport: pipelineCtx?.groundingReport,
        consistencyReport: pipelineCtx?.consistencyReport,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
      },
    });
    const versionId = (version as any)?.insertId ?? 0;

    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: versionId,
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: draftTokens.promptTokens,
      completionTokens: draftTokens.completionTokens,
      estimatedCostUsd: calculateCost(draftModelKey, draftTokens),
      responsePayloadJson: {
        versionId,
        provider: draftProvider,
        failoverUsed: draftProvider === "anthropic-failover",
        groundingReport: pipelineCtx?.groundingReport,
        consistencyReport: pipelineCtx?.consistencyReport,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
        ragExampleCount: pipelineCtx?.ragExampleCount ?? ragExampleCount,
        ragSimilarityScores: pipelineCtx?.ragSimilarityScores ?? ragSimilarityScores,
        ragAbGroup: pipelineCtx?.ragAbGroup ?? ragAbGroup,
        ragInjected: (pipelineCtx?.ragExampleCount ?? ragExampleCount) > 0,
      },
    });

    draftLogger.info({ letterId, provider: draftProvider }, "[Pipeline] Stage 2 complete");
    return draft;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    draftLogger.error({ err, letterId }, "[Pipeline] Stage 2 failed");
    captureServerException(err, {
      tags: { pipeline_stage: "drafting", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    });
    const draftErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: formatStructuredError(draftErrCode, msg, "drafting"),
      completedAt: new Date(),
      promptTokens: draftTokens.promptTokens,
      completionTokens: draftTokens.completionTokens,
      estimatedCostUsd: draftTokens.promptTokens > 0 ? calculateCost(draftModelKey, draftTokens) : undefined,
      responsePayloadJson: {
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
      },
    });
    throw err instanceof PipelineError ? err : new PipelineError(draftErrCode, msg, "drafting");
  }
}
