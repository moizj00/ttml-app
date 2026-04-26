import { generateText, type ToolSet } from "ai";
import {
  createResearchRun,
  createWorkflowJob,
  updateResearchRun,
  updateWorkflowJob,
  updateLetterStatus,
  logReviewAction,
} from "../../db";
import type {
  IntakeJson,
  ResearchPacket,
  PipelineContext,
  TokenUsage,
  PipelineErrorCode,
  ValidationResult,
} from "../../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../../shared/types";
import {
  buildNormalizedPromptInput,
  type NormalizedPromptInput,
} from "../../intake-normalizer";
import { captureServerException } from "../../sentry";
import {
  buildCacheKey,
  getCachedResearch,
  setCachedResearch,
} from "../../kvCache";
import {
  formatStructuredError,
  classifyErrorCode,
  withModelFailover,
} from "../shared";
import {
  getResearchModel,
  getResearchModelFallback,
  getFreeOSSModelFallback,
  RESEARCH_TIMEOUT_MS,
  createTokenAccumulator,
  accumulateTokens,
  calculateCost,
  runOpenAIStoredPromptResearch,
  isOpenAIFailoverAvailable,
} from "../providers";
import {
  validateResearchPacket,
  retryOnValidationFailure,
  addValidationResult,
} from "../validators";
import {
  buildCitationRegistry,
  revalidateCitationsWithOpenAI,
} from "../citations";
import { buildResearchSystemPrompt, buildResearchUserPrompt } from "../prompts";
import { logger } from "../../logger";
import { synthesizeResearchFromIntake } from "./synthetic";

export { synthesizeResearchFromIntake };

// ═══════════════════════════════════════════════════════
// STAGE 1: PERPLEXITY LEGAL RESEARCH
// ═══════════════════════════════════════════════════════

