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
  setLetterQualityDegraded,
  getLatestResearchRun,
  createLetterVersion,
  updateLetterVersionPointers,
  createNotification,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, PipelineContext, TokenUsage, PipelineErrorCode, ValidationResult } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import {
  buildNormalizedPromptInput,
  type NormalizedPromptInput,
} from "../intake-normalizer";
import { sendLetterReadyEmail, sendStatusUpdateEmail, sendNewReviewNeededEmail, sendAdminAlertEmail } from "../email";
import { captureServerException } from "../sentry";
import { formatStructuredError, classifyErrorCode } from "./shared";
import { createTokenAccumulator, calculateCost } from "./providers";
import { validateIntakeCompleteness, addValidationResult } from "./validators";
import { buildCitationRegistry, revalidateCitationsWithPerplexity } from "./citations";
import { runResearchStage } from "./research";
import { runDraftingStage } from "./drafting";
import { runAssemblyVettingLoop, finalizeLetterAfterVetting } from "./vetting";

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
    // openai-failover uses gpt-4o-search-preview + webSearchPreview — still web-grounded.
    // Only anthropic-fallback (Claude, no web access) is truly ungrounded.
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
    // Capture the initial draft for best-effort fallback (both in-context and registry)
    pipelineCtx._intermediateDraftContent = draft.draftLetter;
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
      console.warn(
        `[Pipeline] Vetting critical issues after ${assemblyRetries} retries for letter #${letterId} — ` +
        `saving degraded draft and proceeding to generated_locked. Issues: ${criticalIssues.join("; ")}`
      );
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
        ? calculateCost("sonar-pro", citationRevalidationTokens)
        : "0",
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
        vettingReport: vettingResult.vettingReport,
        assemblyRetries,
        ...(isDegraded && {
          qualityDegraded: true,
          degradationReasons: pipelineCtx.qualityWarnings,
        }),
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
// BEST-EFFORT FALLBACK (called by worker after retry exhaustion)
// ═══════════════════════════════════════════════════════

/**
 * Codes that should stop delivery entirely — never produce a degraded draft.
 * Per product spec:
 *   - CONTENT_POLICY_VIOLATION / API_KEY_MISSING — permanent blockers
 *   - INTAKE_INCOMPLETE — cannot generate without data
 *
 * NOTE: RATE_LIMITED is intentionally excluded from this set. With the model
 * failover system in place, a RATE_LIMITED error means BOTH the primary and
 * backup models were exhausted. In this case we still deliver a degraded draft
 * (best-effort fallback) rather than treating it as completely fatal.
 */
export const FALLBACK_EXCLUDED_CODES: ReadonlySet<string> = new Set([
  PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION,
  PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
  PIPELINE_ERROR_CODES.API_KEY_MISSING,
]);

/**
 * Attempt to deliver a degraded draft after all pipeline retries are exhausted.
 * Returns true if a degraded draft was saved and status set to generated_locked,
 * false if no usable content was found.
 *
 * MUST only be called by the worker after retry exhaustion, never on the first attempt.
 */
