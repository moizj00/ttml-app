import {
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
  getLetterRequestById as getLetterById,
  markPriorPipelineRunsSuperseded,
  setLetterResearchUnverified,
  getLatestResearchRun,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, PipelineContext, TokenUsage, PipelineErrorCode, ValidationResult } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
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
import { buildCitationRegistry, revalidateCitationsWithPerplexity } from "./citations";
import type { CitationRegistryEntry } from "../../shared/types";
import { runResearchStage } from "./research";
import { runDraftingStage } from "./drafting";
import { runAssemblyVettingLoop, finalizeLetterAfterVetting } from "./vetting";
import { triggerN8nPipeline, isN8nMcpConfigured } from "../n8nMcp";
import type { N8nPipelineResult, N8nVettingReport } from "../n8nMcp";

const orchLogger = createLogger({ module: "PipelineOrchestrator" });

// ═══════════════════════════════════════════════════════
// SHARED: Citation revalidation + grounding context setup
// Extracted to eliminate 3× duplication across runFullPipeline
// and both branches of retryPipelineFromStage.
// ═══════════════════════════════════════════════════════

const UNGROUNDED_PROVIDERS = new Set(["anthropic-fallback", "groq-oss-fallback", "synthetic-intake-fallback"]);

async function applyResearchGroundingAndRevalidate(
  letterId: number,
  intake: IntakeJson,
  researchProvider: string,
  research: ResearchPacket,
  pipelineCtx: PipelineContext,
  opts?: { researchFromCache?: boolean },
): Promise<void> {
  pipelineCtx.researchProvider = researchProvider;
  pipelineCtx.researchUnverified = UNGROUNDED_PROVIDERS.has(researchProvider);
  pipelineCtx.webGrounded = !UNGROUNDED_PROVIDERS.has(researchProvider);
  await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);

  let citationRegistry = buildCitationRegistry(research);
  orchLogger.info({ letterId, count: citationRegistry.length }, "[Pipeline] Built citation registry");

  const citationTokens = createTokenAccumulator();
  const researchFromCache = opts?.researchFromCache ?? (researchProvider === "kv-cache");
  const allHighConfidence = citationRegistry.length > 0 && citationRegistry.every(r => r.confidence === "high");
  const skipRevalidation =
    pipelineCtx.researchUnverified ||
    citationRegistry.length === 0 ||
    citationRegistry.length < 3 ||
    researchFromCache ||
    allHighConfidence;

  if (skipRevalidation) {
    const reasons: string[] = [];
    if (pipelineCtx.researchUnverified) reasons.push("research unverified");
    if (citationRegistry.length === 0) reasons.push("no citations");
    if (citationRegistry.length > 0 && citationRegistry.length < 3) reasons.push(`only ${citationRegistry.length} citations (< 3 threshold)`);
    if (researchFromCache) reasons.push("research served from KV cache (already validated)");
    if (allHighConfidence) reasons.push("all citations already high confidence");
    orchLogger.info({ letterId, reasons }, "[Pipeline] Skipping citation revalidation");
  } else {
    const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
    const revalResult = await revalidateCitationsWithPerplexity(
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
// N8N MCP SYNC RESULT HANDLER
// When n8n MCP returns results synchronously (not via callback),
// process them inline using the same logic as the callback handler.
// ═══════════════════════════════════════════════════════

async function processN8nSyncResult(
  letterId: number,
  result: N8nPipelineResult
): Promise<boolean> {
  const {
    researchPacket,
    draftOutput,
    assembledLetter,
    vettedLetter,
    vettingReport,
    researchOutput,
    draftContent,
    stages,
    bloatDetected,
    provider,
  } = result;

  const effectiveFinalLetter = vettedLetter || assembledLetter;
  const effectiveDraft = effectiveFinalLetter || draftOutput?.draftLetter || draftContent;

  if (!effectiveDraft) {
    orchLogger.warn({ letterId }, "[Pipeline] n8n MCP sync result has no draft content — will try fallback");
    return false;
  }

  const hasVetting = !!(vettedLetter && vettingReport);
  const isAligned = !!(researchPacket && draftOutput && assembledLetter);
  const providerTag = provider ?? (hasVetting ? "n8n-mcp-4stage" : isAligned ? "n8n-mcp-3stage" : "n8n-mcp-sync");

  const {
    createLetterVersion,
    updateLetterVersionPointers,
    logReviewAction,
    getLetterRequestById,
    hasLetterBeenPreviouslyUnlocked,
  } = await import("../db");
  const { runAssemblyStage } = await import("../pipeline");

  await updateLetterStatus(letterId, "drafting");
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "status_transition",
    noteText: `n8n MCP research complete (${providerTag}). Transitioning to drafting stage.`,
    fromStatus: "researching",
    toStatus: "drafting",
  });

  const draftVersion = await createLetterVersion({
    letterRequestId: letterId,
    versionType: "ai_draft",
    content: effectiveDraft,
    createdByType: "system",
    metadataJson: {
      provider: providerTag,
      stage: hasVetting ? "vetted_final" : isAligned ? "n8n-assembly" : "n8n-mcp-pipeline",
      researchSummary: researchPacket?.researchSummary ?? researchOutput?.substring(0, 2000),
      attorneyReviewSummary: draftOutput?.attorneyReviewSummary,
      openQuestions: draftOutput?.openQuestions,
      riskFlags: draftOutput?.riskFlags,
      stages,
      ...(hasVetting && vettingReport ? { vettingReport, bloatDetected: bloatDetected ?? 0 } : {}),
    },
  });

  const draftVersionId = (draftVersion as { insertId?: number })?.insertId ?? 0;
  await updateLetterVersionPointers(letterId, { currentAiDraftVersionId: draftVersionId });

  if (researchPacket?.researchSummary) {
    try {
      const researchMeta: Record<string, unknown> = {
        provider: providerTag,
        stage: "research",
        researchPacket: {
          jurisdictionProfile: researchPacket.jurisdictionProfile,
          issuesIdentified: researchPacket.issuesIdentified,
          applicableRulesCount: researchPacket.applicableRules?.length ?? 0,
          riskFlags: researchPacket.riskFlags,
          draftingConstraints: researchPacket.draftingConstraints,
        },
      };
      await createLetterVersion({
        letterRequestId: letterId,
        versionType: "ai_draft",
        content: researchPacket.researchSummary,
        createdByType: "system",
        metadataJson: researchMeta,
      });
      orchLogger.info({ letterId }, "[Pipeline] Research version stored from n8n MCP sync result");
    } catch (researchErr) {
      orchLogger.warn({ letterId, err: researchErr }, "[Pipeline] Failed to store research version from MCP sync");
    }
  }

  if (hasVetting && vettingReport) {
    orchLogger.info(
      { letterId, risk: vettingReport.riskLevel, changes: vettingReport.changesApplied?.length ?? 0 },
      "[Pipeline] Vetted letter stored from n8n MCP sync"
    );
  }

  let assemblyHandledEmails = false;

  if (isAligned || hasVetting) {
    const stageLabel = hasVetting ? "4-stage" : "3-stage";
    await updateLetterStatus(letterId, "generated_locked");
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "ai_pipeline_completed",
      noteText: `n8n MCP aligned ${stageLabel} pipeline complete (${(stages ?? []).join(" → ")}). ${hasVetting ? `Vetting: risk=${vettingReport!.riskLevel}, bloat_removed=${vettingReport!.bloatPhrasesRemoved?.length ?? 0}. ` : ""}Draft ready — awaiting subscriber payment for attorney review.`,
      fromStatus: "drafting",
      toStatus: "generated_locked",
    });
  } else {
    orchLogger.info({ letterId }, "[Pipeline] Legacy n8n MCP output — running local assembly stage");
    const letter = await getLetterRequestById(letterId);
    if (letter?.intakeJson) {
      try {
        const intake = letter.intakeJson as IntakeJson;

        const research: ResearchPacket = researchPacket ?? {
          researchSummary: researchOutput ?? "Research completed by n8n MCP pipeline.",
          jurisdictionProfile: {
            country: intake.jurisdiction?.country ?? "US",
            stateProvince: intake.jurisdiction?.state ?? "",
            city: intake.jurisdiction?.city ?? "",
            authorityHierarchy: ["Federal", "State", "Local"],
          },
          issuesIdentified: [intake.matter?.description?.substring(0, 200) ?? "Legal matter"],
          applicableRules: [{
            ruleTitle: "n8n Research Findings",
            ruleType: "statute",
            jurisdiction: intake.jurisdiction?.state ?? "",
            citationText: "See research summary",
            sectionOrRule: "N/A",
            summary: (researchOutput ?? "").substring(0, 500),
            sourceUrl: "",
            sourceTitle: "n8n MCP Pipeline Research",
            relevance: "Primary research from n8n pipeline",
            confidence: "medium" as const,
          }],
          localJurisdictionElements: [],
          factualDataNeeded: [],
          openQuestions: [],
          riskFlags: [],
          draftingConstraints: [],
        };

        const draft: DraftOutput = draftOutput ?? {
          draftLetter: draftContent ?? "",
          attorneyReviewSummary: "Draft generated by n8n MCP pipeline. Please review carefully.",
          openQuestions: [],
          riskFlags: [],
        };

        await runAssemblyStage(letterId, intake, research, draft);
        assemblyHandledEmails = true;
        orchLogger.info({ letterId }, "[Pipeline] Local assembly complete from n8n MCP sync result");
      } catch (assemblyErr) {
        const assemblyMsg = assemblyErr instanceof Error ? assemblyErr.message : String(assemblyErr);
        orchLogger.warn({ letterId, err: assemblyMsg }, "[Pipeline] Local assembly failed — using n8n draft as final");
        await updateLetterStatus(letterId, "generated_locked");
        await logReviewAction({
          letterRequestId: letterId,
          actorType: "system",
          action: "ai_pipeline_completed",
          noteText: `n8n MCP pipeline complete (${providerTag}). Local assembly skipped. Draft ready — awaiting subscriber payment for attorney review.`,
          fromStatus: "drafting",
          toStatus: "generated_locked",
        });
      }
    } else {
      await updateLetterStatus(letterId, "generated_locked");
      await logReviewAction({
        letterRequestId: letterId,
        actorType: "system",
        action: "ai_pipeline_completed",
        noteText: `n8n MCP pipeline complete (${providerTag}). Draft ready — awaiting subscriber payment for attorney review.`,
        fromStatus: "drafting",
        toStatus: "generated_locked",
      });
    }
  }

  if (!assemblyHandledEmails) {
    const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
    if (!wasAlreadyUnlocked) {
      orchLogger.info({ letterId }, "[Pipeline] Letter generated_locked — paywall email will fire via cron in ~10–15 min");
    } else {
      orchLogger.info({ letterId }, "[Pipeline] Skipping paywall email — previously unlocked");
    }

    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch (autoUnlockErr) {
      orchLogger.error({ letterId, err: autoUnlockErr }, "[Pipeline] Auto-unlock check failed");
    }
  }

  orchLogger.info({ letterId, providerTag }, "[Pipeline] n8n MCP sync result processed successfully");
  return true;
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

  const canResearch = hasPerplexity;
  const canDraft = hasOpenAI || hasAnthropic;

  if (!canResearch) {
    missing.push("Research provider unavailable (PERPLEXITY_API_KEY required — Perplexity is the sole research provider)");
  }
  if ((stage === "drafting" || stage === "full") && !canDraft) {
    missing.push("No drafting provider available (need OPENAI_API_KEY or ANTHROPIC_API_KEY)");
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
  userId?: number
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
  const n8nCallbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";
  const useN8nPrimary = process.env.N8N_PRIMARY === "true";
  const n8nMcpConfigured = isN8nMcpConfigured();
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL ?? "";
  const hasWebhookFallback = !!n8nWebhookUrl && n8nWebhookUrl.startsWith("https://");

  if (useN8nPrimary && (n8nMcpConfigured || hasWebhookFallback)) {
    const pipelineJob = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "generation_pipeline",
      provider: n8nMcpConfigured ? "n8n-mcp" : "n8n",
      requestPayloadJson: {
        letterId,
        stages: ["n8n-sonar-research", "n8n-gpt4o-mini-draft", "n8n-gpt4o-mini-assembly", "n8n-sonnet-vetting"],
        normalizedInput,
        transport: n8nMcpConfigured ? "mcp" : "webhook",
      },
    });
    const pipelineJobId = (pipelineJob as { insertId?: number })?.insertId ?? 0;
    await updateWorkflowJob(pipelineJobId, {
      status: "running",
      startedAt: new Date(),
    });
    await updateLetterStatus(letterId, "researching");

    const appBaseUrl =
      process.env.APP_BASE_URL ??
      "https://www.talk-to-my-lawyer.com";
    const callbackUrl = `${appBaseUrl}/api/pipeline/n8n-callback`;
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
      normalizedInput,
    };

    let n8nSuccess = false;

    // ── Strategy 1: MCP transport (primary) ──────────────────────────────
    if (n8nMcpConfigured) {
      try {
        orchLogger.info({ letterId }, "[Pipeline] Triggering n8n workflow via MCP (primary path)");
        const mcpResult = await triggerN8nPipeline(payload);

        if (mcpResult.success) {
          orchLogger.info({ letterId, hasContent: !!mcpResult.content }, "[Pipeline] n8n MCP call succeeded");

          const mcpContent = mcpResult.content;
          const hasSyncResult = mcpContent &&
            typeof mcpContent === "object" &&
            typeof mcpContent !== "string" &&
            ("vettedLetter" in mcpContent || "assembledLetter" in mcpContent || "draftContent" in mcpContent);

          if (hasSyncResult) {
            orchLogger.info({ letterId }, "[Pipeline] n8n MCP returned synchronous results — processing inline");
            const syncProcessed = await processN8nSyncResult(letterId, mcpContent as N8nPipelineResult);
            if (syncProcessed) {
              await updateWorkflowJob(pipelineJobId, {
                status: "completed",
                responsePayloadJson: { mode: "n8n-mcp-sync", content: mcpContent },
                completedAt: new Date(),
              });
              n8nSuccess = true;
            } else {
              orchLogger.warn({ letterId }, "[Pipeline] n8n MCP sync result unusable — trying fallback");
              await updateWorkflowJob(pipelineJobId, {
                status: "failed",
                errorMessage: formatStructuredError(
                  PIPELINE_ERROR_CODES.N8N_ERROR,
                  "n8n MCP returned sync result but no usable draft content",
                  "pipeline",
                  "Falling back to webhook or in-app pipeline"
                ),
                completedAt: new Date(),
              });
            }
          } else {
            orchLogger.info({ letterId }, "[Pipeline] n8n MCP acknowledged — awaiting async callback");
            await updateWorkflowJob(pipelineJobId, {
              status: "running",
              responsePayloadJson: { mode: "n8n-mcp-async", ack: mcpContent },
            });
            n8nSuccess = true;
          }
        } else {
          orchLogger.warn({ letterId, err: mcpResult.content }, "[Pipeline] n8n MCP call returned error");
        }
      } catch (mcpErr) {
        const mcpMsg = mcpErr instanceof Error ? mcpErr.message : String(mcpErr);
        orchLogger.warn({ letterId, err: mcpMsg }, "[Pipeline] n8n MCP call failed");
      }
    }

    // ── Strategy 2: Legacy webhook fallback ──────────────────────────────
    if (!n8nSuccess && hasWebhookFallback) {
      try {
        orchLogger.info({ letterId, url: n8nWebhookUrl }, "[Pipeline] Falling back to n8n webhook");
        const resolvedWebhookUrl = n8nWebhookUrl.includes("ttml-legal-pipeline")
          ? n8nWebhookUrl.replace("ttml-legal-pipeline", "legal-letter-submission")
          : n8nWebhookUrl;
        const response = await fetch(resolvedWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": n8nCallbackSecret,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const ack = await response.json().catch(() => ({}));
          orchLogger.info({ letterId, ack }, "[Pipeline] n8n webhook acknowledged");
          await updateWorkflowJob(pipelineJobId, {
            status: "running",
            responsePayloadJson: { ack, mode: "n8n-webhook-async" },
          });
          n8nSuccess = true;
        } else {
          const errText = await response.text().catch(() => "unknown");
          orchLogger.warn({ letterId, status: response.status, errText }, "[Pipeline] n8n webhook returned error");
        }
      } catch (webhookErr) {
        const webhookMsg = webhookErr instanceof Error ? webhookErr.message : String(webhookErr);
        orchLogger.warn({ letterId, err: webhookMsg }, "[Pipeline] n8n webhook call failed");
      }
    }

    if (n8nSuccess) {
      return;
    }

    orchLogger.warn({ letterId }, "[Pipeline] All n8n paths failed — falling back to in-app pipeline");
    await updateWorkflowJob(pipelineJobId, {
      status: "failed",
      errorMessage: formatStructuredError(
        PIPELINE_ERROR_CODES.N8N_ERROR,
        "All n8n paths (MCP + webhook) failed",
        "pipeline",
        "Falling back to in-app 4-stage pipeline"
      ),
      completedAt: new Date(),
    });
  } else {
    orchLogger.info({ letterId, useN8nPrimary, n8nMcpConfigured, hasWebhookFallback }, "[Pipeline] N8N_PRIMARY not set or not configured — using direct 4-stage pipeline");
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
  const rawPipelineJobId = (pipelineJob as { insertId?: number })?.insertId;
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
        ? calculateCost(pipelineCtx.citationRevalidationModelKey ?? "sonar", citationRevalidationTokens)
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
  const rawRetryJobId = (retryJob as { insertId?: number })?.insertId;
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
        ? calculateCost(pipelineCtx.citationRevalidationModelKey ?? "sonar", retryCitationTokens)
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