export async function runResearchStage(

  letterId: number,
  intake: IntakeJson,
  pipelineCtx?: PipelineContext
): Promise<{ packet: ResearchPacket; provider: string }> {
  const researchConfig = getResearchModel();
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "research",
    provider: researchConfig.provider,
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      letterType: intake.letterType,
      jurisdiction: intake.jurisdiction,
      sender: intake.sender,
      recipient: intake.recipient,
    },
  });
  const jobId = (job as any)?.insertId ?? 0;
  const researchRun = await createResearchRun({
    letterRequestId: letterId,
    workflowJobId: jobId,
    provider: researchConfig.provider,
  });
  const runId = (researchRun as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });
  await updateResearchRun(runId, { status: "running" });
  await updateLetterStatus(letterId, "researching", { force: true });
  logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "status_changed",
    noteText: "Pipeline started research stage.",
    noteVisibility: "internal",
    fromStatus: "submitted",
    toStatus: "researching",
  }).catch(e =>
    logger.error(
      { e: e },
      `[Pipeline] Failed to log submitted→researching action for #${letterId}:`
    )
  );
  try {
    const { notifyAdmins } = await import("../../db");
    await notifyAdmins({
      category: "letters",
      type: "pipeline_researching",
      title: `Letter #${letterId} entering research stage`,
      body: `AI pipeline has started researching for letter #${letterId}.`,
      link: `/admin/letters/${letterId}`,
    });
  } catch (err) {
    logger.error({ err: err }, "[notifyAdmins] pipeline_researching:");
    captureServerException(err, {
      tags: { component: "pipeline", error_type: "notify_admins_researching" },
    });
  }

  // Build normalized intake for the research prompt
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
  const systemPrompt = buildResearchSystemPrompt();
  const userPrompt = buildResearchUserPrompt(normalizedIntake);

  const researchTokens = createTokenAccumulator();

  // ── KV Cache: check for a matching research packet before calling Perplexity ──
  const situationText = [
    intake.matter?.description ?? "",
    intake.matter?.subject ?? "",
    intake.desiredOutcome ?? "",
  ].join(" ");
  const kvCacheKey = buildCacheKey(
    intake.letterType,
    intake.jurisdiction ?? {},
    situationText
  );

  try {
    const cachedPacket = await getCachedResearch(kvCacheKey);
    if (cachedPacket) {
      // Validate cached packet before trusting it — guards against corrupted or
      // schema-drifted cache entries. On validation failure, treat as a miss.
      const cacheValidation = validateResearchPacket(cachedPacket);
      if (!cacheValidation.valid) {
        logger.warn(
          `[KVCache] Cached packet for key ${kvCacheKey} failed validation (treating as miss): ${cacheValidation.errors.join("; ")}`
        );
        // Fall through to live Perplexity call
      } else {
        logger.info(
          `[Pipeline] Stage 1: KV cache hit for letter #${letterId} (key: ${kvCacheKey}) — skipping Perplexity API call`
        );

        const cacheHitResult: ValidationResult = {
          stage: "research",
          check: "research_packet_validation",
          passed: true,
          errors: [],
          warnings: [
            "Research served from KV cache (Perplexity API call skipped)",
          ],
          timestamp: new Date().toISOString(),
        };

        await updateResearchRun(runId, {
          status: "completed",
          resultJson: cachedPacket,
          validationResultJson: {
            ...cacheHitResult,
            webGrounded: true,
            fromCache: true,
          },
          cacheHit: true,
          cacheKey: kvCacheKey,
        });
        await updateWorkflowJob(jobId, {
          status: "completed",
          completedAt: new Date(),
          promptTokens: 0,
          completionTokens: 0,
          estimatedCostUsd: "0",
          responsePayloadJson: {
            researchRunId: runId,
            webGrounded: true,
            fromCache: true,
            cacheKey: kvCacheKey,
            validationResult: cacheHitResult,
          },
        });

        return { packet: cachedPacket, provider: "kv-cache" };
      }
    }
  } catch (cacheErr) {
    logger.warn(
      { err: cacheErr },
      `[Pipeline] Stage 1: KV cache check error for letter #${letterId} (non-fatal):`
    );
  }
  // ── End KV Cache check ──

  // Declare provider-tracking variables at function scope so the catch block
  // can read the active model key for accurate cost reporting after failover.
  let researchModelKey =
    researchConfig.provider === "openai"
      ? "gpt-4o-search-preview"
      : "claude-sonnet-4-20250514";

  try {
    logger.info(
      `[Pipeline] Stage 1: ${researchConfig.provider} 8-task deep research for letter #${letterId}`
    );

    // Track the active model — may switch to failover mid-stage
    let activeModel = researchConfig.model;
    let activeProvider = researchConfig.provider;
    let activeFallbackTools: ToolSet | undefined = (researchConfig as any)
      .tools;

    const callGenerateText = async (prompt: string) => {
      return generateText({
        model: activeModel,
        ...(activeFallbackTools ? { tools: activeFallbackTools } : {}),
        system: systemPrompt,
        prompt,
        maxOutputTokens: 4000,
        abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
      });
    };

    const {
      result: initialResult,
      failoverTriggered: initialFailover,
      provider: initialProvider,
    } = await withModelFailover(
      "Stage 1 (research)",
      letterId,
      () => callGenerateText(userPrompt),
      async () => {
        // Failover 1: try Perplexity if configured, otherwise use OpenAI stored prompt
        const perplexityFallback = getResearchModelFallback();
        if (perplexityFallback) {
          activeModel = perplexityFallback.model;
          activeProvider = "perplexity-failover";
          activeFallbackTools = undefined;
          researchModelKey = "sonar-pro";
          logger.info(
            `[Pipeline] Stage 1: Falling back to Perplexity sonar-pro for letter #${letterId}`
          );
          return generateText({
            model: activeModel,
            system: systemPrompt,
            prompt: userPrompt,
            maxOutputTokens: 4000,
            abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
          });
        }
        // No Perplexity key — try OpenAI stored prompt
        activeProvider = "openai-stored-prompt";
        activeFallbackTools = undefined;
        researchModelKey = "gpt-4o-search-preview";
        logger.info(
          `[Pipeline] Stage 1: Using OpenAI stored prompt for letter #${letterId}`
        );
        const storedResult = await runOpenAIStoredPromptResearch(userPrompt);
        activeModel = null as any;
        return { text: storedResult.text, usage: storedResult.usage } as any;
      },
      () => {
        activeModel = getFreeOSSModelFallback();
        activeProvider = "groq-oss-fallback";
        activeFallbackTools = undefined;
        researchModelKey = "llama-3.3-70b-versatile";
        return generateText({
          model: activeModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 4000,
          abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        });
      }
    );

    if (initialProvider === "groq-oss-fallback") {
      logger.warn(
        `[Pipeline] Stage 1: Groq Llama 3.3 used as last-resort for letter #${letterId} (RESEARCH_OSS_FALLBACK) — research is NOT web-grounded.`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `RESEARCH_OSS_FALLBACK: Groq Llama 3.3 used as last-resort for research (both OpenAI and Perplexity were unavailable). Research is NOT web-grounded and citations cannot be verified. Heightened attorney scrutiny required.`
        );
        pipelineCtx.researchUnverified = true;
      }
    } else if (activeProvider === "perplexity-failover") {
      logger.warn(
        `[Pipeline] Stage 1: Perplexity sonar-pro failover used for letter #${letterId} — OpenAI primary was unavailable.`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `RESEARCH_FAILOVER: Primary research model (OpenAI) was unavailable. Research performed by Perplexity sonar-pro failover with web search grounding.`
        );
      }
    } else if (initialFailover) {
      logger.warn(
        `[Pipeline] Stage 1: Switched to failover for letter #${letterId} (provider=${activeProvider})`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `RESEARCH_FAILOVER: Primary research model (OpenAI) was rate-limited or unavailable. Research performed by ${activeProvider} failover.`
        );
      }
    }

    const { text, usage: initialUsage } = initialResult;
    accumulateTokens(researchTokens, initialUsage);

    const parseResearchJson = (raw: string): ResearchPacket => {
      const jsonMatch =
        raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;
      return JSON.parse(jsonStr);
    };

    const callWithActiveFallback = (prompt: string) => {
      if (activeFallbackTools) {
        return generateText({
          model: activeModel,
          tools: activeFallbackTools,
          system: systemPrompt,
          prompt,
          maxOutputTokens: 4000,
          abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        });
      }
      return generateText({
        model: activeModel,
        system: systemPrompt,
        prompt,
        maxOutputTokens: 4000,
        abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
      });
    };

    const generateResearch = async (
      errorFeedback?: string
    ): Promise<string> => {
      const promptWithFeedback = errorFeedback
        ? userPrompt + errorFeedback
        : userPrompt;
      const {
        result: retryResult,
        provider: retryProvider,
        failoverTriggered: retryFailover,
      } = await withModelFailover(
        "Stage 1 (research retry)",
        letterId,
        () => callWithActiveFallback(promptWithFeedback),
        async () => {
          const perplexityFallback = getResearchModelFallback();
          if (perplexityFallback) {
            activeModel = perplexityFallback.model;
            activeProvider = "perplexity-failover";
            activeFallbackTools = undefined;
            researchModelKey = "sonar-pro";
            return generateText({
              model: activeModel,
              system: systemPrompt,
              prompt: promptWithFeedback,
              maxOutputTokens: 4000,
              abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
            });
          }
          activeProvider = "openai-stored-prompt";
          activeFallbackTools = undefined;
          researchModelKey = "gpt-4o-search-preview";
          const storedResult =
            await runOpenAIStoredPromptResearch(promptWithFeedback);
          activeModel = null as any;
          return { text: storedResult.text, usage: storedResult.usage } as any;
        },
        () => {
          activeModel = getFreeOSSModelFallback();
          activeProvider = "groq-oss-fallback";
          activeFallbackTools = undefined;
          researchModelKey = "llama-3.3-70b-versatile";
          return generateText({
            model: activeModel,
            system: systemPrompt,
            prompt: promptWithFeedback,
            maxOutputTokens: 4000,
            abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
          });
        }
      );
      if (retryProvider === "groq-oss-fallback" && pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        if (
          !pipelineCtx.qualityWarnings.some(w =>
            w.startsWith("RESEARCH_OSS_FALLBACK")
          )
        ) {
          pipelineCtx.qualityWarnings.push(
            `RESEARCH_OSS_FALLBACK: Groq Llama 3.3 used as last-resort during research retry. Research is NOT web-grounded. Heightened attorney scrutiny required.`
          );
        }
        pipelineCtx.researchUnverified = true;
      } else if (retryFailover && pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        if (
          !pipelineCtx.qualityWarnings.some(w =>
            w.startsWith("RESEARCH_FAILOVER")
          )
        ) {
          pipelineCtx.qualityWarnings.push(
            `RESEARCH_FAILOVER: Switched to failover (${retryProvider}) during research retry.`
          );
        }
      }
      accumulateTokens(researchTokens, retryResult.usage);
      return retryResult.text;
    };

    let researchPacket: ResearchPacket;
    let stage1RetryUsed = false;

    try {
      researchPacket = parseResearchJson(text);
    } catch {
      stage1RetryUsed = true;
      logger.warn(
        `[Pipeline] Stage 1: First JSON parse failed for letter #${letterId}. Retrying (1 of 1) with stricter prompt.`
      );
      try {
        const retryText = await retryOnValidationFailure(
          generateResearch,
          [
            "Response was not valid JSON. Return ONLY a JSON object starting with { and ending with }. No markdown, no explanation.",
          ],
          "Stage 1 (JSON parse)"
        );
        researchPacket = parseResearchJson(retryText);
      } catch {
        const failedResult: ValidationResult = {
          stage: "research",
          check: "json_parse",
          passed: false,
          errors: [
            "Research response could not be parsed as valid JSON after 2 attempts",
          ],
          warnings: [],
          timestamp: new Date().toISOString(),
        };
        addValidationResult(pipelineCtx, failedResult);
        const structuredErr = formatStructuredError(
          PIPELINE_ERROR_CODES.JSON_PARSE_FAILED,
          "Research response could not be parsed as valid JSON after 2 attempts",
          "research",
          "AI returned non-JSON response despite retry"
        );
        await updateResearchRun(runId, {
          status: "failed",
          errorMessage: structuredErr,
          validationResultJson: failedResult,
        });
        await updateWorkflowJob(jobId, {
          status: "failed",
          errorMessage: structuredErr,
          completedAt: new Date(),
          responsePayloadJson: { validationResult: failedResult },
        });
        throw new PipelineError(
          PIPELINE_ERROR_CODES.JSON_PARSE_FAILED,
          "Research stage failed: AI response was not valid JSON after 2 attempts. Please try again.",
          "research"
        );
      }
    }

    let validation = validateResearchPacket(researchPacket);

    if (!validation.valid && !stage1RetryUsed) {
      stage1RetryUsed = true;
      try {
        const retryText = await retryOnValidationFailure(
          generateResearch,
          validation.errors,
          "Stage 1 (research validation)"
        );
        researchPacket = parseResearchJson(retryText);
      } catch {
        const failedResult: ValidationResult = {
          stage: "research",
          check: "research_packet_validation_retry",
          passed: false,
          errors: ["Research retry response could not be parsed as JSON"],
          warnings: [],
          timestamp: new Date().toISOString(),
        };
        addValidationResult(pipelineCtx, failedResult);
        const structuredRetryErr = formatStructuredError(
          PIPELINE_ERROR_CODES.JSON_PARSE_FAILED,
          "Research retry response could not be parsed as JSON",
          "research",
          "Retry also returned non-JSON response"
        );
        await updateResearchRun(runId, {
          status: "failed",
          resultJson: null,
          validationResultJson: failedResult,
          errorMessage: structuredRetryErr,
        });
        await updateWorkflowJob(jobId, {
          status: "failed",
          errorMessage: structuredRetryErr,
          completedAt: new Date(),
          responsePayloadJson: { validationResult: failedResult },
        });
        throw new PipelineError(
          PIPELINE_ERROR_CODES.JSON_PARSE_FAILED,
          "Research retry response could not be parsed as JSON",
          "research"
        );
      }
      validation = validateResearchPacket(researchPacket);
    }

    if (!validation.valid) {
      const failedResult: ValidationResult = {
        stage: "research",
        check: "research_packet_validation",
        passed: false,
        errors: validation.errors,
        warnings: validation.warnings,
        timestamp: new Date().toISOString(),
      };
      addValidationResult(pipelineCtx, failedResult);
      const researchValErr = formatStructuredError(
        PIPELINE_ERROR_CODES.RESEARCH_VALIDATION_FAILED,
        `Research validation failed${stage1RetryUsed ? " after retry" : ""}`,
        "research",
        validation.errors.join("; ")
      );
      await updateResearchRun(runId, {
        status: "invalid",
        resultJson: researchPacket,
        validationResultJson: failedResult,
        errorMessage: researchValErr,
      });
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: researchValErr,
        completedAt: new Date(),
        responsePayloadJson: { validationResult: failedResult },
      });
      throw new PipelineError(
        PIPELINE_ERROR_CODES.RESEARCH_VALIDATION_FAILED,
        `Research packet validation failed${stage1RetryUsed ? " after retry" : ""}`,
        "research",
        validation.errors.join("; ")
      );
    }

    const isClaudeFallback = activeProvider === "anthropic-fallback";
    const isPerplexityFailover = activeProvider === "perplexity-failover";
    const isOpenAIPrimary =
      activeProvider === "openai" || activeProvider === "openai-stored-prompt";
    const isGroqOSSFallback = activeProvider === "groq-oss-fallback";
    // OpenAI primary, OpenAI stored prompt, and Perplexity failover all use web search — web-grounded.
    // Claude anthropic-fallback and Groq OSS fallback have no web access — ungrounded.
    const isWebGrounded = !isClaudeFallback && !isGroqOSSFallback;
    const successResult: ValidationResult = {
      stage: "research",
      check: "research_packet_validation",
      passed: true,
      errors: [],
      warnings: [
        ...validation.warnings,
        ...(isClaudeFallback
          ? [
              "Research is NOT web-grounded (Claude fallback used — no web access)",
            ]
          : []),
        ...(isPerplexityFailover
          ? [
              "Research used Perplexity sonar-pro failover (web-grounded). OpenAI primary was unavailable.",
            ]
          : []),
        ...(isGroqOSSFallback
          ? [
              "Research is NOT web-grounded (Groq Llama 3.3 OSS last-resort used — no web access). Citations cannot be verified. Heightened attorney scrutiny required.",
            ]
          : []),
      ],
      timestamp: new Date().toISOString(),
    };

    await updateResearchRun(runId, {
      status: "completed",
      resultJson: researchPacket,
      validationResultJson: {
        ...successResult,
        webGrounded: isWebGrounded,
        provider: activeProvider,
      },
      cacheHit: false,
      cacheKey: kvCacheKey,
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: researchTokens.promptTokens,
      completionTokens: researchTokens.completionTokens,
      estimatedCostUsd: calculateCost(researchModelKey, researchTokens),
      responsePayloadJson: {
        researchRunId: runId,
        webGrounded: isWebGrounded,
        provider: activeProvider,
        failoverUsed: isPerplexityFailover || isGroqOSSFallback,
        validationResult: successResult,
      },
    });

    // Store new result in KV cache (only for web-grounded results)
    if (isWebGrounded) {
      await setCachedResearch(kvCacheKey, researchPacket);
    }

    if (isClaudeFallback) {
      logger.warn(
        `[Pipeline] Stage 1: Claude fallback used for letter #${letterId} — research is NOT web-grounded. Citations may not be verified.`
      );
    } else if (isPerplexityFailover) {
      logger.info(
        `[Pipeline] Stage 1: Perplexity sonar-pro failover used for letter #${letterId} — research IS web-grounded.`
      );
    } else if (isGroqOSSFallback) {
      logger.warn(
        `[Pipeline] Stage 1: Groq Llama 3.3 70B OSS last-resort used for letter #${letterId} — research is NOT web-grounded. Both OpenAI and Perplexity were exhausted.`
      );
    }

    logger.info(
      `[Pipeline] Stage 1 complete for letter #${letterId} (provider: ${activeProvider})`
    );
    return { packet: researchPacket, provider: activeProvider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { msg: msg },
      `[Pipeline] Stage 1 failed for letter #${letterId}:`
    );
    captureServerException(err, {
      tags: { pipeline_stage: "research", letter_id: String(letterId) },
      extra: { researchRunId: runId, jobId, errorMessage: msg },
    });

    const stageErrCode =
      err instanceof PipelineError ? err.code : classifyErrorCode(err);

    const syntheticPacket = synthesizeResearchFromIntake(intake);
    logger.warn(
      `[Pipeline] Stage 1: All research providers failed for letter #${letterId} — synthesizing research from intake data. Pipeline will continue with degraded research.`
    );

    if (pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      pipelineCtx.qualityWarnings.push(
        `RESEARCH_ALL_PROVIDERS_FAILED: All research providers (OpenAI, Perplexity, Groq) were unavailable. Research was synthesized from client intake data only — no external legal research was performed. Original error: ${msg}. Heightened attorney scrutiny required.`
      );
      pipelineCtx.researchUnverified = true;
    }

    const syntheticResult: ValidationResult = {
      stage: "research",
      check: "synthetic_fallback",
      passed: true,
      errors: [],
      warnings: [
        `All research providers failed (${stageErrCode}). Synthetic research packet created from intake data.`,
        `Original error: ${msg}`,
        "No external legal research was performed. Attorney must independently verify all legal claims.",
      ],
      timestamp: new Date().toISOString(),
    };
    addValidationResult(pipelineCtx, syntheticResult);

    await updateResearchRun(runId, {
      status: "completed",
      resultJson: syntheticPacket,
      validationResultJson: {
        ...syntheticResult,
        webGrounded: false,
        provider: "synthetic-intake-fallback",
        originalError: msg,
      },
      cacheHit: false,
      cacheKey: kvCacheKey,
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: researchTokens.promptTokens,
      completionTokens: researchTokens.completionTokens,
      estimatedCostUsd:
        researchTokens.promptTokens > 0
          ? calculateCost(researchModelKey, researchTokens)
          : "0",
      responsePayloadJson: {
        researchRunId: runId,
        webGrounded: false,
        provider: "synthetic-intake-fallback",
        syntheticFallback: true,
        originalError: msg,
        validationResult: syntheticResult,
      },
    });

    return { packet: syntheticPacket, provider: "synthetic-intake-fallback" };
  }
}
