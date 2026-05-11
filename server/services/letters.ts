/**
 * Letter service — encapsulates letter submission business logic.
 *
 * Responsibilities:
 *  - Atomic entitlement claim → letter creation → pipeline enqueue (submitLetter)
 *  - Usage compensation on failure (refund free-trial slot or decrement count)
 *  - Subscriber feedback / changes processing (processSubscriberFeedback)
 *  - Enqueue helpers for pipeline re-runs
 *
 * The tRPC router (server/routers/letters.ts) delegates to this service so
 * it can stay thin: input validation + auth guards + service call.
 */

import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import {
  createLetterRequest,
  logReviewAction,
  updateLetterStatus,
  notifyAdmins,
  createNotification,
  getUserById,
  getReviewActions,
  refundFreeTrialSlot,
  claimFreeTrialSlot,
  decrementLettersUsed,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  updateLetterPdfUrl,
  updateLetterStoragePath,
} from "../db";
import { storageGet } from "../storage";
import { generateAndUploadApprovedPdf } from "../pdfGenerator";
import {
  sendLetterSubmissionEmail,
  sendStatusUpdateEmail,
  sendLetterToRecipient,
} from "../email";
import { captureServerException } from "../sentry";
import { enqueuePipelineJob } from "../queue";
import { extractLessonFromSubscriberFeedback } from "../learning";
import { runSimplePipeline } from "../pipeline/simple";
import type { NotificationCategory } from "../db/notifications";
import { checkLetterSubmissionAllowed, incrementLettersUsed } from "../stripe";
import type { IntakeJson } from "../../shared/types";
import { getAppUrl } from "../routers/_shared";
import { logger } from "../logger";

import {
  submitSubscriberIntakeProcedure,
  getSubscriberDraftPreviewProcedure as canonicalGetDraftPreviewProcedure,
} from "./canonicalProcedures";

// ─── Submit Letter (subscriber path) ───────────────────────────────────────

export interface SubmitLetterInput {
  letterType: string;
  subject: string;
  issueSummary?: string;
  jurisdictionCountry: string;
  jurisdictionState: string;
  jurisdictionCity?: string;
  intakeJson: IntakeJson;
  priority: "low" | "normal" | "high" | "urgent";
  templateId?: number;
}

export interface SubmitLetterContext {
  userId: number;
  email?: string | null;
  name?: string | null;
  req: Request;
}

/**
 * Atomic claim → create → enqueue for subscriber letter submission.
 * Delegates to submitSubscriberIntakeProcedure for the canonical flow.
 */
export async function submitLetter(
  input: SubmitLetterInput,
  ctx: SubmitLetterContext
): Promise<{ letterId: number; pipelineId: number; status: string; isFreePreview: boolean }> {
  const result = await submitSubscriberIntakeProcedure(
    ctx.userId,
    input.intakeJson,
    input.letterType
  );

  const letter = await getLetterRequestById(result.requestId);

  return {
    letterId: result.requestId,
    pipelineId: result.requestId,
    status: result.status,
    isFreePreview: letter?.isFreePreview === true,
  };
}

/**
 * PROCEDURE 6: getSubscriberDraftPreviewProcedure
 * Delegates to the canonical implementation.
 */
export async function getSubscriberReleasedLetterProcedure(
  letterId: number,
  userId: number
) {
  const result = await canonicalGetDraftPreviewProcedure(letterId, userId);
  const letter = await getLetterRequestById(letterId);

  if (!letter) return null;

  return {
    ...letter,
    visibilityStatus: result.status,
    isReleased: result.status === "visible",
  };
}

/**
 * Handle subscriber response to a "needs_changes" review action.
 */
export async function processSubscriberFeedback(
  input: {
    letterId: number;
    additionalContext: string;
    updatedIntakeJson?: IntakeJson;
  },
  ctx: {
    userId: number;
    req: Request;
    letter: {
      userId: number | null;
      intakeJson: IntakeJson | null;
      status: string;
      subject: string;
      assignedReviewerId: number | null;
    };
  }
): Promise<{ success: boolean; retriggerPipeline: boolean }> {
  const { letterId, additionalContext, updatedIntakeJson } = input;

  let retriggerPipeline = true;
  try {
    const reviewActions = await getReviewActions(letterId);
    const latestChangesAction = [...reviewActions]
      .reverse()
      .find(
        a => a.action === "requested_changes" && a.noteVisibility === "internal"
      );
    if (latestChangesAction?.noteText) {
      const parsed = JSON.parse(latestChangesAction.noteText);
      if (typeof parsed.retriggerPipeline === "boolean") {
        retriggerPipeline = parsed.retriggerPipeline;
      }
    }
  } catch {
    retriggerPipeline = true;
  }

  const toStatus = retriggerPipeline ? "submitted" : "pending_review";

  await logReviewAction({
    letterRequestId: letterId,
    reviewerId: ctx.userId,
    actorType: "subscriber",
    action: "feedback_submitted",
    noteText: additionalContext,
    noteVisibility: "user_visible",
    fromStatus: ctx.letter.status as any,
    toStatus: toStatus as any,
  });

  await updateLetterStatus(letterId, toStatus as any);

  if (retriggerPipeline) {
    const appUrl = getAppUrl(ctx.req);
    runSimplePipeline(
      letterId,
      updatedIntakeJson || ctx.letter.intakeJson!,
      ctx.userId
    ).catch(err => {
      logger.error(
        { err, letterId },
        "processSubscriberFeedback simple pipeline re-run failed"
      );
    });
  }

  await extractLessonFromSubscriberFeedback(
    letterId,
    additionalContext,
    ctx.userId,
    "subscriber_update"
  ).catch(err => {
    logger.error({ err, letterId }, "Failed to extract lesson from feedback");
  });

  return { success: true, retriggerPipeline };
}

