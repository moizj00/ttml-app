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
import { runSimplePipeline } from "../pipeline/simple";
import type { NotificationCategory } from "../db/notifications";
import {
  checkLetterSubmissionAllowed,
  incrementLettersUsed,
} from "../stripe";
import type { IntakeJson } from "../../shared/types";
import { getAppUrl } from "../routers/_shared";
import { logger } from "../logger";

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
): Promise<{ letterId: number; status: string; isFreePreview: boolean }> {
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

  // ── Free-preview lead-magnet flow ─────────────────────────────────────
  // For first-letter-free submissions, enter the 24-hour free-preview flow:
  // the subscriber sees a progress modal now, the pipeline runs in the
  // background, and 24 hours after submit the email-scheduler cron sends
  // the "your draft is ready — preview it" email. The preview is the raw
  // ai_draft (no attorney review) with a DRAFT watermark and a single
  // "Submit For Attorney Review" CTA that routes to subscribe.
  const FREE_PREVIEW_DELAY_HOURS = 24;
  const freePreviewUnlockAt = isFreeTrialSubmission
    ? new Date(Date.now() + FREE_PREVIEW_DELAY_HOURS * 60 * 60 * 1000)
    : undefined;

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
      isFreePreview: isFreeTrialSubmission,
      freePreviewUnlockAt,
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
      logger.error({ err }, "[Email] Submission confirmation failed:");
      captureServerException(err, { tags: { component: "letters", error_type: "submission_email_failed" } });
    });
  }

  // ── Simple Pipeline Mode ─────────────────────────────────────────────────
  // When PIPELINE_MODE=simple, run the pipeline inline as a fire-and-forget
  // Promise. This avoids setTimeout (which doesn't survive process restarts)
  // while still returning immediately so the user sees the progress timeline.
  const useSimplePipeline = process.env.PIPELINE_MODE === "simple";
  if (useSimplePipeline) {
    logger.info({ letterId }, "[Submit] Launching simple pipeline (PIPELINE_MODE=simple)");

    // Fire-and-forget: do NOT await — return immediately to the subscriber
    Promise.resolve().then(async () => {
      try {
        const result = await runSimplePipeline(letterId, input.intakeJson, ctx.userId);
        if (!result.success) {
          logger.error({ letterId, error: result.error }, "[Submit] Simple pipeline failed");
          await _refundUsage(ctx.userId, isFreeTrialSubmission, !!entitlement.subscription);
          await createNotification({
            userId: ctx.userId,
            type: "letter_failed",
            title: "Letter generation failed",
            body: "We could not generate your letter. Your usage has been refunded. Please try again.",
            link: `/dashboard/letters/${letterId}`,
            category: "letters" satisfies NotificationCategory,
          }).catch(() => {});
        } else {
          logger.info({ letterId }, "[Submit] Simple pipeline completed successfully");
        }
      } catch (pipelineErr) {
        logger.error({ err: pipelineErr, letterId }, "[Submit] Simple pipeline threw an error");
        captureServerException(pipelineErr, { tags: { component: "simple-pipeline", error_type: "pipeline_failed" } });
        await _refundUsage(ctx.userId, isFreeTrialSubmission, !!entitlement.subscription);
      }
    });

    logger.info({ letterId }, "[Submit] Pipeline launched, returning to user");
  } else {
    // ── Standard Queue-Based Pipeline ────────────────────────────────────────
    try {
      await enqueuePipelineJob({
        type: "runPipeline",
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
  }

  // Fire-and-forget: admin notification is non-blocking after successful enqueue
  notifyAdmins({
    category: "letters",
    type: "letter_submitted",
    title: `New letter submitted (#${letterId})`,
    body: `${ctx.name ?? ctx.email ?? "A subscriber"} submitted a ${input.letterType} letter: "${input.subject}"`,
    link: `/admin/letters/${letterId}`,
  }).catch(err => {
    logger.error({ err: err }, "[notifyAdmins] letter_submitted:");
    captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_submitted" } });
  });

  return { letterId, status: "submitted", isFreePreview: isFreeTrialSubmission };
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
      const useSimplePipeline = process.env.PIPELINE_MODE === "simple";
      if (useSimplePipeline) {
        // Fire-and-forget simple pipeline for needs_changes retry
        const retriggerUserId = ctx.letter.userId ?? ctx.userId;
        Promise.resolve().then(async () => {
          try {
            const result = await runSimplePipeline(letterId, intake, retriggerUserId);
            if (!result.success) {
              logger.error({ letterId, error: result.error }, "[processSubscriberFeedback] Simple pipeline retry failed");
            }
          } catch (pipelineErr) {
            logger.error({ err: pipelineErr, letterId }, "[processSubscriberFeedback] Simple pipeline retry threw an error");
            captureServerException(pipelineErr, { tags: { component: "simple-pipeline", error_type: "retry_pipeline_failed" } });
          }
        });
        logger.info({ letterId }, "[processSubscriberFeedback] Simple pipeline re-run launched");
      } else {
        try {
          await enqueuePipelineJob({
            type: "runPipeline",
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
        await createNotification({
          userId: ctx.letter.assignedReviewerId,
          type: "subscriber_feedback_received",
          title: "Subscriber responded with feedback",
          body: `Subscriber provided feedback on "${ctx.letter.subject}". Please apply the requested edits.`,
          link: `/review/${letterId}`,
        });
      } else {
        await notifyAdmins({
          category: "letters",
          type: "subscriber_feedback_received",
          title: `Subscriber feedback on letter #${letterId}`,
          body: `Subscriber provided feedback on "${ctx.letter.subject}" (light-edit path). Letter is back in the review queue.`,
          link: `/admin/letters/${letterId}`,
        });
      }
    } catch (notifyErr) {
      logger.error({ err: notifyErr }, "[processSubscriberFeedback] Light-edit notification failed:");
      captureServerException(notifyErr, { tags: { component: "letters", error_type: "light_edit_notify_failed" } });
    }
  }

  return { success: true, retriggerPipeline };
}

// ─── Retry From Rejected ───────────────────────────────────────────────────

export interface RetryFromRejectedInput {
  letterId: number;
  additionalContext?: string;
  updatedIntakeJson?: IntakeJson;
}

interface RetryFromRejectedCtx {
  userId: number;
  userName?: string | null;
  req: Request;
}

export async function retryFromRejected(
  input: RetryFromRejectedInput,
  ctx: RetryFromRejectedCtx,
) {
  const letter = await getLetterRequestById(input.letterId);
  if (!letter || letter.userId !== ctx.userId)
    throw new TRPCError({ code: "NOT_FOUND" });
  if (letter.status !== "rejected")
    throw new TRPCError({ code: "BAD_REQUEST", message: "Letter must be in rejected status to retry" });

  await logReviewAction({
    letterRequestId: input.letterId,
    reviewerId: ctx.userId,
    actorType: "subscriber",
    action: "retry_from_rejected",
    noteText: input.additionalContext ?? "Subscriber retrying after rejection",
    noteVisibility: "user_visible",
    fromStatus: "rejected",
    toStatus: "submitted",
  });

  if (input.additionalContext) {
    extractLessonFromSubscriberFeedback(input.letterId, input.additionalContext, ctx.userId, "subscriber_retry").catch(logger.error);
  }

  if (input.updatedIntakeJson) {
    const db = await (await import("../db")).getDb();
    if (db) {
      const { letterRequests } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(letterRequests)
        .set({ intakeJson: input.updatedIntakeJson, updatedAt: new Date() })
        .where(eq(letterRequests.id, input.letterId));
    }
  }

  const intake = input.updatedIntakeJson ?? letter.intakeJson;
  if (!intake) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No intake data available to re-run the pipeline. Please provide updated details.",
    });
  }

  await updateLetterStatus(input.letterId, "submitted");

  const appUrl = getAppUrl(ctx.req);
  try {
    await enqueuePipelineJob({
      type: "runPipeline",
      letterId: input.letterId,
      intake,
      userId: letter.userId,
      appUrl,
      label: "retryFromRejected",
    });
  } catch (enqueueErr) {
    logger.error({ err: enqueueErr }, "[Queue] Failed to enqueue pipeline job:");
    captureServerException(enqueueErr, { tags: { component: "queue", error_type: "enqueue_failed" } });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to start letter reprocessing. Please try again.",
    });
  }

  // Parallelize post-enqueue notifications — subscriber email, in-app, and admin are independent
  try {
    const subscriberPromise = getUserById(ctx.userId).then(async (subscriber) => {
      if (subscriber?.email) {
        await sendStatusUpdateEmail({
          to: subscriber.email,
          name: subscriber.name ?? "Subscriber",
          subject: letter.subject,
          newStatus: "submitted",
          appUrl,
          letterId: input.letterId,
        });
      }
    });
    const notifPromise = createNotification({
      userId: ctx.userId,
      type: "retry_from_rejected",
      title: "Letter resubmitted for processing",
      body: `Your letter "${letter.subject}" has been resubmitted and is being reprocessed.`,
      link: `/letters/${input.letterId}`,
    });
    const adminPromise = notifyAdmins({
      category: "letters",
      type: "retry_from_rejected",
      title: `Subscriber retried rejected letter #${input.letterId}`,
      body: `${ctx.userName ?? "A subscriber"} retried "${letter.subject}" after rejection.`,
      link: `/admin/letters/${input.letterId}`,
    });
    await Promise.allSettled([subscriberPromise, notifPromise, adminPromise]);
  } catch (err) {
    logger.error({ err: err }, "[retryFromRejected] Notification error:");
    captureServerException(err, { tags: { component: "letters", error_type: "retry_notification_failed" } });
  }

  return { success: true };
}

