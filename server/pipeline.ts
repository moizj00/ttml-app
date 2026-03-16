/**
 * Three-stage AI pipeline for legal letter generation:
 *
 * Stage 1: PERPLEXITY (sonar) — Legal research with web-grounded citations
 * Stage 2: ANTHROPIC (claude-opus-4-5) — Initial draft generation from research packet
 * Stage 3: ANTHROPIC (claude-opus-4-5) — Final professional letter assembly
 *
 * Each stage has deterministic validators before transitioning.
 * All stages log to workflow_jobs and research_runs for audit trail.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import {
  createLetterVersion,
  createResearchRun,
  createWorkflowJob,
  getLatestResearchRun,
  hasLetterBeenPreviouslyUnlocked,
  logReviewAction,
  markPriorPipelineRunsSuperseded,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateResearchRun,
  updateWorkflowJob,
} from "./db";
import type { IntakeJson, ResearchPacket, DraftOutput } from "../shared/types";
import {
  buildNormalizedPromptInput,
  type NormalizedPromptInput,
} from "./intake-normalizer";
import { sendLetterReadyEmail, sendStatusUpdateEmail, sendNewReviewNeededEmail } from "./email";
import { getUserById, getLetterRequestById as getLetterById, getAllUsers } from "./db";
import { captureServerException } from "./sentry";

// ═══════════════════════════════════════════════════════
// MODEL PROVIDERS
// ═══════════════════════════════════════════════════════

// ── Anthropic (Claude) — direct API, used for Stage 2 (draft) and Stage 3 (assembly) ──
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[Pipeline] ANTHROPIC_API_KEY is not set — cannot run drafting or assembly stages"
    );
  }
  return createAnthropic({ apiKey });
}

/** Stage 1: Perplexity sonar-pro — web-grounded legal research (direct API) */
function getResearchModel() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      "[Pipeline] PERPLEXITY_API_KEY is not set — falling back to Claude for research"
    );
    const anthropic = getAnthropicClient();
    return {
      model: anthropic("claude-opus-4-5"),
      provider: "anthropic-fallback",
    };
  }
  // Perplexity is OpenAI-compatible — use @ai-sdk/openai with custom baseURL
  const perplexity = createOpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
    name: "perplexity",
  });
  return { model: perplexity.chat("sonar-pro"), provider: "perplexity" };
}

/** Stage 2: Anthropic claude-opus-4-5 — initial legal draft (direct Anthropic API) */
function getDraftModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-opus-4-5");
}

/** Stage 3: Anthropic claude-opus-4-5 — final polished letter assembly (direct Anthropic API) */
function getAssemblyModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-opus-4-5");
}

// Timeout constants (ms)
const RESEARCH_TIMEOUT_MS = 90_000; // 90s — Perplexity web search can be slow
const DRAFT_TIMEOUT_MS = 120_000; // 120s — Claude drafting a full legal letter
const ASSEMBLY_TIMEOUT_MS = 120_000; // 120s — Claude final assembly

// ═══════════════════════════════════════════════════════
// DETERMINISTIC VALIDATORS
// ═══════════════════════════════════════════════════════

export function validateResearchPacket(data: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data || typeof data !== "object")
    return {
      valid: false,
      errors: ["Research packet is not an object"],
      warnings,
    };
  const p = data as Record<string, unknown>;

  // ── Hard requirements (fail validation if missing) ──
  if (
    !p.researchSummary ||
    typeof p.researchSummary !== "string" ||
    p.researchSummary.length < 50
  )
    errors.push("researchSummary must be a non-empty string (min 50 chars)");
  if (!p.jurisdictionProfile || typeof p.jurisdictionProfile !== "object")
    errors.push("jurisdictionProfile is required");
  if (!Array.isArray(p.issuesIdentified) || p.issuesIdentified.length === 0)
    errors.push("issuesIdentified must be a non-empty array");
  if (!Array.isArray(p.applicableRules))
    errors.push("applicableRules must be an array");
  else {
    if (p.applicableRules.length === 0)
      errors.push("applicableRules must be a non-empty array");
    (p.applicableRules as unknown[]).forEach((rule, i) => {
      if (!rule || typeof rule !== "object") {
        errors.push(`applicableRules[${i}] is not an object`);
        return;
      }
      const r = rule as Record<string, unknown>;
      if (!r.ruleTitle)
        errors.push(`applicableRules[${i}].ruleTitle is required`);
      if (!r.summary) errors.push(`applicableRules[${i}].summary is required`);
    });
  }
  if (!Array.isArray(p.draftingConstraints))
    errors.push("draftingConstraints must be an array");

  // ── Soft warnings for new 8-task research fields (backwards compatible) ──
  if (
    !Array.isArray(p.recentCasePrecedents) ||
    p.recentCasePrecedents.length === 0
  )
    warnings.push(
      "recentCasePrecedents missing — drafting stage will proceed without case law citations"
    );
  if (!p.statuteOfLimitations || typeof p.statuteOfLimitations !== "object")
    warnings.push(
      "statuteOfLimitations missing — letter will not include SOL analysis"
    );
  if (!p.preSuitRequirements || typeof p.preSuitRequirements !== "object")
    warnings.push(
      "preSuitRequirements missing — letter may miss mandatory pre-suit notice requirements"
    );
  if (!p.availableRemedies || typeof p.availableRemedies !== "object")
    warnings.push(
      "availableRemedies missing — damages paragraph will be generic"
    );
  if (!Array.isArray(p.commonDefenses) || p.commonDefenses.length === 0)
    warnings.push(
      "commonDefenses missing — letter will not pre-empt anticipated defenses"
    );
  if (!p.enforcementClimate || typeof p.enforcementClimate !== "object")
    warnings.push(
      "enforcementClimate missing — letter will not reference AG/enforcement activity"
    );

  if (warnings.length > 0) {
    console.warn(
      `[Pipeline] Research packet soft warnings: ${warnings.join("; ")}`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function parseAndValidateDraftLlmOutput(raw: string): {
  valid: boolean;
  data?: DraftOutput;
  errors: string[];
} {
  const errors: string[] = [];
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If not JSON, treat raw text as the letter content
    if (raw.trim().length > 100) {
      return {
        valid: true,
        data: {
          draftLetter: raw.trim(),
          attorneyReviewSummary:
            "AI-generated draft — please review carefully.",
          openQuestions: [],
          riskFlags: [],
        },
        errors: [],
      };
    }
    return {
      valid: false,
      errors: ["Could not parse draft output as JSON or plain text"],
    };
  }

  if (!parsed || typeof parsed !== "object")
    return { valid: false, errors: ["Draft output is not an object"] };
  const d = parsed as Record<string, unknown>;
  if (
    !d.draftLetter ||
    typeof d.draftLetter !== "string" ||
    d.draftLetter.length < 100
  )
    errors.push("draftLetter must be a non-empty string (min 100 chars)");
  if (!d.attorneyReviewSummary || typeof d.attorneyReviewSummary !== "string")
    errors.push("attorneyReviewSummary is required");
  if (!Array.isArray(d.openQuestions))
    errors.push("openQuestions must be an array");
  if (!Array.isArray(d.riskFlags)) errors.push("riskFlags must be an array");

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: parsed as DraftOutput, errors: [] };
}

export function validateFinalLetter(text: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!text || text.length < 200)
    errors.push("Final letter must be at least 200 characters");
  if (
    !text.includes("Dear") &&
    !text.includes("To Whom") &&
    !text.includes("RE:") &&
    !text.includes("Re:")
  )
    errors.push(
      "Final letter should contain a proper salutation or subject line"
    );
  if (
    !text.includes("Sincerely") &&
    !text.includes("Respectfully") &&
    !text.includes("Very truly yours") &&
    !text.includes("Regards")
  )
    errors.push("Final letter should contain a proper closing");
  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════
// STAGE 1: PERPLEXITY LEGAL RESEARCH
// ═══════════════════════════════════════════════════════

