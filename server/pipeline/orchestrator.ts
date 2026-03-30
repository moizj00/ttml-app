import {
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
  hasLetterBeenPreviouslyUnlocked,
  getLetterRequestById as getLetterById,
  getAllUsers,
  getUserById,
  logReviewAction,
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
import { sendLetterReadyEmail, sendStatusUpdateEmail, sendNewReviewNeededEmail } from "../email";
import { captureServerException } from "../sentry";
import { formatStructuredError, classifyErrorCode } from "./shared";
import { createTokenAccumulator, calculateCost } from "./providers";
import { validateIntakeCompleteness, addValidationResult } from "./validators";
import { buildCitationRegistry, revalidateCitationsWithPerplexity } from "./citations";
import { runResearchStage } from "./research";
import { runDraftingStage } from "./drafting";
import { runAssemblyVettingLoop, finalizeLetterAfterVetting } from "./vetting";

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
  },
  userId?: number
): Promise<void> {
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    console.error(
      `[Pipeline] Intake pre-flight failed for letter #${letterId}: ${intakeCheck.errors.join("; ")}`
    );
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
  console.log(
    `[Pipeline] Normalized intake for letter #${letterId}: letterType=${normalizedInput.letterType}, jurisdiction=${normalizedInput.jurisdiction.state}`
  );

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
      console.warn(
        `[Pipeline] n8n call failed for letter #${letterId}: ${n8nMsg}. Falling back to in-app pipeline.`
      );
    }
  } else {
    console.log(
      `[Pipeline] N8N_PRIMARY not set — using direct 4-stage pipeline (primary path) for letter #${letterId}`
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
      stages: ["perplexity-research", "anthropic-draft", "anthropic-assembly", "anthropic-vetting"],
      normalizedInput,
    },
  });
  const rawPipelineJobId = (pipelineJob as any)?.insertId;
  if (rawPipelineJobId == null) {
    console.warn(`[Pipeline] createWorkflowJob returned nullish insertId for pipeline job (letter #${letterId}), falling back to jobId=0`);
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
    pipelineCtx.researchProvider = researchProvider;
    pipelineCtx.researchUnverified = researchProvider === "anthropic-fallback";
    pipelineCtx.webGrounded = researchProvider !== "anthropic-fallback";
    await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);

    addValidationResult(pipelineCtx, {
      stage: "intake",
      check: "intake_completeness",
      passed: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    let citationRegistry = buildCitationRegistry(research);
    console.log(
      `[Pipeline] Built citation registry for letter #${letterId}: ${citationRegistry.length} citations extracted`
    );

    const citationTokens = createTokenAccumulator();
    if (!pipelineCtx.researchUnverified && citationRegistry.length > 0) {
      const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
      citationRegistry = await revalidateCitationsWithPerplexity(
        citationRegistry, jurisdiction, letterId, citationTokens
      );
    }
    pipelineCtx.citationRegistry = citationRegistry;
    if (pipelineCtx) {
      pipelineCtx.citationRevalidationTokens = citationTokens;
    }

    const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);

    const { vettingResult, assemblyRetries } = await runAssemblyVettingLoop(
      letterId, intake, research, draft, pipelineCtx
    );

    if (vettingResult.critical) {
      const failMsg = `Pipeline failed: vetting found critical issues after ${assemblyRetries} assembly retries for letter #${letterId}. Issues: ${vettingResult.vettingReport.jurisdictionIssues.concat(vettingResult.vettingReport.citationsFlagged).join("; ")}`;
      console.error(`[Pipeline] ${failMsg}`);
      throw new Error(failMsg);
    }

    await finalizeLetterAfterVetting(letterId, vettingResult.vettedLetter, vettingResult.vettingReport, pipelineCtx);

    const citationRevalidationTokens = pipelineCtx.citationRevalidationTokens;
    await updateWorkflowJob(pipelineJobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: citationRevalidationTokens?.promptTokens ?? 0,
      completionTokens: citationRevalidationTokens?.completionTokens ?? 0,
      estimatedCostUsd: citationRevalidationTokens
        ? calculateCost("sonar-pro", citationRevalidationTokens)
        : "0",
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
        vettingReport: vettingResult.vettingReport,
        assemblyRetries,
      },
    });
    console.log(
      `[Pipeline] Full 4-stage in-app pipeline completed for letter #${letterId} (vetting risk: ${vettingResult.vettingReport.riskLevel}, assembly retries: ${assemblyRetries})`
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
      captureServerException(autoUnlockErr, { tags: { component: "pipeline", error_type: "auto_unlock_failed" }, extra: { letterId } });
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
    const pipelineErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);
    await updateWorkflowJob(pipelineJobId, {
      status: "failed",
      errorMessage: formatStructuredError(pipelineErrCode, msg, "pipeline"),
      completedAt: new Date(),
    });
    await updateLetterStatus(letterId, "submitted"); // revert to allow retry
    throw err instanceof PipelineError ? err : new PipelineError(pipelineErrCode, msg, "pipeline");
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
    const subscriber = letterRecord.userId != null ? await getUserById(letterRecord.userId) : null;
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
  stage: "research" | "drafting",
  userId?: number
): Promise<void> {
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
    console.warn(`[Pipeline] createWorkflowJob returned nullish insertId for retry job (letter #${letterId}), falling back to jobId=0`);
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
    const { vettingResult, assemblyRetries } = await runAssemblyVettingLoop(
      letterId, intake, research, draft, pipelineCtx
    );
    if (vettingResult.critical) {
      throw new Error(`Retry pipeline failed: vetting critical issues after ${assemblyRetries} assembly retries`);
    }
    await finalizeLetterAfterVetting(letterId, vettingResult.vettedLetter, vettingResult.vettingReport, pipelineCtx);
    return vettingResult;
  };

  try {
    if (stage === "research") {
      await updateLetterStatus(letterId, "submitted", { force: true });
      const { packet: research, provider: researchProvider } = await runResearchStage(letterId, intake, pipelineCtx);
      pipelineCtx.researchProvider = researchProvider;
      pipelineCtx.researchUnverified = researchProvider === "anthropic-fallback";
      pipelineCtx.webGrounded = researchProvider !== "anthropic-fallback";
      await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);
      let citationRegistry = buildCitationRegistry(research);
      const citationTokensResearch = createTokenAccumulator();
      if (!pipelineCtx.researchUnverified && citationRegistry.length > 0) {
        const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
        citationRegistry = await revalidateCitationsWithPerplexity(citationRegistry, jurisdiction, letterId, citationTokensResearch);
      }
      pipelineCtx.citationRegistry = citationRegistry;
      pipelineCtx.citationRevalidationTokens = citationTokensResearch;
      const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
      await runVettingAndFinalize(research, draft);
    } else {
      const latestResearch = await getLatestResearchRun(letterId);
      if (!latestResearch?.resultJson)
        throw new Error("No completed research run found for retry");
      const research = latestResearch.resultJson as ResearchPacket;
      pipelineCtx.researchProvider = latestResearch.provider ?? "perplexity";
      pipelineCtx.researchUnverified = latestResearch.provider === "anthropic-fallback";
      pipelineCtx.webGrounded = !pipelineCtx.researchUnverified;
      await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);
      let citationRegistry = buildCitationRegistry(research);
      const citationTokensDrafting = createTokenAccumulator();
      if (!pipelineCtx.researchUnverified && citationRegistry.length > 0) {
        const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
        citationRegistry = await revalidateCitationsWithPerplexity(citationRegistry, jurisdiction, letterId, citationTokensDrafting);
      }
      pipelineCtx.citationRegistry = citationRegistry;
      pipelineCtx.citationRevalidationTokens = citationTokensDrafting;
      await updateLetterStatus(letterId, "drafting", { force: true });
      const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
      await runVettingAndFinalize(research, draft);
    }
    const retryCitationTokens = pipelineCtx.citationRevalidationTokens;
    await updateWorkflowJob(retryJobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: retryCitationTokens?.promptTokens ?? 0,
      completionTokens: retryCitationTokens?.completionTokens ?? 0,
      estimatedCostUsd: retryCitationTokens
        ? calculateCost("sonar-pro", retryCitationTokens)
        : "0",
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
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

