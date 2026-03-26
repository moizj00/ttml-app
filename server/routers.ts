import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit, getClientIp } from "./rateLimiter";
import { documentAnalysisResultLenientSchema, type DocumentAnalysisResult } from "../shared/types";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
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
  markPriorPipelineRunsSuperseded,
  acquirePipelineLock,
  releasePipelineLock,
  decrementLettersUsed,
  claimFreeTrialSlot,
  refundFreeTrialSlot,
  getAllLessons,
  createPipelineLesson,
  updatePipelineLesson,
  getQualityScoreStats,
  getQualityScoreTrend,
  getQualityScoresByLetterType,
  assignRoleId,
  getPublishedBlogPosts,
  getBlogPostBySlug,
  getAllBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
} from "./db";
import {
  sendJobFailedAlertEmail,
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
} from "./email";
import { captureServerException } from "./sentry";
import { runFullPipeline, retryPipelineFromStage } from "./pipeline";
import { extractLessonFromApproval, extractLessonFromRejection, extractLessonFromChangesRequest, extractLessonFromEdit, extractLessonFromSubscriberFeedback, computeAndStoreQualityScore } from "./learning";
import type { InsertPipelineLesson } from "../drizzle/schema";
import { BLOG_CATEGORIES } from "../drizzle/schema";
import { generateAndUploadApprovedPdf } from "./pdfGenerator";
import { storagePut } from "./storage";
import { invalidateUserCache, getOriginUrl } from "./supabaseAuth";
import {
  createCheckoutSession,
  createBillingPortalSession,
  createLetterUnlockCheckout,
  createTrialReviewCheckout,
  getUserSubscription,
  checkLetterSubmissionAllowed,
  incrementLettersUsed,
  hasActiveRecurringSubscription,
} from "./stripe";

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
});

const PIPELINE_MAX_RETRIES = 2;
const PIPELINE_BASE_DELAY_MS = 10_000;

