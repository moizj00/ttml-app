/**
 * Billing Router — Subscription & Payment Queries
 *
 * Covers: getSubscription, checkCanSubmit, createCheckout, createBillingPortal,
 *         checkPaywallStatus, checkFirstLetterFree, paymentHistory, receipts
 */

import { z } from "zod";
import {
  router,
  protectedProcedure,
  emailVerifiedProcedure,
} from "../../_core/trpc";
import { checkTrpcRateLimit } from "../../rateLimiter";
import {
  getUserSubscription,
  checkLetterSubmissionAllowed,
  createCheckoutSession,
  createBillingPortalSession,
  hasActiveRecurringSubscription,
  getStripe,
  getOrCreateStripeCustomer,
} from "../../stripe";
import { subscriberProcedure, getAppUrl } from "../_shared";

export const billingSubscriptionsRouter = router({
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    return getUserSubscription(ctx.user.id);
  }),

  checkCanSubmit: protectedProcedure.query(async ({ ctx }) => {
    return checkLetterSubmissionAllowed(ctx.user.id);
  }),

  createCheckout: emailVerifiedProcedure
    .input(
      z.object({
        planId: z.string(),
        discountCode: z.string().optional(),
        returnTo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
        returnTo: input.returnTo,
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

  /**
   * Returns the paywall state for the current user:
   *   - "free_review_available" — first letter, eligible for $50 attorney review offer
   *   - "subscribed"            — active monthly/annual plan (bypass paywall entirely)
   *   - "free_trial_used"       — first letter review already used/paid
   *   - "subscription_required" — must subscribe
   */
  checkPaywallStatus: subscriberProcedure.query(async ({ ctx }) => {
    const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
    if (isSubscribed) return { state: "subscribed" as const, eligible: false };

    const db = await (await import("../../db")).getDb();
    if (!db)
      return { state: "subscription_required" as const, eligible: false };
    const { letterRequests } = await import("../../../drizzle/schema");
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
      return { state: "free_review_available" as const, eligible: true };
    return { state: "free_trial_used" as const, eligible: false };
  }),

  // Legacy alias: kept for backward compat (LetterPaywall still calls this)
  checkFirstLetterFree: subscriberProcedure.query(async ({ ctx }) => {
    const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
    if (isSubscribed) return { eligible: false };
    const db = await (await import("../../db")).getDb();
    if (!db) return { eligible: false };
    const { letterRequests } = await import("../../../drizzle/schema");
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

  paymentHistory: protectedProcedure.query(async ({ ctx }) => {
    const stripe = getStripe();
    try {
      const customerId = await getOrCreateStripeCustomer(
        ctx.user.id,
        ctx.user.email ?? "",
        ctx.user.name
      );
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
    } catch {
      return [];
    }
  }),

  receipts: subscriberProcedure.query(async ({ ctx }) => {
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
    } catch {
      return { invoices: [] };
    }
  }),
});
