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


export const profileRouter = router({
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
        const db = (await import("../db")).getDb;
        const dbInstance = await (await import("../db")).getDb();
        if (dbInstance) {
          const { users } = await import("../../drizzle/schema");
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
});
