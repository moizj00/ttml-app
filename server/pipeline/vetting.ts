import { generateText } from "ai";
import {
  createLetterVersion,
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
  updateLetterVersionPointers,
  logReviewAction,
  markPriorPipelineRunsSuperseded,
  getLetterRequestById as getLetterById,
  hasLetterBeenPreviouslyUnlocked,
  isUserFirstLetterEligible,
  getAllUsers,
  getUserById,
  createNotification,
  setLetterQualityDegraded,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, CitationRegistryEntry, CitationAuditReport, PipelineContext, TokenUsage, PipelineErrorCode, StructuredPipelineError } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { buildNormalizedPromptInput, type NormalizedPromptInput } from "../intake-normalizer";
import { sendNewReviewNeededEmail, sendAdminAlertEmail, sendLetterReadyEmail } from "../email";
import { captureServerException } from "../sentry";
import { formatStructuredError, classifyErrorCode, buildLessonsPromptBlock, withModelFailover } from "./shared";
import { getAnthropicClient, getVettingModelFallback, getFreeOSSModelFallback, createTokenAccumulator, accumulateTokens, calculateCost, MODEL_PRICING } from "./providers";
import { validateFinalLetter, validateContentConsistency, retryOnValidationFailure, addValidationResult } from "./validators";
import { runCitationAudit, replaceUnverifiedCitations, buildCitationRegistry } from "./citations";
import { runAssemblyStage } from "./assembly";
import { parseVettingResponse, runPostVetChecks } from "./vetting-parser";

// ═══════════════════════════════════════════════════════
// STAGE 4: CLAUDE VETTING PASS
// ═══════════════════════════════════════════════════════

export {
  AI_BLOAT_PHRASES,
  detectBloatPhrases,
  buildVettingSystemPrompt,
  buildVettingUserPrompt,
  validateVettingOutput,
} from "./vetting-prompts";
export type { VettingReport } from "./vetting-prompts";
export { parseVettingResponse, runPostVetChecks } from "./vetting-parser";
export type { PostVetCheckParams } from "./vetting-parser";
import {
  detectBloatPhrases,
  buildVettingSystemPrompt,
  buildVettingUserPrompt,
  validateVettingOutput,
} from "./vetting-prompts";
import type { VettingReport, PostVetDeterministicContext } from "./vetting-prompts";
import { logger } from "../logger";

const VETTING_TIMEOUT_MS = 120_000;

