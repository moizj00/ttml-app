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
} from "../db";
import {
  sendLetterSubmissionEmail,
  sendStatusUpdateEmail,
  sendLetterToRecipient,
} from "../email";
import { captureServerException } from "../sentry";
import { enqueuePipelineJob } from "../queue";
import { extractLessonFromSubscriberFeedback } from "../learning";
import {
  checkLetterSubmissionAllowed,
  incrementLettersUsed,
} from "../stripe";
import type { IntakeJson } from "../../shared/types";
import { getAppUrl } from "../routers/_shared";
import { logger } from "../_core/logger";

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
 * Handles entitlement checking, free-trial and subscription usage claims,
 * letter creation with usage compensation on failure, pipeline enqueue,
 * and submission confirmation email + admin notification.
 */
export async function submitLetter(
  input: SubmitLetterInput,
  ctx: SubmitLetterContext
): Promise<{ letterId: number; status: string }> {
  const entitlement = await checkLetterSubmissionAllowed(ctx.userId);
  if (!entitlement.allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: entitlement.reason ?? "You are not allowed to submit a letter at this time.",
    });
  }

  let isFreeTrialSubmission = false;
  if (entitlement.firstLetterFree) {
    isFreeTrialSubmission = true;
    const claimed = await claimFreeTrialSlot(ctx.userId);
    if (!claimed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your free first letter has already been used. Please subscribe to continue.",
      });
    }
  } else if (entitlement.subscription) {
    const incremented = await incrementLettersUsed(ctx.userId);
    if (!incremented) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You have used all letter(s) in your plan. Please upgrade to continue.`,
      });
    }
  }

  let result: { insertId: number };
  try {
    result = await createLetterRequest({
      userId: ctx.userId,
      letterType: input.letterType,
      subject: input.subject,
      issueSummary: input.issueSummary,
      jurisdictionCountry: input.jurisdictionCountry,
      jurisdictionState: input.jurisdictionState,
      jurisdictionCity: input.jurisdictionCity,
      intakeJson: input.intakeJson,
      priority: input.priority,
      templateId: input.templateId,
    });
  } catch (createErr) {
    await _refundUsage(ctx.userId, isFreeTrialSubmission, !!entitlement.subscription);
    throw createErr;
  }
  const letterId = result.insertId;

  await logReviewAction({
    letterRequestId: letterId,
    reviewerId: ctx.userId,
    actorType: "subscriber",
    action: "letter_submitted",
    fromStatus: undefined,
    toStatus: "submitted",
  });

  const appUrl = getAppUrl(ctx.req);
  if (ctx.email) {
    sendLetterSubmissionEmail({
      to: ctx.email,
      name: ctx.name ?? "Subscriber",
      subject: input.subject,
      letterId,
      letterType: input.letterType,
      jurisdictionState: input.jurisdictionState,
      appUrl,
    }).catch(err => {
      logger.error({ err: err }, "[Email] Submission confirmation failed:");
      captureServerException(err, { tags: { component: "letters", error_type: "submission_email_failed" } });
    });
  }

  try {
    await enqueuePipelineJob({
      type: "pipeline:submit",
      letterId,
      intake: input.intakeJson,
      userId: ctx.userId,
      appUrl,
      label: "submit",
      usageContext: { shouldRefundOnFailure: true, isFreeTrialSubmission },
    });
  } catch (enqueueErr) {
    logger.error({ err: enqueueErr }, "[Queue] Failed to enqueue pipeline job:");
    captureServerException(enqueueErr, { tags: { component: "queue", error_type: "enqueue_failed" } });
    await _refundUsage(ctx.userId, isFreeTrialSubmission, !!entitlement.subscription);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to start letter processing. Your usage has been refunded. Please try again.",
    });
  }

  try {
    await notifyAdmins({
      category: "letters",
      type: "letter_submitted",
      title: `New letter submitted (#${letterId})`,
      body: `${ctx.name ?? ctx.email ?? "A subscriber"} submitted a ${input.letterType} letter: "${input.subject}"`,
      link: `/admin/letters/${letterId}`,
    });
  } catch (err) {
    logger.error({ err: err }, "[notifyAdmins] letter_submitted:");
    captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_submitted" } });
  }

  return { letterId, status: "submitted" };
}

