/**
 * Affiliate Router — Admin Oversight Procedures
 *
 * Covers: adminAllCodes, adminAllCommissions, adminAllPayouts,
 *         adminUpdateCode, adminForceExpireCode, adminProcessPayout,
 *         adminEmployeePerformance, adminReferralDetails
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../../_core/trpc";
import { adminProcedure } from "../../_core/trpc";
import {
  getAllDiscountCodes,
  getAllCommissions,
  getAllPayoutRequests,
  updateDiscountCode,
  processPayoutRequest,
  getPayoutRequestById,
  getEmployeesAndAdmins,
  getAllEmployeeEarnings,
  getAdminReferralDetails,
  getUserById,
} from "../../db";
import { sendPayoutCompletedEmail, sendPayoutRejectedEmail } from "../../email";
import { captureServerException } from "../../sentry";
import { syncCodeToWorkerAllowlist } from "../_shared";

export const affiliateAdminRouter = router({
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
      if (payout.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payout already processed",
        });
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
        captureServerException(emailErr, { tags: { component: "payout", error_type: "notification_email_failed" } });
      }

      return { success: true };
    }),

  adminEmployeePerformance: adminProcedure.query(async () => {
    const [employees, allCodes, allEarnings] = await Promise.all([
      getEmployeesAndAdmins(),
      getAllDiscountCodes(),
      getAllEmployeeEarnings(),
    ]);

    const codesByEmployee = new Map(allCodes.map(c => [c.employeeId, c]));
    const earningsByEmployee = new Map(allEarnings.map(e => [e.employeeId, e]));

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
        reserved: earnings?.reserved ?? 0,
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
          commissionCount: row.commissionCount ?? 0,
        };
      });

      const totalReferred = referrals.length;
      const tenures = referrals
        .map(r => r.tenureMonths)
        .filter((t): t is number => t !== null);
      const avgTenureMonths =
        tenures.length > 0
          ? Math.round(tenures.reduce((a, b) => a + b, 0) / tenures.length)
          : 0;
      const totalRevenue = referrals.reduce((sum, r) => sum + r.saleAmount, 0);

      return {
        referrals,
        summary: { totalReferred, avgTenureMonths, totalRevenue },
      };
    }),
});
