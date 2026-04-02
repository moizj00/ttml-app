import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit, getClientIp } from "../rateLimiter";
import { documentAnalysisResultLenientSchema, type DocumentAnalysisResult } from "../../shared/types";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import {
  adminProcedure,
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


export const billingRouter = router({
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
      const db = await (await import("../db")).getDb();
      if (!db) return { state: "subscription_required" as const, eligible: false };
      const { letterRequests } = await import("../../drizzle/schema");
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
      const db = await (await import("../db")).getDb();
      if (!db) return { eligible: false };
      const { letterRequests } = await import("../../drizzle/schema");
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
        const db = await (await import("../db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { letterRequests } = await import("../../drizzle/schema");
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
        const { setFreeReviewUsed } = await import("../db");
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
      const { getStripe, getOrCreateStripeCustomer } = await import("../stripe");
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
      const { getStripe, getOrCreateStripeCustomer } = await import("../stripe");
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

    // ─── Subscription Submit: active subscribers bypass paywall entirely ───
    // Subscribers with an active recurring plan submit a generated_locked letter
    // directly to pending_review without any Stripe checkout.
    // Guards:
    //   1. subscriberProcedure — only subscribers can call this
    //   2. hasActiveRecurringSubscription — must have an active plan
    //   3. letter.status === "generated_locked" — only locked letters
    //   4. letter.userId === ctx.user.id — ownership check via getLetterRequestSafeForSubscriber
    subscriptionSubmit: subscriberProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Guard: must have active recurring subscription
        const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
        if (!isSubscribed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "An active subscription is required to use this feature.",
          });
        }
        // Ownership + status guard
        const letter = await getLetterRequestSafeForSubscriber(input.letterId, ctx.user.id);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });
        if (letter.status !== "generated_locked") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in generated_locked status",
          });
        }
        // Transition to pending_review
        await updateLetterStatus(input.letterId, "pending_review");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "subscription_submit",
          noteText: "Subscriber submitted letter for attorney review via active subscription (paywall bypassed).",
          noteVisibility: "internal",
          fromStatus: "generated_locked",
          toStatus: "pending_review",
        });
        // Notify subscriber
        try {
          await sendLetterUnlockedEmail({
            to: ctx.user.email ?? "",
            name: ctx.user.name ?? "Subscriber",
            subject: letter.subject,
            letterId: input.letterId,
            appUrl: getAppUrl(ctx.req),
          });
        } catch (e) {
          console.error("[subscriptionSubmit] Email error:", e);
          captureServerException(e, { tags: { component: "billing", error_type: "subscription_submit_email_failed" } });
        }
        // Notify all attorneys that a new letter is ready for review
        try {
          const { getAllUsers } = await import("../db");
          const attorneys = await getAllUsers("attorney");
          const appUrl = getAppUrl(ctx.req);
          for (const attorney of attorneys) {
            if (attorney.email) {
              await sendNewReviewNeededEmail({
                to: attorney.email,
                name: attorney.name ?? "Attorney",
                letterSubject: letter.subject,
                letterId: input.letterId,
                letterType: letter.letterType,
                jurisdiction: letter.jurisdictionState ?? "Unknown",
                appUrl,
              });
            }
          }
        } catch (notifyErr) {
          console.error("[subscriptionSubmit] Failed to notify attorneys:", notifyErr);
          captureServerException(notifyErr, { tags: { component: "billing", error_type: "subscription_submit_attorney_notify_failed" } });
        }
        // Notify admins
        try {
          await notifyAdmins({
            category: "letters",
            type: "subscription_submit",
            title: `Subscription submit — letter #${input.letterId} enters review queue`,
            body: `${ctx.user.name ?? "A subscriber"} submitted "${letter.subject}" via active subscription. Now pending review.`,
            link: `/admin/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[notifyAdmins] subscription_submit:", err);
          captureServerException(err, { tags: { component: "billing", error_type: "notify_admins_subscription_submit" } });
        }
        return { ok: true as const };
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

});
