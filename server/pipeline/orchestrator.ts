import {
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
  getLetterRequestById as getLetterById,
  markPriorPipelineRunsSuperseded,
  setLetterResearchUnverified,
  getLatestResearchRun,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, PipelineContext, TokenUsage, ValidationResult } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError, type PipelineErrorCode } from "../../shared/types";
import {
  buildNormalizedPromptInput,
  type NormalizedPromptInput,
} from "../intake-normalizer";
import { sendLetterReadyEmail, sendStatusUpdateEmail, sendAdminAlertEmail } from "../email";
import { captureServerException } from "../sentry";
import { createLogger } from "../logger";
import { formatStructuredError, classifyErrorCode } from "./shared";
import { createTokenAccumulator, calculateCost } from "./providers";
import { validateIntakeCompleteness, addValidationResult } from "./validators";
import { autoAdvanceIfPreviouslyUnlocked } from "./fallback";
import { buildCitationRegistry, revalidateCitationsWithOpenAI } from "./citations";
import type { CitationRegistryEntry } from "../../shared/types";
import { runResearchStage } from "./research";
import { runDraftingStage } from "./drafting";
import { runAssemblyVettingLoop, finalizeLetterAfterVetting } from "./vetting";
import { runPipeline as runLangGraphPipeline } from "./langgraph";
import { runSimplePipeline } from "./simple";

const orchLogger = createLogger({ module: "PipelineOrchestrator" });

// ═══════════════════════════════════════════════════════
// SHARED: Citation revalidation + grounding context setup
// Extracted to eliminate 3× duplication across runFullPipeline
// and both branches of retryPipelineFromStage.
// ═══════════════════════════════════════════════════════

// Perplexity research is web-grounded (researchUnverified=false). When research
// falls back to a non-grounded provider (e.g. Claude without web search), we
// mark the letter's research as unverified and skip citation revalidation —
// there's nothing to verify because the "citations" were generated offline.

async function applyResearchGroundingAndRevalidate(
  letterId: number,
  intake: IntakeJson,
  researchProvider: string,
  research: ResearchPacket,
  pipelineCtx: PipelineContext,
  opts?: { researchFromCache?: boolean },
): Promise<void> {
  const isUnverified =
    researchProvider === "anthropic-fallback" ||
    researchProvider === "claude-fallback" ||
    researchProvider === "none";
  pipelineCtx.researchProvider = researchProvider;
  pipelineCtx.researchUnverified = isUnverified;
  pipelineCtx.webGrounded = !isUnverified;
  await setLetterResearchUnverified(letterId, isUnverified);

  let citationRegistry = buildCitationRegistry(research);
  orchLogger.info({ letterId, count: citationRegistry.length, isUnverified }, "[Pipeline] Built citation registry");

  const citationTokens = createTokenAccumulator();
  const researchFromCache = opts?.researchFromCache ?? (researchProvider === "kv-cache");
  const allHighConfidence = citationRegistry.length > 0 && citationRegistry.every(r => r.confidence === "high");
  const skipRevalidation =
    citationRegistry.length === 0 ||
    citationRegistry.length < 3 ||
    isUnverified ||
    researchFromCache ||
    allHighConfidence;

  if (skipRevalidation) {
    const reasons: string[] = [];
    if (citationRegistry.length === 0) reasons.push("no citations");
    if (citationRegistry.length > 0 && citationRegistry.length < 3) reasons.push(`only ${citationRegistry.length} citations (< 3 threshold)`);
    if (isUnverified) reasons.push(`research provider ${researchProvider} is not web-grounded`);
    if (researchFromCache) reasons.push("research served from KV cache (already validated)");
    if (allHighConfidence) reasons.push("all citations already high confidence");
    orchLogger.info({ letterId, reasons }, "[Pipeline] Skipping citation revalidation");
  } else {
    const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
    const revalResult = await revalidateCitationsWithOpenAI(
      citationRegistry, jurisdiction, letterId, citationTokens
    );
    citationRegistry = revalResult.registry;
    pipelineCtx.citationRevalidationModelKey = revalResult.modelKey;
  }
  pipelineCtx.citationRegistry = citationRegistry;
  pipelineCtx.citationRevalidationTokens = citationTokens;
}