export async function runResearchStage(
  letterId: number,
  intake: IntakeJson
): Promise<ResearchPacket> {
  const researchConfig = getResearchModel();
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "research",
    provider: researchConfig.provider,
    requestPayloadJson: {
      letterId,
      letterType: intake.letterType,
      jurisdiction: intake.jurisdiction,
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
  await updateLetterStatus(letterId, "researching");

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

  try {
    console.log(
      `[Pipeline] Stage 1: ${researchConfig.provider} 8-task deep research for letter #${letterId}`
    );
    const { text } = await generateText({
      model: researchConfig.model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 6000,
      abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
    });

    // Parse research packet from response
    let researchPacket: ResearchPacket;
    try {
      const jsonMatch =
        text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        text.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      researchPacket = JSON.parse(jsonStr);
    } catch {
      // Build a structured packet from the text response
      researchPacket = {
        researchSummary: text.substring(0, 2000),
        jurisdictionProfile: {
          country: intake.jurisdiction.country,
          stateProvince: intake.jurisdiction.state,
          city: intake.jurisdiction.city,
          authorityHierarchy: ["Federal", "State", "Local"],
        },
        issuesIdentified: [intake.matter.description.substring(0, 200)],
        applicableRules: [
          {
            ruleTitle: "General Legal Framework",
            ruleType: "statute",
            jurisdiction: intake.jurisdiction.state,
            citationText: "See research summary",
            sectionOrRule: "N/A",
            summary: text.substring(0, 300),
            sourceUrl: "",
            sourceTitle: "Perplexity Research",
            relevance: "Primary research findings",
            confidence: "medium" as const,
          },
        ],
        localJurisdictionElements: [],
        factualDataNeeded: [],
        openQuestions: [],
        riskFlags: [],
        draftingConstraints: [],
      };
    }

    // Deterministic validation
    const validation = validateResearchPacket(researchPacket);
    if (!validation.valid) {
      await updateResearchRun(runId, {
        status: "invalid",
        resultJson: researchPacket,
        validationResultJson: { errors: validation.errors },
        errorMessage: `Validation failed: ${validation.errors.join("; ")}`,
      });
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: `Research validation failed: ${validation.errors.join("; ")}`,
        completedAt: new Date(),
      });
      throw new Error(
        `Research packet validation failed: ${validation.errors.join("; ")}`
      );
    }

    await updateResearchRun(runId, {
      status: "completed",
      resultJson: researchPacket,
      validationResultJson: { valid: true, errors: [] },
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: { researchRunId: runId },
    });

    console.log(`[Pipeline] Stage 1 complete for letter #${letterId}`);
    return researchPacket;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 1 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "research", letter_id: String(letterId) },
      extra: { researchRunId: runId, jobId, errorMessage: msg },
    });
    await updateResearchRun(runId, { status: "failed", errorMessage: msg });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// STAGE 2: OPENAI DRAFT GENERATION
// ═══════════════════════════════════════════════════════

export async function runDraftingStage(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket
): Promise<DraftOutput> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "draft_generation",
    provider: "anthropic",
    requestPayloadJson: { letterId, letterType: intake.letterType },
  });
  const jobId = (job as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });
  await updateLetterStatus(letterId, "drafting");

  // Build normalized intake for the drafting prompt
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
  const draftSystemPrompt = buildDraftingSystemPrompt();
  // Look up the target word count for this letter type from the shared config
  const { LETTER_TYPE_CONFIG } = await import("../shared/types");
  const letterTypeConfig = LETTER_TYPE_CONFIG[intake.letterType];
  const targetWordCount = letterTypeConfig?.targetWordCount ?? 450;
  console.log(
    `[Pipeline] Stage 2: targetWordCount=${targetWordCount} for letterType=${intake.letterType}`
  );
  const draftUserPrompt = buildDraftingUserPrompt(
    normalizedIntake,
    targetWordCount,
    research as any
  );

  try {
    console.log(
      `[Pipeline] Stage 2: Claude structured drafting for letter #${letterId}`
    );
    const { text } = await generateText({
      model: getDraftModel(),
      system: draftSystemPrompt,
      prompt: draftUserPrompt,
      maxOutputTokens: 8000,
      abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });

    const validation = parseAndValidateDraftLlmOutput(text);
    if (!validation.valid || !validation.data) {
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: `Draft validation failed: ${validation.errors.join("; ")}`,
        completedAt: new Date(),
      });
      throw new Error(
        `Draft output validation failed: ${validation.errors.join("; ")}`
      );
    }

    const draft = validation.data;

    // Store AI draft as a letter version
    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: draft.draftLetter,
      createdByType: "system",
      metadataJson: {
        provider: "anthropic",
        stage: "draft_generation",
        attorneyReviewSummary: draft.attorneyReviewSummary,
        openQuestions: draft.openQuestions,
        riskFlags: draft.riskFlags,
        reviewNotes: draft.reviewNotes,
      },
    });
    const versionId = (version as any)?.insertId ?? 0;

    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: versionId,
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: { versionId },
    });

    console.log(`[Pipeline] Stage 2 complete for letter #${letterId}`);
    return draft;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 2 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "drafting", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    throw err;
  }
}
// ═══════════════════════════════════════════════════════
// STAGE 3: CLAUDE FINAL LETTER ASSEMBLYY
// ═══════════════════════════════════════════════════════

