/**
 * Stripe Webhook — Subscription & Invoice Handlers
 *
 * Handles:
 *   - customer.subscription.created / updated → activateSubscription + auto-submit first letter
 *   - customer.subscription.deleted → mark canceled
 *   - invoice.paid → renewal + recurring commission
 *   - invoice.payment_failed → send payment failed email
 */

import Stripe from "stripe";
import { activateSubscription } from "../../stripe";
import { getPlanConfig } from "../../stripe-products";
import {
  getDb, updateLetterStatus, logReviewAction, getUserById,
  createNotification, notifyAdmins, notifyAllAttorneys, createCommission,
} from "../../db";
import { sendPaymentFailedEmail, sendEmployeeCommissionEmail } from "../../email";
import { captureServerException } from "../../sentry";
import { getUserIdFromStripeCustomer, mapStripeStatus, stripeLogger } from "../_helpers";
import { getStripe } from "../../stripe";

export async function handleSubscriptionCreatedOrUpdated(
  event: Stripe.Event
): Promise<void> {
  const sub = event.data.object as any;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
  const userId = resolvedUserId || (await getUserIdFromStripeCustomer(customerId)) || 0;

  if (!userId) {
    stripeLogger.warn({ eventType: event.type }, "[StripeWebhook] could not resolve userId");
    return;
  }

  const planId = sub.metadata?.plan_id ?? "monthly_basic";
  const status = mapStripeStatus(sub.status);

  await activateSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: null,
    planId,
    status,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });

  stripeLogger.info({ eventType: event.type, userId, status }, "[StripeWebhook] Subscription event processed");

  // ─── Auto-submit first letter for new subscribers ─────────────────────────
  if (event.type === "customer.subscription.created" && status === "active") {
    try {
      const db = await getDb();
      if (db) {
        const { letterRequests } = await import("../../../drizzle/schema");
        const { eq, and, notInArray } = await import("drizzle-orm");

        const previouslyUnlockedLetters = await db
          .select({ id: letterRequests.id })
          .from(letterRequests)
          .where(
            and(
              eq(letterRequests.userId, userId),
              notInArray(letterRequests.status, [
                "submitted",
                "researching",
                "drafting",
                "generated_locked",
                "pipeline_failed",
              ])
            )
          )
          .limit(1);

        if (previouslyUnlockedLetters.length === 0) {
          const lockedLetters = await db
            .select()
            .from(letterRequests)
            .where(
              and(
                eq(letterRequests.userId, userId),
                eq(letterRequests.status, "generated_locked")
              )
            )
            .limit(1);

          if (lockedLetters.length === 1) {
            const lockedLetter = lockedLetters[0];
            try {
              await updateLetterStatus(lockedLetter.id, "pending_review");
              await logReviewAction({
                letterRequestId: lockedLetter.id,
                actorType: "system",
                action: "payment_received",
                noteText: `Subscriber signed up — first letter auto-submitted for attorney review (subscription waives $50 fee). Plan: ${planId}`,
                noteVisibility: "user_visible",
                fromStatus: "generated_locked",
                toStatus: "pending_review",
              });
              await createNotification({
                userId,
                type: "letter_unlocked",
                title: "Subscription activated — letter submitted for review!",
                body: `Your letter "${lockedLetter.subject}" has been submitted for attorney review as part of your new plan.`,
                link: `/letters/${lockedLetter.id}`,
              });
              await notifyAllAttorneys({
                letterId: lockedLetter.id,
                letterSubject: lockedLetter.subject,
                letterType: lockedLetter.letterType,
                jurisdiction: lockedLetter.jurisdictionState ?? "Unknown",
                appUrl: "https://www.talk-to-my-lawyer.com",
              }).catch((e) => stripeLogger.error({ err: e }, "[StripeWebhook] Failed to notify attorneys for auto-submit"));
              stripeLogger.info({ letterId: lockedLetter.id, userId }, "[StripeWebhook] Auto-submitted first letter for new subscriber");
            } catch (autoSubmitErr) {
              stripeLogger.error({ err: autoSubmitErr, letterId: lockedLetter.id }, "[StripeWebhook] Failed to auto-submit letter");
            }
          }
        } else {
          stripeLogger.info({ userId }, "[StripeWebhook] New subscriber has prior unlocked letters — no auto-submit");
        }
      }
    } catch (autoSubmitErr) {
      stripeLogger.error({ err: autoSubmitErr, userId }, "[StripeWebhook] Auto-submit first letter error");
    }
  }
}

