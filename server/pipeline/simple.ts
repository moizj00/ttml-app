import type { IntakeJson } from "../../shared/types";
import type { NotificationCategory } from "../db/notifications";
import { createLogger } from "../logger";
import { generateText } from "ai";
import { getAnthropicClient } from "./providers";
import {
  updateLetterStatus,
  createLetterVersion,
  updateLetterVersionPointers,
  createNotification,
  logReviewAction,
  notifyAdmins,
  createWorkflowJob,
  updateWorkflowJob,
} from "../db";
import { captureServerException } from "../sentry";

const logger = createLogger("simple-pipeline");

/**
 * Ultra-simple letter generation pipeline.
 *
 * Single stage: intake → Claude generates letter → saved to DB.
 * No research, no vetting, no orchestration complexity.
 *
 * Activated when PIPELINE_MODE=simple.
 * Uses the Vercel AI SDK generateText() directly (same as all other pipeline stages).
 */

const MODEL = "claude-sonnet-4-6-20250514";

export type SimplePipelineResult = {
  success: boolean;
  letter?: string;
  error?: string;
};

function buildPrompt(intake: IntakeJson): string {
  const {
    matter,
    jurisdiction,
    sender,
    recipient,
    tonePreference,
    additionalContext,
    desiredOutcome,
    financials,
    priorCommunication,
    deadlineDate,
  } = intake;

  const tone = tonePreference ?? "moderate";
  const toneLabel = tone === "firm" ? "Firm and assertive" : tone === "aggressive" ? "Aggressive — demand immediate action" : "Professional and moderate";

  return `You are a senior attorney drafting a formal legal letter on behalf of a client.

**Letter Type:** ${intake.letterType ?? "General Legal Matter"}
**Subject:** ${matter?.subject ?? "N/A"}
**Matter Category:** ${matter?.category ?? "N/A"}
**Description of Issue:** ${matter?.description ?? "N/A"}
${matter?.incidentDate ? `**Date of Incident:** ${matter.incidentDate}` : ""}

**Jurisdiction:** ${jurisdiction?.state ? `${jurisdiction.state}, ` : ""}${jurisdiction?.country ?? "US"}

**FROM (Sender / Client):**
- Name: ${sender?.name ?? "N/A"}
- Address: ${sender?.address ?? "N/A"}
${sender?.email ? `- Email: ${sender.email}` : ""}
${sender?.phone ? `- Phone: ${sender.phone}` : ""}

**TO (Recipient):**
- Name: ${recipient?.name ?? "N/A"}
- Address: ${recipient?.address ?? "N/A"}
${recipient?.email ? `- Email: ${recipient.email}` : ""}

**Desired Outcome:** ${desiredOutcome ?? "N/A"}
**Tone:** ${toneLabel}
${deadlineDate ? `**Response Deadline:** ${deadlineDate}` : ""}
${financials?.amountOwed ? `**Amount in Dispute:** ${financials.currency ?? "USD"} ${financials.amountOwed}` : ""}
${priorCommunication ? `**Prior Communication:** ${priorCommunication}` : ""}
${additionalContext ? `**Additional Context:** ${additionalContext}` : ""}

Draft a comprehensive, professional legal letter addressing the matter above.
Requirements:
1. Use proper legal formatting: today's date, recipient address block, "Re:" subject line, formal salutation, body paragraphs, closing, and signature block for the sender
2. Be clear, concise, and authoritative — no fluff
3. Cite the applicable legal basis or rights where relevant to the jurisdiction
4. State clearly what action is required and by when
5. Use plain text only — no markdown, no asterisks, no bullet symbols
6. Address the letter from ${sender?.name ?? "the sender"} to ${recipient?.name ?? "the recipient"}

Output only the finished letter text, ready for attorney review and signature.`;
}

