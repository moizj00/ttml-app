import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit, getClientIp } from "../rateLimiter";
import { documentAnalysisResultLenientSchema, type DocumentAnalysisResult } from "../../shared/types";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import {
  adminProcedure,
  emailVerifiedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../_core/trpc";
import {
  claimLetterForReview,
  createAttachment,
  createLetterRequest,
  createLetterVersion,
  createNotification,
  notifyAdmins,
  getAllLetterRequests,
  getAllUsers,
  getAllUsersWithSubscription,
  markAsPaidDb,
  getAttachmentsByLetterId,
  getEmployeesAndAdmins,
  getFailedJobs,
  getLetterRequestById,
  getLetterRequestSafeForSubscriber,
  getLetterRequestsByUserId,
  getLetterVersionById,
  getLetterVersionsByRequestId,
  getNotificationsByUserId,
  getResearchRunsByLetterId,
  getReviewActions,
  getCostAnalytics,
  getSystemStats,
  getWorkflowJobsByLetterId,
  logReviewAction,
  markAllNotificationsRead,
  markNotificationRead,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateUserRole,
  updateUserProfile,
  getUserById,
  getUserByEmail,
  deleteUserVerificationTokens,
  createEmailVerificationToken,
  purgeFailedJobs,
  updateLetterPdfUrl,
  archiveLetterRequest,
  createDiscountCodeForEmployee,
  getDiscountCodeByEmployeeId,
  rotateDiscountCode,
  getDiscountCodeByCode,
  getAllDiscountCodes,
  updateDiscountCode,
  getCommissionsByEmployeeId,
  getEmployeeEarningsSummary,
  getAllCommissions,
  getAdminReferralDetails,
  markCommissionsPaid,
  createPayoutRequest,
  getPayoutRequestsByEmployeeId,
  getAllPayoutRequests,
  processPayoutRequest,
  getPayoutRequestById,
  getAllEmployeeEarnings,
  decrementLettersUsed,
  claimFreeTrialSlot,
  refundFreeTrialSlot,
  getAllLessons,
  createPipelineLesson,
  updatePipelineLesson,
  getQualityScoreStats,
  getQualityScoreTrend,
  getQualityScoresByLetterType,
  getLessonImpactSummary,
  assignRoleId,
  getPublishedBlogPosts,
  getBlogPostBySlug,
  getAllBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  getBlogPostSlugById,
  getPipelineAnalytics,
} from "../db";
import { invalidateBlogPostCache } from "../blogCacheInvalidation";
import { getCachedBlogPosts, getCachedBlogPost } from "../blogCache";
import {
  sendLetterApprovedEmail,
  sendLetterRejectedEmail,
  sendNeedsChangesEmail,
  sendNewReviewNeededEmail,
  sendLetterSubmissionEmail,
  sendLetterUnlockedEmail,
  sendStatusUpdateEmail,
  sendVerificationEmail,
  sendReviewAssignedEmail,
  sendPayoutCompletedEmail,
  sendPayoutRejectedEmail,
  sendLetterToRecipient,
  sendAttorneyInvitationEmail,
  sendAttorneyWelcomeEmail,
  sendClientRevisionRequestEmail,
} from "../email";
import { captureServerException } from "../sentry";
import { enqueuePipelineJob, enqueueRetryFromStageJob, getPipelineQueue } from "../queue";
import { extractLessonFromApproval, extractLessonFromRejection, extractLessonFromChangesRequest, extractLessonFromEdit, extractLessonFromSubscriberFeedback, computeAndStoreQualityScore, consolidateLessonsForScope } from "../learning";
import type { InsertPipelineLesson } from "../../drizzle/schema";
import { BLOG_CATEGORIES } from "../../drizzle/schema";
import { generateAndUploadApprovedPdf } from "../pdfGenerator";
import { storagePut } from "../storage";
import { invalidateUserCache, getOriginUrl } from "../supabaseAuth";
import {
  createCheckoutSession,
  createBillingPortalSession,
  createLetterUnlockCheckout,
  createTrialReviewCheckout,
  createRevisionConsultationCheckout,
  getUserSubscription,
  checkLetterSubmissionAllowed,
  incrementLettersUsed,
  hasActiveRecurringSubscription,
} from "../stripe";

/**
 * Sync a discount code to/from the Cloudflare Worker KV allowlist.
 * Called fire-and-forget (errors are swallowed) — the Worker degrades gracefully
 * to not redirecting unknown codes; any temporary sync failure is non-critical.
 */
async function syncCodeToWorkerAllowlist(code: string, action: "add" | "remove"): Promise<void> {
  const workerUrl = process.env.AFFILIATE_WORKER_URL ?? "";
  const secret = process.env.AFFILIATE_WORKER_SECRET ?? "";
  if (!workerUrl || !secret) return;

  await fetch(`${workerUrl.replace(/\/$/, "")}/admin/codes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ code, action }),
    signal: AbortSignal.timeout(5000),
  });
}

const intakeJsonSchema = z.object({
  schemaVersion: z.string().default("1.0"),
  letterType: z.string(),
  sender: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  recipient: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  jurisdiction: z.object({
    country: z.string(),
    state: z.string(),
    city: z.string().optional(),
  }),
  matter: z.object({
    category: z.string(),
    subject: z.string(),
    description: z.string(),
    incidentDate: z.string().optional(),
  }),
  financials: z
    .object({
      amountOwed: z.number().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  desiredOutcome: z.string(),
  deadlineDate: z.string().optional(),
  additionalContext: z.string().optional(),
  tonePreference: z
    .enum(["firm", "moderate", "aggressive"])
    .optional(),
  language: z.string().optional(),
  priorCommunication: z.string().optional(),
  deliveryMethod: z.string().optional(),
  communications: z
    .object({
      summary: z.string(),
      lastContactDate: z.string().optional(),
      method: z
        .enum(["email", "phone", "letter", "in-person", "other"])
        .optional(),
    })
    .optional(),
  toneAndDelivery: z
    .object({
      tone: z.enum(["firm", "moderate", "aggressive"]),
      deliveryMethod: z
        .enum(["email", "certified-mail", "hand-delivery"])
        .optional(),
    })
    .optional(),
  situationFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  exhibits: z
    .array(
      z.object({
        label: z.string(),
        description: z.string().optional(),
        hasAttachment: z.boolean().optional(),
      })
    )
    .optional(),
  evidenceSummary: z.string().optional(),
});


// ─── Role Guards ──────────────────────────────────────────────────────────────

const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "employee" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Employee or Admin access required",
    });
  }
  return next({ ctx });
});

const attorneyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "attorney" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Attorney or Admin access required",
    });
  }
  return next({ ctx });
});

const subscriberProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "subscriber") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Subscriber access required",
    });
  }
  return next({ ctx });
});

const verifiedSubscriberProcedure = emailVerifiedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "subscriber") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Subscriber access required",
    });
  }
  return next({ ctx });
});

function getAppUrl(req: {
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (host && !String(host).includes("localhost")) {
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    return `${proto}://${host}`;
  }
  return "https://www.talk-to-my-lawyer.com";
}

// ═══════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════


export const lettersRouter = router({
    submit: verifiedSubscriberProcedure
      .input(
        z.object({
          letterType: z.enum([
            "demand-letter",
            "cease-and-desist",
            "contract-breach",
            "eviction-notice",
            "employment-dispute",
            "consumer-complaint",
            "general-legal",
            "pre-litigation-settlement",
            "debt-collection",
            "estate-probate",
            "landlord-tenant",
            "insurance-dispute",
            "personal-injury-demand",
            "intellectual-property",
            "family-law",
            "neighbor-hoa",
          ]),
          subject: z.string().min(5).max(500),
          issueSummary: z.string().optional(),
          jurisdictionCountry: z.string().default("US"),
          jurisdictionState: z.string().min(2),
          jurisdictionCity: z.string().optional(),
          intakeJson: intakeJsonSchema,
          priority: z
            .enum(["low", "normal", "high", "urgent"])
            .default("normal"),
          templateId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkTrpcRateLimit("letter", `user:${ctx.user.id}`, true);

        // ── Step 1: Check entitlement (non-atomic read, fast path) ────────────
        const entitlement = await checkLetterSubmissionAllowed(ctx.user.id);
        if (!entitlement.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: entitlement.reason ?? "You are not allowed to submit a letter at this time.",
          });
        }

        // ── Step 2: Atomically claim usage before creating the letter ─────────
        // This prevents TOCTOU races where two concurrent requests both see
        // count=0 (for free trial) or lettersUsed < lettersAllowed (for paid).
        let isFreeTrialSubmission = false;
        if (entitlement.firstLetterFree) {
          // Free-trial path: atomically claim the slot via conditional UPDATE
          isFreeTrialSubmission = true;
          const claimed = await claimFreeTrialSlot(ctx.user.id);
          if (!claimed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Your free first letter has already been used. Please subscribe to continue.",
            });
          }
        } else if (entitlement.subscription) {
          // Paid subscriber path: atomically increment, reject if exhausted
          const incremented = await incrementLettersUsed(ctx.user.id);
          if (!incremented) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `You have used all letter(s) in your plan. Please upgrade to continue.`,
            });
          }
        }

        // ── Step 3: Create the letter request (compensate usage on failure) ──────
        let result: any;
        try {
          result = await createLetterRequest({
            userId: ctx.user.id,
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
          // Usage was already claimed — roll it back before re-throwing
          try {
            if (isFreeTrialSubmission) {
              await refundFreeTrialSlot(ctx.user.id);
            } else if (entitlement.subscription) {
              await decrementLettersUsed(ctx.user.id);
            }
          } catch (refundErr) {
            console.error("[Submit] Failed to refund usage after letter creation failure:", refundErr);
            captureServerException(refundErr, { tags: { component: "letters", error_type: "usage_refund_on_create_failed" } });
          }
          throw createErr;
        }
        const letterId = (result as any)?.insertId;

        await logReviewAction({
          letterRequestId: letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "letter_submitted",
          fromStatus: undefined,
          toStatus: "submitted",
        });

        // Send submission confirmation email (non-blocking)
        const appUrl = getAppUrl(ctx.req);
        if (ctx.user.email)
          sendLetterSubmissionEmail({
            to: ctx.user.email,
            name: ctx.user.name ?? "Subscriber",
            subject: input.subject,
            letterId,
            letterType: input.letterType,
            jurisdictionState: input.jurisdictionState,
            appUrl,
          }).catch(err =>
            { console.error("[Email] Submission confirmation failed:", err); captureServerException(err, { tags: { component: "letters", error_type: "submission_email_failed" } }); }
          );

        try {
          await enqueuePipelineJob({
            type: "runPipeline",
            letterId,
            intake: input.intakeJson,
            userId: ctx.user.id,
            appUrl,
            label: "submit",
            usageContext: { shouldRefundOnFailure: true, isFreeTrialSubmission },
          });
        } catch (enqueueErr) {
          console.error("[Queue] Failed to enqueue pipeline job:", enqueueErr);
          captureServerException(enqueueErr, { tags: { component: "queue", error_type: "enqueue_failed" } });
          try {
            if (isFreeTrialSubmission) {
              await refundFreeTrialSlot(ctx.user.id);
            } else if (entitlement.subscription) {
              await decrementLettersUsed(ctx.user.id);
            }
          } catch (refundErr) {
            console.error("[Queue] Failed to refund usage after enqueue failure:", refundErr);
            captureServerException(refundErr, { tags: { component: "queue", error_type: "enqueue_refund_failed" } });
          }
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
            body: `${ctx.user.name ?? ctx.user.email ?? "A subscriber"} submitted a ${input.letterType} letter: "${input.subject}"`,
            link: `/admin/letters/${letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_submitted:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_submitted" } });
        }

        return { letterId, status: "submitted" };
      }),

    adminSubmit: adminProcedure
      .input(
        z.object({
          letterType: z.enum([
            "demand-letter",
            "cease-and-desist",
            "contract-breach",
            "eviction-notice",
            "employment-dispute",
            "consumer-complaint",
            "general-legal",
            "pre-litigation-settlement",
            "debt-collection",
            "estate-probate",
            "landlord-tenant",
            "insurance-dispute",
            "personal-injury-demand",
            "intellectual-property",
            "family-law",
            "neighbor-hoa",
          ]),
          subject: z.string().min(5).max(500),
          issueSummary: z.string().optional(),
          jurisdictionCountry: z.string().default("US"),
          jurisdictionState: z.string().min(2),
          jurisdictionCity: z.string().optional(),
          intakeJson: intakeJsonSchema,
          priority: z
            .enum(["low", "normal", "high", "urgent"])
            .default("normal"),
          templateId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkTrpcRateLimit("letter", `admin:${ctx.user.id}`, true);

        let result: any;
        try {
          result = await createLetterRequest({
            userId: ctx.user.id,
            letterType: input.letterType,
            subject: input.subject,
            issueSummary: input.issueSummary,
            jurisdictionCountry: input.jurisdictionCountry,
            jurisdictionState: input.jurisdictionState,
            jurisdictionCity: input.jurisdictionCity,
            intakeJson: input.intakeJson,
            priority: input.priority,
            templateId: input.templateId,
            submittedByAdmin: true,
          });
        } catch (createErr) {
          throw createErr;
        }
        const letterId = (result as any)?.insertId;

        await logReviewAction({
          letterRequestId: letterId,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "letter_submitted",
          fromStatus: undefined,
          toStatus: "submitted",
          noteText: "Letter submitted by admin (bypass billing).",
          noteVisibility: "internal",
        });

        const appUrl = getAppUrl(ctx.req);
        try {
          await enqueuePipelineJob({
            type: "runPipeline",
            letterId,
            intake: input.intakeJson,
            userId: ctx.user.id,
            appUrl,
            label: "admin_submit",
          });
        } catch (enqueueErr) {
          console.error("[Queue] Failed to enqueue admin pipeline job:", enqueueErr);
          captureServerException(enqueueErr, { tags: { component: "queue", error_type: "admin_enqueue_failed" } });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to start letter processing. Please try again.",
          });
        }

        return { letterId, status: "submitted" };
      }),

    myLetters: subscriberProcedure.query(async ({ ctx }) => {
      return getLetterRequestsByUserId(ctx.user.id);
    }),

    detail: subscriberProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const letter = await getLetterRequestSafeForSubscriber(
          input.id,
          ctx.user.id
        );
        if (!letter)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Letter not found",
          });
        const actions = await getReviewActions(input.id, false);
        const versions = await getLetterVersionsByRequestId(input.id, false, letter.status);
        const attachmentList = await getAttachmentsByLetterId(input.id);
        return { letter, actions, versions, attachments: attachmentList };
      }),

    updateForChanges: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          additionalContext: z.string().min(10).max(5000),
          updatedIntakeJson: intakeJsonSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkTrpcRateLimit("letter", `user:${ctx.user.id}`, true);
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (letter.status !== "needs_changes")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in needs_changes status",
          });

        // Read the retriggerPipeline preference stored in the latest requested_changes review action
        let retriggerPipeline = true; // default: re-run pipeline
        try {
          const reviewActions = await getReviewActions(input.letterId);
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
          // If parsing fails, default to pipeline re-run
          retriggerPipeline = true;
        }

        const toStatus = retriggerPipeline ? "submitted" : "pending_review";

        // Log the subscriber's response
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "subscriber_updated",
          noteText: input.additionalContext,
          noteVisibility: "user_visible",
          fromStatus: "needs_changes",
          toStatus,
        });

        extractLessonFromSubscriberFeedback(input.letterId, input.additionalContext, ctx.user.id, "subscriber_update").catch(console.error);

        // If updated intake provided, update the letter request
        if (input.updatedIntakeJson) {
          const db = await (await import("../db")).getDb();
          if (db) {
            const { letterRequests } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db
              .update(letterRequests)
              .set({
                intakeJson: input.updatedIntakeJson,
                updatedAt: new Date(),
              } as any)
              .where(eq(letterRequests.id, input.letterId));
          }
        }

        if (retriggerPipeline) {
          // Full pipeline re-run path: transition to submitted and enqueue
          await updateLetterStatus(input.letterId, "submitted");
          const intake = input.updatedIntakeJson ?? letter.intakeJson;
          if (intake) {
            const appUrl = getAppUrl(ctx.req);
            try {
              await enqueuePipelineJob({
                type: "runPipeline",
                letterId: input.letterId,
                intake,
                userId: letter.userId,
                appUrl,
                label: "updateForChanges",
              });
            } catch (enqueueErr) {
              console.error("[Queue] Failed to enqueue pipeline job:", enqueueErr);
              captureServerException(enqueueErr, { tags: { component: "queue", error_type: "enqueue_failed" } });
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to start letter reprocessing. Please try again.",
              });
            }
          }
        } else {
          // Light-edit path: go back to pending_review so attorney can apply edits manually
          await updateLetterStatus(input.letterId, "pending_review");
          // Notify assigned attorney (or admins if none assigned)
          try {
            const appUrl = getAppUrl(ctx.req);
            if (letter.assignedReviewerId) {
              const attorney = await getUserById(letter.assignedReviewerId);
              if (attorney?.email) {
                await sendStatusUpdateEmail({
                  to: attorney.email,
                  name: attorney.name ?? "Attorney",
                  subject: letter.subject,
                  letterId: input.letterId,
                  newStatus: "pending_review",
                  appUrl,
                });
              }
              await createNotification({
                userId: letter.assignedReviewerId,
                type: "subscriber_feedback_received",
                title: "Subscriber responded with feedback",
                body: `Subscriber provided feedback on "${letter.subject}". Please apply the requested edits.`,
                link: `/review/${input.letterId}`,
              });
            } else {
              await notifyAdmins({
                category: "letters",
                type: "subscriber_feedback_received",
                title: `Subscriber feedback on letter #${input.letterId}`,
                body: `Subscriber provided feedback on "${letter.subject}" (light-edit path). Letter is back in the review queue.`,
                link: `/admin/letters/${input.letterId}`,
              });
            }
          } catch (notifyErr) {
            console.error("[updateForChanges] Light-edit notification failed:", notifyErr);
            captureServerException(notifyErr, { tags: { component: "letters", error_type: "light_edit_notify_failed" } });
          }
        }

        return { success: true, retriggerPipeline };
      }),

    retryFromRejected: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          additionalContext: z.string().min(10).max(5000).optional(),
          updatedIntakeJson: intakeJsonSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkTrpcRateLimit("letter", `user:${ctx.user.id}`, true);
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (letter.status !== "rejected")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in rejected status to retry",
          });

        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "retry_from_rejected",
          noteText: input.additionalContext ?? "Subscriber retrying after rejection",
          noteVisibility: "user_visible",
          fromStatus: "rejected",
          toStatus: "submitted",
        });

        if (input.additionalContext) {
          extractLessonFromSubscriberFeedback(input.letterId, input.additionalContext, ctx.user.id, "subscriber_retry").catch(console.error);
        }

        if (input.updatedIntakeJson) {
          const db = await (await import("../db")).getDb();
          if (db) {
            const { letterRequests } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db
              .update(letterRequests)
              .set({
                intakeJson: input.updatedIntakeJson,
                updatedAt: new Date(),
              } as any)
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
          console.error("[Queue] Failed to enqueue pipeline job:", enqueueErr);
          captureServerException(enqueueErr, { tags: { component: "queue", error_type: "enqueue_failed" } });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to start letter reprocessing. Please try again.",
          });
        }

        try {
          const subscriber = await getUserById(ctx.user.id);
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
          await createNotification({
            userId: ctx.user.id,
            type: "retry_from_rejected",
            title: "Letter resubmitted for processing",
            body: `Your letter "${letter.subject}" has been resubmitted and is being reprocessed.`,
            link: `/letters/${input.letterId}`,
          });
          await notifyAdmins({
            category: "letters",
            type: "retry_from_rejected",
            title: `Subscriber retried rejected letter #${input.letterId}`,
            body: `${ctx.user.name ?? "A subscriber"} retried "${letter.subject}" after rejection.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[retryFromRejected] Notification error:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "retry_notification_failed" } });
        }

        return { success: true };
      }),

    archive: subscriberProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (!["approved", "client_approved", "rejected", "client_declined", "sent"].includes(letter.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only completed letters can be archived",
          });
        await archiveLetterRequest(input.letterId, ctx.user.id);
        return { success: true };
      }),

    sendToRecipient: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          recipientEmail: z.string().email(),
          subjectOverride: z.string().max(500).optional(),
          note: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
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

        // Mark letter as sent now that delivery succeeded
        try {
          await updateLetterStatus(input.letterId, "sent", { force: true });
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: ctx.user.role as any,
            action: "letter_sent_to_recipient",
            noteText: `Letter delivered to ${input.recipientEmail}`,
            noteVisibility: "internal",
            fromStatus: letter.status,
            toStatus: "sent",
          });
        } catch (err) {
          console.error("[sendToRecipient] Failed to update status to sent:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "update_sent_status_failed" } });
        }

        try {
          await notifyAdmins({
            category: "letters",
            type: "letter_sent_to_recipient",
            title: `Letter #${input.letterId} sent to recipient`,
            body: `Letter "${letter.subject}" was sent to ${input.recipientEmail}.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_sent_to_recipient:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_sent_to_recipient" } });
        }

        return { success: true };
      }),

    uploadAttachment: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          fileName: z.string(),
          mimeType: z.string(),
          base64Data: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        const buffer = Buffer.from(input.base64Data, "base64");
        // Strip path separators and non-safe chars to prevent path traversal
        const safeName =
          input.fileName
            .replace(/[/\\]/g, "_")
            .replace(/[^a-zA-Z0-9._\-]/g, "_")
            .slice(0, 200) || "attachment";
        const key = `attachments/${ctx.user.id}/${input.letterId}/${Date.now()}-${safeName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        await createAttachment({
          letterRequestId: input.letterId,
          uploadedByUserId: ctx.user.id,
          storagePath: key,
          storageUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: buffer.length,
        });
        return { url, key };
      }),

    requestClientApproval: attorneyProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (ctx.user.role !== "admin" && letter.assignedReviewerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the assigned reviewer or an admin can request client approval",
          });
        }
        if (letter.status !== "approved") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in approved status to request client approval",
          });
        }
        await updateLetterStatus(input.letterId, "client_approval_pending");
        const actorType = ctx.user.role === "admin" ? "admin" as const : "attorney" as const;
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType,
          action: "requested_client_approval",
          noteText: "Attorney requested client approval before final delivery",
          noteVisibility: "user_visible",
          fromStatus: "approved",
          toStatus: "client_approval_pending",
        });
        try {
          if (letter.userId != null) {
            const subscriber = await getUserById(letter.userId);
            const appUrl = getAppUrl(ctx.req);
            if (subscriber?.email) {
              await sendStatusUpdateEmail({
                to: subscriber.email,
                name: subscriber.name ?? "Subscriber",
                subject: letter.subject,
                letterId: input.letterId,
                newStatus: "client_approval_pending",
                appUrl,
              });
            }
            await createNotification({
              userId: letter.userId,
              type: "client_approval_pending",
              title: "Your letter is ready for final approval",
              body: "Please review your attorney-approved letter and click Approve & Proceed to confirm delivery.",
              link: `/letters/${input.letterId}`,
            });
          }
        } catch (err) {
          console.error("[requestClientApproval] Notification error:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "client_approval_notification_failed" } });
        }
        try {
          await notifyAdmins({
            category: "letters",
            type: "letter_pending_client_approval",
            title: `Letter #${input.letterId} sent for client approval`,
            body: `Letter "${letter.subject}" is now pending client approval.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_pending_client_approval:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_pending_approval" } });
        }
        return { success: true };
      }),

    clientApprove: subscriberProcedure
      .input(z.object({
        letterId: z.number(),
        recipientEmail: z.string().email().optional(),
        subjectOverride: z.string().max(200).optional(),
        note: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (letter.status !== "client_approval_pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not awaiting client approval",
          });
        }

        // Get the final_approved version content for PDF generation
        let finalContent: string | undefined;
        if (letter.currentFinalVersionId) {
          const finalVersion = await getLetterVersionById(letter.currentFinalVersionId);
          finalContent = finalVersion?.content ?? undefined;
        }

        // Transition to client_approved
        await updateLetterStatus(input.letterId, "client_approved");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "client_approved",
          noteText: input.note ?? "Subscriber approved the letter",
          noteVisibility: "user_visible",
          fromStatus: "client_approval_pending",
          toStatus: "client_approved",
        });

        // Generate PDF now that subscriber has approved
        let pdfUrl: string | undefined;
        if (finalContent) {
          try {
            const pdfResult = await generateAndUploadApprovedPdf({
              letterId: input.letterId,
              letterType: letter.letterType,
              subject: input.subjectOverride ?? letter.subject,
              content: finalContent,
              approvedBy: ctx.user.name ?? undefined,
              approvedAt: new Date().toISOString(),
              jurisdictionState: letter.jurisdictionState,
              jurisdictionCountry: letter.jurisdictionCountry,
              intakeJson: letter.intakeJson as any,
            });
            pdfUrl = pdfResult.pdfUrl;
            await updateLetterPdfUrl(input.letterId, pdfUrl);
            console.log(`[ClientApprove] PDF generated for letter #${input.letterId}: ${pdfUrl}`);
          } catch (pdfErr) {
            captureServerException(pdfErr, { tags: { component: "letters", error_type: "pdf_generation_failed" }, extra: { letterId: input.letterId } });
            console.error(`[ClientApprove] PDF generation failed for letter #${input.letterId}:`, pdfErr);
            // Non-blocking: approval still succeeds even if PDF fails
          }
        }

        // If recipientEmail was provided, send the letter to the recipient in one step
        let recipientSent = false;
        let recipientSendError: string | undefined;
        if (input.recipientEmail) {
          try {
            const versions = await getLetterVersionsByRequestId(input.letterId, false);
            const finalVer = versions.find((v) => v.versionType === "final_approved");
            await sendLetterToRecipient({
              recipientEmail: input.recipientEmail,
              letterSubject: letter.subject,
              subjectOverride: input.subjectOverride?.trim() || undefined,
              note: input.note?.trim() || undefined,
              pdfUrl: pdfUrl ?? letter.pdfUrl ?? undefined,
              htmlContent: finalVer?.content ?? finalContent ?? "",
            });
            recipientSent = true;
            console.log(`[ClientApprove] Letter #${input.letterId} sent to ${input.recipientEmail}`);
          } catch (sendErr) {
            recipientSendError = sendErr instanceof Error ? sendErr.message : "Failed to send";
            captureServerException(sendErr, { tags: { component: "letters", error_type: "client_approve_send_failed" }, extra: { letterId: input.letterId, recipientEmail: input.recipientEmail } });
            console.error(`[ClientApprove] Failed to send letter #${input.letterId} to recipient:`, sendErr);
          }
        }

        // Transition to sent only if recipient delivery succeeded
        // Approve Only (no recipient) stays at client_approved for download/manual send
        // Approve & Send with failed delivery also stays at client_approved for retry
        if (recipientSent) {
          await updateLetterStatus(input.letterId, "sent", { force: true });
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: "subscriber",
            action: recipientSent ? "letter_sent_to_recipient" : "letter_sent",
            noteText: recipientSent
              ? `Letter approved, PDF generated, and delivered to ${input.recipientEmail}.`
              : `Letter approved and PDF generated${pdfUrl ? " — PDF available" : ""}.`,
            noteVisibility: "user_visible",
            fromStatus: "client_approved",
            toStatus: "sent",
          });
        } else {
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: "subscriber",
            action: "pdf_generated",
            noteText: recipientSendError
              ? `PDF generated${pdfUrl ? " — available for download" : ""}. Sending to recipient failed — you can retry from the letter page.`
              : `PDF generated${pdfUrl ? " — available for download" : ""}.`,
            noteVisibility: "user_visible",
            fromStatus: "client_approved",
            toStatus: "client_approved",
          });
        }

        // Notify subscriber with PDF link
        try {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(ctx.user.id);
          if (subscriber?.email) {
            await sendLetterApprovedEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              appUrl,
              pdfUrl,
            });
          }
          await createNotification({
            userId: ctx.user.id,
            type: "letter_sent",
            title: "Your letter is ready!",
            body: `Your letter "${letter.subject}" has been approved and your PDF is ready to download.${pdfUrl ? " A PDF copy is available." : ""}`,
            link: `/letters/${input.letterId}`,
          });
        } catch (notifyErr) {
          console.error("[ClientApprove] Subscriber notification failed:", notifyErr);
          captureServerException(notifyErr, { tags: { component: "letters", error_type: "client_approve_notify_failed" } });
        }

        try {
          await notifyAdmins({
            category: "letters",
            type: "client_approved",
            title: `Client approved letter #${input.letterId}`,
            body: `${ctx.user.name ?? "A subscriber"} approved "${letter.subject}" — PDF generated.${recipientSent ? ` Letter sent to ${input.recipientEmail}.` : ""}${pdfUrl ? " PDF available." : ""}`,
            link: `/admin/letters/${input.letterId}`,
            emailOpts: {
              subject: `Client Approved Letter #${input.letterId}`,
              preheader: `Client approved letter "${letter.subject}"`,
              bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "A subscriber"}</strong> has approved letter <strong>#${input.letterId}</strong> — "${letter.subject}". PDF has been generated.${recipientSent ? ` Letter was sent to ${input.recipientEmail}.` : ""}</p>`,
              ctaText: "View Letter",
              ctaUrl: `${getAppUrl(ctx.req)}/admin/letters/${input.letterId}`,
            },
          });
        } catch (err) {
          console.error("[notifyAdmins] client_approved:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_client_approved" } });
        }
        return { success: true, pdfUrl, recipientSent, recipientSendError };
      }),

    clientRequestRevision: subscriberProcedure
      .input(z.object({
        letterId: z.number(),
        revisionNotes: z.string().min(10, "Please provide at least 10 characters of feedback").max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const allowedStatuses = ["client_approval_pending", "client_approved", "sent"];
        if (!allowedStatuses.includes(letter.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in a state that allows revision requests",
          });
        }

        const isPostApproval = letter.status === "client_approved" || letter.status === "sent";

        // Revision limit guardrail
        const allActions = await getReviewActions(input.letterId);
        const revisionCount = allActions.filter(a => a.action === "client_revision_requested").length;
        if (revisionCount >= 5) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Maximum revision limit reached (5 revisions). Please contact support if you need further changes.",
          });
        }
        // Warn at 3+ but allow
        const revisionWarning = revisionCount >= 3
          ? `This is revision ${revisionCount + 1} of 5. You have ${5 - revisionCount - 1} revision(s) remaining.`
          : undefined;

        // ─── Paid revision gate ─────────────────────────────────────────────
        // Pre-approval: first revision (revisionCount === 0) is free, subsequent cost $20.
        // Post-approval: first post-approval edit is free, second+ cost $20.
        // We count post-approval edits separately for the fee trigger.
        const postApprovalEditCount = isPostApproval
          ? allActions.filter(a => a.action === "client_revision_requested" && (a.fromStatus === "client_approved" || a.fromStatus === "sent")).length
          : 0;
        const requiresPayment = isPostApproval ? postApprovalEditCount >= 1 : revisionCount >= 1;
        if (requiresPayment) {
          const origin = getOriginUrl(ctx.req);
          const checkout = await createRevisionConsultationCheckout({
            userId: ctx.user.id,
            email: ctx.user.email ?? "",
            name: ctx.user.name,
            letterId: input.letterId,
            revisionNotes: input.revisionNotes,
            origin,
          });
          // Return checkout URL — client will redirect to Stripe
          return {
            success: false,
            requiresPayment: true,
            checkoutUrl: checkout.url,
            revisionCount,
            revisionWarning,
          };
        }

        await updateLetterStatus(input.letterId, "client_revision_requested");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "client_revision_requested",
          noteText: input.revisionNotes,
          noteVisibility: "user_visible",
          fromStatus: letter.status,
          toStatus: "client_revision_requested",
        });

        try {
          const appUrl = getAppUrl(ctx.req);
          if (letter.assignedReviewerId) {
            const attorney = await getUserById(letter.assignedReviewerId);
            if (attorney?.email) {
              await sendClientRevisionRequestEmail({
                to: attorney.email,
                name: attorney.name ?? "Attorney",
                letterSubject: letter.subject,
                letterId: input.letterId,
                subscriberNotes: input.revisionNotes,
                appUrl,
              });
            }
            await createNotification({
              userId: letter.assignedReviewerId,
              type: "client_revision_requested",
              title: isPostApproval ? "Client requested post-approval edits" : "Client requested revisions",
              body: `A subscriber requested ${isPostApproval ? "post-approval edits" : "revisions"} on "${letter.subject}". Please review their notes and update the letter.`,
              link: `/review/${input.letterId}`,
            });
          }
          await notifyAdmins({
            category: "letters",
            type: "client_revision_requested",
            title: `Client requested revisions on letter #${input.letterId}`,
            body: `${ctx.user.name ?? "A subscriber"} requested revisions on "${letter.subject}".`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[clientRequestRevision] Notification error:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "client_revision_notification_failed" } });
        }
        return { success: true, revisionCount: revisionCount + 1, revisionWarning };
      }),

    clientDecline: subscriberProcedure
      .input(z.object({
        letterId: z.number(),
        reason: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (letter.status !== "client_approval_pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not awaiting client approval",
          });
        }
        await updateLetterStatus(input.letterId, "client_declined");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "client_declined",
          noteText: input.reason || "Subscriber declined the letter",
          noteVisibility: "user_visible",
          fromStatus: "client_approval_pending",
          toStatus: "client_declined",
        });
        try {
          await notifyAdmins({
            category: "letters",
            type: "client_declined",
            title: `Client declined letter #${input.letterId}`,
            body: `${ctx.user.name ?? "A subscriber"} declined "${letter.subject}".${input.reason ? ` Reason: ${input.reason}` : ""}`,
            link: `/admin/letters/${input.letterId}`,
            emailOpts: {
              subject: `Client Declined Letter #${input.letterId}`,
              preheader: `Client declined letter "${letter.subject}"`,
              bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "A subscriber"}</strong> has declined letter <strong>#${input.letterId}</strong> — "${letter.subject}".</p>${input.reason ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEE2E2;border-left:4px solid #EF4444;border-radius:4px;color:#991B1B;">${input.reason}</blockquote>` : ""}`,
              ctaText: "View Letter",
              ctaUrl: `${getAppUrl(ctx.req)}/admin/letters/${input.letterId}`,
            },
          });
        } catch (err) {
          console.error("[notifyAdmins] client_declined:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_client_declined" } });
        }
        return { success: true };
      }),
});