export async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as any;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
  const userId = resolvedUserId || (await getUserIdFromStripeCustomer(customerId)) || 0;

  if (!userId) return;

  const planId = sub.metadata?.plan_id ?? "monthly_basic";

  await activateSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: null,
    planId,
    status: "canceled",
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: true,
  });

  stripeLogger.info({ userId }, "[StripeWebhook] Subscription canceled");
}

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const parentSub = (invoice.parent as any)?.subscription_details?.subscription;
  const subId = typeof parentSub === "string" ? parentSub : parentSub?.id;

  if (!subId) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId) as any;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
  const userId = resolvedUserId || (await getUserIdFromStripeCustomer(customerId)) || 0;

  if (!userId) return;

  const planId = sub.metadata?.plan_id ?? "monthly_basic";

  await activateSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: null,
    planId,
    status: "active",
    currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });

  stripeLogger.info({ userId }, "[StripeWebhook] Invoice paid, subscription renewed");

  // ─── Recurring commission tracking ───────────────────────────────────────
  const subDiscountCode = sub.metadata?.discount_code as string | undefined;
  const subEmployeeId = sub.metadata?.employee_id ? parseInt(sub.metadata.employee_id, 10) : null;
  const subDiscountCodeId = sub.metadata?.discount_code_id ? parseInt(sub.metadata.discount_code_id, 10) : null;

  if (subDiscountCode && subEmployeeId) {
    try {
      const invoiceAmount = invoice.amount_paid ?? 0;
      if (invoiceAmount > 0) {
        const invoicePaymentIntent = typeof (invoice as any).payment_intent === "string"
          ? (invoice as any).payment_intent
          : (invoice as any).payment_intent?.id ?? undefined;
        const commissionRate = 500;
        const commissionAmount = Math.round(invoiceAmount * commissionRate / 10000);

        await createCommission({
          employeeId: subEmployeeId,
          letterRequestId: undefined,
          subscriberId: userId,
          discountCodeId: subDiscountCodeId ?? undefined,
          stripePaymentIntentId: invoicePaymentIntent,
          saleAmount: invoiceAmount,
          commissionRate,
          commissionAmount,
        });

        stripeLogger.info({ commissionAmount, subEmployeeId, planId }, "[StripeWebhook] Recurring commission created");

        try {
          const employee = await getUserById(subEmployeeId);
          const subscriber = await getUserById(userId);
          const planCfg = getPlanConfig(planId);
          const appUrl = "https://www.talk-to-my-lawyer.com";

          await createNotification({
            userId: subEmployeeId,
            type: "commission_earned",
            category: "employee",
            title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
            body: `You earned a $${(commissionAmount / 100).toFixed(2)} commission from a subscription renewal (code: ${subDiscountCode}).`,
            link: `/employee`,
          });

          if (employee?.email) {
            await sendEmployeeCommissionEmail({
              to: employee.email,
              name: employee.name ?? "Employee",
              subscriberName: subscriber?.name ?? "A subscriber",
              planName: planCfg?.name ?? planId,
              commissionAmount: `$${(commissionAmount / 100).toFixed(2)}`,
              discountCode: subDiscountCode,
              dashboardUrl: `${appUrl}/employee`,
            });
          }

          await notifyAdmins({
            category: "employee",
            type: "commission_earned",
            title: `Recurring commission: $${(commissionAmount / 100).toFixed(2)}`,
            body: `${employee?.name ?? `Employee #${subEmployeeId}`} earned a renewal commission via code "${subDiscountCode}".`,
            link: `/admin/affiliate`,
          });
        } catch (notifyErr) {
          stripeLogger.error({ err: notifyErr }, "[StripeWebhook] Recurring commission notification error");
        }
      }
    } catch (commErr) {
      stripeLogger.error({ err: commErr }, "[StripeWebhook] Recurring commission tracking error");
    }
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  stripeLogger.warn({ invoiceId: invoice.id }, "[StripeWebhook] Invoice payment failed");
  try {
    const parentSub = (invoice.parent as any)?.subscription_details?.subscription;
    const subId = typeof parentSub === "string" ? parentSub : parentSub?.id;
    if (subId) {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subId) as any;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
      const userId = resolvedUserId || (customerId ? await getUserIdFromStripeCustomer(customerId) : null) || 0;
      if (userId) {
        const user = await getUserById(userId);
        if (user?.email) {
          await sendPaymentFailedEmail({
            to: user.email,
            name: user.name ?? "Subscriber",
            billingUrl: "https://www.talk-to-my-lawyer.com/subscriber/billing",
          }).catch(err => {
            stripeLogger.error({ err }, "[StripeWebhook] Failed to send payment failed email");
            captureServerException(err, {
              tags: { component: "stripe_webhook", error_type: "payment_failed_email" },
            });
          });
        }
      }
    }
  } catch (err) {
    stripeLogger.error({ err }, "[StripeWebhook] Error handling payment_failed");
    captureServerException(err, {
      tags: { component: "stripe_webhook", error_type: "payment_failed_handler" },
    });
  }
}