async function runPipelineWithRetry(
  letterId: number,
  intake: any,
  userId: number | undefined,
  appUrl: string,
  label: string,
  usageContext?: { shouldRefundOnFailure: true; isFreeTrialSubmission: boolean }
): Promise<void> {
  // ── Acquire DB-level pipeline lock ────────────────────────────────────────
  const lockAcquired = await acquirePipelineLock(letterId);
  if (!lockAcquired) {
    console.warn(`[Pipeline] Letter #${letterId} pipeline lock already held — skipping duplicate run (${label})`);
    return;
  }

  // ── All post-acquisition work is wrapped in try/finally to guarantee lock ──
  // release even if markPriorPipelineRunsSuperseded or any early setup throws.
  let lastErr: unknown;
  try {
    // ── Deduplication: supersede any pre-existing active pipeline runs ───────
    await markPriorPipelineRunsSuperseded(letterId);

    for (let attempt = 0; attempt <= PIPELINE_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = PIPELINE_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[Pipeline] Retry ${attempt}/${PIPELINE_MAX_RETRIES} for letter #${letterId} in ${delay}ms (${label})`);
          await new Promise(r => setTimeout(r, delay));
        }
        {
          const current = await getLetterRequestById(letterId);
          const retryableStatuses = ["submitted", "researching", "drafting", "pipeline_failed"];
          if (attempt > 0 && current && !retryableStatuses.includes(current.status)) {
            console.log(`[Pipeline] Letter #${letterId} status changed to "${current.status}" during backoff, aborting retry (${label})`);
            // Another process completed the letter — exit normally; finally releases lock
            return;
          }
          if (!current || current.status !== "submitted") {
            await updateLetterStatus(letterId, "submitted", { force: true });
          }
        }
        await runFullPipeline(letterId, intake, undefined, userId);
        // Success — return; finally releases lock
        return;
      } catch (err) {
        lastErr = err;
        console.error(`[Pipeline] Attempt ${attempt + 1} failed for letter #${letterId} (${label}):`, err instanceof Error ? err.message : err);
        captureServerException(err, { tags: { component: "pipeline", error_type: "attempt_failed" }, extra: { letterId, attempt: attempt + 1 } });
      }
    }

    // ── All retries exhausted — perform terminal failure state writes ─────────
    console.error(`[Pipeline] All ${PIPELINE_MAX_RETRIES + 1} attempts exhausted for letter #${letterId} (${label})`);

    // ── Refund usage on total failure (initial submissions only) ─────────────
    // Re-trigger paths (updateForChanges, retryFromRejected) do NOT pass
    // usageContext and therefore never trigger a refund — they consume no
    // new quota when they fail.
    if (userId && usageContext?.shouldRefundOnFailure) {
      try {
        if (usageContext.isFreeTrialSubmission) {
          await refundFreeTrialSlot(userId);
          console.log(`[Pipeline] Refunded free trial slot for user #${userId} after pipeline failure on letter #${letterId}`);
        } else {
          await decrementLettersUsed(userId);
          console.log(`[Pipeline] Refunded 1 letter usage for user #${userId} after pipeline failure on letter #${letterId}`);
        }
      } catch (refundErr) {
        console.error("[Pipeline] Failed to refund usage after pipeline failure:", refundErr);
        captureServerException(refundErr, { tags: { component: "pipeline", error_type: "usage_refund_failed" } });
      }
    }

    try {
      const admins = await getAllUsers("admin");
      for (const admin of admins) {
        try {
          if (admin.email) {
            await sendJobFailedAlertEmail({
              to: admin.email,
              name: admin.name ?? "Admin",
              letterId,
              jobType: "generation_pipeline",
              errorMessage: lastErr instanceof Error ? lastErr.message : String(lastErr),
              appUrl,
            });
          }
        } catch (emailErr) {
          console.error("[Pipeline] Failed to email admin:", emailErr);
          captureServerException(emailErr, { tags: { component: "pipeline", error_type: "admin_email_failed" } });
        }
        try {
          await createNotification({
            userId: admin.id,
            type: "job_failed",
            category: "letters",
            title: `Pipeline failed for letter #${letterId}`,
            body: lastErr instanceof Error ? lastErr.message : String(lastErr),
            link: `/admin/jobs`,
          });
        } catch (notifErr) {
          console.error("[Pipeline] Failed to create notification:", notifErr);
          captureServerException(notifErr, { tags: { component: "pipeline", error_type: "notification_failed" } });
        }
      }
    } catch (notifyErr) {
      console.error("[Pipeline] Failed to notify admins:", notifyErr);
      captureServerException(notifyErr, { tags: { component: "pipeline", error_type: "notify_admins_failed" } });
    }
    try {
      await updateLetterStatus(letterId, "pipeline_failed", { force: true });
    } catch (statusErr) {
      console.error("[Pipeline] Failed to set pipeline_failed status:", statusErr);
      captureServerException(statusErr, { tags: { component: "pipeline", error_type: "status_update_failed" } });
    }
  } finally {
    // Release lock — always, on all exit paths (success, abort, early throw, exhaustion)
    await releasePipelineLock(letterId).catch(e => console.error("[Pipeline] Failed to release pipeline lock:", e));
  }
}

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

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie("sb_session", { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    completeOnboarding: protectedProcedure
      .input(
        z.object({
          // Attorney role is NOT self-assignable — it can only be granted by a super admin
          role: z.enum(["subscriber", "employee"]),
          jurisdiction: z.string().optional(),
          companyName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        await updateUserRole(userId, input.role);
        try {
          await assignRoleId(userId, input.role);
        } catch (e) {
          console.error("[Onboarding] Role ID assignment failed:", e);
        }
        if (input.role === "employee") {
          try {
            await createDiscountCodeForEmployee(userId);
          } catch (e) {
            console.log(
              "[Onboarding] Discount code creation skipped (may already exist)",
              e
            );
          }
        }
        const roleLabels: Record<string, string> = {
          subscriber: "Your account is ready. Start submitting legal letters!",
          employee:
            "Your affiliate account is set up with a unique discount code.",
        };
        return {
          success: true,
          role: input.role,
          message: roleLabels[input.role] || "Account set up!",
        };
      }),
  }),

  // ─── Subscriber: Letter Requests ───────────────────────────────────────────
  letters: router({
    submit: subscriberProcedure
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

        runPipelineWithRetry(letterId, input.intakeJson as any, ctx.user.id, appUrl, "submit", { shouldRefundOnFailure: true, isFreeTrialSubmission });

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

        // Log the subscriber's response
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "subscriber_updated",
          noteText: input.additionalContext,
          noteVisibility: "user_visible",
          fromStatus: "needs_changes",
          toStatus: "submitted",
        });

        extractLessonFromSubscriberFeedback(input.letterId, input.additionalContext, ctx.user.id, "subscriber_update").catch(console.error);

        // If updated intake provided, update the letter request
        if (input.updatedIntakeJson) {
          const db = await (await import("./db")).getDb();
          if (db) {
            const { letterRequests } = await import("../drizzle/schema");
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

        // Transition status back to submitted before re-triggering pipeline
        // This allows the pipeline to properly set researching → drafting → generated_locked
        await updateLetterStatus(input.letterId, "submitted");

        const intake = input.updatedIntakeJson ?? letter.intakeJson;
        if (intake) {
          const appUrl = getAppUrl(ctx.req);
          runPipelineWithRetry(input.letterId, intake as any, letter.userId, appUrl, "updateForChanges");
        }

        return { success: true };
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
          const db = await (await import("./db")).getDb();
          if (db) {
            const { letterRequests } = await import("../drizzle/schema");
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
        runPipelineWithRetry(input.letterId, intake as any, letter.userId, appUrl, "retryFromRejected");

        return { success: true };
      }),

    archive: subscriberProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (!["approved", "client_approved", "rejected"].includes(letter.status))
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
        if (letter.status !== "approved" && letter.status !== "client_approved")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only approved letters can be sent to recipients",
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
      .input(z.object({ letterId: z.number() }))
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
        await updateLetterStatus(input.letterId, "client_approved");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "client_approved",
          noteText: "Subscriber approved the letter for final delivery",
          noteVisibility: "user_visible",
          fromStatus: "client_approval_pending",
          toStatus: "client_approved",
        });
        try {
          await notifyAdmins({
            category: "letters",
            type: "client_approved",
            title: `Client approved letter #${input.letterId}`,
            body: `${ctx.user.name ?? "A subscriber"} approved "${letter.subject}" for final delivery.`,
            link: `/admin/letters/${input.letterId}`,
            emailOpts: {
              subject: `Client Approved Letter #${input.letterId}`,
              preheader: `Client approved letter "${letter.subject}" for delivery`,
              bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "A subscriber"}</strong> has approved letter <strong>#${input.letterId}</strong> — "${letter.subject}" for final delivery.</p>`,
              ctaText: "View Letter",
              ctaUrl: `${getAppUrl(ctx.req)}/admin/letters/${input.letterId}`,
            },
          });
        } catch (err) {
          console.error("[notifyAdmins] client_approved:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_client_approved" } });
        }
        return { success: true };
      }),
  }),

  // ─── Employee/Attorney: Review Center ─────────────────────────────────────
  review: router({
    queue: attorneyProcedure
      .input(
        z
          .object({
            status: z.string().optional(),
            unassigned: z.boolean().optional(),
            myAssigned: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (input?.myAssigned)
          return getAllLetterRequests({ assignedReviewerId: ctx.user.id });
        return getAllLetterRequests({
          status: input?.status,
          unassigned: input?.unassigned,
        });
      }),

    letterDetail: attorneyProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.id);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        // Admins can always view.
        // Attorneys can view if:
        //   (a) they are the assigned reviewer, OR
        //   (b) the letter is pending_review (unassigned — available to claim)
        const canView =
          ctx.user.role === "admin" ||
          letter.assignedReviewerId === ctx.user.id ||
          letter.status === "pending_review";
        if (!canView)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        const versions = await getLetterVersionsByRequestId(input.id, true);
        const actions = await getReviewActions(input.id, true);
        const jobs = await getWorkflowJobsByLetterId(input.id);
        const research = await getResearchRunsByLetterId(input.id);
        const attachmentList = await getAttachmentsByLetterId(input.id);
        return {
          letter,
          versions,
          actions,
          jobs,
          research,
          attachments: attachmentList,
        };
      }),

    claim: attorneyProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (!["pending_review", "under_review"].includes(letter.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in a reviewable state",
          });
        await claimLetterForReview(input.letterId, ctx.user.id);
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "claimed_for_review",
          fromStatus: letter.status,
          toStatus: "under_review",
        });
        // ── Notify subscriber: letter is now under attorney review ──
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
                newStatus: "under_review",
                appUrl,
              });
            }
            await createNotification({
              userId: letter.userId,
              type: "letter_under_review",
              title: "Your letter is being reviewed",
              body: `An attorney has claimed your letter "${letter.subject}" and is currently reviewing it.`,
              link: `/letters/${input.letterId}`,
            });
          }
        } catch (err) {
          console.error("[Notify] Claim subscriber notification failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "claim_notification_failed" } });
        }
        // ── Notify attorney: review assignment confirmation ──
        try {
          const attorney = await getUserById(ctx.user.id);
          const appUrl = getAppUrl(ctx.req);
          const subscriber = letter.userId != null ? await getUserById(letter.userId) : null;
          if (attorney?.email) {
            const jurisdiction =
              [
                letter.jurisdictionCity,
                letter.jurisdictionState,
                letter.jurisdictionCountry,
              ]
                .filter(Boolean)
                .join(", ") || "Not specified";
            await sendReviewAssignedEmail({
              to: attorney.email,
              name: attorney.name ?? "Attorney",
              letterSubject: letter.subject,
              letterId: input.letterId,
              letterType: letter.letterType,
              jurisdiction,
              subscriberName: subscriber?.name ?? "Subscriber",
              appUrl,
            });
          }
        } catch (err) {
          console.error("[Notify] Claim attorney notification failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "attorney_notification_failed" } });
        }
        try {
          await notifyAdmins({
            category: "letters",
            type: "letter_claimed",
            title: `Attorney claimed letter #${input.letterId}`,
            body: `${ctx.user.name ?? "An attorney"} claimed "${letter.subject}" for review.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_claimed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "notify_admins_claimed" } });
        }
        return { success: true };
      }),

    unclaim: attorneyProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not under review",
          });
        if (ctx.user.role !== "admin" && letter.assignedReviewerId !== ctx.user.id)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        await updateLetterStatus(input.letterId, "pending_review", { assignedReviewerId: null });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "released_back_to_queue",
          noteText: "Attorney released letter back to the review queue",
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "pending_review",
        });
        // ── Notify subscriber ──
        try {
          const subscriber = letter.userId ? await getUserById(letter.userId) : null;
          const appUrl = getAppUrl(ctx.req);
          if (subscriber?.email) {
            await sendStatusUpdateEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              newStatus: "pending_review",
              appUrl,
            });
          }
        } catch (err) {
          console.error("[Notify] Unclaim subscriber notification failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "unclaim_notification_failed" } });
        }
        try {
          await notifyAdmins({
            category: "letters",
            type: "letter_released",
            title: `Letter #${input.letterId} released back to queue`,
            body: `${ctx.user.name ?? "An attorney"} released "${letter.subject}" back to the review queue.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_released:", err);
          captureServerException(err, { tags: { component: "review", error_type: "notify_admins_released" } });
        }
        return { success: true };
      }),

    approve: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          finalContent: z.string().min(50).max(50000),
          internalNote: z.string().optional(),
          userVisibleNote: z.string().optional(),
          acknowledgedUnverifiedResearch: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review to approve",
          });
        if (letter.researchUnverified && !input.acknowledgedUnverifiedResearch)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You must acknowledge that research citations are unverified before approving this letter.",
          });
        const version = await createLetterVersion({
          letterRequestId: input.letterId,
          versionType: "final_approved",
          content: input.finalContent,
          createdByType: ctx.user.role as any,
          createdByUserId: ctx.user.id,
          metadataJson: {
            approvedBy: ctx.user.name,
            approvedAt: new Date().toISOString(),
          },
        });
        const versionId = (version as any)?.insertId;
        if (typeof versionId !== "number" || isNaN(versionId)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create final approved version — version ID was not returned. Approval aborted.",
          });
        }
        await updateLetterVersionPointers(input.letterId, {
          currentFinalVersionId: versionId,
        });
        await updateLetterStatus(input.letterId, "approved");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "approved",
          noteText: input.internalNote,
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "approved",
        });
        if (input.userVisibleNote) {
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: ctx.user.role as any,
            action: "attorney_note",
            noteText: input.userVisibleNote,
            noteVisibility: "user_visible",
          });
        }
        // ── Generate PDF, upload to S3, store URL ──
        let pdfUrl: string | undefined;
        try {
          const pdfResult = await generateAndUploadApprovedPdf({
            letterId: input.letterId,
            letterType: letter.letterType,
            subject: letter.subject,
            content: input.finalContent,
            approvedBy: ctx.user.name ?? undefined,
            approvedAt: new Date().toISOString(),
            jurisdictionState: letter.jurisdictionState,
            jurisdictionCountry: letter.jurisdictionCountry,
            intakeJson: letter.intakeJson as any,
          });
          pdfUrl = pdfResult.pdfUrl;
          await updateLetterPdfUrl(input.letterId, pdfUrl);
          console.log(
            `[Approve] PDF generated for letter #${input.letterId}: ${pdfUrl}`
          );
        } catch (pdfErr) {
          captureServerException(pdfErr, { tags: { component: "review", error_type: "pdf_generation_failed" }, extra: { letterId: input.letterId } });
          console.error(
            `[Approve] PDF generation failed for letter #${input.letterId}:`,
            pdfErr
          );
          // Non-blocking: approval still succeeds even if PDF fails
        }
        // ── Notify subscriber with PDF link ──
        try {
          if (letter.userId != null) {
            const appUrl = getAppUrl(ctx.req);
            const subscriber = await getUserById(letter.userId);
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
              userId: letter.userId,
              type: "letter_approved",
              title: "Your letter has been approved!",
              body: `Your letter "${letter.subject}" is ready to download.${pdfUrl ? " A PDF copy is available." : ""}`,
              link: `/letters/${input.letterId}`,
            });
          }
        } catch (err) {
          console.error("[Notify] Failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "approval_notification_failed" } });
        }
        extractLessonFromApproval(input.letterId, input.finalContent, ctx.user.id, input.internalNote).catch(console.error);
        computeAndStoreQualityScore(input.letterId, "approved", input.finalContent).catch(console.error);
        try {
          const appUrl2 = getAppUrl(ctx.req);
          await notifyAdmins({
            category: "letters",
            type: "letter_approved_by_attorney",
            title: `Letter #${input.letterId} approved by attorney`,
            body: `${ctx.user.name ?? "An attorney"} approved "${letter.subject}".${pdfUrl ? " PDF generated." : ""}`,
            link: `/admin/letters/${input.letterId}`,
            emailOpts: {
              subject: `Letter #${input.letterId} Approved`,
              preheader: `Attorney approved letter "${letter.subject}"`,
              bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "An attorney"}</strong> has approved letter <strong>#${input.letterId}</strong> — "${letter.subject}".</p>`,
              ctaText: "View Letter",
              ctaUrl: `${appUrl2}/admin/letters/${input.letterId}`,
            },
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_approved_by_attorney:", err);
          captureServerException(err, { tags: { component: "review", error_type: "notify_admins_approved" } });
        }
        return { success: true, versionId, pdfUrl };
      }),

    reject: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          reason: z.string().min(10).max(5000),
          userVisibleReason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review to reject",
          });
        await updateLetterStatus(input.letterId, "rejected");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "rejected",
          noteText: input.reason,
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "rejected",
        });
        const visibleReason = input.userVisibleReason ?? input.reason;
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "rejection_notice",
          noteText: visibleReason,
          noteVisibility: "user_visible",
        });
        try {
          if (letter.userId != null) {
            const appUrl = getAppUrl(ctx.req);
            const subscriber = await getUserById(letter.userId);
            if (subscriber?.email) {
              await sendLetterRejectedEmail({
                to: subscriber.email,
                name: subscriber.name ?? "Subscriber",
                subject: letter.subject,
                letterId: input.letterId,
                reason: visibleReason,
                appUrl,
              });
            }
            await createNotification({
              userId: letter.userId,
              type: "letter_rejected",
              title: "Update on your letter request",
              body: visibleReason,
              link: `/letters/${input.letterId}`,
            });
          }
        } catch (err) {
          console.error("[Notify] Failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "rejection_notification_failed" } });
        }
        extractLessonFromRejection(input.letterId, input.reason, ctx.user.id).catch(console.error);
        computeAndStoreQualityScore(input.letterId, "rejected").catch(console.error);
        try {
          await notifyAdmins({
            category: "letters",
            type: "letter_rejected",
            title: `Letter #${input.letterId} rejected`,
            body: `${ctx.user.name ?? "An attorney"} rejected "${letter.subject}". Reason: ${input.reason.slice(0, 200)}`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_rejected:", err);
          captureServerException(err, { tags: { component: "review", error_type: "notify_admins_rejected" } });
        }
        return { success: true };
      }),

    requestChanges: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          internalNote: z.string().optional(),
          userVisibleNote: z.string().min(10).max(5000),
          retriggerPipeline: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review",
          });
        await updateLetterStatus(input.letterId, "needs_changes", { assignedReviewerId: null });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "requested_changes",
          noteText: input.internalNote,
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "needs_changes",
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "changes_requested",
          noteText: input.userVisibleNote,
          noteVisibility: "user_visible",
        });
        try {
          if (letter.userId != null) {
            const appUrl = getAppUrl(ctx.req);
            const subscriber = await getUserById(letter.userId);
            if (subscriber?.email) {
              await sendNeedsChangesEmail({
                to: subscriber.email,
                name: subscriber.name ?? "Subscriber",
                subject: letter.subject,
                letterId: input.letterId,
                attorneyNote: input.userVisibleNote,
                appUrl,
              });
            }
            await createNotification({
              userId: letter.userId,
              type: "needs_changes",
              title: "Changes requested for your letter",
              body: input.userVisibleNote,
              link: `/letters/${input.letterId}`,
            });
          }
        } catch (err) {
          console.error("[Notify] Failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "changes_notification_failed" } });
        }
        extractLessonFromChangesRequest(input.letterId, input.internalNote, input.userVisibleNote, ctx.user.id).catch(console.error);
        try {
          await notifyAdmins({
            category: "letters",
            type: "letter_changes_requested",
            title: `Changes requested for letter #${input.letterId}`,
            body: `${ctx.user.name ?? "An attorney"} requested changes on "${letter.subject}".`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] letter_changes_requested:", err);
          captureServerException(err, { tags: { component: "review", error_type: "notify_admins_changes_requested" } });
        }
        if (input.retriggerPipeline && letter.intakeJson) {
          retryPipelineFromStage(
            input.letterId,
            letter.intakeJson as any,
            "drafting",
            letter.userId ?? undefined
          ).catch(console.error);
        }
        return { success: true };
      }),

    saveEdit: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          content: z.string().min(50).max(50000),
          note: z.string().max(5000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review to edit",
          });
        const version = await createLetterVersion({
          letterRequestId: input.letterId,
          versionType: "attorney_edit",
          content: input.content,
          createdByType: ctx.user.role as any,
          createdByUserId: ctx.user.id,
          metadataJson: { note: input.note },
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "attorney_edit_saved",
          noteText: input.note,
          noteVisibility: "internal",
        });
        extractLessonFromEdit(input.letterId, input.content, input.note, ctx.user.id).catch(console.error);
        return { versionId: (version as any)?.insertId };
      }),
  }),

  // ─── Admin ─────────────────────────────────────────────────────────────────
  admin: router({
    stats: adminProcedure.query(async () => getSystemStats()),

    costAnalytics: adminProcedure.query(async () => getCostAnalytics()),

    users: adminProcedure
      .input(
        z
          .object({
            role: z
              .enum(["subscriber", "employee", "admin", "attorney"])
              .optional(),
          })
          .optional()
      )
      .query(async ({ input }) => getAllUsersWithSubscription(input?.role)),

    markAsPaid: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(input.userId);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        await markAsPaidDb(input.userId);
        await logReviewAction({
          letterRequestId: 0,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "admin_mark_as_paid",
          noteText: `Admin manually activated subscription for user #${input.userId} (${user.email ?? user.name})`,
          noteVisibility: "internal",
        });
        return { success: true };
      }),

    updateRole: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          // Admin role is NOT assignable via the UI — it is hard-coded to
          // ravivo@homes.land and moizj00@gmail.com in the auth layer.
          role: z.enum(["subscriber", "employee", "attorney"]),
        })
      )
      .mutation(async ({ input }) => {
        // ── Guard: block promoting active subscribers to attorney ──
        // An active subscriber has a billing relationship (Stripe subscription).
        // Changing their role to attorney would remove their subscriber dashboard
        // while Stripe keeps billing them — a logic flaw.
        if (input.role === "attorney") {
          const hasActiveSub = await hasActiveRecurringSubscription(input.userId);
          if (hasActiveSub) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "This user has an active subscription. Cancel their subscription before promoting them to Attorney.",
            });
          }
        }
        await updateUserRole(input.userId, input.role);
        try {
          await assignRoleId(input.userId, input.role);
        } catch (e) {
          console.error("[updateRole] Role ID assignment failed:", e);
        }

        // Invalidate the user's auth cache so their next request picks up the new role
        // immediately instead of waiting for the 30-second TTL to expire.
        const updatedUser = await getUserById(input.userId);
        if (updatedUser?.openId) {
          invalidateUserCache(updatedUser.openId);
        }

        // Notify the user when they are promoted to attorney so they know
        // to refresh their browser and access the Review Center.
        if (input.role === "attorney") {
          try {
            await createNotification({
              userId: input.userId,
              type: "role_updated",
              title: "Your account has been upgraded to Attorney",
              body: "You now have access to the Review Center. Please refresh your browser or log out and back in to activate your new role.",
              link: "/attorney",
            });
          } catch (err) {
            // Non-blocking — role update still succeeds even if notification fails
            console.error("[updateRole] Failed to send attorney promotion notification:", err);
            captureServerException(err, { tags: { component: "admin", error_type: "attorney_promotion_notification_failed" } });
          }
        }
        try {
          const targetUser = await getUserById(input.userId);
          await notifyAdmins({
            category: "users",
            type: "user_role_changed",
            title: `User role changed to ${input.role}`,
            body: `${targetUser?.name ?? targetUser?.email ?? `User #${input.userId}`} was changed to ${input.role}.`,
            link: `/admin/users`,
          });
        } catch (err) {
          console.error("[notifyAdmins] user_role_changed:", err);
          captureServerException(err, { tags: { component: "admin", error_type: "notify_admins_role_changed" } });
        }
        return { success: true };
      }),

    inviteAttorney: adminProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
          name: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const email = input.email.toLowerCase().trim();
        const name = input.name?.trim() || email.split("@")[0];

        const existingUser = await getUserByEmail(email);
        if (existingUser) {
          if (existingUser.role === "attorney") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This user is already an attorney.",
            });
          }
          const hasActiveSub = await hasActiveRecurringSubscription(existingUser.id);
          if (hasActiveSub) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This user has an active subscription. Cancel their subscription before promoting them to Attorney.",
            });
          }
          await updateUserRole(existingUser.id, "attorney");
          try { await assignRoleId(existingUser.id, "attorney"); } catch (e) {
            console.error("[inviteAttorney] Role ID assignment failed:", e);
          }
          if (existingUser.openId) invalidateUserCache(existingUser.openId);
          try {
            await createNotification({
              userId: existingUser.id,
              type: "role_updated",
              title: "Your account has been upgraded to Attorney",
              body: "You now have access to the Review Center. Please refresh your browser or log out and back in to activate your new role.",
              link: "/attorney",
            });
          } catch (err) {
            console.error("[inviteAttorney] notification failed:", err);
          }
          return { success: true, alreadyExisted: true, message: `${email} already had an account and has been promoted to attorney.` };
        }

        const { createClient } = await import("@supabase/supabase-js");
        const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        if (!sbUrl || !sbServiceKey) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Supabase configuration missing." });
        }
        const serviceClient = createClient(sbUrl, sbServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const crypto = await import("crypto");
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const { data: createData, error: createError } = await serviceClient.auth.admin.createUser({
          email,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { name, invited_attorney: true },
        });

        if (createError) {
          console.error("[inviteAttorney] Supabase createUser error:", createError.message);
          if (createError.message.includes("already") || createError.message.includes("exists")) {
            // User exists in Supabase auth but not in our app DB (first check above
            // already handled app-level users). Try to recover by generating a recovery
            // link for the existing auth user and creating the app record.
            try {
              const origin2 = getOriginUrl(ctx.req);
              const { data: linkData2 } = await serviceClient.auth.admin.generateLink({
                type: "recovery",
                email,
                options: { redirectTo: `${origin2}/accept-invitation` },
              });
              if (linkData2?.properties?.action_link && linkData2.user) {
                const authUserId = linkData2.user.id;
                const { upsertUser: upsertExisting, getUserByOpenId: getByOpenId } = await import("./db");
                await upsertExisting({
                  openId: authUserId,
                  name,
                  email,
                  loginMethod: "email",
                  lastSignedIn: new Date(),
                  role: "attorney",
                  emailVerified: true,
                });
                invalidateUserCache(authUserId);
                const existingAppUser = await getByOpenId(authUserId);
                if (existingAppUser) {
                  try { await assignRoleId(existingAppUser.id, "attorney"); } catch (e) {
                    console.error("[inviteAttorney] Role ID assignment for existing auth user:", e);
                  }
                }
                await serviceClient.auth.admin.updateUserById(authUserId, {
                  user_metadata: { name, invited_attorney: true },
                });
                await sendAttorneyInvitationEmail({ to: email, name, setPasswordUrl: linkData2.properties.action_link, invitedByName: ctx.user.name || undefined });
                return { success: true, alreadyExisted: true, message: `${email} had an auth account and has been set up as an attorney. Invitation sent.` };
              }
            } catch (recoveryErr) {
              console.error("[inviteAttorney] Recovery attempt for existing auth user failed:", recoveryErr);
            }
            throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists in the auth system." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: createError.message });
        }

        if (!createData.user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create auth user." });
        }

        const { upsertUser, getUserByOpenId } = await import("./db");
        await upsertUser({
          openId: createData.user.id,
          name,
          email,
          loginMethod: "email",
          lastSignedIn: new Date(),
          role: "attorney",
          emailVerified: true,
        });
        invalidateUserCache(createData.user.id);

        const appUser = await getUserByOpenId(createData.user.id);
        if (appUser) {
          try { await assignRoleId(appUser.id, "attorney"); } catch (e) {
            console.error("[inviteAttorney] Role ID assignment failed:", e);
          }
        }

        const origin = getOriginUrl(ctx.req);
        const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${origin}/accept-invitation` },
        });

        if (linkError || !linkData?.properties?.action_link) {
          console.error("[inviteAttorney] generateLink error:", linkError?.message);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "User created but failed to generate invitation link. The attorney can use 'Forgot Password' to set their password.",
          });
        }

        const setPasswordUrl = linkData.properties.action_link;

        try {
          await sendAttorneyInvitationEmail({
            to: email,
            name,
            setPasswordUrl,
            invitedByName: ctx.user.name || undefined,
          });
        } catch (emailErr) {
          console.error("[inviteAttorney] Failed to send invitation email:", emailErr);
          captureServerException(emailErr, { tags: { component: "admin", error_type: "attorney_invitation_email_failed" } });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Attorney account created but invitation email failed to send. They can use 'Forgot Password' to access their account.",
          });
        }

        try {
          await notifyAdmins({
            category: "users",
            type: "attorney_invited",
            title: `Attorney invited: ${name}`,
            body: `${email} was invited as an attorney by ${ctx.user.name || ctx.user.email || "an admin"}.`,
            link: `/admin/users`,
          });
        } catch (err) {
          console.error("[notifyAdmins] attorney_invited:", err);
        }

        return { success: true, alreadyExisted: false, message: `Invitation sent to ${email}.` };
      }),

    allLetters: adminProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) =>
        getAllLetterRequests({ status: input?.status })
      ),

    failedJobs: adminProcedure.query(async () => getFailedJobs(100)),

    retryJob: adminProcedure
      .input(
        z.object({
          letterId: z.number(),
          stage: z.enum(["research", "drafting"]),
        })
      )
      .mutation(async ({ input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (!letter.intakeJson)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No intake data found",
          });
        retryPipelineFromStage(
          input.letterId,
          letter.intakeJson as any,
          input.stage,
          letter.userId ?? undefined
        ).catch(console.error);
        return {
          success: true,
          message: `Retry started for stage: ${input.stage}`,
        };
      }),

    purgeFailedJobs: adminProcedure.mutation(async () => {
      const result = await purgeFailedJobs();
      return { success: true, deletedCount: result.deletedCount };
    }),

    letterJobs: adminProcedure
      .input(z.object({ letterId: z.number() }))
      .query(async ({ input }) => getWorkflowJobsByLetterId(input.letterId)),

    employees: adminProcedure.query(async () => getEmployeesAndAdmins()),

    getLetterDetail: adminProcedure
      .input(z.object({ letterId: z.number() }))
      .query(async ({ input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        const [versions, actions, jobs] = await Promise.all([
          getLetterVersionsByRequestId(input.letterId, true), // include internal
          getReviewActions(input.letterId, true), // include internal
          getWorkflowJobsByLetterId(input.letterId),
        ]);
        const aiDraftVersion = versions.find(v => v.versionType === "ai_draft");

        // Aggregate token/cost across all jobs with tracked cost (includes failed jobs
        // that still incurred API charges), so pipelineCostSummary reflects true spend.
        const trackedJobs = jobs.filter(j => j.estimatedCostUsd != null);
        const pipelineCostSummary = {
          totalPromptTokens: trackedJobs.reduce((s, j) => s + (j.promptTokens ?? 0), 0),
          totalCompletionTokens: trackedJobs.reduce((s, j) => s + (j.completionTokens ?? 0), 0),
          totalTokens: trackedJobs.reduce((s, j) => s + (j.promptTokens ?? 0) + (j.completionTokens ?? 0), 0),
          totalCostUsd: trackedJobs
            .reduce((s, j) => s + parseFloat(j.estimatedCostUsd as string ?? "0"), 0)
            .toFixed(6),
          byStage: trackedJobs.map(j => ({
            jobId: j.id,
            jobType: j.jobType,
            provider: j.provider,
            promptTokens: j.promptTokens ?? 0,
            completionTokens: j.completionTokens ?? 0,
            totalTokens: (j.promptTokens ?? 0) + (j.completionTokens ?? 0),
            estimatedCostUsd: j.estimatedCostUsd,
          })),
        };

        return {
          ...letter,
          aiDraftContent: aiDraftVersion?.content ?? null,
          letterVersions: versions,
          reviewActions: actions,
          workflowJobs: jobs,
          pipelineCostSummary,
        };
      }),

    forceStatusTransition: adminProcedure
      .input(
        z.object({
          letterId: z.number(),
          newStatus: z.enum([
            "submitted",
            "researching",
            "drafting",
            "generated_locked",
            "pending_review",
            "under_review",
            "needs_changes",
            "approved",
            "client_approval_pending",
            "client_approved",
            "sent",
            "rejected",
            "pipeline_failed",
          ]),
          reason: z.string().min(5).max(5000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });

        // Guard: prevent forcing to review states without a content version
        if (input.newStatus === "pending_review" || input.newStatus === "approved") {
          const versions = await getLetterVersionsByRequestId(input.letterId, true);
          if (versions.length === 0) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Cannot force to "${input.newStatus}": this letter has no content version. Generate a draft first.`,
            });
          }
        }

        await updateLetterStatus(input.letterId, input.newStatus, {
          force: true,
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "admin_force_status_transition",
          noteText: `Admin forced status from ${letter.status} to ${input.newStatus}. Reason: ${input.reason}`,
          noteVisibility: "internal",
          fromStatus: letter.status,
          toStatus: input.newStatus,
        });
        if (input.newStatus === "pending_review") {
          try {
            const appUrl = getAppUrl(ctx.req);
            if (letter.assignedReviewerId) {
              const attorney = await getUserById(letter.assignedReviewerId);
              if (attorney?.email) {
                await sendNewReviewNeededEmail({
                  to: attorney.email,
                  name: attorney.name ?? "Attorney",
                  letterSubject: letter.subject,
                  letterId: input.letterId,
                  letterType: letter.letterType,
                  jurisdiction: `${letter.jurisdictionState ?? ""}, ${letter.jurisdictionCountry ?? "US"}`,
                  appUrl,
                });
              }
            }
          } catch (_err) {
            // Non-fatal: email failure should not block the status transition
          }
        }
        return { success: true };
      }),

    assignLetter: adminProcedure
      .input(z.object({ letterId: z.number(), employeeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        await updateLetterStatus(input.letterId, letter.status, {
          assignedReviewerId: input.employeeId,
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "assigned_reviewer",
          noteText: `Assigned to employee ID ${input.employeeId}`,
          noteVisibility: "internal",
        });
        try {
          const appUrl = getAppUrl(ctx.req);
          const employee = await getUserById(input.employeeId);
          if (employee?.email) {
            await sendNewReviewNeededEmail({
              to: employee.email,
              name: employee.name ?? "Attorney",
              letterSubject: letter.subject,
              letterId: input.letterId,
              letterType: letter.letterType,
              jurisdiction: `${letter.jurisdictionState ?? ""}, ${letter.jurisdictionCountry ?? "US"}`,
              appUrl,
            });
          }
        } catch (err) {
          console.error("[Notify] Failed:", err);
          captureServerException(err, { tags: { component: "review", error_type: "unlock_notification_failed" } });
        }
        return { success: true };
      }),

    claimLetterAsAttorney: adminProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (letter.status !== "pending_review") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in pending_review status to claim",
          });
        }
        if (letter.assignedReviewerId !== null && letter.assignedReviewerId !== undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter already has an assigned reviewer",
          });
        }
        await claimLetterForReview(input.letterId, ctx.user.id);
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "admin_claimed_as_attorney",
          noteText: `Admin claimed letter for review as attorney`,
          noteVisibility: "internal",
          fromStatus: "pending_review",
          toStatus: "under_review",
        });
        return { success: true };
      }),

    repairLetterState: adminProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });

        const findings: string[] = [];

        // Check for broken-processing pattern:
        // status = "processing" or stuck in a pipeline state, with a failed workflowJob,
        // and no content version (no ai_draft or final_approved)
        const [versions, jobs] = await Promise.all([
          getLetterVersionsByRequestId(input.letterId, true),
          getWorkflowJobsByLetterId(input.letterId),
        ]);

        const hasContentVersion = versions.some(
          v => v.versionType === "ai_draft" || v.versionType === "final_approved"
        );
        const hasFailed = jobs.some(j => j.status === "failed");
        const isStuckInPipeline =
          ["submitted", "researching", "drafting"].includes(letter.status) &&
          hasFailed &&
          !hasContentVersion;

        if (isStuckInPipeline) {
          findings.push(
            `Detected stuck-processing: status="${letter.status}", has failed job(s), no content version`
          );
          await updateLetterStatus(input.letterId, "submitted", { force: true });
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: "admin",
            action: "admin_repair_letter_state",
            noteText: `Repaired stuck letter: reset from "${letter.status}" to "submitted". Has failed job(s), no content version.`,
            noteVisibility: "internal",
            fromStatus: letter.status,
            toStatus: "submitted",
          });
          findings.push(`Reset status from "${letter.status}" to "submitted"`);
        } else {
          findings.push(
            `No broken-processing pattern detected (status="${letter.status}", hasContentVersion=${hasContentVersion}, hasFailed=${hasFailed}). No changes made.`
          );
        }

        return { success: true, findings };
      }),

    lessons: adminProcedure.query(async () => getAllLessons()),

    lessonsFiltered: adminProcedure
      .input(z.object({
        letterType: z.string().optional(),
        jurisdiction: z.string().optional(),
        pipelineStage: z.string().optional(),
        isActive: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => getAllLessons(input ?? undefined)),

    createLesson: adminProcedure
      .input(z.object({
        letterType: z.string().optional(),
        jurisdiction: z.string().optional(),
        pipelineStage: z.enum(["research", "drafting", "assembly", "vetting"]).optional(),
        category: z.enum(["citation_error", "jurisdiction_error", "tone_issue", "structure_issue", "factual_error", "bloat_detected", "missing_section", "style_preference", "legal_accuracy", "general"]).default("general"),
        lessonText: z.string().min(10).max(5000),
        sourceAction: z.enum(["attorney_approval", "attorney_rejection", "attorney_changes", "attorney_edit", "manual"]).default("manual"),
        weight: z.number().min(0).max(100).default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        await createPipelineLesson({
          letterType: input.letterType as InsertPipelineLesson["letterType"],
          jurisdiction: input.jurisdiction,
          pipelineStage: input.pipelineStage as InsertPipelineLesson["pipelineStage"],
          category: input.category as InsertPipelineLesson["category"],
          lessonText: input.lessonText,
          sourceAction: input.sourceAction as InsertPipelineLesson["sourceAction"],
          createdByUserId: ctx.user.id,
          weight: input.weight,
        });
        return { success: true };
      }),

    updateLesson: adminProcedure
      .input(z.object({
        id: z.number(),
        isActive: z.boolean().optional(),
        weight: z.number().min(0).max(100).optional(),
        lessonText: z.string().min(10).max(5000).optional(),
        category: z.enum(["citation_error", "jurisdiction_error", "tone_issue", "structure_issue", "factual_error", "bloat_detected", "missing_section", "style_preference", "legal_accuracy", "general"]).optional(),
      }))
      .mutation(async ({ input }) => {
        await updatePipelineLesson(input.id, {
          isActive: input.isActive,
          weight: input.weight,
          lessonText: input.lessonText,
          category: input.category as InsertPipelineLesson["category"],
        });
        return { success: true };
      }),

    qualityStats: adminProcedure.query(async () => getQualityScoreStats()),

    qualityTrend: adminProcedure
      .input(z.object({ days: z.number().default(30) }).optional())
      .query(async ({ input }) => getQualityScoreTrend(input?.days ?? 30)),

    qualityByLetterType: adminProcedure.query(async () => getQualityScoresByLetterType()),
  }),

  // ─── Notifications ─────────────────────────────────────────────────────────
  notifications: router({
    list: protectedProcedure
      .input(z.object({ unreadOnly: z.boolean().default(false) }).optional())
      .query(async ({ ctx, input }) =>
        getNotificationsByUserId(ctx.user.id, input?.unreadOnly ?? false)
      ),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
  }),

  // ─── Shared: Letter Version Access ─────────────────────────────────────────
  versions: router({
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const version = await getLetterVersionById(input.id);
        if (!version) throw new TRPCError({ code: "NOT_FOUND" });
        if (ctx.user.role === "subscriber") {
          // Subscribers can view final_approved versions always
          // They can also view ai_draft when the letter is generated_locked (paywall preview)
          if (version.versionType === "final_approved") return version;
          if (version.versionType === "ai_draft") {
            const letter = await getLetterRequestById(version.letterRequestId);
            if (
              letter &&
              letter.userId === ctx.user.id &&
              letter.status === "generated_locked"
            ) {
              if (version.content) {
                const lines = version.content.split("\n");
                const visibleCount = Math.max(5, Math.floor(lines.length * 0.2));
                return { ...version, content: lines.slice(0, visibleCount).join("\n"), truncated: true };
              }
              return { ...version, truncated: true };
            }
          }
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return version;
      }),
  }),
  // ─── Stripe / Billing ────────────────────────────────────────────────────
  billing: router({
    getSubscription: protectedProcedure.query(async ({ ctx }) => {
      return getUserSubscription(ctx.user.id);
    }),
    checkCanSubmit: protectedProcedure.query(async ({ ctx }) => {
      return checkLetterSubmissionAllowed(ctx.user.id);
    }),
    createCheckout: protectedProcedure
      .input(
        z.object({ planId: z.string(), discountCode: z.string().optional() })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate limit: 10 checkout attempts per hour per user
        await checkTrpcRateLimit("payment", `user:${ctx.user.id}`);
        const result = await createCheckoutSession({
          userId: ctx.user.id,
          email: ctx.user.email ?? "",
          name: ctx.user.name,
          planId: input.planId,
          origin: (ctx.req.headers.origin &&
          !String(ctx.req.headers.origin).includes("localhost")
            ? ctx.req.headers.origin
            : ctx.req.headers["x-forwarded-host"]
              ? `https://${ctx.req.headers["x-forwarded-host"]}`
              : "https://www.talk-to-my-lawyer.com") as string,
          discountCode: input.discountCode,
        });
        return result;
      }),
    createBillingPortal: protectedProcedure.mutation(async ({ ctx }) => {
      const url = await createBillingPortalSession({
        userId: ctx.user.id,
        email: ctx.user.email ?? "",
        origin: (ctx.req.headers.origin &&
        !String(ctx.req.headers.origin).includes("localhost")
          ? ctx.req.headers.origin
          : ctx.req.headers["x-forwarded-host"]
            ? `https://${ctx.req.headers["x-forwarded-host"]}`
            : "https://www.talk-to-my-lawyer.com") as string,
      });
      return { url };
    }),
    // ─── Check paywall status: free | subscription_required | subscribed ───
    /**
     * Returns the paywall state for the current user:
     *   - "free"                  — first letter, free trial not yet used
     *   - "subscribed"            — active monthly/annual plan (bypass paywall entirely)
     *   - "subscription_required" — free trial already used, no active recurring subscription
     *   - "pay_per_letter"        — legacy fallback; same action as subscription_required
     */
    checkPaywallStatus: subscriberProcedure.query(async ({ ctx }) => {
      // 1. Check for active monthly/annual subscription first
      const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
      if (isSubscribed)
        return { state: "subscribed" as const, eligible: false };
      // 2. Explicit free-trial-used marker (fast path — no letter count query needed)
      if (ctx.user.freeReviewUsedAt)
        return { state: "free_trial_used" as const, eligible: false };
      // 3. Derive from letter history for users created before the freeReviewUsedAt column
      const db = await (await import("./db")).getDb();
      if (!db) return { state: "subscription_required" as const, eligible: false };
      const { letterRequests } = await import("../drizzle/schema");
      const { eq, and, notInArray } = await import("drizzle-orm");
      const unlockedLetters = await db
        .select({ id: letterRequests.id })
        .from(letterRequests)
        .where(
          and(
            eq(letterRequests.userId, ctx.user.id),
            notInArray(letterRequests.status, [
              "submitted",
              "researching",
              "drafting",
              "generated_locked",
              "pipeline_failed",
            ])
          )
        );
      if (unlockedLetters.length === 0)
        return { state: "free" as const, eligible: true };
      return { state: "free_trial_used" as const, eligible: false };
    }),
    // ─── Legacy alias: kept for backward compat (LetterPaywall still calls this) ───
    checkFirstLetterFree: subscriberProcedure.query(async ({ ctx }) => {
      const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
      if (isSubscribed) return { eligible: false };
      const db = await (await import("./db")).getDb();
      if (!db) return { eligible: false };
      const { letterRequests } = await import("../drizzle/schema");
      const { eq, and, notInArray } = await import("drizzle-orm");
      const paidLetters = await db
        .select({ id: letterRequests.id })
        .from(letterRequests)
        .where(
          and(
            eq(letterRequests.userId, ctx.user.id),
            notInArray(letterRequests.status, [
              "submitted",
              "researching",
              "drafting",
              "generated_locked",
              "pipeline_failed",
            ])
          )
        );
      return { eligible: paidLetters.length === 0 };
    }),

    // ─── Free unlock: first letter goes directly to pending_review ───
    freeUnlock: subscriberProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestSafeForSubscriber(
          input.letterId,
          ctx.user.id
        );
        if (!letter)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Letter not found",
          });
        if (letter.status !== "generated_locked")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in generated_locked status",
          });

        // Verify they actually qualify for free first letter
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { letterRequests } = await import("../drizzle/schema");
        const {
          eq: eqOp,
          and: andOp,
          notInArray: notInOp,
        } = await import("drizzle-orm");
        const paidLetters = await db
          .select({ id: letterRequests.id })
          .from(letterRequests)
          .where(
            andOp(
              eqOp(letterRequests.userId, ctx.user.id),
              notInOp(letterRequests.status, [
                "submitted",
                "researching",
                "drafting",
                "generated_locked",
              ])
            )
          );
        // Return structured state instead of throwing so the frontend can switch
        // directly to the subscribe/pay CTA without showing an error toast.
        if (paidLetters.length > 0 || ctx.user.freeReviewUsedAt) {
          return {
            ok: false as const,
            nextState: "subscription_required" as const,
            message:
              "Your free first letter has already been used. Please subscribe or pay per letter.",
          };
        }

        // Transition to pending_review
        await updateLetterStatus(input.letterId, "pending_review");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "free_unlock",
          noteText: "First letter — free attorney review (promotional)",
          noteVisibility: "internal",
          fromStatus: "generated_locked",
          toStatus: "pending_review",
        });

        // Mark the free trial as used so future checkPaywallStatus calls are fast
        const { setFreeReviewUsed } = await import("./db");
        await setFreeReviewUsed(ctx.user.id);
        // Invalidate user cache so next request reflects the updated freeReviewUsedAt
        invalidateUserCache(ctx.user.openId);

        // Send notification emails
        try {
          await sendLetterUnlockedEmail({
            to: ctx.user.email ?? "",
            name: ctx.user.name ?? "Subscriber",
            subject: letter.subject,
            letterId: input.letterId,
            appUrl: getAppUrl(ctx.req),
          });
          await sendNewReviewNeededEmail({
            to: "", // Will use admin email from config
            name: "Attorney Team",
            letterSubject: letter.subject,
            letterId: input.letterId,
            letterType: letter.letterType,
            jurisdiction: letter.jurisdictionState ?? "Unknown",
            appUrl: getAppUrl(ctx.req),
          });
        } catch (e) {
          console.error("[freeUnlock] Email error:", e);
          captureServerException(e, { tags: { component: "letters", error_type: "free_unlock_email_failed" } });
        }

        try {
          await notifyAdmins({
            category: "letters",
            type: "free_unlock",
            title: `Free unlock — letter #${input.letterId} enters review queue`,
            body: `${ctx.user.name ?? "A subscriber"} used free first letter for "${letter.subject}". Now pending review.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] free_unlock:", err);
          captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_free_unlock" } });
        }

        return { ok: true as const, free: true };
      }),

    // ─── Payment History: fetch from Stripe ───
    paymentHistory: protectedProcedure.query(async ({ ctx }) => {
      const { getStripe, getOrCreateStripeCustomer } = await import("./stripe");
      const stripe = getStripe();
      try {
        const customerId = await getOrCreateStripeCustomer(
          ctx.user.id,
          ctx.user.email ?? "",
          ctx.user.name
        );
        // Fetch recent payment intents for this customer
        const paymentIntents = await stripe.paymentIntents.list({
          customer: customerId,
          limit: 25,
          expand: ["data.latest_charge"],
        });
        return paymentIntents.data.map((pi: any) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          description: pi.description ?? "Letter unlock payment",
          created: pi.created,
          receiptUrl: pi.latest_charge?.receipt_url ?? null,
          metadata: pi.metadata ?? {},
        }));
      } catch (e) {
        console.error("[paymentHistory] Stripe error:", e);
        return [];
      }
    }),

    // ─── Receipts: fetch Stripe invoices for current user ───
    receipts: subscriberProcedure.query(async ({ ctx }) => {
      const { getStripe, getOrCreateStripeCustomer } = await import("./stripe");
      const stripe = getStripe();
      try {
        const customerId = await getOrCreateStripeCustomer(
          ctx.user.id,
          ctx.user.email ?? "",
          ctx.user.name
        );
        const invoices = await stripe.invoices.list({
          customer: customerId,
          limit: 50,
        });
        return {
          invoices: invoices.data.map((inv: any) => ({
            id: inv.id,
            date: inv.created,
            amount: inv.amount_paid,
            currency: inv.currency,
            status: inv.status,
            pdfUrl: inv.invoice_pdf ?? null,
            receiptUrl: inv.hosted_invoice_url ?? null,
            description: inv.lines?.data?.[0]?.description ?? "Payment",
          })),
        };
      } catch (e) {
        console.error("[receipts] Stripe error:", e);
        return { invoices: [] };
      }
    }),

    // ─── Pay-to-unlock: one-time $200 checkout for a specific locked letter ───
    payToUnlock: subscriberProcedure
      .input(
        z.object({ letterId: z.number(), discountCode: z.string().optional() })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate limit: 10 payment attempts per hour per user
        await checkTrpcRateLimit("payment", `user:${ctx.user.id}`);
        // Verify the letter belongs to this subscriber and is in generated_locked status
        const letter = await getLetterRequestSafeForSubscriber(
          input.letterId,
          ctx.user.id
        );
        if (!letter)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Letter not found",
          });
        if (letter.status !== "generated_locked")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in generated_locked status",
          });
        const origin = getAppUrl(ctx.req);
        const result = await createLetterUnlockCheckout({
          userId: ctx.user.id,
          email: ctx.user.email ?? "",
          name: ctx.user.name,
          letterId: input.letterId,
          origin,
          discountCode: input.discountCode,
        });
        return result;
      }),

  }),

  // ─── Employee Affiliate System ──────────────────────────────────────────────
  affiliate: router({
    // Employee: get or create my discount code
    myCode: employeeProcedure.query(async ({ ctx }) => {
      let code = await getDiscountCodeByEmployeeId(ctx.user.id);
      if (!code) {
        code = await createDiscountCodeForEmployee(
          ctx.user.id,
          ctx.user.name ?? "EMP"
        );
        try {
          await notifyAdmins({
            category: "employee",
            type: "discount_code_created",
            title: `Discount code created`,
            body: `${ctx.user.name ?? "An employee"} created a new discount code: ${code?.code ?? "unknown"}.`,
            link: `/admin/affiliate`,
          });
        } catch (err) {
          console.error("[notifyAdmins] discount_code_created:", err);
          captureServerException(err, { tags: { component: "affiliate", error_type: "notify_admins_discount_code" } });
        }
      }
      return code;
    }),

    // Employee: rotate (regenerate) my discount code — called after copying
    rotateCode: employeeProcedure.mutation(async ({ ctx }) => {
      const code = await rotateDiscountCode(
        ctx.user.id,
        ctx.user.name ?? "EMP"
      );
      if (!code) throw new TRPCError({ code: "NOT_FOUND", message: "No discount code found to rotate." });
      return code;
    }),

    // Employee: get my earnings summary
    myEarnings: employeeProcedure.query(async ({ ctx }) => {
      return getEmployeeEarningsSummary(ctx.user.id);
    }),

    // Employee: get my commission history
    myCommissions: employeeProcedure.query(async ({ ctx }) => {
      return getCommissionsByEmployeeId(ctx.user.id);
    }),

    // Employee: request a payout
    requestPayout: employeeProcedure
      .input(
        z.object({
          amount: z.number().min(1000, "Minimum payout is $10.00"),
          paymentMethod: z.string().default("bank_transfer"),
          paymentDetails: z
            .object({
              bankName: z.string().optional(),
              accountLast4: z.string().optional(),
              routingNumber: z.string().optional(),
              paypalEmail: z.string().email().optional(),
              venmoHandle: z.string().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify employee has enough pending balance
        const earnings = await getEmployeeEarningsSummary(ctx.user.id);
        if (earnings.pending < input.amount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient pending balance. Available: $${(earnings.pending / 100).toFixed(2)}`,
          });
        }
        const result = await createPayoutRequest({
          employeeId: ctx.user.id,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentDetails: input.paymentDetails,
        });
        try {
          const payoutAppUrl = getAppUrl(ctx.req);
          await notifyAdmins({
            category: "employee",
            type: "payout_request",
            title: `New payout request: $${(input.amount / 100).toFixed(2)}`,
            body: `${ctx.user.name ?? "An employee"} requested a $${(input.amount / 100).toFixed(2)} payout via ${input.paymentMethod}.`,
            link: `/admin/affiliate`,
            emailOpts: {
              subject: `New Payout Request: $${(input.amount / 100).toFixed(2)}`,
              preheader: `${ctx.user.name ?? "An employee"} requested a payout`,
              bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "An employee"}</strong> has requested a payout of <strong>$${(input.amount / 100).toFixed(2)}</strong> via ${input.paymentMethod}.</p><p>Please review and process this request.</p>`,
              ctaText: "Review Payouts",
              ctaUrl: `${payoutAppUrl}/admin/affiliate`,
            },
          });
        } catch (err) {
          console.error("[notifyAdmins] payout_request:", err);
          captureServerException(err, { tags: { component: "affiliate", error_type: "notify_admins_payout_request" } });
        }
        return { success: true, payoutRequestId: result.insertId };
      }),

    // Employee: get my payout requests
    myPayouts: employeeProcedure.query(async ({ ctx }) => {
      return getPayoutRequestsByEmployeeId(ctx.user.id);
    }),

    // Public: validate a discount code (for checkout)
    validateCode: publicProcedure
      .input(z.object({ code: z.string().min(1) }))
      .query(async ({ input }) => {
        const code = await getDiscountCodeByCode(input.code);
        if (!code || !code.isActive)
          return { valid: false, discountPercent: 0 };
        if (code.maxUses && code.usageCount >= code.maxUses)
          return { valid: false, discountPercent: 0 };
        if (code.expiresAt && new Date(code.expiresAt) < new Date())
          return { valid: false, discountPercent: 0 };
        return { valid: true, discountPercent: code.discountPercent };
      }),

    // ─── Admin: Affiliate Oversight ──────────────────────────────────────────
    adminAllCodes: adminProcedure.query(async () => getAllDiscountCodes()),

    adminAllCommissions: adminProcedure.query(async () => getAllCommissions()),

    adminAllPayouts: adminProcedure.query(async () => getAllPayoutRequests()),

    adminUpdateCode: adminProcedure
      .input(
        z.object({
          id: z.number(),
          isActive: z.boolean().optional(),
          discountPercent: z.number().min(1).max(100).optional(),
          maxUses: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateDiscountCode(id, data);
        return { success: true };
      }),

    adminProcessPayout: adminProcedure
      .input(
        z.object({
          payoutId: z.number(),
          action: z.enum(["completed", "rejected"]),
          rejectionReason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const payout = await getPayoutRequestById(input.payoutId);
        if (!payout) throw new TRPCError({ code: "NOT_FOUND" });
        if (payout.status !== "pending")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payout already processed",
          });

        if (input.action === "completed") {
          const commissions = await getCommissionsByEmployeeId(
            payout.employeeId
          );
          // Sort oldest-first so we settle in chronological order
          const pendingCommissions = commissions
            .filter(c => c.status === "pending")
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          // Mark commissions oldest-first until the cumulative total meets or
          // exceeds the payout amount. This guarantees the full payout is always
          // settled — even when a single commission is larger than the residual.
          // Commissions are indivisible, so the last marked one may slightly
          // over-cover; that small surplus stays on the employee's ledger.
          let cumulative = 0;
          const idsToMark: number[] = [];
          for (const c of pendingCommissions) {
            if (cumulative >= payout.amount) break;
            idsToMark.push(c.id);
            cumulative += c.commissionAmount;
          }

          if (idsToMark.length > 0) {
            await markCommissionsPaid(idsToMark);
            console.log(
              `[adminProcessPayout] Payout #${input.payoutId}: marked ${idsToMark.length} commission(s) ` +
              `totalling ${cumulative} cents as paid (payout amount: ${payout.amount} cents)`
            );
          } else {
            console.warn(
              `[adminProcessPayout] Payout #${input.payoutId}: no pending commissions found to settle ` +
              `for employee #${payout.employeeId}`
            );
          }
        }

        await processPayoutRequest(
          input.payoutId,
          ctx.user.id,
          input.action,
          input.rejectionReason
        );

        try {
          const employee = await getUserById(payout.employeeId);
          if (employee?.email) {
            if (input.action === "completed") {
              await sendPayoutCompletedEmail({
                to: employee.email,
                name: employee.name ?? "Employee",
                amount: `$${(payout.amount / 100).toFixed(2)}`,
                paymentMethod: payout.paymentMethod,
              });
            } else {
              await sendPayoutRejectedEmail({
                to: employee.email,
                name: employee.name ?? "Employee",
                amount: `$${(payout.amount / 100).toFixed(2)}`,
                reason: input.rejectionReason ?? "No reason provided",
              });
            }
          }
        } catch (emailErr) {
          console.error("[adminProcessPayout] Notification email error:", emailErr);
          captureServerException(emailErr, { tags: { component: "payout", error_type: "notification_email_failed" } });
        }

        return { success: true };
      }),

    adminEmployeePerformance: adminProcedure.query(async () => {
      // Batched: 3 queries total instead of 2N+1 (N+1 fix)
      const [employees, allCodes, allEarnings] = await Promise.all([
        getEmployeesAndAdmins(),
        getAllDiscountCodes(),
        getAllEmployeeEarnings(),
      ]);

      // Build lookup maps for O(1) access
      const codesByEmployee = new Map(allCodes.map(c => [c.employeeId, c]));
      const earningsByEmployee = new Map(
        allEarnings.map(e => [e.employeeId, e])
      );

      return employees.map(emp => {
        const code = codesByEmployee.get(emp.id);
        const earnings = earningsByEmployee.get(emp.id);
        return {
          employeeId: emp.id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          discountCode: code?.code ?? null,
          codeActive: code?.isActive ?? false,
          usageCount: code?.usageCount ?? 0,
          totalEarned: earnings?.totalEarned ?? 0,
          pending: earnings?.pending ?? 0,
          paid: earnings?.paid ?? 0,
          referralCount: earnings?.referralCount ?? 0,
        };
      });
    }),

    adminReferralDetails: adminProcedure
      .input(z.object({ employeeId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const rows = await getAdminReferralDetails(input.employeeId);
        const now = new Date();

        const referrals = rows.map(row => {
          const subCreatedAt = row.subscriptionCreatedAt
            ? new Date(row.subscriptionCreatedAt)
            : null;
          const tenureMonths = subCreatedAt
            ? Math.floor(
                (now.getTime() - subCreatedAt.getTime()) /
                  (1000 * 60 * 60 * 24 * 30.44)
              )
            : null;
          return {
            commissionId: row.commissionId,
            subscriberId: row.subscriberId,
            subscriberName: row.subscriberName ?? null,
            subscriberEmail: row.subscriberEmail ?? null,
            subscriptionPlan: row.subscriptionPlan ?? null,
            subscriptionStatus: row.subscriptionStatus ?? null,
            subscriptionCreatedAt: row.subscriptionCreatedAt ?? null,
            tenureMonths,
            commissionAmount: row.commissionAmount,
            saleAmount: row.saleAmount,
            commissionStatus: row.commissionStatus,
            commissionCreatedAt: row.commissionCreatedAt,
          };
        });

        // Summary stats
        const totalReferred = referrals.length;
        const tenures = referrals
          .map(r => r.tenureMonths)
          .filter((t): t is number => t !== null);
        const avgTenureMonths =
          tenures.length > 0
            ? Math.round(
                tenures.reduce((a, b) => a + b, 0) / tenures.length
              )
            : 0;
        const totalRevenue = referrals.reduce(
          (sum, r) => sum + r.saleAmount,
          0
        );

        return {
          referrals,
          summary: { totalReferred, avgTenureMonths, totalRevenue },
        };
      }),
  }),
  // ─── Profile ──────────────────────────────────────────────────────────────
  profile: router({
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200).optional(),
          email: z.string().email().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),
    changeEmail: protectedProcedure
      .input(
        z.object({
          newEmail: z.string().email("Please enter a valid email address"),
          currentPassword: z
            .string()
            .min(1, "Password is required to change email"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { createClient } = await import("@supabase/supabase-js");
        const crypto = await import("crypto");
        const sbUrl =
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const sbAnonKey =
          process.env.VITE_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "";
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        // Check new email is different from current
        if (input.newEmail.toLowerCase() === ctx.user.email?.toLowerCase()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New email is the same as your current email",
          });
        }

        // Check new email is not already taken
        const existingUser = await getUserByEmail(input.newEmail);
        if (existingUser && existingUser.id !== ctx.user.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email address is already in use",
          });
        }

        // Verify current password
        const verifyClient = createClient(sbUrl, sbAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: signInError } =
          await verifyClient.auth.signInWithPassword({
            email: ctx.user.email!,
            password: input.currentPassword,
          });
        if (signInError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }

        // Update email in Supabase Auth
        const serviceClient = createClient(sbUrl, sbServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: updateError } =
          await serviceClient.auth.admin.updateUserById(ctx.user.openId, {
            email: input.newEmail,
          });
        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update email in auth system",
          });
        }

        // Update email in app database and set emailVerified = false
        await updateUserProfile(ctx.user.id, { email: input.newEmail });
        const db = (await import("./db")).getDb;
        const dbInstance = await (await import("./db")).getDb();
        if (dbInstance) {
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await dbInstance
            .update(users)
            .set({ emailVerified: false, updatedAt: new Date() })
            .where(eq(users.id, ctx.user.id));
        }

        // Send verification email to new address
        const verificationToken = crypto.randomBytes(48).toString("hex");
        await deleteUserVerificationTokens(ctx.user.id);
        await createEmailVerificationToken(
          ctx.user.id,
          input.newEmail,
          verificationToken
        );
        const origin =
          ctx.req?.headers?.origin &&
          !String(ctx.req?.headers?.origin).includes("localhost")
            ? (ctx.req.headers.origin as string)
            : ctx.req?.headers?.["x-forwarded-host"]
              ? `https://${ctx.req.headers["x-forwarded-host"]}`
              : "https://www.talk-to-my-lawyer.com";
        const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;
        try {
          await sendVerificationEmail({
            to: input.newEmail,
            name: ctx.user.name || input.newEmail.split("@")[0],
            verifyUrl,
          });
        } catch (emailErr) {
          captureServerException(emailErr, { tags: { component: "profile", error_type: "verification_email_failed" } });
          console.error(
            "[Profile] Failed to send verification email:",
            emailErr
          );
        }

        return {
          success: true,
          message:
            "Email updated. Please check your new email for a verification link.",
        };
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { createClient } = await import("@supabase/supabase-js");
        const sbUrl =
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const sbAnonKey =
          process.env.VITE_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "";
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        // Verify current password by attempting sign-in
        const verifyClient = createClient(sbUrl, sbAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: signInError } =
          await verifyClient.auth.signInWithPassword({
            email: ctx.user.email!,
            password: input.currentPassword,
          });
        if (signInError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }
        // Update password using service role client
        const serviceClient = createClient(sbUrl, sbServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: updateError } =
          await serviceClient.auth.admin.updateUserById(ctx.user.openId, {
            password: input.newPassword,
          });
        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update password",
          });
        }
        return { success: true };
      }),
  }),

  // ─── Document Analyzer (public, rate-limited) ─────────────────────────────
  documents: router({
    analyze: publicProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(500),
          fileType: z.enum(["pdf", "docx", "txt"]),
          // Max base64 string length for a ~7.5MB file (accounts for ~33% base64 overhead)
          fileBase64: z.string().min(1).max(10_485_760), // 10MB base64 string = ~7.5MB actual file
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate-limit: 3/hour for unauthenticated (by trusted IP), general limit for authenticated
        if (!ctx.user) {
          const clientIp = getClientIp(ctx.req);
          await checkTrpcRateLimit("document", `ip:${clientIp}`);
        } else {
          await checkTrpcRateLimit("general", `user:${ctx.user.id}`);
        }

        // Enforce binary size limit: 7.5MB decoded
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        if (fileBuffer.byteLength > 7_864_320) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "File exceeds the 7.5 MB size limit. Please upload a smaller document.",
          });
        }

        // Extract text from document
        let documentText = "";
        try {
          if (input.fileType === "pdf") {
            const { PDFParse } = await import("pdf-parse");
            const parser = new PDFParse({ data: fileBuffer });
            const pdfData = await parser.getText();
            await parser.destroy();
            documentText = pdfData.text;
          } else if (input.fileType === "docx") {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            documentText = result.value;
          } else {
            documentText = fileBuffer.toString("utf-8");
          }
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not extract text from the document. Please ensure it is a valid file.",
          });
        }

        if (!documentText || documentText.trim().length < 50) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The document appears to be empty or contains no readable text.",
          });
        }

        // Truncate to avoid token limits (~100k chars)
        const truncatedText = documentText.length > 100_000
          ? documentText.slice(0, 100_000) + "\n\n[Document truncated due to length]"
          : documentText;

        // Build OpenAI prompt
        const openai = (await import("@ai-sdk/openai")).createOpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        const { generateText: aiGenerateText } = await import("ai");

        const prompt = `You are a legal document analyst specializing in identifying what legal action a recipient of a document should take, AND in reading between the lines to detect emotional tone, hidden intent, veiled threats, and manipulative language. Analyze the following document and return a JSON object with this EXACT structure — no additional fields, no markdown, just valid JSON:

{
  "summary": "A clear 2-4 paragraph summary of what this document is about, its purpose, and the key parties involved.",
  "actionItems": [
    "Action item or obligation 1",
    "Action item or obligation 2"
  ],
  "flaggedRisks": [
    {
      "clause": "The specific clause or section title",
      "description": "Why this is risky or important",
      "severity": "high"
    }
  ],
  "recommendedLetterType": "demand-letter",
  "urgencyLevel": "high",
  "detectedDeadline": "30 days from receipt",
  "detectedJurisdiction": "California",
  "detectedParties": {
    "senderName": "Acme Corp",
    "recipientName": "John Smith"
  },
  "recommendedResponseSummary": "A one-sentence description of the most important thing the recipient should do in response to this document.",
  "emotionalIntelligence": {
    "overallTone": "Threatening but Polite",
    "toneConfidence": "high",
    "emotionBreakdown": [
      { "emotion": "urgency", "intensity": 85 },
      { "emotion": "anger", "intensity": 30 },
      { "emotion": "condescension", "intensity": 60 }
    ],
    "hiddenImplications": [
      "Implies legal action if you don't comply within 10 days, though phrased as a suggestion"
    ],
    "redFlags": [
      {
        "passage": "We kindly request your prompt attention to this matter",
        "explanation": "Despite the polite wording, this is a veiled threat implying consequences for non-compliance"
      }
    ],
    "manipulationTactics": [
      "False urgency — creates artificial time pressure to prevent careful consideration"
    ],
    "trueIntentSummary": "Plain-English paragraph explaining what this document is really saying beneath all the formality."
  }
}

Field rules:
- summary: Comprehensive yet readable overview (2-4 paragraphs)
- actionItems: Array of 3-10 concrete obligations, deadlines, or required actions the document recipient must take
- flaggedRisks: Array of 2-8 important clauses, risks, or provisions that deserve attention. severity must be "low", "medium", or "high"
- recommendedLetterType: The type of response letter the recipient should consider sending. Must be exactly one of: "demand-letter", "cease-and-desist", "contract-breach", "eviction-notice", "employment-dispute", "consumer-complaint", "general-legal". If no legal response letter is warranted, set to null.
- urgencyLevel: How urgently the recipient needs to respond — "low", "medium", or "high" based on deadlines, legal consequences, and tone
- detectedDeadline: Any specific deadline or response window mentioned in the document (e.g., "30 days from the date of this letter"). Set to null if none found.
- detectedJurisdiction: The US state or jurisdiction mentioned or implied in the document (e.g., "California", "New York"). Set to null if unclear.
- detectedParties: The party who sent this document (senderName) and the party it was sent to (recipientName). Use null for either if not clearly identified.
- recommendedResponseSummary: One concise sentence (under 150 chars) describing the best action the document recipient should take.

Emotional Intelligence field rules:
- overallTone: A short labeled tone description (e.g., "Threatening but Polite", "Passive-Aggressive", "Genuinely Cooperative", "Coldly Professional", "Manipulatively Friendly"). Be specific and nuanced.
- toneConfidence: How confident you are in the tone assessment — "low", "medium", or "high"
- emotionBreakdown: Array of 4-8 detected emotions with intensity 0-100. Include emotions like: anger, fear, urgency, friendliness, condescension, sarcasm, guilt-tripping, confidence, deception, desperation. Only include emotions that are actually present (intensity > 0).
- hiddenImplications: Array of 2-6 things the document implies without saying directly. Look for unstated consequences, implied threats wrapped in polite language, assumptions the document makes without stating, and obligations it tries to create through implication rather than explicit statement.
- redFlags: Array of 1-5 specific passages where language wraps threats, pressure, or unfavorable terms in friendly/neutral/humorous tone. Quote the actual passage and explain what's really being said. Look for: polite language disguising demands, humor masking serious consequences, casual framing of significant obligations, and professional language softening harsh realities.
- manipulationTactics: Array of 1-5 identified persuasion or manipulation techniques. Look for: false urgency, appeal to authority, guilt-tripping, minimization of the recipient's rights, anchoring bias, social proof manipulation, fear of loss framing, and false dichotomies.
- trueIntentSummary: A plain-English paragraph (2-4 sentences) explaining what this document is REALLY saying when you strip away all the formality, politeness, and legal language. Be direct and honest about the sender's true motivations and goals.

- Return ONLY valid JSON, no markdown fences, no explanation outside the JSON object.

Document to analyze:
---
${truncatedText}
---`;

        let analysisResult: DocumentAnalysisResult;

        try {
          const { text } = await aiGenerateText({
            model: openai("gpt-4o"),
            prompt,
            maxOutputTokens: 5000,
          });

          // Parse and strip JSON from possible markdown code fences
          let jsonStr = text.trim();
          const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();
          const objMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (objMatch) jsonStr = objMatch[0];

          const parsed: unknown = JSON.parse(jsonStr);

          // Validate via lenient schema (applies safe defaults for partial/malformed AI output)
          analysisResult = documentAnalysisResultLenientSchema.parse(parsed);
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AI analysis failed. Please try again.",
          });
        }

        // Persist result to DB (best-effort, non-blocking)
        (async () => {
          try {
            const db = await (await import("./db")).getDb();
            if (db) {
              const { documentAnalyses } = await import("../drizzle/schema");
              await db.insert(documentAnalyses).values({
                documentName: input.fileName,
                fileType: input.fileType,
                analysisJson: analysisResult,
                userId: ctx.user?.id ?? null,
              });
            }
          } catch (dbErr) {
            console.error("[DocumentAnalyzer] DB insert failed (non-fatal):", dbErr);
            captureServerException(dbErr, { tags: { component: "document_analyzer", error_type: "db_insert_failed" } });
          }
        })();

        return analysisResult;
      }),

    getMyAnalyses: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.number().int().optional(), // id of the last row seen (for keyset pagination)
        }).optional()
      )
      .query(async ({ ctx, input }) => {
        const limit = input?.limit ?? 20;
        const cursor = input?.cursor;
        try {
          const db = await (await import("./db")).getDb();
          if (!db) return { rows: [], nextCursor: undefined };
          const { documentAnalyses } = await import("../drizzle/schema");
          const { eq, desc, lt, and } = await import("drizzle-orm");

          const conditions = cursor
            ? and(eq(documentAnalyses.userId, ctx.user.id), lt(documentAnalyses.id, cursor))
            : eq(documentAnalyses.userId, ctx.user.id);

          const fetched = await db
            .select()
            .from(documentAnalyses)
            .where(conditions)
            .orderBy(desc(documentAnalyses.createdAt), desc(documentAnalyses.id))
            .limit(limit + 1);

          let nextCursor: number | undefined;
          if (fetched.length > limit) {
            nextCursor = fetched[limit].id;
            fetched.pop();
          }

          return { rows: fetched, nextCursor };
        } catch (err) {
          console.error("[DocumentAnalyzer] getMyAnalyses failed:", err);
          captureServerException(err, { tags: { component: "document_analyzer", error_type: "get_analyses_failed" } });
          return { rows: [], nextCursor: undefined };
        }
      }),
  }),

  // ─── Blog ───────────────────────────────────────────────────────────────────
  blog: router({
    list: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(12),
        offset: z.number().int().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return getPublishedBlogPosts({
          category: input?.category,
          limit: input?.limit ?? 12,
          offset: input?.offset ?? 0,
        });
      }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string().min(1) }))
      .query(async ({ input }) => {
        const post = await getBlogPostBySlug(input.slug);
        if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Blog post not found" });
        return post;
      }),

    adminList: adminProcedure.query(async () => {
      return getAllBlogPosts();
    }),

    adminCreate: adminProcedure
      .input(z.object({
        slug: z.string().min(1).max(300),
        title: z.string().min(1).max(300),
        excerpt: z.string().min(1),
        content: z.string().min(1),
        category: z.enum(BLOG_CATEGORIES),
        metaDescription: z.string().optional(),
        ogImageUrl: z.string().optional(),
        authorName: z.string().optional(),
        status: z.enum(["draft", "published"]).default("draft"),
      }))
      .mutation(async ({ input }) => {
        return createBlogPost(input);
      }),

    adminUpdate: adminProcedure
      .input(z.object({
        id: z.number(),
        slug: z.string().min(1).max(300).optional(),
        title: z.string().min(1).max(300).optional(),
        excerpt: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        category: z.enum(BLOG_CATEGORIES).optional(),
        metaDescription: z.string().nullable().optional(),
        ogImageUrl: z.string().nullable().optional(),
        authorName: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateBlogPost(id, data);
        return { success: true };
      }),

    adminDelete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBlogPost(input.id);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