export async function bestEffortFallback(opts: {
  letterId: number;
  intake: IntakeJson;
  intermediateDraftContent?: string;
  qualityWarnings?: string[];
  pipelineErrorCode: string;
  errorMessage: string;
  dbFields?: { subject?: string; jurisdictionState?: string | null };
}): Promise<boolean> {
  const { letterId, intake, intermediateDraftContent, qualityWarnings, pipelineErrorCode, errorMessage, dbFields } = opts;

  if (FALLBACK_EXCLUDED_CODES.has(pipelineErrorCode)) {
    console.warn(
      `[Pipeline] Fallback excluded for letter #${letterId}: error code ${pipelineErrorCode} is fail-stop`
    );
    return false;
  }

  console.warn(`[Pipeline] Attempting best-effort draft fallback for letter #${letterId} (error: ${pipelineErrorCode})`);

  try {
    let fallbackContent: string | null = null;
    let fallbackSource = "unknown";

    // 1. In-memory content captured progressively as stages completed
    if (intermediateDraftContent) {
      fallbackContent = intermediateDraftContent;
      fallbackSource = "in_memory_intermediate";
    }

    // 2. Previously-persisted ai_draft version via currentAiDraftVersionId pointer
    if (!fallbackContent) {
      const { getLetterVersionById, getLetterVersionsByRequestId } = await import("../db");
      const letterRecord = await getLetterById(letterId);
      if (letterRecord?.currentAiDraftVersionId) {
        try {
          const existingVersion = await getLetterVersionById(letterRecord.currentAiDraftVersionId);
          if (existingVersion?.content) {
            fallbackContent = existingVersion.content;
            fallbackSource = "db_ai_draft_pointer";
          }
        } catch {
          // ignore
        }
      }

      // 3. Scan all versions for any usable content
      if (!fallbackContent) {
        try {
          const allVersions = await getLetterVersionsByRequestId(letterId, true);
          const candidate = allVersions.find(v => v.content && v.content.length > 50);
          if (candidate?.content) {
            fallbackContent = candidate.content;
            fallbackSource = `db_version_${candidate.versionType}`;
          }
        } catch {
          // ignore
        }
      }

      // 4. Last resort: synthesize a skeleton from the research packet
      // Ensures delivery even when drafting never produced text
      if (!fallbackContent) {
        try {
          const researchRun = await getLatestResearchRun(letterId);
          const researchResult = researchRun?.resultJson as Record<string, unknown> | null;
          if (researchResult?.researchSummary) {
            const subject = dbFields?.subject ?? intake.matter?.subject ?? "Legal Matter";
            const jurisdiction = dbFields?.jurisdictionState ?? intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "Your Jurisdiction";
            const issues = (researchResult.issuesIdentified as string[] | undefined)?.slice(0, 5) ?? [];
            const rules = (researchResult.applicableRules as Array<{ ruleTitle?: string; citationText?: string }> | undefined)?.slice(0, 3) ?? [];
            const skeleton = [
              `RE: ${subject}`,
              "",
              `Dear [Recipient],`,
              "",
              `I am writing regarding the matter described above. This draft was generated by our system based on legal research for ${jurisdiction} jurisdiction and requires thorough attorney review before use.`,
              "",
              `LEGAL RESEARCH SUMMARY`,
              "─".repeat(40),
              String(researchResult.researchSummary),
              "",
              issues.length > 0 ? `KEY ISSUES IDENTIFIED\n${"─".repeat(40)}\n${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}` : "",
              "",
              rules.length > 0 ? `APPLICABLE LEGAL STANDARDS\n${"─".repeat(40)}\n${rules.map(r => `• ${r.ruleTitle ?? ""}: ${r.citationText ?? ""}`).join("\n")}` : "",
              "",
              `[ATTORNEY NOTE: This is a research-based skeleton draft produced via best-effort fallback. Full drafting did not complete. The research above is accurate, but the letter body must be written by the reviewing attorney.]`,
              "",
              `Sincerely,`,
              `[Sender Name]`,
            ].filter(line => line !== "").join("\n");
            fallbackContent = skeleton;
            fallbackSource = "research_skeleton";
          }
        } catch {
          // ignore — no research fallback available
        }
      }
    }

    if (!fallbackContent) {
      console.warn(`[Pipeline] No fallback content found for letter #${letterId} — cannot produce degraded draft`);
      return false;
    }

    const degradationReasons = [
      `Pipeline failed after all retries with error: ${pipelineErrorCode} — ${errorMessage}`,
      ...(qualityWarnings ?? []),
    ];
    console.warn(
      `[Pipeline] Saving degraded draft for letter #${letterId} (source: ${fallbackSource}, ${degradationReasons.length} reason(s))`
    );

    await setLetterQualityDegraded(letterId, true);

    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: fallbackContent,
      createdByType: "system",
      metadataJson: {
        provider: "anthropic",
        stage: "best_effort_fallback",
        fallbackSource,
        qualityDegraded: true,
        degradationReasons,
        pipelineErrorCode,
        wordCount: fallbackContent.split(/\s+/).filter(w => w.length > 0).length,
      },
    });
    const versionId = (version as any)?.insertId ?? 0;
    await updateLetterVersionPointers(letterId, { currentAiDraftVersionId: versionId });

    await updateLetterStatus(letterId, "generated_locked", { force: true });
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "ai_pipeline_completed",
      noteText: `Draft produced via best-effort fallback after all retries exhausted (${pipelineErrorCode}). Quality flags raised — attorney scrutiny required. Degradation reasons: ${degradationReasons.join("; ")}`,
      noteVisibility: "internal",
      fromStatus: "drafting",
      toStatus: "generated_locked",
    });

    // Notify admins
    try {
      const admins = await getAllUsers("admin");
      const appBaseUrl = process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
      for (const admin of admins) {
        if (admin.email) {
          sendAdminAlertEmail({
            to: admin.email,
            name: admin.name ?? "Admin",
            subject: `Degraded draft produced for letter #${letterId}`,
            preheader: `Quality fallback triggered after retry exhaustion — attorney review required`,
            bodyHtml: `<p>Letter #${letterId} was produced via best-effort fallback after all pipeline retries were exhausted (error: <strong>${pipelineErrorCode}</strong>).</p><p>Degradation reasons:</p><ul>${degradationReasons.map(r => `<li>${r}</li>`).join("")}</ul><p>The draft is now in <strong>generated_locked</strong> status awaiting subscriber unlock and attorney review.</p>`,
            ctaText: "View Letter",
            ctaUrl: `${appBaseUrl}/admin/letters/${letterId}`,
          }).catch(e => console.error(`[Pipeline] Failed to send degraded-draft admin email for #${letterId}:`, e));
        }
        createNotification({
          userId: admin.id,
          type: "quality_alert",
          category: "letters",
          title: `Degraded draft: letter #${letterId}`,
          body: `Pipeline error (${pipelineErrorCode}) after retries exhausted — best-effort fallback used. Attorney scrutiny needed.`,
          link: `/admin/letters/${letterId}`,
        }).catch(e => console.error(`[Pipeline] Failed to create degraded-draft notification for #${letterId}:`, e));
      }
    } catch (notifyErr) {
      console.error(`[Pipeline] Failed to notify admins of degraded draft for #${letterId}:`, notifyErr);
    }

    // Send subscriber "letter ready" email
    try {
      const letterRecord = await getLetterById(letterId);
      const wasAlreadyUnlocked = letterRecord ? await hasLetterBeenPreviouslyUnlocked(letterId) : false;
      if (letterRecord && !wasAlreadyUnlocked && letterRecord.userId != null) {
        const subscriber = await getUserById(letterRecord.userId);
        if (subscriber?.email) {
          sendLetterReadyEmail({
            to: subscriber.email,
            name: subscriber.name ?? "Subscriber",
            subject: letterRecord.subject,
            letterId,
            appUrl: process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com",
            letterType: letterRecord.letterType ?? undefined,
            jurisdictionState: letterRecord.jurisdictionState ?? undefined,
          }).catch(e => console.error(`[Pipeline] Failed to send letter-ready email for fallback #${letterId}:`, e));
        }
      }
    } catch (emailErr) {
      console.error(`[Pipeline] Failed to send subscriber email for fallback draft #${letterId}:`, emailErr);
    }

    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch {
      // non-fatal
    }

    return true;
  } catch (fallbackErr) {
    console.error(`[Pipeline] Best-effort fallback failed for letter #${letterId}:`, fallbackErr);
    captureServerException(fallbackErr, {
      tags: { pipeline_stage: "best_effort_fallback", letter_id: String(letterId) },
    });
    return false;
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
    // Capture draft content for best-effort fallback
    pipelineCtx._intermediateDraftContent = draft.draftLetter;
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
      console.warn(
        `[Pipeline] Retry vetting critical issues after ${assemblyRetries} retries for letter #${letterId} — ` +
        `saving degraded draft. Issues: ${criticalIssues.join("; ")}`
      );
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
    const isRetryDegraded = (pipelineCtx.qualityWarnings?.length ?? 0) > 0;
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