/** Refund free-trial slot or decrement subscription letter count after a failure. */
async function _refundUsage(
  userId: number,
  isFreeTrialSubmission: boolean,
  hasSubscription: boolean
): Promise<void> {
  try {
    if (isFreeTrialSubmission) {
      await refundFreeTrialSlot(userId);
    } else if (hasSubscription) {
      await decrementLettersUsed(userId);
    }
  } catch (refundErr) {
    logger.error({ err: refundErr }, "[Submit] Failed to refund usage:");
    captureServerException(refundErr, { tags: { component: "letters", error_type: "usage_refund_failed" } });
  }
}

// ─── Process Subscriber Feedback (needs_changes path) ──────────────────────

export interface ProcessFeedbackInput {
  letterId: number;
  additionalContext: string;
  updatedIntakeJson?: IntakeJson;
}

export interface ProcessFeedbackContext {
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

/**
 * Handle subscriber response to a "needs_changes" review action.
 * Reads the retriggerPipeline flag from the latest internal review note to decide
 * between a full pipeline re-run or a light-edit path back to pending_review.
 */
export async function processSubscriberFeedback(
  input: ProcessFeedbackInput,
  ctx: ProcessFeedbackContext
): Promise<{ success: boolean; retriggerPipeline: boolean }> {
  const { letterId, additionalContext, updatedIntakeJson } = input;

  let retriggerPipeline = true;
  try {
    const reviewActions = await getReviewActions(letterId);
    const latestChangesAction = [...reviewActions]
      .reverse()
      .find(a => a.action === "requested_changes" && a.noteVisibility === "internal");
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
    action: "subscriber_updated",
    noteText: additionalContext,
    noteVisibility: "user_visible",
    fromStatus: "needs_changes",
    toStatus,
  });

  extractLessonFromSubscriberFeedback(letterId, additionalContext, ctx.userId, "subscriber_update").catch(logger.error);

  if (updatedIntakeJson) {
    const db = await (await import("../db")).getDb();
    if (db) {
      const { letterRequests } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(letterRequests)
        .set({ intakeJson: updatedIntakeJson, updatedAt: new Date() })
        .where(eq(letterRequests.id, letterId));
    }
  }

  const appUrl = getAppUrl(ctx.req);

  if (retriggerPipeline) {
    await updateLetterStatus(letterId, "submitted");
    const intake = updatedIntakeJson ?? ctx.letter.intakeJson;
    if (intake) {
      try {
        await enqueuePipelineJob({
          type: "pipeline:submit",
          letterId,
          intake,
          userId: ctx.letter.userId ?? ctx.userId,
          appUrl,
          label: "updateForChanges",
        });
      } catch (enqueueErr) {
        logger.error({ err: enqueueErr }, "[Queue] Failed to enqueue pipeline job:");
        captureServerException(enqueueErr, { tags: { component: "queue", error_type: "enqueue_failed" } });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start letter reprocessing. Please try again.",
        });
      }
    }
  } else {
    await updateLetterStatus(letterId, "pending_review");
    try {
      if (ctx.letter.assignedReviewerId) {
        const attorney = await getUserById(ctx.letter.assignedReviewerId);
        if (attorney?.email) {
          await sendStatusUpdateEmail({
            to: attorney.email,
            name: attorney.name ?? "Attorney",
            subject: ctx.letter.subject,
            letterId,
            newStatus: "pending_review",
            appUrl,
          });
        }
      }
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[Email] Failed to send pending_review email to attorney:");
      captureServerException(emailErr, { tags: { component: "letters", error_type: "pending_review_email_failed" } });
    }
  }

  return { success: true, retriggerPipeline };
}

// ─── Admin Actions ─────────────────────────────────────────────────────────

export async function adminEnqueuePipelineJob(
  letterId: number,
  intake: IntakeJson,
  userId: number,
  appUrl: string,
  label: string
): Promise<void> {
  await enqueuePipelineJob({
    type: "pipeline:submit",
    letterId,
    intake,
    userId,
    appUrl,
    label,
    usageContext: { shouldRefundOnFailure: false, isFreeTrialSubmission: false },
  });
}

export async function adminEnqueueRetryFromStageJob(
  letterId: number,
  intake: IntakeJson,
  stage: "researching" | "drafting" | "vetting",
  userId: number,
  appUrl: string,
  label: string
): Promise<void> {
  await enqueuePipelineJob({
    type: "pipeline:retryFromStage",
    letterId,
    intake,
    stage,
    userId,
    appUrl,
    label,
    usageContext: { shouldRefundOnFailure: false, isFreeTrialSubmission: false },
  });
}