export async function retryFromRejected(
  input: {
    letterId: number;
    additionalContext?: string;
    updatedIntakeJson?: IntakeJson;
  },
  ctx: { userId: number; userName: string | null; req: Request }
) {
  await updateLetterStatus(input.letterId, "submitted");
  const appUrl = getAppUrl(ctx.req);
  runSimplePipeline(
    input.letterId,
    input.updatedIntakeJson || ({} as any),
    ctx.userId
  ).catch(err => {
    logger.error(
      { err, letterId: input.letterId },
      "retryFromRejected simple pipeline re-run failed"
    );
  });
  return { success: true };
}

export async function sendLetterToRecipientFlow(
  input: {
    letterId: number;
    recipientEmail: string;
    subjectOverride?: string;
    note?: string;
  },
  ctx: { userId: number; appUrl: string }
) {
  const letter = await getLetterRequestById(input.letterId);
  if (!letter || letter.userId !== ctx.userId)
    throw new TRPCError({ code: "NOT_FOUND" });

  const SENDABLE_STATUSES = ["client_approved", "approved", "sent"] as const;
  if (!SENDABLE_STATUSES.includes(letter.status as any)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Letter must be approved before sending. Current status: ${letter.status}`,
    });
  }

  // Resolve a current PDF URL so the recipient receives the polished
  // attorney-signed PDF (not just inline HTML). Three cases:
  //
  //   1. PDF already in R2 → mint a fresh URL via storageGet.
  //   2. No PDF in R2 yet (e.g. attorney-side generation failed silently)
  //      → render+upload via generateAndUploadApprovedPdf, persist key+url.
  //   3. PDF generation fails entirely → fall back to htmlContent only so
  //      the recipient at least gets the letter inline. Surfaced in the
  //      response payload so the client can warn the subscriber.
  //
  // Previously this function passed `pdfUrl: undefined` with a TODO
  // comment ("will be fetched by sender if needed") — but the email
  // worker never actually fetched it, so recipients got the email body
  // only and no PDF attachment.
  let resolvedPdfUrl: string | undefined;
  let pdfAttached = false;

  const versions = await getLetterVersionsByRequestId(input.letterId, false);
  const finalVer = versions.find(v => v.versionType === "final_approved");
  const htmlContent = finalVer?.content;

  const existingKey = (letter as any).pdfStoragePath as
    | string
    | null
    | undefined;
  if (existingKey) {
    try {
      const { url } = await storageGet(existingKey);
      resolvedPdfUrl = url;
      pdfAttached = true;
    } catch (err) {
      logger.warn(
        { err, letterId: input.letterId },
        "[sendLetterToRecipientFlow] storageGet failed — generating fresh PDF"
      );
    }
  }

  if (!resolvedPdfUrl && finalVer?.content) {
    try {
      const approvalMeta = (finalVer.metadataJson ?? {}) as {
        approvedBy?: string;
        approvedAt?: string;
      };
      const { pdfKey, pdfUrl } = await generateAndUploadApprovedPdf({
        letterId: input.letterId,
        letterType: letter.letterType,
        subject: letter.subject,
        content: finalVer.content,
        approvedBy: approvalMeta.approvedBy,
        approvedAt: approvalMeta.approvedAt ?? new Date().toISOString(),
        jurisdictionState: letter.jurisdictionState,
        jurisdictionCountry: letter.jurisdictionCountry,
        intakeJson: letter.intakeJson as Record<string, unknown> | null,
      });
      await updateLetterStoragePath(input.letterId, pdfKey);
      await updateLetterPdfUrl(input.letterId, pdfUrl);
      resolvedPdfUrl = pdfUrl;
      pdfAttached = true;
      logger.info(
        { letterId: input.letterId, pdfKey },
        "[sendLetterToRecipientFlow] On-demand PDF generation succeeded"
      );
    } catch (err) {
      captureServerException(err as Error, {
        tags: {
          component: "letters",
          error_type: "send_pdf_generation_failed",
        },
        extra: { letterId: input.letterId },
      });
      logger.error(
        { err, letterId: input.letterId },
        "[sendLetterToRecipientFlow] On-demand PDF generation failed; sending with htmlContent only"
      );
    }
  }

  await sendLetterToRecipient({
    recipientEmail: input.recipientEmail,
    letterSubject: `Legal Letter: ${letter.subject}`,
    subjectOverride: input.subjectOverride,
    pdfUrl: resolvedPdfUrl,
    htmlContent,
    note: input.note,
  });

  await updateLetterStatus(input.letterId, "sent");
  return { success: true, pdfAttached };
}

async function _refundUsage(
  userId: number,
  isFreeTrial: boolean,
  isSubscription: boolean
) {
  if (isFreeTrial) {
    await refundFreeTrialSlot(userId);
  } else if (isSubscription) {
    await decrementLettersUsed(userId);
  }
}