// ═══════════════════════════════════════════════════════
// INTERMEDIATE CONTENT REGISTRY
// Tracks the best draft content produced so far per letter.
// Populated progressively as pipeline stages complete so the worker
// can pass it to bestEffortFallback after retry exhaustion.
// ═══════════════════════════════════════════════════════

const _intermediateContentRegistry = new Map<number, { content: string; qualityWarnings: string[] }>();

/** Read and clear the registry entry for a letter. Called by the worker. */
export function consumeIntermediateContent(letterId: number): { content?: string; qualityWarnings: string[] } {
  const entry = _intermediateContentRegistry.get(letterId);
  _intermediateContentRegistry.delete(letterId);
  return { content: entry?.content, qualityWarnings: entry?.qualityWarnings ?? [] };
}

// ═══════════════════════════════════════════════════════
// FULL PIPELINE ORCHESTRATOR
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
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    orchLogger.error({ letterId, errors: intakeCheck.errors }, "[Pipeline] Intake pre-flight failed");
    throw new PipelineError(
      PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
      `Intake validation failed: ${intakeCheck.errors.join("; ")}`,
      "pipeline",
      intakeCheck.errors.join("; ")
    );
  }

  // ── LangGraph Pipeline Routing ──────────────────────────────────────────────
  // Set PIPELINE_MODE=langgraph to use the new LangGraph-based pipeline.
  // This eliminates the need for pg-boss workers and n8n workflows.
  const useLangGraph = process.env.PIPELINE_MODE === "langgraph";
  if (useLangGraph) {
    orchLogger.info({ letterId }, "[Pipeline] Using LangGraph pipeline (PIPELINE_MODE=langgraph)");
    const result = await runLangGraphPipeline(letterId, intake, userId, isFreePreview);
    if (!result.success) {
      throw new PipelineError(
        (result.errorCode as PipelineErrorCode) ?? PIPELINE_ERROR_CODES.RESEARCH_PROVIDER_FAILED,
        result.error ?? "LangGraph pipeline failed",
        "pipeline"
      );
    }
    orchLogger.info({ letterId, hasLetter: !!result.vettedLetter }, "[Pipeline] LangGraph pipeline completed");
    return;
  }

  // ── Simple Pipeline Routing ──────────────────────────────────────────────────
  // Set PIPELINE_MODE=simple to use the ultra-simple Claude-only pipeline.
  // Single stage: intake → Claude → letter. No research, no vetting.
  const useSimple = process.env.PIPELINE_MODE === "simple";
  if (useSimple) {
    orchLogger.info({ letterId }, "[Pipeline] Using simple pipeline (PIPELINE_MODE=simple)");
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

  const normalizedInput = buildNormalizedPromptInput(
    dbFields ?? {
      subject: intake.matter?.subject ?? "Legal Matter",
      issueSummary: intake.matter?.description,
      jurisdictionCountry: intake.jurisdiction?.country,
      jurisdictionState: intake.jurisdiction?.state,
      jurisdictionCity: intake.jurisdiction?.city,
      letterType: intake.letterType,
    },
    intake
  );
  orchLogger.info({ letterId, letterType: normalizedInput.letterType, jurisdictionState: normalizedInput.jurisdiction.state }, "[Pipeline] Normalized intake");

  // ── Try n8n workflow first (primary path) ──────────────────────────────────
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL ?? "";
  const n8nCallbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";
  // ── Routing: Direct 4-stage pipeline is PRIMARY.
  // Set N8N_PRIMARY=true in env to route through n8n instead (useful for debugging/experimentation).
  const useN8nPrimary =
    process.env.N8N_PRIMARY === "true" &&
    !!n8nWebhookUrl &&
    n8nWebhookUrl.startsWith("https://");
  if (useN8nPrimary) {
    const pipelineJob = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "generation_pipeline",
      provider: "n8n",
      requestPayloadJson: {
        letterId,
        stages: ["n8n-sonar-research", "n8n-gpt4o-mini-draft", "n8n-gpt4o-mini-assembly", "n8n-sonnet-vetting"],
        normalizedInput,
      },
    });
    const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;
    await updateWorkflowJob(pipelineJobId, {
      status: "running",
      startedAt: new Date(),
    });
    await updateLetterStatus(letterId, "researching");

    try {
      orchLogger.info({ letterId, url: n8nWebhookUrl }, "[Pipeline] Triggering n8n workflow");
      const appBaseUrl =
        process.env.APP_BASE_URL ??
        "https://www.talk-to-my-lawyer.com";
      const callbackUrl = `${appBaseUrl}/api/pipeline/n8n-callback`;
      // We fire-and-forget the n8n webhook — the callback endpoint will handle the result
      const payload = {
        letterId,
        letterType: intake.letterType,
        userId: intake.sender?.name ?? "unknown",
        callbackUrl,
        callbackSecret: n8nCallbackSecret,
        intakeData: {
          sender: intake.sender,
          recipient: intake.recipient,
          jurisdictionState: intake.jurisdiction?.state ?? "",
          jurisdictionCountry: intake.jurisdiction?.country ?? "US",
          matter: intake.matter,
          desiredOutcome: intake.desiredOutcome,
          letterType: intake.letterType,
          tonePreference: intake.tonePreference,
          financials: intake.financials,
          additionalContext: intake.additionalContext,
        },
      };

      // Correct stale webhook URL path if needed
      const resolvedWebhookUrl = n8nWebhookUrl.includes("ttml-legal-pipeline")
        ? n8nWebhookUrl.replace(
            "ttml-legal-pipeline",
            "legal-letter-submission"
          )
        : n8nWebhookUrl;
      const response = await fetch(resolvedWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // n8n webhook uses headerAuth — the credential's header name is X-Auth-Token
          "X-Auth-Token": n8nCallbackSecret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10s to get acknowledgment
      });

      if (response.ok) {
        const ack = await response.json().catch(() => ({}));
        orchLogger.info({ letterId, ack }, "[Pipeline] n8n acknowledged");
        await updateWorkflowJob(pipelineJobId, {
          status: "running",
          responsePayloadJson: { ack, mode: "n8n-async" },
        });
        // n8n will call back when done — we return here and let the callback handle the rest
        return;
      } else {
        const errText = await response.text().catch(() => "unknown");
        orchLogger.warn({ letterId, status: response.status, errText }, "[Pipeline] n8n returned error — falling back to in-app pipeline");
        await updateWorkflowJob(pipelineJobId, {
          status: "failed",
          errorMessage: formatStructuredError(
            PIPELINE_ERROR_CODES.N8N_ERROR,
            `n8n returned ${response.status}`,
            "pipeline",
            errText
          ),
          completedAt: new Date(),
        });
      }
    } catch (n8nErr) {
      const n8nMsg = n8nErr instanceof Error ? n8nErr.message : String(n8nErr);
      orchLogger.warn({ letterId, err: n8nMsg }, "[Pipeline] n8n call failed — falling back to in-app pipeline");
    }
  } else {
    orchLogger.info({ letterId }, "[Pipeline] N8N_PRIMARY not set — using direct 4-stage pipeline (primary path)");
  }

  // ── API key preflight for direct pipeline (only when NOT routing through n8n) ──
  const apiCheck = preflightApiKeyCheck("full");
  if (!apiCheck.ok) {
    const msg = `API key preflight failed: ${apiCheck.missing.join("; ")}`;
    orchLogger.error({ letterId, err: msg }, "[Pipeline] API key preflight failed");
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
      stages: ["perplexity-sonar-research", "openai-gpt4o-mini-draft", "openai-gpt4o-mini-assembly", "anthropic-sonnet-vetting"],
      normalizedInput,
    },
  });
  const rawPipelineJobId = (pipelineJob as any)?.insertId;
  if (rawPipelineJobId == null) {
    orchLogger.warn({ letterId }, "[Pipeline] createWorkflowJob returned nullish insertId for pipeline job, falling back to jobId=0");
  }
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

    const { packet: research, provider: researchProvider } = await runResearchStage(letterId, intake, pipelineCtx);

    addValidationResult(pipelineCtx, {
      stage: "intake",
      check: "intake_completeness",
      passed: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    await applyResearchGroundingAndRevalidate(letterId, intake, researchProvider, research, pipelineCtx);

    const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
    // Capture the initial draft for best-effort fallback (both in-context and registry)
    pipelineCtx._intermediateDraftContent = draft.draftLetter;
    pipelineCtx.counterArguments = draft.counterArguments;
    _intermediateContentRegistry.set(letterId, { content: draft.draftLetter, qualityWarnings: pipelineCtx.qualityWarnings ?? [] });

    const { vettingResult, assemblyRetries } = await runAssemblyVettingLoop(
      letterId, intake, research, draft, pipelineCtx
    );
    // Assembly/vetting produced a higher-quality version — prefer it
    pipelineCtx._intermediateDraftContent = vettingResult.vettedLetter;
    _intermediateContentRegistry.set(letterId, { content: vettingResult.vettedLetter, qualityWarnings: pipelineCtx.qualityWarnings ?? [] });

    if (vettingResult.critical) {
      const criticalIssues = vettingResult.vettingReport.jurisdictionIssues
        .concat(vettingResult.vettingReport.citationsFlagged)
        .concat(vettingResult.vettingReport.factualIssuesFound);
      orchLogger.warn({ letterId, assemblyRetries, issues: criticalIssues }, "[Pipeline] Vetting critical issues — saving degraded draft and proceeding to generated_locked");
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      pipelineCtx.qualityWarnings.push(...criticalIssues.map(i => `VETTING_CRITICAL: ${i}`));
      pipelineCtx.qualityWarnings.push(`Vetting found critical issues after ${assemblyRetries} assembly retries. Attorney scrutiny required.`);
    }

    await finalizeLetterAfterVetting(letterId, vettingResult.vettedLetter, vettingResult.vettingReport, pipelineCtx);

    const citationRevalidationTokens = pipelineCtx.citationRevalidationTokens;
    const isDegraded = (pipelineCtx.qualityWarnings?.length ?? 0) > 0;
    await updateWorkflowJob(pipelineJobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: citationRevalidationTokens?.promptTokens ?? 0,
      completionTokens: citationRevalidationTokens?.completionTokens ?? 0,
      estimatedCostUsd: citationRevalidationTokens
        ? calculateCost(pipelineCtx.citationRevalidationModelKey ?? "llama-3.3-70b-versatile", citationRevalidationTokens)
        : "0",
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
        vettingReport: vettingResult.vettingReport,
        counterArguments: pipelineCtx.counterArguments,
        assemblyRetries,
        ragExampleCount: pipelineCtx.ragExampleCount ?? 0,
        ragSimilarityScores: pipelineCtx.ragSimilarityScores ?? [],
        ragAbGroup: pipelineCtx.ragAbGroup ?? "test",
        ragInjected: (pipelineCtx.ragExampleCount ?? 0) > 0,
        lessonCount: pipelineCtx.lessonCount ?? 0,
        ...(isDegraded && {
          qualityDegraded: true,
          degradationReasons: pipelineCtx.qualityWarnings,
        }),
      },
    });
    orchLogger.info({ letterId, vettingRisk: vettingResult.vettingReport.riskLevel, assemblyRetries }, "[Pipeline] Full 4-stage in-app pipeline completed");

    // ── Auto-unlock: if the letter was previously unlocked (paid/free),
    // skip generated_locked and go straight to pending_review ──
    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch (autoUnlockErr) {
      orchLogger.error({ err: autoUnlockErr, letterId }, "[Pipeline] Auto-unlock check failed (pipeline still succeeded)");
      captureServerException(autoUnlockErr, { tags: { component: "pipeline", error_type: "auto_unlock_failed" }, extra: { letterId } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    orchLogger.error({ letterId, err: msg }, "[Pipeline] Full pipeline failed");
    captureServerException(err, {
      tags: { pipeline_stage: "full_pipeline", letter_id: String(letterId) },
      extra: { pipelineJobId, errorMessage: msg },
    });
    const pipelineErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);

    // Parallelize: workflow job failure + status revert are independent
    await Promise.all([
      updateWorkflowJob(pipelineJobId, {
        status: "failed",
        errorMessage: formatStructuredError(pipelineErrCode, msg, "pipeline"),
        completedAt: new Date(),
      }),
      updateLetterStatus(letterId, "submitted"), // revert to allow retry
    ]);
    throw err instanceof PipelineError ? err : new PipelineError(pipelineErrCode, msg, "pipeline");
  }
}

