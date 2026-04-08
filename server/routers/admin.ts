import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit, getClientIp } from "../rateLimiter";
import { documentAnalysisResultLenientSchema, type DocumentAnalysisResult } from "../../shared/types";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import {
  adminProcedure,
  publicProcedure,
  router,
} from "../_core/trpc";
import {
  syncCodeToWorkerAllowlist,
  intakeJsonSchema,
  employeeProcedure,
  attorneyProcedure,
  subscriberProcedure,
  getAppUrl,
} from "./_shared";
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

// ═══════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════

import { changeUserRole, inviteAttorney, retryPipelineJob, forceStatusTransition, diagnoseAndRepairLetterState } from "../services/admin";

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
      .mutation(async ({ ctx, input }) => {
        // Business logic lives in server/services/admin.ts → changeUserRole.
        // ── Guard: permanently block promoting any subscriber to attorney ──
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
        const updatedUser = await getUserById(input.userId);
        if (updatedUser?.openId) {
          invalidateUserCache(updatedUser.openId);
        }

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
            console.error("[updateRole] Failed to send attorney promotion notification:", err);
            captureServerException(err, { tags: { component: "admin", error_type: "attorney_promotion_notification_failed" } });
          }
          try {
            const pendingLetters = await getAllLetterRequests({ status: "pending_review" });
            if (pendingLetters.length > 0) {
              await createNotification({
                userId: input.userId,
                type: "attorney_onboarding_queue",
                category: "letters",
                title: `${pendingLetters.length} letter${pendingLetters.length !== 1 ? "s" : ""} awaiting review in the Review Center`,
                body: `Welcome! There ${pendingLetters.length !== 1 ? "are" : "is"} already ${pendingLetters.length} letter${pendingLetters.length !== 1 ? "s" : ""} in the queue waiting for attorney review.`,
                link: "/attorney/queue",
              });
            }
          } catch (err) {
            console.error("[updateRole] Failed to send attorney onboarding queue notification:", err);
            captureServerException(err, { tags: { component: "admin", error_type: "attorney_onboarding_queue_notification_failed" } });
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
        return inviteAttorney(input, {
          actingAdmin: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
          req: ctx.req,
        });
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
      .mutation(async ({ input }) => retryPipelineJob(input)),

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
      .mutation(async ({ ctx, input }) =>
        forceStatusTransition(input, { userId: ctx.user.id, appUrl: getAppUrl(ctx.req) })
      ),

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
      .mutation(async ({ ctx, input }) =>
        diagnoseAndRepairLetterState(input.letterId, ctx.user.id)
      ),

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
