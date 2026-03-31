import { generateText, type ToolSet } from "ai";
import {
  createResearchRun,
  createWorkflowJob,
  updateResearchRun,
  updateWorkflowJob,
  updateLetterStatus,
} from "../db";
import type { IntakeJson, ResearchPacket, PipelineContext, TokenUsage, PipelineErrorCode, ValidationResult } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { buildNormalizedPromptInput, type NormalizedPromptInput } from "../intake-normalizer";
import { captureServerException } from "../sentry";
import { buildCacheKey, getCachedResearch, setCachedResearch } from "../kvCache";
import { formatStructuredError, classifyErrorCode, withModelFailover } from "./shared";
import { getResearchModel, getResearchModelFallback, getFreeOSSModelFallback, RESEARCH_TIMEOUT_MS, createTokenAccumulator, accumulateTokens, calculateCost } from "./providers";
import { validateResearchPacket, retryOnValidationFailure, addValidationResult } from "./validators";
import { buildCitationRegistry, revalidateCitationsWithPerplexity } from "./citations";
import { buildResearchSystemPrompt, buildResearchUserPrompt } from "./prompts";

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
  try {
    const { notifyAdmins } = await import("../db");
    await notifyAdmins({
      category: "letters",
      type: "pipeline_researching",
      title: `Letter #${letterId} entering research stage`,
      body: `AI pipeline has started researching for letter #${letterId}.`,
      link: `/admin/letters/${letterId}`,
    });
  } catch (err) {
    console.error("[notifyAdmins] pipeline_researching:", err);
    captureServerException(err, { tags: { component: "pipeline", error_type: "notify_admins_researching" } });
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
  const kvCacheKey = buildCacheKey(intake.letterType, intake.jurisdiction ?? {}, situationText);

  try {
    const cachedPacket = await getCachedResearch(kvCacheKey);
    if (cachedPacket) {
      // Validate cached packet before trusting it — guards against corrupted or
      // schema-drifted cache entries. On validation failure, treat as a miss.
      const cacheValidation = validateResearchPacket(cachedPacket);
      if (!cacheValidation.valid) {
        console.warn(
          `[KVCache] Cached packet for key ${kvCacheKey} failed validation (treating as miss): ${cacheValidation.errors.join("; ")}`
        );
        // Fall through to live Perplexity call
      } else {
        console.log(`[Pipeline] Stage 1: KV cache hit for letter #${letterId} (key: ${kvCacheKey}) — skipping Perplexity API call`);

        const cacheHitResult: ValidationResult = {
          stage: "research",
          check: "research_packet_validation",
          passed: true,
          errors: [],
          warnings: ["Research served from KV cache (Perplexity API call skipped)"],
          timestamp: new Date().toISOString(),
        };

        await updateResearchRun(runId, {
          status: "completed",
          resultJson: cachedPacket,
          validationResultJson: { ...cacheHitResult, webGrounded: true, fromCache: true },
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
    console.warn(`[Pipeline] Stage 1: KV cache check error for letter #${letterId} (non-fatal):`, cacheErr);
  }
  // ── End KV Cache check ──

  // Declare provider-tracking variables at function scope so the catch block
  // can read the active model key for accurate cost reporting after failover.
  let researchModelKey = researchConfig.provider === "perplexity" ? "sonar-pro" : "claude-opus-4-5";

  try {
    console.log(
      `[Pipeline] Stage 1: ${researchConfig.provider} 8-task deep research for letter #${letterId}`
    );

    // Track the active model — may switch to failover mid-stage
    let activeModel = researchConfig.model;
    let activeProvider = researchConfig.provider;
    let activeFallbackTools: ToolSet | undefined;

    const callGenerateText = async (prompt: string) => {
      return generateText({
        model: activeModel,
        system: systemPrompt,
        prompt,
        maxOutputTokens: 6000,
        abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
      });
    };

    const { result: initialResult, failoverTriggered: initialFailover, provider: initialProvider } = await withModelFailover(
      "Stage 1 (research)",
      letterId,
      () => callGenerateText(userPrompt),
      () => {
        const fallback = getResearchModelFallback();
        activeModel = fallback.model;
        activeProvider = fallback.provider;
        activeFallbackTools = fallback.tools;
        researchModelKey = "gpt-4o-search-preview";
        return generateText({
          model: fallback.model,
          tools: fallback.tools,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 6000,
          abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        });
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
          maxOutputTokens: 6000,
          abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        });
      }
    );

    if (initialProvider === "groq-oss-fallback") {
      console.warn(
        `[Pipeline] Stage 1: Groq Llama 3.3 used as last-resort for letter #${letterId} (RESEARCH_OSS_FALLBACK) — research is NOT web-grounded.`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `RESEARCH_OSS_FALLBACK: Groq Llama 3.3 used as last-resort for research (both Perplexity and OpenAI were unavailable). Research is NOT web-grounded and citations cannot be verified. Heightened attorney scrutiny required.`
        );
        pipelineCtx.researchUnverified = true;
      }
    } else if (initialFailover) {
      console.warn(
        `[Pipeline] Stage 1: Switched to OpenAI GPT-4o (web search) failover for letter #${letterId} (provider=${activeProvider})`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `RESEARCH_FAILOVER: Primary research model (Perplexity) was rate-limited. Research performed by OpenAI gpt-4o-search-preview with web search grounding. Citation style and format may differ slightly from Perplexity standard.`
        );
      }
    }

    const { text, usage: initialUsage } = initialResult;
    accumulateTokens(researchTokens, initialUsage);

    const parseResearchJson = (raw: string): ResearchPacket => {
      const jsonMatch =
        raw.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        raw.match(/(\{[\s\S]*\})/);
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
          maxOutputTokens: 6000,
          abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        });
      }
      return generateText({
        model: activeModel,
        system: systemPrompt,
        prompt,
        maxOutputTokens: 6000,
        abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
      });
    };

    const generateResearch = async (errorFeedback?: string): Promise<string> => {
      const promptWithFeedback = errorFeedback ? userPrompt + errorFeedback : userPrompt;
      const { result: retryResult, provider: retryProvider, failoverTriggered: retryFailover } = await withModelFailover(
        "Stage 1 (research retry)",
        letterId,
        () => callWithActiveFallback(promptWithFeedback),
        async () => {
          const fallback = getResearchModelFallback();
          activeModel = fallback.model;
          activeProvider = fallback.provider;
          activeFallbackTools = fallback.tools;
          researchModelKey = "gpt-4o-search-preview";
          return generateText({
            model: fallback.model,
            tools: fallback.tools,
            system: systemPrompt,
            prompt: promptWithFeedback,
            maxOutputTokens: 6000,
            abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
          });
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
            maxOutputTokens: 6000,
            abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
          });
        }
      );
      if (retryProvider === "groq-oss-fallback" && pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("RESEARCH_OSS_FALLBACK"))) {
          pipelineCtx.qualityWarnings.push(
            `RESEARCH_OSS_FALLBACK: Groq Llama 3.3 used as last-resort during research retry. Research is NOT web-grounded. Heightened attorney scrutiny required.`
          );
        }
        pipelineCtx.researchUnverified = true;
      } else if (retryFailover && pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("RESEARCH_FAILOVER"))) {
          pipelineCtx.qualityWarnings.push(
            `RESEARCH_FAILOVER: Switched to OpenAI gpt-4o-search-preview during research retry due to rate limit.`
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
      console.warn(
        `[Pipeline] Stage 1: First JSON parse failed for letter #${letterId}. Retrying (1 of 1) with stricter prompt.`
      );
      try {
        const retryText = await retryOnValidationFailure(
          generateResearch,
          ["Response was not valid JSON. Return ONLY a JSON object starting with { and ending with }. No markdown, no explanation."],
          "Stage 1 (JSON parse)"
        );
        researchPacket = parseResearchJson(retryText);
      } catch {
        const failedResult: ValidationResult = {
          stage: "research",
          check: "json_parse",
          passed: false,
          errors: ["Research response could not be parsed as valid JSON after 2 attempts"],
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
        throw new PipelineError(PIPELINE_ERROR_CODES.JSON_PARSE_FAILED, "Research retry response could not be parsed as JSON", "research");
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
    const isOpenAIFailover = activeProvider === "openai-failover";
    const isGroqOSSFallback = activeProvider === "groq-oss-fallback";
    // OpenAI failover uses gpt-4o-search-preview + webSearchPreview tool — still web-grounded.
    // Claude anthropic-fallback and Groq OSS fallback have no web access — ungrounded.
    const isWebGrounded = !isClaudeFallback && !isGroqOSSFallback;
    const successResult: ValidationResult = {
      stage: "research",
      check: "research_packet_validation",
      passed: true,
      errors: [],
      warnings: [
        ...validation.warnings,
        ...(isClaudeFallback ? ["Research is NOT web-grounded (Claude fallback used — no web access)"] : []),
        ...(isOpenAIFailover ? ["Research used OpenAI gpt-4o-search-preview failover (web-grounded via webSearchPreview tool). Perplexity was rate-limited."] : []),
        ...(isGroqOSSFallback ? ["Research is NOT web-grounded (Groq Llama 3.3 OSS last-resort used — no web access). Citations cannot be verified. Heightened attorney scrutiny required."] : []),
      ],
      timestamp: new Date().toISOString(),
    };

    await updateResearchRun(runId, {
      status: "completed",
      resultJson: researchPacket,
      validationResultJson: { ...successResult, webGrounded: isWebGrounded, provider: activeProvider },
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
        failoverUsed: isOpenAIFailover,
        validationResult: successResult,
      },
    });

    // Store new result in KV cache (only for web-grounded Perplexity results)
    if (isWebGrounded) {
      await setCachedResearch(kvCacheKey, researchPacket);
    }

    if (isClaudeFallback) {
      console.warn(
        `[Pipeline] Stage 1: Claude fallback used for letter #${letterId} — research is NOT web-grounded. Citations may not be verified.`
      );
    } else if (isOpenAIFailover) {
      console.warn(
        `[Pipeline] Stage 1: OpenAI gpt-4o-search-preview failover used for letter #${letterId} — research IS web-grounded via webSearchPreview tool. Perplexity was rate-limited.`
      );
    } else if (isGroqOSSFallback) {
      console.warn(
        `[Pipeline] Stage 1: Groq Llama 3.3 70B OSS last-resort used for letter #${letterId} — research is NOT web-grounded. Both Perplexity and OpenAI were exhausted.`
      );
    }

    console.log(`[Pipeline] Stage 1 complete for letter #${letterId} (provider: ${activeProvider})`);
    return { packet: researchPacket, provider: activeProvider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 1 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "research", letter_id: String(letterId) },
      extra: { researchRunId: runId, jobId, errorMessage: msg },
    });
    const failedResult: ValidationResult = {
      stage: "research",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    };
    const stageErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);
    const structuredCatchErr = formatStructuredError(stageErrCode, msg, "research");
    await updateResearchRun(runId, {
      status: "failed",
      errorMessage: structuredCatchErr,
      validationResultJson: failedResult,
    });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: structuredCatchErr,
      completedAt: new Date(),
      promptTokens: researchTokens.promptTokens,
      completionTokens: researchTokens.completionTokens,
      estimatedCostUsd: researchTokens.promptTokens > 0 ? calculateCost(researchModelKey, researchTokens) : undefined,
      responsePayloadJson: { validationResult: failedResult },
    });
    throw err instanceof PipelineError ? err : new PipelineError(stageErrCode, msg, "research");
  }
}

