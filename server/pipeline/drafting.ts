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
import type { IntakeJson, ResearchPacket, DraftOutput, CitationRegistryEntry, PipelineContext, TokenUsage, PipelineErrorCode } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { buildNormalizedPromptInput, type NormalizedPromptInput } from "../intake-normalizer";
import { captureServerException } from "../sentry";
import { formatStructuredError, classifyErrorCode, withModelFailover } from "./shared";
import { getDraftModel, getDraftModelFallback, getFreeOSSModelFallback, DRAFT_TIMEOUT_MS, createTokenAccumulator, accumulateTokens, calculateCost } from "./providers";
import { parseAndValidateDraftLlmOutput, validateDraftGrounding, validateContentConsistency, retryOnValidationFailure, addValidationResult } from "./validators";
import { buildCitationRegistryPromptBlock, buildCitationRegistry } from "./citations";
import { buildLessonsPromptBlock } from "./shared";
import { buildDraftingSystemPrompt, buildDraftingUserPrompt } from "./prompts";

// ═══════════════════════════════════════════════════════
// STAGE 2: OPENAI DRAFT GENERATION
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
    provider: "anthropic",
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
  }).catch(e => console.error(`[Pipeline] Failed to log researching→drafting action for #${letterId}:`, e));
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
    console.error("[notifyAdmins] pipeline_drafting:", err);
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

  // A/B testing: RAG_AB_TEST_CONTROL_PCT (0-100) determines % of runs that skip RAG
  const controlPct = Math.max(0, Math.min(100, parseInt(process.env.RAG_AB_TEST_CONTROL_PCT ?? "0", 10)));
  const isControlRun = controlPct > 0 && Math.random() * 100 < controlPct;
  if (isControlRun) {
    ragAbGroup = "control";
    console.log(`[Pipeline] Stage 2: A/B control group — skipping RAG injection for letter #${letterId} (controlPct=${controlPct}%)`);
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
          console.log(`[Pipeline] Stage 2: Injected ${similarLetters.length} RAG examples for letter #${letterId}`);
        }
      }
    } catch (ragErr) {
      console.warn(`[Pipeline] Stage 2: RAG retrieval failed for letter #${letterId} (non-blocking):`, ragErr);
    }
  }

  // Store RAG metadata on pipelineCtx for access by orchestrator
  if (pipelineCtx) {
    pipelineCtx.ragExampleCount = ragExampleCount;
    pipelineCtx.ragSimilarityScores = ragSimilarityScores;
    pipelineCtx.ragAbGroup = ragAbGroup;
  }

  const draftSystemPrompt = buildDraftingSystemPrompt() + citationRegistryBlock + lessonsBlockDrafting + ragBlock;
  // Look up the target word count for this letter type from the shared config
  const { LETTER_TYPE_CONFIG } = await import("../../shared/types");
  const letterTypeConfig = LETTER_TYPE_CONFIG[intake.letterType];
  const targetWordCount = letterTypeConfig?.targetWordCount ?? 450;
  console.log(
    `[Pipeline] Stage 2: targetWordCount=${targetWordCount} for letterType=${intake.letterType}`
  );
  const draftUserPrompt = buildDraftingUserPrompt(
    normalizedIntake,
    targetWordCount,
    research
  );

  const draftTokens = createTokenAccumulator();
  let draftProvider = "anthropic";
  let draftModelKey = "claude-sonnet-4";

  const callGenerateText = async (prompt: string) => {
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

  const callGenerateTextFallback = async (prompt: string) => {
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
        const r = await generateText({
          model: draftProvider === "openai-failover" ? getDraftModelFallback() : draftProvider === "groq-oss-fallback" ? getFreeOSSModelFallback() : getDraftModel(),
          system: draftSystemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 8000,
          abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        });
        accumulateTokens(draftTokens, r.usage);
        return r;
      },
      async () => {
        draftProvider = "openai-failover";
        draftModelKey = "gpt-4o-mini";
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
      async () => {
        draftProvider = "groq-oss-fallback";
        draftModelKey = "llama-3.3-70b-versatile";
        const r = await generateText({
          model: getFreeOSSModelFallback(),
          system: draftSystemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 8000,
          abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        });
        accumulateTokens(draftTokens, r.usage);
        return r;
      }
    );
    if (retryProvider === "groq-oss-fallback" && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("DRAFT_OSS_FALLBACK"))) {
        pipelineCtx.qualityWarnings.push(
          `DRAFT_OSS_FALLBACK: Groq Llama 3.3 used as last-resort for draft retry (both Claude and OpenAI were unavailable). Legal tone and structure may differ significantly. Heightened attorney scrutiny required.`
        );
      }
    } else if (retryFailover && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("DRAFTING_FAILOVER"))) {
        pipelineCtx.qualityWarnings.push(
          `DRAFTING_FAILOVER: Switched to OpenAI GPT-4o-mini during draft retry due to rate limit on primary model.`
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
    console.log(
      `[Pipeline] Stage 2: Claude structured drafting for letter #${letterId}`
    );

    const { result: initialDraftResult, provider: initialDraftProvider, failoverTriggered: draftFailover } = await withModelFailover(
      "Stage 2 (drafting)",
      letterId,
      () => callGenerateText(draftUserPrompt),
      () => {
        draftProvider = "openai-failover";
        draftModelKey = "gpt-4o-mini";
        return callGenerateTextFallback(draftUserPrompt);
      },
      async () => {
        draftProvider = "groq-oss-fallback";
        draftModelKey = "llama-3.3-70b-versatile";
        const r = await generateText({
          model: getFreeOSSModelFallback(),
          system: draftSystemPrompt,
          prompt: draftUserPrompt,
          maxOutputTokens: 8000,
          abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        });
        accumulateTokens(draftTokens, r.usage);
        return r;
      }
    );

    if (initialDraftProvider === "groq-oss-fallback") {
      console.warn(
        `[Pipeline] Stage 2: Groq Llama 3.3 used as last-resort for letter #${letterId} (DRAFT_OSS_FALLBACK)`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `DRAFT_OSS_FALLBACK: Groq Llama 3.3 used as last-resort for drafting (both Claude and OpenAI were unavailable). Legal tone and structure may differ significantly. Heightened attorney scrutiny required.`
        );
      }
    } else if (draftFailover) {
      console.warn(
        `[Pipeline] Stage 2: Switched to OpenAI GPT-4o-mini failover for letter #${letterId} (provider=${draftProvider})`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `DRAFTING_FAILOVER: Primary drafting model (Claude) was rate-limited. Draft generated by OpenAI GPT-4o-mini. Legal tone and structure may differ from Claude standard.`
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
      console.warn(
        `[Pipeline] Stage 2: First attempt failed validation for letter #${letterId}: ${retryErrors.join("; ")}. Retrying (1 of 1)...`
      );
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
      console.warn(
        `[Pipeline] Stage 2: Jurisdiction mismatch for letter #${letterId}${needsRetry ? " persists after retry" : ""} — ` +
        `found "${finalConsistency.foundJurisdiction}", expected "${finalConsistency.expectedJurisdiction}". ` +
        `Attaching as quality warning and continuing to assembly/vetting.`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `JURISDICTION_WARNING: Draft references "${finalConsistency.foundJurisdiction}" but intake specifies "${finalConsistency.expectedJurisdiction}". Attorney review required.`
        );
      }
    }

    if (!finalGrounding.passed) {
      draft.groundingWarnings = finalGrounding.ungroundedCitations;
      console.warn(
        `[Pipeline] Stage 2: ${finalGrounding.ungroundedCitations.length} ungrounded citations for letter #${letterId}${needsRetry ? " after retry" : ""}. Storing with groundingWarnings.`
      );
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
        failoverUsed: draftProvider === "openai-failover" || draftProvider === "groq-oss-fallback",
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
        failoverUsed: draftProvider === "openai-failover" || draftProvider === "groq-oss-fallback",
        groundingReport: pipelineCtx?.groundingReport,
        consistencyReport: pipelineCtx?.consistencyReport,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
        ragExampleCount: pipelineCtx?.ragExampleCount ?? ragExampleCount,
        ragSimilarityScores: pipelineCtx?.ragSimilarityScores ?? ragSimilarityScores,
        ragAbGroup: pipelineCtx?.ragAbGroup ?? ragAbGroup,
        ragInjected: (pipelineCtx?.ragExampleCount ?? ragExampleCount) > 0,
      },
    });

    console.log(`[Pipeline] Stage 2 complete for letter #${letterId} (provider: ${draftProvider})`);
    return draft;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 2 failed for letter #${letterId}:`, msg);
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
