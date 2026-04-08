import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure } from "../../_core/trpc";
import {
  createNotification,
  notifyAdmins,
  getAllLetterRequests,
  getAllUsersWithSubscription,
  markAsPaidDb,
  getEmployeesAndAdmins,
  logReviewAction,
  getCostAnalytics,
  getSystemStats,
  updateUserRole,
  getUserById,
  assignRoleId,
  getAllEmployeeEarnings,
} from "../../db";
import { captureServerException } from "../../sentry";
import { invalidateUserCache } from "../../supabaseAuth";
import { hasEverSubscribed } from "../../stripe";
import { inviteAttorney } from "../../services/admin";
import { logger } from "../../logger";

export const usersProcedures = {
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
        logger.error({ e: e }, "[updateRole] Role ID assignment failed:");
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
          logger.error({ err: err }, "[updateRole] Failed to send attorney promotion notification:");
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
          logger.error({ err: err }, "[updateRole] Failed to send attorney onboarding queue notification:");
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
        logger.error({ err: err }, "[notifyAdmins] user_role_changed:");
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

  employees: adminProcedure.query(async () => {
    const [employees, earnings] = await Promise.all([
      getEmployeesAndAdmins(),
      getAllEmployeeEarnings(),
    ]);
    const earningsMap = new Map(earnings.map(e => [e.employeeId, e]));
    return employees.map(emp => ({
      ...emp,
      totalEarned: earningsMap.get(emp.id)?.totalEarned ?? 0,
      pendingEarnings: earningsMap.get(emp.id)?.pending ?? 0,
      paidEarnings: earningsMap.get(emp.id)?.paid ?? 0,
    }));
  }),
};