export async function runAssemblyStage(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput
): Promise<string> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "draft_generation", // reuse type, differentiated by provider
    provider: "anthropic",
    requestPayloadJson: { letterId, stage: "final_assembly" },
  });
  const jobId = (job as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });

  const assemblySystem = buildAssemblySystemPrompt();
  const assemblyUser = buildAssemblyUserPrompt(intake, research, draft);

  try {
    console.log(
      `[Pipeline] Stage 3: Claude final assembly for letter #${letterId}`
    );
    const { text: finalLetter } = await generateText({
      model: getAssemblyModel(),
      system: assemblySystem,
      prompt: assemblyUser,
      maxOutputTokens: 10000,
      abortSignal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS),
    });

    // Validate the final letter
    const validation = validateFinalLetter(finalLetter);
    if (!validation.valid) {
      console.warn(
        `[Pipeline] Stage 3 validation warnings for letter #${letterId}:`,
        validation.errors
      );
      // Non-fatal: still store it but log the warnings
    }

    // Store the assembled letter as a new AI draft version (replaces the Stage 2 draft)
    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: finalLetter,
      createdByType: "system",
      metadataJson: {
        provider: "anthropic",
        stage: "final_assembly",
        assembledFrom: {
          researchProvider: "perplexity",
          draftProvider: "anthropic",
        },
        validationWarnings:
          validation.errors.length > 0 ? validation.errors : undefined,
      },
    });
    const versionId = (version as any)?.insertId ?? 0;

    // Update the AI draft pointer to the final assembled version
    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: versionId,
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: { versionId },
    });

    // All letters always go to generated_locked.
    // The paywall (billing.checkPaywallStatus) determines whether the user
    // sees "Claim Free Review" or "Pay $200" — no intermediate status needed.
    const letterRecord = await getLetterById(letterId);
    const finalStatus = "generated_locked" as const;

    await updateLetterStatus(letterId, finalStatus);
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "ai_pipeline_completed",
      noteText: `Draft ready. Our legal team has completed research (Perplexity) and drafting (Anthropic). Submit for attorney review to receive your finalised letter.`,
      noteVisibility: "user_visible",
      fromStatus: "drafting",
      toStatus: finalStatus,
    });
    // Send "letter ready" email to subscriber (non-blocking)
    // Skip this paywall-style email for previously-unlocked letters — they will
    // get a pending_review notification from autoAdvanceIfPreviouslyUnlocked instead.
    const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
    if (!wasAlreadyUnlocked) {
      (() => {
        const record = letterRecord;
        if (!record) return;
        getUserById(record.userId)
          .then(async subscriber => {
            const appBaseUrl =
              process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
            if (subscriber?.email) {
              await sendLetterReadyEmail({
                to: subscriber.email,
                name: subscriber.name ?? "Subscriber",
                subject: record.subject,
                letterId,
                appUrl: appBaseUrl,
                letterType: record.letterType ?? undefined,
                jurisdictionState: record.jurisdictionState ?? undefined,
              });
              console.log(
                `[Pipeline] Letter-ready email sent to ${subscriber.email} for letter #${letterId}`
              );
            }
          })
          .catch(emailErr =>
            console.error(
              `[Pipeline] Failed to send letter-ready email for #${letterId}:`,
              emailErr
            )
          );
      })();
    } else {
      console.log(
        `[Pipeline] Skipping letter-ready (paywall) email for #${letterId} — previously unlocked`
      );
    }
    console.log(
      `[Pipeline] Stage 3 complete for letter #${letterId} — status: ${finalStatus} (awaiting payment/review)`
    );
    return finalLetter;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 3 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "assembly", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    throw err;
  }
}
// ═══════════════════════════════════════════════════════
// FULL PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════

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
  }
): Promise<void> {
  // Normalize intake using canonical helper
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
  console.log(
    `[Pipeline] Normalized intake for letter #${letterId}: letterType=${normalizedInput.letterType}, jurisdiction=${normalizedInput.jurisdiction.state}`
  );

  // ── Try n8n workflow first (primary path) ──────────────────────────────────
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL ?? "";
  const n8nCallbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";
  // ── Routing: Direct 3-stage pipeline is PRIMARY.
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
        stages: ["n8n-perplexity-research", "n8n-openai-draft"],
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
      console.log(
        `[Pipeline] Triggering n8n workflow for letter #${letterId}: ${n8nWebhookUrl}`
      );
      const callbackUrl = `${process.env.BUILT_IN_FORGE_API_URL ? "" : ""}/api/pipeline/n8n-callback`;
      // We fire-and-forget the n8n webhook — the callback endpoint will handle the result
      const payload = {
        letterId,
        letterType: intake.letterType,
        userId: intake.sender?.name ?? "unknown",
        callbackUrl:
          callbackUrl ||
          `https://www.talk-to-my-lawyer.com/api/pipeline/n8n-callback`,
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
        console.log(`[Pipeline] n8n acknowledged letter #${letterId}:`, ack);
        await updateWorkflowJob(pipelineJobId, {
          status: "running",
          responsePayloadJson: { ack, mode: "n8n-async" },
        });
        // n8n will call back when done — we return here and let the callback handle the rest
        return;
      } else {
        const errText = await response.text().catch(() => "unknown");
        console.warn(
          `[Pipeline] n8n returned ${response.status} for letter #${letterId}: ${errText}. Falling back to in-app pipeline.`
        );
        await updateWorkflowJob(pipelineJobId, {
          status: "failed",
          errorMessage: `n8n returned ${response.status}: ${errText}`,
          completedAt: new Date(),
        });
      }
    } catch (n8nErr) {
      const n8nMsg = n8nErr instanceof Error ? n8nErr.message : String(n8nErr);
      console.warn(
        `[Pipeline] n8n call failed for letter #${letterId}: ${n8nMsg}. Falling back to in-app pipeline.`
      );
    }
  } else {
    console.log(
      `[Pipeline] N8N_PRIMARY not set — using direct 3-stage pipeline (primary path) for letter #${letterId}`
    );
  }

  // ── Mark stale pipeline runs as superseded before starting fresh ──────────
  await markPriorPipelineRunsSuperseded(letterId);

  // ── Fallback: In-app 3-stage pipeline ─────────────────────────────────────
  const pipelineJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "generation_pipeline",
    provider: "multi-provider",
    requestPayloadJson: {
      letterId,
      stages: ["perplexity-research", "anthropic-draft", "anthropic-assembly"],
      normalizedInput,
    },
  });
  const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;
  await updateWorkflowJob(pipelineJobId, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    // Stage 1: Perplexity Research
    const research = await runResearchStage(letterId, intake);

    // Stage 2: OpenAI Draft
    const draft = await runDraftingStage(letterId, intake, research);

    // Stage 3: Claude Final Assembly
    await runAssemblyStage(letterId, intake, research, draft);

    await updateWorkflowJob(pipelineJobId, {
      status: "completed",
      completedAt: new Date(),
    });
    console.log(
      `[Pipeline] Full 3-stage in-app pipeline completed for letter #${letterId}`
    );

    // ── Auto-unlock: if the letter was previously unlocked (paid/free),
    // skip generated_locked and go straight to pending_review ──
    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch (autoUnlockErr) {
      console.error(
        `[Pipeline] Auto-unlock check failed for letter #${letterId} (pipeline still succeeded):`,
        autoUnlockErr
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Pipeline] Full pipeline failed for letter #${letterId}:`,
      msg
    );
    captureServerException(err, {
      tags: { pipeline_stage: "full_pipeline", letter_id: String(letterId) },
      extra: { pipelineJobId, errorMessage: msg },
    });
    await updateWorkflowJob(pipelineJobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    await updateLetterStatus(letterId, "submitted"); // revert to allow retry
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// AUTO-ADVANCE (previously unlocked letters skip paywall)
// ═══════════════════════════════════════════════════════

export async function autoAdvanceIfPreviouslyUnlocked(
  letterId: number
): Promise<boolean> {
  const wasUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
  if (!wasUnlocked) {
    console.log(
      `[Pipeline] Letter #${letterId} has not been previously unlocked — staying at generated_locked`
    );
    return false;
  }

  console.log(
    `[Pipeline] Letter #${letterId} was previously unlocked — auto-advancing to pending_review`
  );
  await updateLetterStatus(letterId, "pending_review");
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "auto_unlock",
    noteText:
      "Letter was previously unlocked (paid/free). Automatically advanced to pending_review after re-pipeline.",
    noteVisibility: "user_visible",
    fromStatus: "generated_locked",
    toStatus: "pending_review",
  });

  const letterRecord = await getLetterById(letterId);
  if (letterRecord) {
    const appBaseUrl =
      process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
    const subscriber = await getUserById(letterRecord.userId);
    if (subscriber?.email) {
      sendStatusUpdateEmail({
        to: subscriber.email,
        name: subscriber.name ?? "Subscriber",
        subject: letterRecord.subject,
        letterId,
        newStatus: "pending_review",
        appUrl: appBaseUrl,
      }).catch(err =>
        console.error(
          `[Pipeline] Failed to send pending_review email for #${letterId}:`,
          err
        )
      );
    }
    const attorneys = await getAllUsers("attorney");
    for (const attorney of attorneys) {
      if (attorney.email) {
        sendNewReviewNeededEmail({
          to: attorney.email,
          name: attorney.name ?? "Attorney",
          letterSubject: letterRecord.subject,
          letterId,
          letterType: letterRecord.letterType,
          jurisdiction: letterRecord.jurisdictionState ?? "Unknown",
          appUrl: appBaseUrl,
        }).catch(err =>
          console.error(
            `[Pipeline] Failed to notify attorney for #${letterId}:`,
            err
          )
        );
      }
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════
// RETRY LOGIC
// ═══════════════════════════════════════════════════════

export async function retryPipelineFromStage(
  letterId: number,
  intake: IntakeJson,
  stage: "research" | "drafting"
): Promise<void> {
  const retryJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "retry",
    provider: "multi-provider",
    requestPayloadJson: { letterId, stage },
  });
  const retryJobId = (retryJob as any)?.insertId ?? 0;
  await updateWorkflowJob(retryJobId, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    if (stage === "research") {
      // Full re-run from research
      const research = await runResearchStage(letterId, intake);
      const draft = await runDraftingStage(letterId, intake, research);
      await runAssemblyStage(letterId, intake, research, draft);
    } else {
      // Re-run from drafting using existing research
      const latestResearch = await getLatestResearchRun(letterId);
      if (!latestResearch?.resultJson)
        throw new Error("No completed research run found for retry");
      const research = latestResearch.resultJson as ResearchPacket;
      const draft = await runDraftingStage(letterId, intake, research);
      await runAssemblyStage(letterId, intake, research, draft);
    }
    await updateWorkflowJob(retryJobId, {
      status: "completed",
      completedAt: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateWorkflowJob(retryJobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// STAGE 1 PROMPT — PERPLEXITY LEGAL RESEARCH
// Split into system + user so Perplexity's search engine
// knows its role before reading the case details.
// ═══════════════════════════════════════════════════════

export function buildResearchSystemPrompt(): string {
  return `You are an elite legal research engine with real-time web search access. 
Your sole mission is to find REAL, CURRENT, VERIFIABLE legal information — not 
summaries, not approximations, not hallucinated statutes.

## Your Research Standards

REAL COURT DECISIONS: You must find actual case law with real case names, 
docket numbers, courts, and years. Example format: 
"Smith v. Jones, 2022 WL 4839201 (Cal. App. 4th 2022)" or 
"Green v. ABC Corp., 187 F.3d 129 (9th Cir. 2021)". 
If you cannot find a real case, say so — never invent citations.

REAL STATUTES: Cite actual code sections with their exact title, chapter, 
and section numbers. Example: "California Civil Code § 1950.5(b)" or 
"Texas Property Code § 92.104". Verify the section is still in effect.

LOCAL ORDINANCES: Search specifically for the city and county named. 
Local ordinances often provide stronger protections or additional requirements 
than state law and are frequently overlooked.

POLITICAL & ENFORCEMENT CONTEXT: Report the current enforcement climate — 
which party controls the relevant legislature, whether the state AG has 
active enforcement campaigns in this area, and any recent legislative 
changes (passed in the last 3 years) that affect this issue.

RECENT EXAMPLES: Find 2–3 real reported cases from the specific state or 
federal circuit covering this jurisdiction decided in the last 5 years. 
Prioritize cases where the fact pattern is similar to the matter described.

JURISDICTIONAL HIERARCHY: Always research in this order:
1. Specific city/county ordinances and local rules
2. State statutes and state administrative regulations  
3. Federal law (if applicable)
4. Relevant federal circuit and state appellate court decisions

STATUTE OF LIMITATIONS: Always find the exact filing deadline for this 
type of claim in this specific state. This is non-negotiable — missing 
it could destroy the client's case.

PRE-SUIT REQUIREMENTS: Many states require demand letters, waiting periods, 
or notice filings before suit. Find the exact requirement for this 
jurisdiction and claim type.

## What You Must NEVER Do
- Invent case names, docket numbers, or statute sections
- Use placeholder citations like "see generally" without a real cite
- Ignore local ordinances in favor of only state/federal law
- Give national averages when jurisdiction-specific data exists
- Use data older than 5 years without flagging it as potentially outdated`;
}

export function buildResearchUserPrompt(intake: NormalizedPromptInput): string {
  const jurisdiction = [
    intake.jurisdiction.city,
    intake.jurisdiction.state,
    intake.jurisdiction.country,
  ]
    .filter(Boolean)
    .join(", ");

  const financialsLine = intake.financials?.amountOwed
    ? `Amount in dispute: $${intake.financials.amountOwed.toLocaleString()} ${intake.financials.currency}`
    : null;

  const today = new Date().toISOString().split("T")[0];

  return `## Legal Matter Requiring Research
Today's date: ${today}

**Letter Type:** ${intake.letterType.replace(/-/g, " ").toUpperCase()}
**Matter Category:** ${intake.matterCategory}
**Jurisdiction (CRITICAL — research must be specific to this location):**
  - Country: ${intake.jurisdiction.country}
  - State/Province: ${intake.jurisdiction.state}
  - City/County: ${intake.jurisdiction.city ?? "Not specified — use state level"}
**Subject:** ${intake.matter.subject}
**Incident Date:** ${intake.matter.incidentDate ?? "Not specified"}
${financialsLine ? `**${financialsLine}**` : ""}
**Desired Outcome:** ${intake.desiredOutcome}
${intake.deadlineDate ? `**Client's Deadline:** ${intake.deadlineDate}` : ""}
${intake.tonePreference === "aggressive" ? "**Note:** Client wants aggressive legal posture — research maximum available remedies including attorney fees, punitive damages, and statutory penalties." : ""}

## Case Facts
${intake.matter.description}

${intake.additionalContext ? `## Additional Context Provided by Client\n${intake.additionalContext}` : ""}

${intake.evidenceSummary ? `## Evidence Available\n${intake.evidenceSummary}` : ""}

${intake.timeline.length > 0 ? `## Timeline of Events\n${intake.timeline.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : ""}

---

## Research Tasks — Complete ALL of the following:

### Task 1: Jurisdiction-Specific Statutes
Search for the primary state statute(s) governing this type of matter in 
**${intake.jurisdiction.state}**. Find the exact code section numbers, 
current text, and any relevant subsections. Check if there have been 
amendments in the last 3 years.

### Task 2: Local Ordinances
Search for **${intake.jurisdiction.city ?? intake.jurisdiction.state}** 
city or county ordinances that apply to this matter. Many municipalities 
have stronger tenant protections, consumer protections, or employer 
obligations than state law.

### Task 3: Real Court Decisions (State + Federal)
Find 2–4 real court decisions from **${intake.jurisdiction.state}** state 
courts OR the relevant federal circuit that cover this exact type of dispute. 
Prioritize decisions from 2019–${new Date().getFullYear()}. Include:
- Full case name and citation
- Court name and year
- The specific holding and how it applies to this matter
- Any damages or remedies awarded

### Task 4: Statute of Limitations
Find the EXACT statute of limitations for this type of claim in 
**${intake.jurisdiction.state}**. Include:
- The specific statute that sets the deadline
- The exact time period
- When the clock starts (discovery rule vs. incident date)
- Any tolling exceptions that might apply here

### Task 5: Pre-Suit Requirements & Demand Letter Rules
Does **${intake.jurisdiction.state}** require a formal demand letter, 
waiting period, or administrative filing before a lawsuit can be filed 
for this type of matter? Find the exact statutory requirement including:
- Required content of any demand notice
- Mandatory waiting period before suit
- Method of delivery required (certified mail, etc.)
- Penalties for failing to send proper notice

### Task 6: Available Remedies & Damages
What specific remedies are available in **${intake.jurisdiction.state}** 
for this type of claim? Research:
- Actual damages formula
- Statutory damages (if any — many consumer/tenant statutes have per-violation amounts)
- Attorney's fees availability (one-way or two-way fee shifting?)
- Punitive damages standard in this state
- Any statutory multipliers (2x, 3x damages)

### Task 7: Political & Enforcement Climate
Research the current enforcement environment in **${intake.jurisdiction.state}**:
- Has the state Attorney General recently pursued cases in this area?
- Are there any active class actions or mass litigation in this jurisdiction for this issue type?
- Any recent legislation (passed since 2022) that strengthened or weakened these protections?
- Which political party controls the relevant regulatory bodies and legislature, and how does that affect enforcement likelihood?

### Task 8: Jurisdiction-Specific Defenses
What are the most common defenses raised by the opposing party 
(${intake.recipient.name}) in ${intake.jurisdiction.state} for this 
type of matter? List the top 3–4 and note which are typically successful.

---

## Required Output Format

Return ONLY a valid JSON object. No markdown outside the JSON. 
No explanatory text before or after. Start with { and end with }.

\`\`\`json
{
  "researchSummary": "3–4 paragraphs covering: (1) the legal landscape in ${intake.jurisdiction.state} for this matter type, (2) the strongest statutes and cases found, (3) the enforcement/political climate, (4) key risks and strategic observations. Minimum 300 words.",
  
  "jurisdictionProfile": {
    "country": "${intake.jurisdiction.country}",
    "stateProvince": "${intake.jurisdiction.state}",
    "city": "${intake.jurisdiction.city ?? ""}",
    "authorityHierarchy": ["Federal", "State — ${intake.jurisdiction.state}", "County", "City — ${intake.jurisdiction.city ?? "N/A"}"],
    "politicalContext": "Who controls the legislature and AG office, enforcement climate, recent relevant legislation",
    "localCourts": "Name of the specific trial court, small claims limit, and relevant local rules for ${intake.jurisdiction.city ?? intake.jurisdiction.state}"
  },
  
  "issuesIdentified": [
    "Specific legal issue 1 — cite the statute or doctrine",
    "Specific legal issue 2"
  ],
  
  "applicableRules": [
    {
      "ruleTitle": "Exact name of statute, regulation, or case",
      "ruleType": "statute | regulation | case_law | local_ordinance | common_law",
      "jurisdiction": "${intake.jurisdiction.state} | Federal | ${intake.jurisdiction.city ?? "Local"}",
      "citationText": "EXACT citation — e.g. Cal. Civ. Code § 1950.5 or Smith v. Jones, 156 F.3d 129 (9th Cir. 2023)",
      "sectionOrRule": "Specific section or subsection number",
      "summary": "Plain English: what this rule says and exactly how it applies to THIS case",
      "sourceUrl": "Direct URL to official source, Westlaw, Lexis, or government website",
      "sourceTitle": "Official source name — e.g. California Legislative Information, Cornell LII, Justia",
      "relevance": "Specific sentence explaining how this rule supports or affects this exact matter",
      "dateVerified": "YYYY-MM",
      "confidence": "high | medium | low",
      "caseOutcome": "For case_law only — what happened to the plaintiff and what damages/relief were awarded"
    }
  ],
  
  "recentCasePrecedents": [
    {
      "caseName": "Full case name",
      "citation": "Full citation with court and year",
      "court": "Exact court name",
      "year": 2023,
      "facts": "1–2 sentences on the relevant facts",
      "holding": "What the court decided",
      "relevance": "Why this case matters for this specific matter",
      "damages": "Dollar amount or remedy awarded if reported",
      "sourceUrl": "Justia, Google Scholar, or official court URL"
    }
  ],
  
  "statuteOfLimitations": {
    "period": "e.g. 2 years",
    "statute": "Exact code section",
    "clockStartsOn": "Incident date | Discovery of harm | Last payment | etc.",
    "deadlineEstimate": "Approximate deadline based on ${intake.matter.incidentDate ?? "incident date unknown"}",
    "tollingExceptions": ["Exception 1", "Exception 2"],
    "urgencyFlag": false,
    "notes": "Any unusual SOL rules for this claim type in this state"
  },
  
  "preSuitRequirements": {
    "demandLetterRequired": false,
    "statute": "Code section if required",
    "waitingPeriodDays": 30,
    "requiredContent": ["What the demand letter must include"],
    "deliveryMethod": "Certified mail | Personal service | etc.",
    "penaltyForNonCompliance": "What happens if you skip this step"
  },
  
  "availableRemedies": {
    "actualDamages": "Description and formula",
    "statutoryDamages": "Amount per violation if applicable",
    "punitiveDamages": "Standard and likelihood in ${intake.jurisdiction.state}",
    "attorneyFees": "One-way | Two-way | Not available — cite the statute",
    "injunctiveRelief": "Available | Not applicable",
    "multiplier": "2x | 3x | None — cite authority"
  },
  
  "localJurisdictionElements": [
    {
      "element": "Specific local rule, ordinance, or court practice",
      "whyItMatters": "How this changes the strategy or strengthens the letter",
      "sourceUrl": "URL to local government or court site",
      "confidence": "high | medium | low"
    }
  ],
  
  "enforcementClimate": {
    "agActivity": "Recent AG enforcement actions in this area",
    "classActions": "Any active class actions in this jurisdiction on this issue",
    "recentLegislation": "Laws passed since 2022 that affect this matter",
    "politicalLeaning": "How the current political environment affects enforcement",
    "courtReputations": "Anything notable about how local courts handle this type of case"
  },
  
  "commonDefenses": [
    {
      "defense": "Defense name",
      "description": "How the opposing party typically argues this",
      "counterArgument": "How to pre-empt or rebut this in the demand letter",
      "successRate": "Typically successful | Rarely successful | Depends on facts"
    }
  ],
  
  "factualDataNeeded": [
    "Specific missing fact that would strengthen the legal position"
  ],
  
  "openQuestions": [
    "Unresolved legal question relevant to this matter"
  ],
  
  "riskFlags": [
    "Specific risk — e.g. SOL may have run, client may have waived rights, etc."
  ],
  
  "draftingConstraints": [
    "Specific requirement the letter draft must include — e.g. must reference Cal. Civ. Code § 1950.5, must demand response within 30 days per statutory requirement"
  ]
}
\`\`\``;
}

function buildDraftingSystemPrompt(): string {
  return `You are a senior litigation attorney at a top-tier law firm with 20 years of experience 
drafting demand letters, cease and desist notices, and pre-litigation correspondence. 
You have won cases by writing letters so precise, well-cited, and strategically framed 
that the opposing party settled before suit was filed.

## Your Drafting Philosophy

EVERY legal claim must cite a real, specific statute or case from the research packet.
Never write "under applicable law" or "pursuant to relevant statutes." 
Name the law. Cite the section. That specificity is what makes opposing counsel take the letter seriously.

STRUCTURE IS STRATEGY. The order of your paragraphs is deliberate:
1. Establish facts the recipient cannot dispute
2. State the legal basis they cannot ignore  
3. Quantify the exposure they want to avoid
4. Make a demand that gives them a face-saving exit
5. State the consequence of non-compliance in cold, factual terms

PRE-EMPT DEFENSES. If the research packet identifies common defenses, 
address and neutralize them in the letter body. Don't wait for them to raise it — 
take it off the table first.

LEVERAGE ENFORCEMENT CLIMATE. If the research shows active AG enforcement, 
pending class actions, or recent legislative changes that favor the sender, 
reference these in the letter. "The California Attorney General has recently 
pursued identical claims under this statute" is worth more than three legal citations.

STATUTE OF LIMITATIONS AWARENESS. If the SOL is approaching or has unusual 
tolling rules, the letter must reflect that urgency without sounding desperate.

TONE CALIBRATION:
- firm: Professional, serious, no hedging — makes clear suit will follow. No threats, just facts.
- moderate: Firm but leaves a clear door open for resolution. Good for ongoing relationships.
- aggressive: Maximum legal pressure. References every available remedy, mentions AG/regulatory 
  referral as an explicit option, demands a short response window. Still professional — 
  aggressive does not mean unprofessional.

## Output Format Rules

Return ONLY a valid JSON object. Nothing before the opening brace. Nothing after the closing brace.
No markdown code fences outside the JSON values. No apologies. No commentary.
The draftLetter value must be plain text with \\n for line breaks �� no markdown inside it.`;
}

function buildDraftingUserPrompt(
  intake: NormalizedPromptInput,
  targetWordCount: number,
  research: ResearchPacket & {
    recentCasePrecedents?: {
      caseName: string;
      citation: string;
      court: string;
      year: number;
      facts: string;
      holding: string;
      relevance: string;
      damages?: string;
    }[];
    statuteOfLimitations?: {
      period: string;
      statute: string;
      clockStartsOn: string;
      deadlineEstimate?: string;
      urgencyFlag?: boolean;
      notes?: string;
    };
    preSuitRequirements?: {
      demandLetterRequired: boolean;
      statute?: string;
      waitingPeriodDays?: number;
      requiredContent?: string[];
      deliveryMethod?: string;
      consequenceOfNonCompliance?: string;
    };
    availableRemedies?: {
      actualDamages?: string;
      statutoryDamages?: string;
      punitiveDamages?: string;
      attorneyFees?: string;
      injunctiveRelief?: string;
      multiplier?: string;
    };
    commonDefenses?: {
      defense: string;
      description: string;
      counterArgument: string;
      successRate: string;
    }[];
    enforcementClimate?: {
      agActivity?: string;
      classActions?: string;
      recentLegislation?: string;
      politicalLeaning?: string;
    };
    jurisdictionProfile: {
      country: string;
      stateProvince: string;
      city?: string;
      authorityHierarchy: string[];
      politicalContext?: string;
      localCourts?: string;
    };
  }
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ── Build a clean, curated context string rather than raw JSON dump ──

  // Top 6 most relevant rules, ranked by confidence
  const topRules = [...research.applicableRules]
    .sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[a.confidence] ?? 2) - (order[b.confidence] ?? 2);
    })
    .slice(0, 6);

  const rulesBlock = topRules
    .map(
      r =>
        `- [${r.ruleType.toUpperCase()}] ${r.ruleTitle} | Citation: ${r.citationText} | Section: ${r.sectionOrRule}
    Summary: ${r.summary}
    Relevance to this case: ${r.relevance}
    Source: ${r.sourceTitle} (${r.sourceUrl})`
    )
    .join("\n\n");

  const casesBlock =
    research.recentCasePrecedents
      ?.slice(0, 3)
      .map(
        c =>
          `- ${c.caseName} (${c.citation})
    Court: ${c.court} | Year: ${c.year}
    Facts: ${c.facts}
    Holding: ${c.holding}
    Relevance here: ${c.relevance}${c.damages ? `\n    Damages awarded: ${c.damages}` : ""}`
      )
      .join("\n\n") ?? "No specific cases retrieved.";

  const solBlock = research.statuteOfLimitations
    ? `Statute of limitations: ${research.statuteOfLimitations.period} (${research.statuteOfLimitations.statute})
Clock starts: ${research.statuteOfLimitations.clockStartsOn}
${research.statuteOfLimitations.deadlineEstimate ? `Estimated deadline: ${research.statuteOfLimitations.deadlineEstimate}` : ""}
${research.statuteOfLimitations.urgencyFlag ? "⚠ URGENCY FLAG: SOL may be approaching — letter must convey time sensitivity" : ""}
${research.statuteOfLimitations.notes ?? ""}`
    : "Statute of limitations data not available.";

  const preSuitBlock = research.preSuitRequirements
    ? `Formal demand letter required: ${research.preSuitRequirements.demandLetterRequired ? "YES" : "No"}
${research.preSuitRequirements.statute ? `Governing statute: ${research.preSuitRequirements.statute}` : ""}
${research.preSuitRequirements.waitingPeriodDays ? `Required waiting period: ${research.preSuitRequirements.waitingPeriodDays} days before filing suit` : ""}
${research.preSuitRequirements.deliveryMethod ? `Required delivery method: ${research.preSuitRequirements.deliveryMethod}` : ""}
${research.preSuitRequirements.requiredContent?.length ? `Letter must include: ${research.preSuitRequirements.requiredContent.join("; ")}` : ""}
${research.preSuitRequirements.consequenceOfNonCompliance ? `Consequence of skipping: ${research.preSuitRequirements.consequenceOfNonCompliance}` : ""}`
    : "No special pre-suit requirements identified.";

  const remediesBlock = research.availableRemedies
    ? `Actual damages: ${research.availableRemedies.actualDamages ?? "N/A"}
Statutory damages: ${research.availableRemedies.statutoryDamages ?? "N/A"}
Attorney fees: ${research.availableRemedies.attorneyFees ?? "N/A"}
Punitive damages: ${research.availableRemedies.punitiveDamages ?? "N/A"}
Multiplier: ${research.availableRemedies.multiplier ?? "None"}
Injunctive relief: ${research.availableRemedies.injunctiveRelief ?? "N/A"}`
    : "Remedies data not available.";

  const defensesBlock =
    research.commonDefenses
      ?.slice(0, 3)
      .map(
        d =>
          `- Defense: ${d.defense}
    How they argue it: ${d.description}
    How to pre-empt it: ${d.counterArgument}
    Success rate: ${d.successRate}`
      )
      .join("\n\n") ?? "No common defenses identified.";

  const enforcementBlock = research.enforcementClimate
    ? [
        research.enforcementClimate.agActivity
          ? `AG Activity: ${research.enforcementClimate.agActivity}`
          : null,
        research.enforcementClimate.classActions
          ? `Active class actions: ${research.enforcementClimate.classActions}`
          : null,
        research.enforcementClimate.recentLegislation
          ? `Recent legislation: ${research.enforcementClimate.recentLegislation}`
          : null,
        research.enforcementClimate.politicalLeaning
          ? `Enforcement climate: ${research.enforcementClimate.politicalLeaning}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "No enforcement climate data.";

  const financialsLine = intake.financials?.amountOwed
    ? `$${intake.financials.amountOwed.toLocaleString()} ${intake.financials.currency}`
    : null;

  // Calculate response deadline for letter body
  const responseDeadlineDays =
    intake.tonePreference === "aggressive"
      ? 10
      : intake.tonePreference === "moderate"
        ? 21
        : 14;

  const responseDeadlineDate = new Date(
    Date.now() + responseDeadlineDays * 24 * 60 * 60 * 1000
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `## Matter Summary
Letter Type: ${intake.letterType.replace(/-/g, " ").toUpperCase()}
Category: ${intake.matterCategory}
Date: ${today}
Tone Required: ${intake.tonePreference.toUpperCase()}
Language Required: ${intake.language.toUpperCase()}
Response Deadline to use in letter: ${responseDeadlineDate} (${responseDeadlineDays} days from today)

## Parties
SENDER (your client):
  Name: ${intake.sender.name}
  Address: ${intake.sender.address}
  ${intake.sender.email ? `Email: ${intake.sender.email}` : ""}
  ${intake.sender.phone ? `Phone: ${intake.sender.phone}` : ""}

RECIPIENT (opposing party):
  Name: ${intake.recipient.name}
  Address: ${intake.recipient.address}
  ${intake.recipient.email ? `Email: ${intake.recipient.email}` : ""}

## Jurisdiction
${intake.jurisdiction.city ? `City: ${intake.jurisdiction.city}` : ""}
State: ${intake.jurisdiction.state}
Country: ${intake.jurisdiction.country}
Local Court: ${research.jurisdictionProfile.localCourts ?? "State trial court"}
${research.jurisdictionProfile.politicalContext ? `Political Context: ${research.jurisdictionProfile.politicalContext}` : ""}

## Facts of the Matter
${intake.matter.description}
${intake.matter.incidentDate ? `\nIncident date: ${intake.matter.incidentDate}` : ""}
${financialsLine ? `Amount in dispute: ${financialsLine}` : ""}
${intake.desiredOutcome ? `\nDesired outcome: ${intake.desiredOutcome}` : ""}
${intake.deadlineDate ? `\nClient's hard deadline: ${intake.deadlineDate}` : ""}
${intake.additionalContext ? `\nAdditional context: ${intake.additionalContext}` : ""}
${intake.evidenceSummary ? `\nEvidence available: ${intake.evidenceSummary}` : ""}

${
  intake.timeline.length > 0
    ? `## Chronology of Events\n${intake.timeline.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}`
    : ""
}

---

## Legal Foundation (from Perplexity Research)

### Applicable Statutes and Case Law
${rulesBlock}

### Recent Precedents From This Jurisdiction
${casesBlock}

### Statute of Limitations Analysis
${solBlock}

### Pre-Suit Requirements
${preSuitBlock}

### Available Remedies and Damages
${remediesBlock}

### Enforcement Climate
${enforcementBlock}

### Anticipated Defenses (Pre-empt These in the Letter)
${defensesBlock}

### Research Summary
${research.researchSummary}

### Risk Flags From Research
${research.riskFlags.length > 0 ? research.riskFlags.map((f: string) => `- ${f}`).join("\n") : "None identified."}

### Required Drafting Constraints
${research.draftingConstraints.length > 0 ? research.draftingConstraints.map((c: string) => `- ${c}`).join("\n") : "Standard professional format."}

---

## Drafting Instructions

Write a complete, professional ${intake.letterType.replace(/-/g, " ")} following 
this exact structure. Every instruction below is mandatory.

**STRUCTURE:**

1. HEADER BLOCK (no label, just formatting):
   [Today's date: ${today}]
   [blank line]
   ${intake.deliveryMethod === "certified_mail" ? "VIA CERTIFIED MAIL" : ""}
   [blank line]
   [Sender's full name and address — left-aligned]
   [blank line]
   [Recipient's full name and address — left-aligned]
   [blank line]
   RE: [Concise subject line that names the legal claim and the statute if applicable]
   [blank line]
   Dear [Recipient's appropriate title and last name, or "To Whom It May Concern" if unknown]:

2. OPENING PARAGRAPH — Purpose and Standing:
   Identify who the sender is, the purpose of the letter, and the legal basis in 
   one clear paragraph. Reference the primary statute by name and section number. 
   This paragraph must immediately signal this is a serious legal communication, 
   not a complaint.
   ${
     research.preSuitRequirements?.demandLetterRequired
       ? `\n   REQUIRED: This letter serves as the formal statutory demand required by 
   ${research.preSuitRequirements.statute ?? "applicable law"} prior to initiating legal proceedings.
   ${research.preSuitRequirements.waitingPeriodDays ? `The mandatory ${research.preSuitRequirements.waitingPeriodDays}-day waiting period will begin upon delivery of this notice.` : ""}`
       : ""
   }

3. FACTS PARAGRAPH(S) — Undisputed Record:
   State the factual chronology in plain, neutral language. Use dates where 
   available. Every fact stated must be something the recipient cannot dispute 
   without lying — stick to observable events, communications, and omissions.
   ${intake.timeline.length > 0 ? "Use the chronology of events provided above." : ""}
   ${intake.priorCommunication ? `Reference prior communication: ${intake.priorCommunication}` : ""}

4. LEGAL BASIS PARAGRAPH(S) — Statute + Case Law:
   This is the most important section. Cite at minimum 2 specific statutes or 
   regulations from the research packet by full name and section number.
   ${
     topRules.length > 0
       ? `You MUST reference these specific authorities:
   ${topRules
     .slice(0, 3)
     .map(r => `- ${r.ruleTitle}: ${r.citationText}`)
     .join("\n   ")}`
       : ""
   }
   ${
     research.recentCasePrecedents && research.recentCasePrecedents.length > 0
       ? `\n   Cite at least one of these real court decisions to show how courts have ruled:
   ${research.recentCasePrecedents
     .slice(0, 2)
     .map(c => `- ${c.caseName}, ${c.citation} — ${c.holding}`)
     .join("\n   ")}`
       : ""
   }
   
   Pre-empt defenses here. Address any of the following anticipated defenses 
   and neutralize them with legal authority:
   ${
     research.commonDefenses && research.commonDefenses.length > 0
       ? research.commonDefenses
           .slice(0, 2)
           .map(d => `- ${d.defense}: ${d.counterArgument}`)
           .join("\n   ")
       : "No specific defenses to pre-empt."
   }

5. DAMAGES / EXPOSURE PARAGRAPH — What Is at Stake:
   Quantify the full legal exposure clearly. Reference all applicable remedies.
   ${
     research.availableRemedies
       ? `Include:
   ${research.availableRemedies.actualDamages ? `- Actual damages: ${research.availableRemedies.actualDamages}` : ""}
   ${research.availableRemedies.statutoryDamages ? `- Statutory damages: ${research.availableRemedies.statutoryDamages}` : ""}
   ${research.availableRemedies.attorneyFees ? `- Attorney's fees: ${research.availableRemedies.attorneyFees}` : ""}
   ${research.availableRemedies.multiplier && research.availableRemedies.multiplier !== "None" ? `- Damage multiplier: ${research.availableRemedies.multiplier}` : ""}
   ${financialsLine ? `- Primary damages sought: ${financialsLine}` : ""}`
       : financialsLine
         ? `Demand ${financialsLine} plus applicable statutory penalties and attorney's fees.`
         : "Quantify available remedies based on research findings."
   }
   ${
     enforcementBlock !== "No enforcement climate data." &&
     intake.tonePreference !== "moderate"
       ? `\n   Reference enforcement climate if relevant: ${research.enforcementClimate?.agActivity ?? ""}`
       : ""
   }

6. DEMAND PARAGRAPH — Specific, Numbered, Time-Bound:
   List each demand as a numbered item. Each demand must be specific and 
   measurable — no vague demands like "cease and desist." 
   State: "On or before ${responseDeadlineDate}, you must:"
   1. [Primary demand — specific action, amount, or document]
   2. [Secondary demand if applicable]
   3. [Written confirmation of compliance required]
   ${intake.desiredOutcome ? `\n   Client's stated outcome to incorporate: ${intake.desiredOutcome}` : ""}

7. CONSEQUENCE PARAGRAPH — If Demands Are Not Met:
   State plainly what legal action follows. Do not threaten — state facts.
   Tone-appropriate language:
   ${
     intake.tonePreference === "aggressive"
       ? `- "Failure to comply by the stated deadline will result in the immediate filing of a civil complaint in ${research.jurisdictionProfile.localCourts ?? "the appropriate court"}, seeking the full range of damages described above including statutory penalties, attorney's fees, and where applicable, punitive damages."
   - If AG enforcement is active, add: "Additionally, this matter will be referred to the ${intake.jurisdiction.state} Attorney General's office for investigation under [statute]."
   - If class actions are active, reference them.`
       : intake.tonePreference === "moderate"
         ? `- "In the event this matter is not resolved by the date stated above, we will have no choice but to pursue all available legal remedies, including but not limited to filing suit in ${research.jurisdictionProfile.localCourts ?? "the appropriate court"}. We remain open to discussion of a reasonable resolution."`
         : `- "If we do not receive your written compliance or a substantive response by ${responseDeadlineDate}, we will proceed with legal action without further notice."`
   }
   ${
     research.statuteOfLimitations?.urgencyFlag
       ? `\n   NOTE: Mention that the statute of limitations (${research.statuteOfLimitations.period}) creates urgency for prompt resolution.`
       : ""
   }

8. CLOSING:
   [One sentence inviting written response]
   [blank line]
   ${intake.tonePreference === "aggressive" ? "Very truly yours," : intake.tonePreference === "moderate" ? "Respectfully yours," : "Sincerely,"}
   [blank line]
   [blank line]
   [Sender's full name]
   ${intake.sender.address}
   ${intake.sender.email ? `Email: ${intake.sender.email}` : ""}
   ${intake.sender.phone ? `Phone: ${intake.sender.phone}` : ""}

---

## JSON Output Required

Return this exact structure:

{
  "draftLetter": "The complete letter text as described above. Use \\n for line breaks. No markdown. Plain text only. The letter must be complete — no placeholders, no [INSERT HERE] gaps. Target length: approximately ${targetWordCount} words (±15%). Do not pad with filler — every sentence must add legal value.",
  
  "attorneyReviewSummary": "A 2–3 paragraph memo to the reviewing attorney covering: (1) which statutes and cases were cited and why they were chosen, (2) the legal theory being advanced and its strength in ${intake.jurisdiction.state}, (3) any gaps in the client's stated facts that should be confirmed before sending, (4) whether the demand amount is supported by available remedies.",
  
  "openQuestions": [
    "Specific factual question the attorney should ask the client before approving — e.g. 'Client should confirm they have documentation of [specific item]'",
    "..."
  ],

  "reviewNotes": "Stage 2 Focus: This is an initial draft. Focus on legal accuracy and completeness. An attorney will review and polish this later.",
  
  "riskFlags": [
    "Specific legal risk — e.g. '${research.statuteOfLimitations?.urgencyFlag ? `SOL urgency: ${research.statuteOfLimitations.period} from ${research.statuteOfLimitations.clockStartsOn}` : "Verify all factual claims are documented before sending"}'",
    "..."
  ]
} `;
}

function buildAssemblySystemPrompt(): string {
  return `You are the managing partner of a top-tier law firm performing the FINAL quality review 
of a legal letter before it goes to the reviewing attorney. Your job is to take the Stage 2 draft 
and produce a polished, print-ready letter that meets the highest professional standards.

## Your Assembly Philosophy

You are NOT rewriting the letter from scratch. The Stage 2 draft already contains the correct 
legal analysis, citations, and structure. Your job is to:

1. POLISH the language — eliminate any awkward phrasing, redundancy, or unclear sentences
2. VERIFY citation format — ensure every statute and case citation is properly formatted
3. STRENGTHEN weak paragraphs — if the demand is vague, sharpen it; if a legal argument 
   trails off, tighten it
4. ENSURE completeness — the letter must have every required section with no placeholders
5. FORMAT for print — proper spacing, paragraph breaks, and professional letter structure
6. PRE-EMPT DEFENSES — if the draft missed addressing a common defense from the research, 
   weave it in naturally
7. VERIFY TONE CONSISTENCY — the entire letter should maintain the requested tone from 
   opening to closing

## Critical Rules

- Output ONLY the final letter text. No JSON. No markdown code fences. No commentary.
- The letter must be complete and ready to print on letterhead.
- Every legal citation from the draft must be preserved and properly formatted.
- If the draft referenced case law, keep those references and ensure they're accurate.
- The letter must be minimum 800 words for demand letters, 600 words for cease and desist.
- Use plain text with line breaks. No markdown formatting inside the letter body.
- Include the full signature block with all sender contact information.`;
}

function buildAssemblyUserPrompt(
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const researchAny = research as any;

  // Build enriched research context for the assembly stage
  const rulesBlock = research.applicableRules
    .slice(0, 6)
    .map(r => `- ${r.ruleTitle}: ${r.summary} (${r.citationText})`)
    .join("\n");

  const casesBlock =
    researchAny.recentCasePrecedents
      ?.slice(0, 3)
      .map((c: any) => `- ${c.caseName} (${c.citation}) — ${c.holding}`)
      .join("\n") ?? "";

  const solBlock = researchAny.statuteOfLimitations
    ? `SOL: ${researchAny.statuteOfLimitations.period} (${researchAny.statuteOfLimitations.statute})${
        researchAny.statuteOfLimitations.urgencyFlag ? " ⚠ APPROACHING" : ""
      }`
    : "";

  const remediesBlock = researchAny.availableRemedies
    ? [
        researchAny.availableRemedies.actualDamages
          ? `Actual: ${researchAny.availableRemedies.actualDamages}`
          : null,
        researchAny.availableRemedies.statutoryDamages
          ? `Statutory: ${researchAny.availableRemedies.statutoryDamages}`
          : null,
        researchAny.availableRemedies.attorneyFees
          ? `Fees: ${researchAny.availableRemedies.attorneyFees}`
          : null,
        researchAny.availableRemedies.multiplier &&
        researchAny.availableRemedies.multiplier !== "None"
          ? `Multiplier: ${researchAny.availableRemedies.multiplier}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const defensesBlock =
    researchAny.commonDefenses
      ?.slice(0, 3)
      .map((d: any) => `- ${d.defense}: Pre-empt with: ${d.counterArgument}`)
      .join("\n") ?? "";

  const enforcementBlock = researchAny.enforcementClimate
    ? [
        researchAny.enforcementClimate.agActivity,
        researchAny.enforcementClimate.classActions,
        researchAny.enforcementClimate.recentLegislation,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const casesSection = casesBlock ? "### Case Precedents\n" + casesBlock : "";
  const solSection = solBlock ? "### Statute of Limitations\n" + solBlock : "";
  const remediesSection = remediesBlock ? "### Available Remedies\n" + remediesBlock : "";
  const defensesSection = defensesBlock ? "### Defenses to Pre-empt\n" + defensesBlock : "";
  const enforcementSection = enforcementBlock ? "### Enforcement Climate\n" + enforcementBlock : "";
  const senderEmail = intake.sender.email ? "Email: " + intake.sender.email : "";
  const senderPhone = intake.sender.phone ? "Phone: " + intake.sender.phone : "";
  const tone = intake.tonePreference ?? "firm";
  const step6 = researchAny.commonDefenses?.length > 0 ? "6. VERIFY all identified defenses are pre-empted in the letter body" : "";
  const step7 = researchAny.statuteOfLimitations?.urgencyFlag ? "7. ENSURE SOL urgency is reflected in the letter's timeline demands" : "";

  return "## Letter Context\n" +
    "Type: " + intake.letterType.replace(/-/g, " ").toUpperCase() + "\n" +
    "Date: " + today + "\n" +
    "Tone: " + tone + "\n" +
    "Language: " + (intake.language ?? "english") + "\n\n" +
    "## Parties\n" +
    "SENDER: " + intake.sender.name + ", " + intake.sender.address + "\n" +
    senderEmail + "\n" +
    senderPhone + "\n\n" +
    "RECIPIENT: " + intake.recipient.name + ", " + intake.recipient.address + "\n\n" +
    "## Research Foundation\n" +
    "### Key Statutes and Rules\n" +
    rulesBlock + "\n\n" +
    casesSection + "\n" +
    solSection + "\n" +
    remediesSection + "\n" +
    defensesSection + "\n" +
    enforcementSection + "\n\n" +
    "Research Summary: " + research.researchSummary + "\n" +
    "Risk Flags: " + (research.riskFlags.join("; ") || "None") + "\n" +
    "Drafting Constraints: " + (research.draftingConstraints.join("; ") || "Standard format") + "\n\n" +
    "## Stage 2 Draft (from Claude)\n" +
    draft.draftLetter + "\n\n" +
    "## Attorney Review Notes from Stage 2\n" +
    draft.attorneyReviewSummary + "\n\n" +
    "Open Questions: " + (draft.openQuestions.join("; ") || "None") + "\n" +
    "Risk Flags: " + (draft.riskFlags.join("; ") || "None") + "\n\n" +
    "## Assembly Instructions\n\n" +
    "Take the Stage 2 draft above and produce the FINAL letter. Your specific tasks:\n\n" +
    "1. PRESERVE all legal citations and case references from the draft — do not remove any\n" +
    "2. POLISH language: eliminate redundancy, tighten sentences, ensure professional tone throughout\n" +
    "3. VERIFY the letter has ALL required sections:\n" +
    "   - Date and addresses (use " + today + ")\n" +
    "   - RE: line with specific subject\n" +
    "   - Professional salutation\n" +
    "   - Opening paragraph establishing purpose and legal standing\n" +
    "   - Facts paragraph(s) with chronology\n" +
    "   - Legal basis paragraph(s) with specific citations\n" +
    "   - Damages/exposure paragraph quantifying consequences\n" +
    "   - Demand paragraph with numbered, specific, time-bound demands\n" +
    "   - Consequences paragraph stating what follows non-compliance\n" +
    "   - Professional closing with full signature block\n" +
    "4. STRENGTHEN any weak sections — if the demand is vague, make it specific; if a legal argument is thin, bolster it with additional citations from the research\n" +
    "5. ENSURE the tone is consistently " + tone + " throughout — no tone shifts mid-letter\n" +
    step6 + "\n" +
    step7 + "\n\n" +
    "OUTPUT ONLY THE FINAL LETTER TEXT. No JSON. No markdown code blocks. No commentary before or after.";
}