// ─── Send To Recipient ─────────────────────────────────────────────────────

export interface SendToRecipientInput {
  letterId: number;
  recipientEmail: string;
  subjectOverride?: string;
  note?: string;
}

interface SendToRecipientCtx {
  userId: number;
  userRole: "subscriber" | "employee" | "admin" | "attorney";
  userName?: string | null;
  req: Request;
}

export async function sendLetterToRecipientFlow(
  input: SendToRecipientInput,
  ctx: SendToRecipientCtx,
) {
  const letter = await getLetterRequestById(input.letterId);
  if (!letter || letter.userId !== ctx.userId)
    throw new TRPCError({ code: "NOT_FOUND" });
  if (letter.status !== "approved" && letter.status !== "client_approved" && letter.status !== "sent")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only approved or sent letters can be sent to recipients",
    });

  const versions = await getLetterVersionsByRequestId(input.letterId, false);
  const finalVersion = versions.find((v) => v.versionType === "final_approved");
  if (!finalVersion)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No approved letter version found",
    });

  await sendLetterToRecipient({
    recipientEmail: input.recipientEmail,
    letterSubject: letter.subject,
    subjectOverride: input.subjectOverride?.trim() || undefined,
    note: input.note?.trim() || undefined,
    pdfUrl: letter.pdfUrl ?? undefined,
    htmlContent: finalVersion.content,
  });

  // Parallelize: status update + review action are independent
  try {
    await Promise.all([
      updateLetterStatus(input.letterId, "sent", { force: true }),
      logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.userId,
        actorType: ctx.userRole,
        action: "letter_sent_to_recipient",
        noteText: `Letter delivered to ${input.recipientEmail}`,
        noteVisibility: "internal",
        fromStatus: letter.status,
        toStatus: "sent",
      }),
    ]);
  } catch (err) {
    logger.error({ err: err }, "[sendToRecipient] Failed to update status to sent:");
    captureServerException(err, { tags: { component: "letters", error_type: "update_sent_status_failed" } });
  }

  // Fire-and-forget: admin notification is non-blocking
  notifyAdmins({
    category: "letters",
    type: "letter_sent_to_recipient",
    title: `Letter #${input.letterId} sent to recipient`,
    body: `Letter "${letter.subject}" was sent to ${input.recipientEmail}.`,
    link: `/admin/letters/${input.letterId}`,
  }).catch(err => {
    logger.error({ err: err }, "[notifyAdmins] letter_sent_to_recipient:");
    captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_sent_to_recipient" } });
  });

  return { success: true };
}

