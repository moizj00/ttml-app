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
  getRAGAnalytics,
  getFineTuneRuns,
  getEditDistanceTrend,
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
  hasEverSubscribed,
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


export const adminRouter = router({
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
        // ── Guard: permanently block promoting any subscriber to attorney ──
        // Once a user has EVER subscribed (any plan, any status — including canceled),
        // they can never be promoted to attorney. This is a permanent, irreversible rule:
        // subscriber → attorney is a forbidden transition to prevent billing/role conflicts.
        if (input.role === "attorney") {
          const everSubscribed = await hasEverSubscribed(input.userId);
          if (everSubscribed) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "This user has a subscription history and cannot be promoted to Attorney. The subscriber role is permanent once a plan has been purchased.",
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
          // Permanent block: once a user has EVER subscribed, they cannot become attorney
          const everSubscribed = await hasEverSubscribed(existingUser.id);
          if (everSubscribed) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This user has a subscription history and cannot be promoted to Attorney. The subscriber role is permanent once a plan has been purchased.",
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
                const { upsertUser: upsertExisting, getUserByOpenId: getByOpenId } = await import("../db");
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

        const { upsertUser, getUserByOpenId } = await import("../db");
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
        enqueueRetryFromStageJob({
          type: "retryPipelineFromStage",
          letterId: input.letterId,
          intake: letter.intakeJson,
          stage: input.stage,
          userId: letter.userId ?? undefined,
        }).catch(console.error);
        return {
          success: true,
          message: `Retry started for stage: ${input.stage}`,
        };
      }),

    purgeFailedJobs: adminProcedure.mutation(async () => {
      const result = await purgeFailedJobs();
      return { success: true, deletedCount: result.deletedCount };
    }),

    queueHealth: adminProcedure.query(async () => {
      try {
        const queue = getPipelineQueue();
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        const recentFailed = await queue.getFailed(0, 9);
        const failedJobs = recentFailed.map(j => ({
          id: j.id,
          name: j.name,
          failedReason: j.failedReason,
          finishedOn: j.finishedOn,
          data: { type: j.data.type, letterId: j.data.letterId },
        }));

        const recentCompleted = await queue.getCompleted(0, 9);
        const avgProcessingTimeMs = recentCompleted.length > 0
          ? recentCompleted.reduce((sum, j) => {
              const processing = (j.finishedOn ?? 0) - (j.processedOn ?? 0);
              return sum + (processing > 0 ? processing : 0);
            }, 0) / recentCompleted.length
          : 0;

        return {
          pending: waiting,
          active,
          completed,
          failed,
          delayed,
          avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
          recentFailedJobs: failedJobs,
        };
      } catch (err) {
        console.error("[Queue] Health check failed:", err);
        return {
          pending: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          avgProcessingTimeMs: 0,
          recentFailedJobs: [],
          error: err instanceof Error ? err.message : "Queue health check failed",
        };
      }
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
        const [versions, actions, jobs, researchRuns] = await Promise.all([
          getLetterVersionsByRequestId(input.letterId, true), // include internal
          getReviewActions(input.letterId, true), // include internal
          getWorkflowJobsByLetterId(input.letterId),
          getResearchRunsByLetterId(input.letterId),
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
          researchRuns,
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
            "client_revision_requested",
            "client_declined",
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
        if (!["pending_review", "client_revision_requested"].includes(letter.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in pending_review or client_revision_requested status to claim",
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
          fromStatus: letter.status,
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

    consolidateLessons: adminProcedure
      .input(z.object({
        letterType: z.string(),
        jurisdiction: z.string().nullable(),
      }))
      .mutation(async ({ input }) => {
        const result = await consolidateLessonsForScope(input.letterType, input.jurisdiction);
        return { success: true, ...result };
      }),

    lessonImpact: adminProcedure.query(async () => getLessonImpactSummary()),

    pipelineAnalytics: adminProcedure
      .input(z.object({ dateRange: z.enum(["7d", "30d", "90d", "all"]).default("30d") }).optional())
      .query(async ({ input }) => getPipelineAnalytics(input?.dateRange ?? "30d")),

    ragAnalytics: adminProcedure
      .input(z.object({ days: z.number().default(30) }).optional())
      .query(async ({ input }) => getRAGAnalytics(input?.days ?? 30)),

    fineTuneRuns: adminProcedure.query(async () => getFineTuneRuns()),

    editDistanceTrend: adminProcedure
      .input(z.object({ days: z.number().default(30) }).optional())
      .query(async ({ input }) => getEditDistanceTrend(input?.days ?? 30)),
});