// ═══════════════════════════════════════════════════════
// BEST-EFFORT FALLBACK (called by worker after retry exhaustion)
// ═══════════════════════════════════════════════════════
// Implementation extracted to ./fallback.ts — re-exported here for callers
// that import directly from orchestrator (e.g. worker.ts).
export { bestEffortFallback, autoAdvanceIfPreviouslyUnlocked, FALLBACK_EXCLUDED_CODES } from "./fallback";

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
      orchLogger.warn({ letterId }, "[Pipeline] Retry: intake was null/invalid in job data — recovered from database");
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
    orchLogger.error({ letterId, err: msg }, "[Pipeline] API key preflight failed for retry");
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
    orchLogger.warn({ letterId }, "[Pipeline] createWorkflowJob returned nullish insertId for retry job, falling back to jobId=0");
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
    draft: DraftOutput,
  ) => {
    pipelineCtx._intermediateDraftContent = draft.draftLetter;
    pipelineCtx.counterArguments = draft.counterArguments;
    _intermediateContentRegistry.set(letterId, { content: draft.draftLetter, qualityWarnings: pipelineCtx.qualityWarnings ?? [] });

    const { vettingResult, assemblyRetries } = await runAssemblyVettingLoop(
      letterId, intake, research, draft, pipelineCtx
    );
    pipelineCtx._intermediateDraftContent = vettingResult.vettedLetter;
    _intermediateContentRegistry.set(letterId, { content: vettingResult.vettedLetter, qualityWarnings: pipelineCtx.qualityWarnings ?? [] });

    if (vettingResult.critical) {
      const criticalIssues = vettingResult.vettingReport.jurisdictionIssues
        .concat(vettingResult.vettingReport.citationsFlagged)
        .concat(vettingResult.vettingReport.factualIssuesFound);
      orchLogger.warn({ letterId, assemblyRetries, issues: criticalIssues }, "[Pipeline] Retry vetting critical issues — saving degraded draft");
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      pipelineCtx.qualityWarnings.push(...criticalIssues.map(i => `VETTING_CRITICAL: ${i}`));
      pipelineCtx.qualityWarnings.push(`Vetting found critical issues after ${assemblyRetries} assembly retries. Attorney scrutiny required.`);
    }
    await finalizeLetterAfterVetting(letterId, vettingResult.vettedLetter, vettingResult.vettingReport, pipelineCtx);
    return vettingResult;
  };

  try {
    if (stage === "research") {
      await updateLetterStatus(letterId, "submitted", { force: true });
      const { packet: research, provider: researchProvider } = await runResearchStage(letterId, intake, pipelineCtx);
      await applyResearchGroundingAndRevalidate(letterId, intake, researchProvider, research, pipelineCtx);
      const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
      await runVettingAndFinalize(research, draft);
    } else {
      const latestResearch = await getLatestResearchRun(letterId);
      if (!latestResearch?.resultJson)
        throw new Error("No completed research run found for retry");
      const research = latestResearch.resultJson as ResearchPacket;
      const provider = latestResearch.provider ?? "perplexity";
      await applyResearchGroundingAndRevalidate(letterId, intake, provider, research, pipelineCtx, {
        researchFromCache: latestResearch.cacheHit === true,
      });
      await updateLetterStatus(letterId, "drafting", { force: true });
      const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
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
        ? calculateCost(pipelineCtx.citationRevalidationModelKey ?? "llama-3.3-70b-versatile", retryCitationTokens)
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
      errorMessage: formatStructuredError(retryErrCode, msg, "citation_revalidation"),
      completedAt: new Date(),
    });
    throw err;
  }
}