export async function runVettingStage(
  letterId: number,
  assembledLetter: string,
  intake: IntakeJson,
  research: ResearchPacket,
  pipelineCtx?: PipelineContext,
): Promise<{ vettedLetter: string; vettingReport: VettingReport; critical: boolean }> {
  let jobId = 0;
  try {
    const job = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "vetting",
      provider: "anthropic",
      requestPayloadJson: {
        letterId,
        userId: pipelineCtx?.userId,
        stage: "vetting",
      },
    });
    const rawJobId = (job as any)?.insertId;
    if (rawJobId == null) {
      logger.warn(`[Pipeline] Stage 4: createWorkflowJob returned nullish insertId for letter #${letterId}, falling back to jobId=0`);
    }
    jobId = rawJobId ?? 0;
  } catch (jobCreateErr) {
    logger.warn({ err: jobCreateErr }, `[Pipeline] Stage 4: createWorkflowJob INSERT failed for letter #${letterId}, falling back to jobId=0:`);
    captureServerException(jobCreateErr, { tags: { component: "pipeline", error_type: "workflow_job_create_failed" }, extra: { letterId } });
  }
  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });

  const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
  const letterType = intake.letterType ?? "general-legal";
  const citationRegistry = pipelineCtx?.citationRegistry ?? [];

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

  const preVetCitationAudit = runCitationAudit(assembledLetter, citationRegistry);
  logger.info(
    `[Pipeline] Stage 4: Pre-vet citation audit for letter #${letterId}: ${preVetCitationAudit.verifiedCitations.length} verified, ${preVetCitationAudit.unverifiedCitations.length} unverified, risk score: ${preVetCitationAudit.hallucinationRiskScore}%`
  );

  addValidationResult(pipelineCtx, {
    stage: "vetting",
    check: "pre_vet_citation_audit",
    passed: preVetCitationAudit.unverifiedCitations.length === 0,
    errors: preVetCitationAudit.unverifiedCitations.map(c => `Unverified citation: "${c.citation}"`),
    warnings: [`Total citations: ${preVetCitationAudit.totalCitations}, hallucination risk: ${preVetCitationAudit.hallucinationRiskScore}%`],
    timestamp: new Date().toISOString(),
  });

  const preVetConsistency = validateContentConsistency(assembledLetter, normalizedIntake);
  addValidationResult(pipelineCtx, {
    stage: "vetting",
    check: "pre_vet_content_consistency",
    passed: preVetConsistency.passed,
    errors: preVetConsistency.jurisdictionMismatch
      ? [`Jurisdiction mismatch: expected "${preVetConsistency.expectedJurisdiction}" but found "${preVetConsistency.foundJurisdiction}"`]
      : [],
    warnings: preVetConsistency.warnings,
    timestamp: new Date().toISOString(),
  });

  const detectedBloat = detectBloatPhrases(assembledLetter);
  if (detectedBloat.length > 0) {
    logger.info(
      `[Pipeline] Stage 4: Detected ${detectedBloat.length} bloat phrases in letter #${letterId}: ${detectedBloat.slice(0, 5).join(", ")}${detectedBloat.length > 5 ? "..." : ""}`
    );
  }

  const preVetIssues: string[] = [];
  if (preVetCitationAudit.unverifiedCitations.length > 0) {
    preVetIssues.push(`UNVERIFIED CITATIONS FOUND: ${preVetCitationAudit.unverifiedCitations.map(c => `"${c.citation}"`).join(", ")}. These must be removed or replaced with [CITATION REQUIRES ATTORNEY VERIFICATION].`);
  }
  if (preVetConsistency.jurisdictionMismatch) {
    preVetIssues.push(`JURISDICTION MISMATCH: Letter references "${preVetConsistency.foundJurisdiction}" law but should only reference "${preVetConsistency.expectedJurisdiction}". Remove all cross-jurisdiction citations.`);
  }

  const lessonsBlockVetting = await buildLessonsPromptBlock(letterType, jurisdiction, "vetting", undefined, pipelineCtx);
  const systemPrompt = buildVettingSystemPrompt(jurisdiction, letterType, detectedBloat) + lessonsBlockVetting;
  const baseUserPrompt = buildVettingUserPrompt(assembledLetter, intake, research, citationRegistry);
  const preVetBlock = preVetIssues.length > 0
    ? `\n\n## PRE-VET ISSUES DETECTED (MUST FIX)\n${preVetIssues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}\n`
    : "";
  const userPrompt = baseUserPrompt + preVetBlock;

  const vettingTokens = createTokenAccumulator();
  let vettingProvider = "anthropic";
  let vettingModelKey = "claude-sonnet-4-20250514";

  const generateVetting = async (errorFeedback?: string): Promise<string> => {
    // Reset provider to primary on each retry to avoid tier collapse
    vettingProvider = "anthropic";
    vettingModelKey = "claude-sonnet-4-20250514";
    const promptWithFeedback = errorFeedback
      ? userPrompt + errorFeedback
      : userPrompt;
    const { result: vettingText, provider: retryProvider, failoverTriggered: retryFailover } = await withModelFailover(
      "Stage 4 (vetting retry)",
      letterId,
      async () => {
        if (vettingProvider === "openai-failover") {
          const { text, usage: vettingUsage } = await generateText({
            model: getVettingModelFallback(),
            system: systemPrompt,
            prompt: promptWithFeedback,
            maxOutputTokens: 16000,
            abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
          });
          accumulateTokens(vettingTokens, vettingUsage);
          return text;
        }
        if (vettingProvider === "groq-oss-fallback") {
          const { text, usage: vettingUsage } = await generateText({
            model: getFreeOSSModelFallback(),
            system: systemPrompt,
            prompt: promptWithFeedback,
            maxOutputTokens: 16000,
            abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
          });
          accumulateTokens(vettingTokens, vettingUsage);
          return text;
        }
        const anthropic = getAnthropicClient();
        const { text, usage: vettingUsage } = await generateText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, vettingUsage);
        return text;
      },
      async () => {
        vettingProvider = "openai-failover";
        vettingModelKey = "gpt-4o-mini";
        const { text, usage: vettingUsage } = await generateText({
          model: getVettingModelFallback(),
          system: systemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, vettingUsage);
        return text;
      },
      async () => {
        vettingProvider = "groq-oss-fallback";
        vettingModelKey = "llama-3.3-70b-versatile";
        const { text, usage: vettingUsage } = await generateText({
          model: getFreeOSSModelFallback(),
          system: systemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, vettingUsage);
        return text;
      }
    );
    if (retryProvider === "groq-oss-fallback" && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("VETTING_OSS_FALLBACK"))) {
        pipelineCtx.qualityWarnings.push(
          `VETTING_OSS_FALLBACK: Groq Llama 3.3 used as last-resort during vetting retry (both Claude and OpenAI were unavailable). Quality vetting may be incomplete. Heightened attorney scrutiny required.`
        );
      }
    } else if (retryFailover && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("VETTING_FAILOVER"))) {
        pipelineCtx.qualityWarnings.push(
          `VETTING_FAILOVER: Switched to OpenAI GPT-4o-mini during vetting retry due to rate limit on primary model. Heightened attorney scrutiny recommended.`
        );
      }
    }
    return vettingText;
  };

  try {
    logger.info(
      `[Pipeline] Stage 4: Claude vetting pass for letter #${letterId}`
    );

    const { result: initialVettingText, provider: initialVettingProvider, failoverTriggered: vettingFailover } = await withModelFailover(
      "Stage 4 (vetting)",
      letterId,
      () => {
        const anthropic = getAnthropicClient();
        return generateText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        }).then(r => { accumulateTokens(vettingTokens, r.usage); return r.text; });
      },
      () => {
        vettingProvider = "openai-failover";
        vettingModelKey = "gpt-4o-mini";
        return generateText({
          model: getVettingModelFallback(),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        }).then(r => { accumulateTokens(vettingTokens, r.usage); return r.text; });
      },
      async () => {
        vettingProvider = "groq-oss-fallback";
        vettingModelKey = "llama-3.3-70b-versatile";
        const r = await generateText({
          model: getFreeOSSModelFallback(),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, r.usage);
        return r.text;
      }
    );

    if (initialVettingProvider === "groq-oss-fallback") {
      logger.warn(
        `[Pipeline] Stage 4: Groq Llama 3.3 used as last-resort for letter #${letterId} (VETTING_OSS_FALLBACK)`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `VETTING_OSS_FALLBACK: Groq Llama 3.3 used as last-resort for vetting (both Claude Sonnet and OpenAI were unavailable). Quality vetting may be significantly reduced. Heightened attorney scrutiny required.`
        );
      }
    } else if (vettingFailover) {
      logger.warn(
        `[Pipeline] Stage 4: Switched to OpenAI GPT-4o-mini failover for letter #${letterId} (provider=${vettingProvider})`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `VETTING_FAILOVER: Primary vetting model (Claude Sonnet) was rate-limited. Final quality vetting performed by OpenAI GPT-4o-mini. Claude's legal polish and tone review was not applied — heightened attorney scrutiny recommended.`
        );
      }
    }

    let rawResponse = initialVettingText;
    let parsed = parseVettingResponse(rawResponse);

    if (!parsed) {
      logger.warn(
        `[Pipeline] Stage 4: Failed to parse vetting JSON for letter #${letterId}, retrying...`
      );
      rawResponse = await retryOnValidationFailure(
        generateVetting,
        ["Your previous response was not valid JSON. Return ONLY a JSON object with vettedLetter and vettingReport fields."],
        "Stage 4 (JSON parse retry)"
      );
      parsed = parseVettingResponse(rawResponse);
      if (!parsed) {
        const failMsg = `Stage 4 vetting failed: could not parse valid JSON after retry for letter #${letterId}`;
        logger.error(`[Pipeline] ${failMsg}`);
        addValidationResult(pipelineCtx, {
          stage: "vetting",
          check: "json_parse",
          passed: false,
          errors: [failMsg],
          warnings: [],
          timestamp: new Date().toISOString(),
        });
        await updateWorkflowJob(jobId, {
          status: "failed",
          errorMessage: formatStructuredError(
            PIPELINE_ERROR_CODES.JSON_PARSE_FAILED,
            failMsg,
            "vetting",
            "Could not parse vetting response as valid JSON after retry"
          ),
          completedAt: new Date(),
        });
        throw new PipelineError(PIPELINE_ERROR_CODES.JSON_PARSE_FAILED, failMsg, "vetting");
      }
    }

    const postVetParams = { citationRegistry, normalizedIntake, assembledLetter };

    let currentLetter = parsed.vettedLetter;
    let currentReport = parsed.vettingReport;
    let checks = runPostVetChecks(currentLetter, currentReport, postVetParams);

    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "post_vet_citation_audit",
      passed: checks.postVetCitationAudit.unverifiedCitations.length === 0,
      errors: checks.postVetCitationAudit.unverifiedCitations.map(c => `Still unverified after vetting: "${c.citation}"`),
      warnings: [`Post-vet hallucination risk: ${checks.postVetCitationAudit.hallucinationRiskScore}%`],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "post_vet_content_consistency",
      passed: checks.postVetConsistency.passed,
      errors: checks.postVetConsistency.jurisdictionMismatch
        ? [`Post-vet jurisdiction mismatch persists: "${checks.postVetConsistency.foundJurisdiction}"`]
        : [],
      warnings: checks.postVetConsistency.warnings,
      timestamp: new Date().toISOString(),
    });

    if (!checks.validation.valid) {
      logger.warn(
        `[Pipeline] Stage 4: Vetting validation failed for letter #${letterId}: ${checks.validation.errors.join("; ")}. Retrying vetting...`
      );
      const retryResponse = await retryOnValidationFailure(
        generateVetting,
        checks.validation.errors,
        "Stage 4 (vetting validation retry)"
      );
      const retryParsed = parseVettingResponse(retryResponse);
      if (retryParsed) {
        const retryChecks = runPostVetChecks(retryParsed.vettedLetter, retryParsed.vettingReport, postVetParams);

        addValidationResult(pipelineCtx, {
          stage: "vetting",
          check: "vetting_retry_validation",
          passed: retryChecks.validation.valid,
          errors: retryChecks.validation.errors,
          warnings: [],
          timestamp: new Date().toISOString(),
        });

        if (retryChecks.validation.valid || !retryChecks.validation.critical) {
          currentLetter = retryParsed.vettedLetter;
          currentReport = retryParsed.vettingReport;
          checks = retryChecks;
          logger.info(`[Pipeline] Stage 4: Retry improved results for letter #${letterId}`);
        }
      }
    }

    const postVetBloat = detectBloatPhrases(currentLetter);
    if (postVetBloat.length > 0) {
      logger.warn(
        `[Pipeline] Stage 4: ${postVetBloat.length} bloat phrase(s) persist after vetting for letter #${letterId}: ${postVetBloat.join(", ")}`
      );
      addValidationResult(pipelineCtx, {
        stage: "vetting",
        check: "post_vet_bloat_enforcement",
        passed: true,
        errors: [],
        warnings: postVetBloat.map(p => `Bloat phrase persists after vetting: "${p}"`),
        timestamp: new Date().toISOString(),
      });
    }

    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "vetting_output_validation",
      passed: checks.validation.valid,
      errors: checks.validation.errors,
      warnings: [
        `Risk: ${currentReport.riskLevel}`,
        `Changes: ${currentReport.changesApplied.length}`,
        `Citations flagged: ${currentReport.citationsFlagged.length}`,
        `Bloat removed: ${currentReport.bloatPhrasesRemoved.length}`,
        `Post-vet hallucination risk: ${checks.postVetCitationAudit.hallucinationRiskScore}%`,
      ],
      timestamp: new Date().toISOString(),
    });

    const jobStatus = checks.validation.valid ? "completed" : (checks.validation.critical ? "failed" : "completed");

    if (checks.validation.critical) {
      logger.error(
        `[Pipeline] Stage 4: CRITICAL issues for letter #${letterId} (needs assembly retry): ${checks.validation.errors.join("; ")}`
      );
      await updateWorkflowJob(jobId, {
        status: jobStatus,
        completedAt: new Date(),
        promptTokens: vettingTokens.promptTokens,
        completionTokens: vettingTokens.completionTokens,
        estimatedCostUsd: calculateCost(vettingModelKey, vettingTokens),
        errorMessage: formatStructuredError(
          PIPELINE_ERROR_CODES.VETTING_REJECTED,
          "Vetting validation issues",
          "vetting",
          checks.validation.errors.join("; ")
        ),
        responsePayloadJson: {
          provider: vettingProvider,
          failoverUsed: vettingProvider === "openai-failover" || vettingProvider === "groq-oss-fallback",
          vettingReport: currentReport,
          bloatDetected: detectedBloat.length,
          preVetCitationAudit: {
            verified: preVetCitationAudit.verifiedCitations.length,
            unverified: preVetCitationAudit.unverifiedCitations.length,
            riskScore: preVetCitationAudit.hallucinationRiskScore,
          },
          postVetCitationAudit: {
            verified: checks.postVetCitationAudit.verifiedCitations.length,
            unverified: checks.postVetCitationAudit.unverifiedCitations.length,
            riskScore: checks.postVetCitationAudit.hallucinationRiskScore,
          },
          postVetConsistency: checks.postVetConsistency,
          critical: true,
        },
      });
      return { vettedLetter: checks.finalLetter, vettingReport: currentReport, critical: true };
    }

    if (!checks.validation.valid) {
      logger.warn(
        `[Pipeline] Stage 4: Non-critical structural issues for letter #${letterId} (proceeding with best available): ${checks.validation.errors.join("; ")}`
      );
      addValidationResult(pipelineCtx, {
        stage: "vetting",
        check: "non_critical_warnings",
        passed: true,
        errors: [],
        warnings: checks.validation.errors,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `[Pipeline] Stage 4 complete for letter #${letterId}: risk=${currentReport.riskLevel}, changes=${currentReport.changesApplied.length}, bloat_removed=${currentReport.bloatPhrasesRemoved.length}`
    );

    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: vettingTokens.promptTokens,
      completionTokens: vettingTokens.completionTokens,
      estimatedCostUsd: calculateCost(vettingModelKey, vettingTokens),
      errorMessage: checks.validation.valid ? undefined : formatStructuredError(
        PIPELINE_ERROR_CODES.VETTING_REJECTED,
        "Vetting validation issues",
        "vetting",
        checks.validation.errors.join("; ")
      ),
      responsePayloadJson: {
        provider: vettingProvider,
        failoverUsed: vettingProvider === "openai-failover" || vettingProvider === "groq-oss-fallback",
        vettingReport: currentReport,
        bloatDetected: detectedBloat.length,
        preVetCitationAudit: {
          verified: preVetCitationAudit.verifiedCitations.length,
          unverified: preVetCitationAudit.unverifiedCitations.length,
          riskScore: preVetCitationAudit.hallucinationRiskScore,
        },
        postVetCitationAudit: {
          verified: checks.postVetCitationAudit.verifiedCitations.length,
          unverified: checks.postVetCitationAudit.unverifiedCitations.length,
          riskScore: checks.postVetCitationAudit.hallucinationRiskScore,
        },
        postVetConsistency: checks.postVetConsistency,
        critical: false,
      },
    });

    logger.info(
      `[Pipeline] Stage 4 complete for letter #${letterId}: provider=${vettingProvider}, risk=${currentReport.riskLevel}`
    );
    return { vettedLetter: checks.finalLetter, vettingReport: currentReport, critical: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ msg: msg }, `[Pipeline] Stage 4 failed for letter #${letterId}:`);
    captureServerException(err, {
      tags: { pipeline_stage: "vetting", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    });
    const vettingErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: formatStructuredError(vettingErrCode, msg, "vetting"),
      completedAt: new Date(),
      promptTokens: vettingTokens.promptTokens,
      completionTokens: vettingTokens.completionTokens,
      estimatedCostUsd: vettingTokens.promptTokens > 0 ? calculateCost(vettingModelKey, vettingTokens) : undefined,
    });
    throw err instanceof PipelineError ? err : new PipelineError(vettingErrCode, `Stage 4 vetting failed for letter #${letterId}: ${msg}`, "vetting");
  }
}