export async function runSimplePipeline(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): Promise<SimplePipelineResult> {
  // ── Create workflow_job for admin visibility ───────────────────────────
  let jobId = 0;
  try {
    const job = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "generation_pipeline",
      provider: "anthropic-simple",
      requestPayloadJson: {
        letterId,
        userId,
        mode: "simple",
        model: MODEL,
        letterType: intake.letterType,
      },
    });
    jobId = (job as { insertId?: number })?.insertId ?? 0;
    await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });
  } catch (jobErr) {
    logger.warn({ err: jobErr, letterId }, "[Simple] Failed to create workflow_job (non-fatal)");
  }

  try {
    logger.info({ letterId, userId, model: MODEL }, "[Simple] Starting simple pipeline");

    // Transition: submitted → researching → drafting
    // The status machine requires passing through 'researching' before 'drafting'.
    // The simple pipeline has no research stage, so we advance through it immediately.
    await updateLetterStatus(letterId, "researching");
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "status_changed",
      noteText: "Simple pipeline started (no research stage).",
      noteVisibility: "internal",
      fromStatus: "submitted",
      toStatus: "researching",
    }).catch(() => {});

    await updateLetterStatus(letterId, "drafting");
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "status_changed",
      noteText: "Drafting started.",
      noteVisibility: "internal",
      fromStatus: "researching",
      toStatus: "drafting",
    }).catch(() => {});

    // ── Single Vercel AI SDK call ─────────────────────────────────────────
    const anthropic = getAnthropicClient();
    const model = anthropic(MODEL);

    const result = await generateText({
      model,
      system:
        "You are an expert legal letter drafting assistant. You write clear, professional, jurisdiction-aware legal letters on behalf of clients. You output only the finished letter text — no commentary, no preamble, no markdown.",
      prompt: buildPrompt(intake),
      maxOutputTokens: 4096,
      abortSignal: AbortSignal.timeout(90_000),
    });

    const letterContent = result.text.trim();

    if (!letterContent) {
      logger.error({ letterId }, "[Simple] Draft generation returned empty response");
      await updateLetterStatus(letterId, "submitted");
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: "Model returned empty response",
        completedAt: new Date(),
      });
      return { success: false, error: "Draft generation returned empty response" };
    }

    logger.info(
      { letterId, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      "[Simple] Draft generated successfully"
    );

    // ── Save ai_draft version ─────────────────────────────────────────────
    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: letterContent,
      createdByType: "system",
      createdByUserId: userId,
      metadataJson: {
        mode: "simple",
        model: MODEL,
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
      },
    });

    if (!version?.insertId) {
      logger.error({ letterId }, "[Simple] createLetterVersion returned no insertId");
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: "createLetterVersion returned no insertId",
        completedAt: new Date(),
      });
      return { success: false, error: "Failed to save letter version" };
    }

    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: version.insertId,
    });

    // Transition: drafting → generated_locked (paywall state)
    await Promise.all([
      updateLetterStatus(letterId, "generated_locked"),
      logReviewAction({
        letterRequestId: letterId,
        actorType: "system",
        action: "ai_pipeline_completed",
        noteText: `Simple pipeline complete (${MODEL}). Draft ready — awaiting subscriber payment for attorney review.`,
        noteVisibility: "internal",
        fromStatus: "drafting",
        toStatus: "generated_locked",
      }).catch(() => {}),
    ]);

    // Mark job complete with token/cost data
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      estimatedCostUsd: (
        (result.usage.inputTokens / 1_000_000) * 3 +
        (result.usage.outputTokens / 1_000_000) * 15
      ).toFixed(6),
      responsePayloadJson: { mode: "simple", model: MODEL, versionId: version.insertId },
    });

    // Notify user (non-blocking)
    if (userId) {
      createNotification({
        userId,
        type: "letter_draft_ready",
        title: "Your letter draft is ready",
        body: `Our team has prepared your ${intake.matter?.category ?? intake.letterType ?? "legal letter"} and it is ready for attorney review.`,
        link: `/dashboard/letters/${letterId}`,
        category: "letters" satisfies NotificationCategory,
      }).catch((err) =>
        logger.warn({ err, letterId }, "[Simple] Failed to create user notification (non-fatal)")
      );
    }

    // Notify admins (non-blocking)
    notifyAdmins({
      category: "letters",
      type: "pipeline_researching",
      title: `Letter #${letterId} draft ready (simple pipeline)`,
      body: `Simple pipeline completed for letter #${letterId}. Awaiting subscriber unlock.`,
      link: `/admin/letters/${letterId}`,
    }).catch(() => {});

    logger.info({ letterId }, "[Simple] Pipeline complete — status: generated_locked");

    return { success: true, letter: letterContent };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, letterId }, "[Simple] Pipeline failed");
    captureServerException(err, {
      tags: { component: "simple-pipeline", error_type: "generation_failed" },
      extra: { letterId, userId },
    });

    // Revert to submitted so the user can retry
    await updateLetterStatus(letterId, "submitted").catch(() => {});
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: error,
      completedAt: new Date(),
    }).catch(() => {});

    return { success: false, error };
  }
}