// ─── Client Decline ────────────────────────────────────────────────────────

export interface ClientDeclineInput {
  letterId: number;
  reason?: string;
}

interface ClientDeclineCtx {
  userId: number;
  userName?: string | null;
  req: Request;
}

export async function clientDeclineLetter(
  input: ClientDeclineInput,
  ctx: ClientDeclineCtx,
) {
  const letter = await getLetterRequestById(input.letterId);
  if (!letter || letter.userId !== ctx.userId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (letter.status !== "client_approval_pending") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Letter is not awaiting client approval",
    });
  }
  // Parallelize: status update + review action are independent
  await Promise.all([
    updateLetterStatus(input.letterId, "client_declined"),
    logReviewAction({
      letterRequestId: input.letterId,
      reviewerId: ctx.userId,
      actorType: "subscriber",
      action: "client_declined",
      noteText: input.reason || "Subscriber declined the letter",
      noteVisibility: "user_visible",
      fromStatus: "client_approval_pending",
      toStatus: "client_declined",
    }),
  ]);
  try {
    await notifyAdmins({
      category: "letters",
      type: "client_declined",
      title: `Client declined letter #${input.letterId}`,
      body: `${ctx.userName ?? "A subscriber"} declined "${letter.subject}".${input.reason ? ` Reason: ${input.reason}` : ""}`,
      link: `/admin/letters/${input.letterId}`,
      emailOpts: {
        subject: `Client Declined Letter #${input.letterId}`,
        preheader: `Client declined letter "${letter.subject}"`,
        bodyHtml: `<p>Hello,</p><p><strong>${ctx.userName ?? "A subscriber"}</strong> has declined letter <strong>#${input.letterId}</strong> — "${letter.subject}".</p>${input.reason ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEE2E2;border-left:4px solid #EF4444;border-radius:4px;color:#991B1B;">${input.reason}</blockquote>` : ""}`,
        ctaText: "View Letter",
        ctaUrl: `${getAppUrl(ctx.req)}/admin/letters/${input.letterId}`,
      },
    });
  } catch (err) {
    logger.error({ err: err }, "[notifyAdmins] client_declined:");
    captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_client_declined" } });
  }
  return { success: true };
}
