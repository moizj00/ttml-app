/**
 * Affiliate Router — Employee Procedures
 *
 * Covers: myCode, rotateCode, myEarnings, myCommissions,
 *         requestPayout, myPayouts, clickAnalytics, validateCode (public)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "../../_core/trpc";
import {
  createDiscountCodeForEmployee,
  getDiscountCodeByEmployeeId,
  rotateDiscountCode,
  getDiscountCodeByCode,
  getEmployeeEarningsSummary,
  getCommissionsByEmployeeId,
  createPayoutRequest,
  getPayoutRequestsByEmployeeId,
  notifyAdmins,
  PayoutAmountMismatchError,
  PayoutUnavailableError,
} from "../../db";
import { captureServerException } from "../../sentry";
import { syncCodeToWorkerAllowlist, employeeProcedure, getAppUrl } from "../_shared";

export const affiliateEmployeeRouter = router({
  // Employee: get or create my discount code
  myCode: employeeProcedure.query(async ({ ctx }) => {
    let code = await getDiscountCodeByEmployeeId(ctx.user.id);
    if (!code) {
      code = await createDiscountCodeForEmployee(
        ctx.user.id,
        ctx.user.name ?? "EMP"
      );
      if (code) {
        syncCodeToWorkerAllowlist(code.code, "add").catch((err) => {
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
        captureServerException(err, { tags: { component: "affiliate", error_type: "notify_admins_discount_code" } });
      }
    }
    return code;
  }),

  // Employee: rotate (regenerate) my discount code
  rotateCode: employeeProcedure.mutation(async ({ ctx }) => {
    const oldCode = await getDiscountCodeByEmployeeId(ctx.user.id);
    const code = await rotateDiscountCode(ctx.user.id, ctx.user.name ?? "EMP");
    if (!code) throw new TRPCError({ code: "NOT_FOUND", message: "No discount code found to rotate." });
    if (oldCode) {
      syncCodeToWorkerAllowlist(oldCode.code, "remove").catch((err) => {
        captureServerException(err, { tags: { component: "discount_code", error_type: "worker_allowlist_remove_failed" } });
      });
    }
    syncCodeToWorkerAllowlist(code.code, "add").catch((err) => {
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
      const earnings = await getEmployeeEarningsSummary(ctx.user.id);
      if (earnings.pending < 1000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Minimum available balance for payout is $10.00.",
        });
      }
      if (earnings.pending !== input.amount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payout amount must equal your full available balance of $${(earnings.pending / 100).toFixed(2)}.`,
        });
      }

      let result: Awaited<ReturnType<typeof createPayoutRequest>>;
      try {
        result = await createPayoutRequest({
          employeeId: ctx.user.id,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentDetails: input.paymentDetails,
        });
      } catch (err) {
        if (err instanceof PayoutUnavailableError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Minimum available balance for payout is $10.00.",
          });
        }
        if (err instanceof PayoutAmountMismatchError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payout amount must equal your full available balance of $${(err.available / 100).toFixed(2)}.`,
          });
        }
        throw err;
      }

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
      if (!code || !code.isActive) return { valid: false, discountPercent: 0 };
      if (code.maxUses && code.usageCount >= code.maxUses) return { valid: false, discountPercent: 0 };
      if (code.expiresAt && new Date(code.expiresAt) < new Date()) return { valid: false, discountPercent: 0 };
      return { valid: true, discountPercent: code.discountPercent };
    }),

  // Employee: get click analytics for my referral code
  clickAnalytics: employeeProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const code = await getDiscountCodeByEmployeeId(ctx.user.id);
      if (!code) return { totalClicks: 0, uniqueVisitors: 0, daily: [] };

      const workerUrl = process.env.AFFILIATE_WORKER_URL ?? "https://refer.talktomylawyer.com";
      const secret = process.env.AFFILIATE_WORKER_SECRET ?? "";

      if (!secret) return { totalClicks: 0, uniqueVisitors: 0, daily: [] };

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
      } catch {
        return { totalClicks: 0, uniqueVisitors: 0, daily: [] };
      }
    }),
});
