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
import { logger } from "../logger";

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


export const affiliateRouter = router({
    // Employee: get or create my discount code
    myCode: employeeProcedure.query(async ({ ctx }) => {
      let code = await getDiscountCodeByEmployeeId(ctx.user.id);
      if (!code) {
        code = await createDiscountCodeForEmployee(
          ctx.user.id,
          ctx.user.name ?? "EMP"
        );
        if (code) {
          // Register new code in Worker allowlist (fire-and-forget, non-blocking)
          syncCodeToWorkerAllowlist(code.code, "add").catch((err) => {
            logger.error("[DiscountCode] Failed to sync new code to worker allowlist:", err);
            captureServerException(err, { tags: { component: "discount_code", error_type: "worker_allowlist_sync_failed" } });
          });
        }
        try {
          await notifyAdmins({
            category: "employee",
            type: "discount_code_created",
            title: `Discount code created`,
            body: `${ctx.user.name ?? "An employee"} created a new discount code: ${code?.code ?? "unknown"}.`,
            link: `/admin/affiliate`,
          });
        } catch (err) {
          logger.error({ err: err }, "[notifyAdmins] discount_code_created:");
          captureServerException(err, { tags: { component: "affiliate", error_type: "notify_admins_discount_code" } });
        }
      }
      return code;
    }),

    // Employee: rotate (regenerate) my discount code — called after copying
    rotateCode: employeeProcedure.mutation(async ({ ctx }) => {
      // Get old code before rotation so we can remove it from allowlist
      const oldCode = await getDiscountCodeByEmployeeId(ctx.user.id);
      const code = await rotateDiscountCode(
        ctx.user.id,
        ctx.user.name ?? "EMP"
      );
      if (!code) throw new TRPCError({ code: "NOT_FOUND", message: "No discount code found to rotate." });
      // Swap allowlist entries: remove old, add new (fire-and-forget)
      if (oldCode) syncCodeToWorkerAllowlist(oldCode.code, "remove").catch((err) => {
        logger.error("[DiscountCode] Failed to remove old code from worker allowlist:", err);
        captureServerException(err, { tags: { component: "discount_code", error_type: "worker_allowlist_remove_failed" } });
      });
      syncCodeToWorkerAllowlist(code.code, "add").catch((err) => {
        logger.error("[DiscountCode] Failed to add rotated code to worker allowlist:", err);
        captureServerException(err, { tags: { component: "discount_code", error_type: "worker_allowlist_sync_failed" } });
      });
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
          logger.error({ err: err }, "[notifyAdmins] payout_request:");
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

    // Employee: get click analytics for my referral code from the Cloudflare Worker
    clickAnalytics: employeeProcedure
      .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
      .query(async ({ ctx, input }) => {
        const code = await getDiscountCodeByEmployeeId(ctx.user.id);
        if (!code) return { totalClicks: 0, uniqueVisitors: 0, daily: [] };

        const workerUrl = process.env.AFFILIATE_WORKER_URL ?? "https://refer.talktomylawyer.com";
        const secret = process.env.AFFILIATE_WORKER_SECRET ?? "";

        if (!secret) {
          // Worker not yet configured — return zeros gracefully
          return { totalClicks: 0, uniqueVisitors: 0, daily: [] };
        }

        try {
          const res = await fetch(
            `${workerUrl}/${encodeURIComponent(code.code)}/analytics?days=${input.days}`,
            {
              headers: { Authorization: `Bearer ${secret}` },
              signal: AbortSignal.timeout(5000),
            }
          );
          if (!res.ok) return { totalClicks: 0, uniqueVisitors: 0, daily: [] };
          return res.json() as Promise<{
            totalClicks: number;
            uniqueVisitors: number;
            daily: { date: string; clicks: number; uniqueVisitors: number }[];
          }>;
        } catch (analyticsErr) {
          logger.warn({ err: analyticsErr }, "[Analytics] Failed to fetch click analytics, returning empty defaults:");
          return { totalClicks: 0, uniqueVisitors: 0, daily: [] };
        }
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
          expiresAt: z.string().datetime().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, expiresAt, ...rest } = input;
        const data: Parameters<typeof updateDiscountCode>[1] = { ...rest };
        if (expiresAt !== undefined) {
          data.expiresAt = expiresAt ? new Date(expiresAt) : null;
        }
        await updateDiscountCode(id, data);
        return { success: true };
      }),

    adminForceExpireCode: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const allCodes = await getAllDiscountCodes();
        const target = allCodes.find(c => c.id === input.id);
        await updateDiscountCode(input.id, {
          isActive: false,
          expiresAt: new Date(),
        });
        if (target?.code) {
          syncCodeToWorkerAllowlist(target.code, "remove").catch((err) => {
            logger.error("[DiscountCode] Failed to remove disabled code from worker allowlist:", err);
            captureServerException(err, { tags: { component: "discount_code", error_type: "worker_allowlist_remove_failed" } });
          });
        }
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
            logger.info(
              `[adminProcessPayout] Payout #${input.payoutId}: marked ${idsToMark.length} commission(s) ` +
              `totalling ${cumulative} cents as paid (payout amount: ${payout.amount} cents)`
            );
          } else {
            logger.warn(
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
          logger.error({ err: emailErr }, "[adminProcessPayout] Notification email error:");
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
});