// ═══════════════════════════════════════════════════════
// FINALIZE LETTER (post-vetting: version, status, email)
// ═══════════════════════════════════════════════════════

export async function finalizeLetterAfterVetting(
  letterId: number,
  vettedLetter: string,
  vettingReport: VettingReport,
  pipelineCtx?: PipelineContext,
): Promise<void> {
  const qualityWarnings = pipelineCtx?.qualityWarnings ?? [];
  const isDegraded = qualityWarnings.length > 0;

  // Always explicitly set qualityDegraded so a clean re-run resets a previously-degraded letter
  await setLetterQualityDegraded(letterId, isDegraded);

  const version = await createLetterVersion({
    letterRequestId: letterId,
    versionType: "ai_draft",
    content: vettedLetter,
    createdByType: "system",
    metadataJson: {
      provider: "multi-provider",
      researchProvider: pipelineCtx?.researchProvider,
      failoverUsed: qualityWarnings.some(w =>
        w.includes("_FAILOVER:") || w.includes("FAILOVER")
      ),
      stage: "vetted_final",
      vettingReport,
      counterArguments: pipelineCtx?.counterArguments,
      researchUnverified: pipelineCtx?.researchUnverified ?? false,
      webGrounded: pipelineCtx?.webGrounded ?? true,
      citationRegistry: pipelineCtx?.citationRegistry ?? [],
      validationResults: pipelineCtx?.validationResults,
      wordCount: vettedLetter.split(/\s+/).filter(w => w.length > 0).length,
      qualityDegraded: isDegraded,
      qualityWarnings,
    },
  });
  const versionId = (version as any)?.insertId ?? 0;
  if (!versionId) {
    throw new PipelineError(
      PIPELINE_ERROR_CODES.UNKNOWN_ERROR,
      `createLetterVersion returned a null/zero ID for letter #${letterId} — cannot finalize without a valid version`,
      "vetting",
      "insertId was 0 or falsy"
    );
  }

  await updateLetterVersionPointers(letterId, {
    currentAiDraftVersionId: versionId,
  });

  const finalStatus = "generated_locked" as const;
  await updateLetterStatus(letterId, finalStatus);

  const noteText = isDegraded
    ? `Draft ready with quality warnings. Our AI completed research, drafting, and vetting, but some checks raised flags (see attorney-only notes). Attorney review will address these. ${qualityWarnings.length} quality warning(s) attached.`
    : `Draft ready. Our legal team has completed research, drafting, and quality vetting. Submit for attorney review to receive your finalised letter.`;

  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "ai_pipeline_completed",
    noteText,
    noteVisibility: isDegraded ? "internal" : "user_visible",
    fromStatus: "drafting",
    toStatus: finalStatus,
  });

  // ── Admin alert for degraded drafts (normal completion path) ────────────────
  if (isDegraded) {
    (async () => {
      try {
        const appBaseUrl = process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
        const admins = await getAllUsers("admin");
        for (const admin of admins) {
          if (admin.email) {
            sendAdminAlertEmail({
              to: admin.email,
              name: admin.name ?? "Admin",
              subject: `Quality-flagged draft produced for letter #${letterId}`,
              preheader: `Vetting raised quality warnings — attorney scrutiny required`,
              bodyHtml: `<p>Letter #${letterId} completed the pipeline with quality warnings attached.</p><p>Warnings:</p><ul>${qualityWarnings.map(w => `<li>${w}</li>`).join("")}</ul><p>The draft is in <strong>generated_locked</strong> status and requires heightened attorney scrutiny upon review.</p>`,
              ctaText: "View Letter",
              ctaUrl: `${appBaseUrl}/admin/letters/${letterId}`,
            }).catch(e => logger.error({ e: e }, `[Pipeline] Failed admin alert email for degraded draft #${letterId}:`));
          }
          createNotification({
            userId: admin.id,
            type: "quality_alert",
            category: "letters",
            title: `Quality-flagged draft: letter #${letterId}`,
            body: `Vetting quality warnings attached (${qualityWarnings.length}). Extra attorney scrutiny needed.`,
            link: `/admin/letters/${letterId}`,
          }).catch(e => logger.error({ e: e }, `[Pipeline] Failed notification for degraded draft #${letterId}:`));
        }
      } catch (alertErr) {
        logger.error({ err: alertErr }, `[Pipeline] Failed to notify admins of quality-degraded draft #${letterId}:`);
      }
    })();
  }

  const letterForPaywall = await getLetterById(letterId);

  // ── Subscriber "letter ready" email (normal completion path) ─────────────────
  try {
    const wasAlreadyUnlocked = letterForPaywall ? await hasLetterBeenPreviouslyUnlocked(letterId) : false;
    if (letterForPaywall && !letterForPaywall.submittedByAdmin && !wasAlreadyUnlocked && letterForPaywall.userId != null) {
      const subscriber = await getUserById(letterForPaywall.userId);
      if (subscriber?.email) {
        const isFirstLetter = !wasAlreadyUnlocked && await isUserFirstLetterEligible(letterForPaywall.userId);
        sendLetterReadyEmail({
          to: subscriber.email,
          name: subscriber.name ?? "Subscriber",
          subject: letterForPaywall.subject,
          letterId,
          appUrl: process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com",
          letterType: letterForPaywall.letterType ?? undefined,
          jurisdictionState: letterForPaywall.jurisdictionState ?? undefined,
          isFirstLetter,
        }).catch(e => logger.error({ e: e }, `[Pipeline] Failed to send letter-ready email for #${letterId}:`));
      }
    }
  } catch (emailErr) {
    logger.error({ err: emailErr }, `[Pipeline] Failed to send subscriber email for normal completion #${letterId}:`);
  }

  if (letterForPaywall?.submittedByAdmin) {
    logger.info(
      `[Pipeline] Skipping paywall email for #${letterId} — admin-submitted letter`
    );
  } else {
    const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
    if (!wasAlreadyUnlocked) {
      logger.info(
        `[Pipeline] Letter #${letterId} is generated_locked — paywall email will fire via cron in ~10–15 min`
      );
    } else {
      logger.info(
        `[Pipeline] Skipping paywall email for #${letterId} — previously unlocked`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════
// SHARED ASSEMBLY↔VETTING RETRY LOOP
// ═══════════════════════════════════════════════════════

const MAX_ASSEMBLY_VETTING_RETRIES = 2;

export async function runAssemblyVettingLoop(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput,
  pipelineCtx: PipelineContext,
): Promise<{ vettingResult: { vettedLetter: string; vettingReport: VettingReport; critical: boolean }; assemblyRetries: number }> {
  let assembledLetter = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
  let vettingResult = await runVettingStage(letterId, assembledLetter, intake, research, pipelineCtx);
  let assemblyRetries = 0;

  while (vettingResult.critical && assemblyRetries < MAX_ASSEMBLY_VETTING_RETRIES) {
    assemblyRetries++;
    const lastValidation = pipelineCtx.validationResults
      ?.filter(r => r.stage === "vetting" && r.check === "vetting_output_validation")
      .pop();
    const lastErrors = lastValidation?.errors;
    const reportErrors = vettingResult.vettingReport.jurisdictionIssues
      .concat(vettingResult.vettingReport.citationsFlagged)
      .concat(vettingResult.vettingReport.factualIssuesFound);

    let allCriticalErrors: string[];
    if (lastErrors && lastErrors.length > 0) {
      allCriticalErrors = lastErrors;
    } else if (reportErrors.length > 0) {
      allCriticalErrors = reportErrors;
    } else {
      allCriticalErrors = [vettingResult.vettingReport.overallAssessment || "Vetting flagged critical issues but no specific errors were provided"];
    }

    logger.warn(
      `[Pipeline] Assembly↔Vetting retry #${assemblyRetries} for letter #${letterId}: critical issues found: ${allCriticalErrors.join("; ")}`
    );

    addValidationResult(pipelineCtx, {
      stage: "assembly_vetting_retry",
      check: `retry_${assemblyRetries}`,
      passed: false,
      errors: allCriticalErrors,
      warnings: [`Retry triggered by vetting critical flag (attempt ${assemblyRetries}/${MAX_ASSEMBLY_VETTING_RETRIES})`],
      timestamp: new Date().toISOString(),
    });

    pipelineCtx.assemblyVettingFeedback = `CRITICAL ISSUES FROM PREVIOUS ATTEMPT (must fix):\n${allCriticalErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;

    assembledLetter = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
    vettingResult = await runVettingStage(letterId, assembledLetter, intake, research, pipelineCtx);
  }

  return { vettingResult, assemblyRetries };
}

