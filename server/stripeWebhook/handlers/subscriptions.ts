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
import { getStripe } from "../../stripe";
import { activateSubscription } from "../../stripe/subscriptions";
import {
  getDb, updateLetterStatus, logReviewAction, getUserById,
  createNotification, notifyAllAttorneys,
} from "../../db";
import { sendPaymentFailedEmail } from "../../email";
import { captureServerException } from "../../sentry";
import {
  getUserIdFromStripeCustomer,
  mapStripeStatus,
  stripeLogger,
  getSubscriptionPeriod,
  getSubscriptionIdFromInvoice,
  getPaymentIntentIdFromInvoice,
} from "../_helpers";
import { parseSubscriptionMetadata, getCustomerId } from "../_metadata";
import { trackRecurringCommission } from "../_commission";

const FALLBACK_APP_URL = "https://www.talk-to-my-lawyer.com";

async function resolveSubscriptionUserId(sub: Stripe.Subscription): Promise<{
  userId: number;
  planId: string;
  customerId: string;
}> {
  const meta = parseSubscriptionMetadata(sub);
  const customerId = getCustomerId(sub.customer);
  const userId =
    meta.userId ??
    (await getUserIdFromStripeCustomer(customerId)) ??
    0;
  return { userId, planId: meta.planId, customerId };
}

export async function handleSubscriptionCreatedOrUpdated(
  event: Stripe.Event
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const { userId, planId, customerId } = await resolveSubscriptionUserId(sub);

  if (!userId) {
    stripeLogger.warn({ eventType: event.type }, "[StripeWebhook] could not resolve userId");
    return;
  }

  const status = mapStripeStatus(sub.status);
  const period = getSubscriptionPeriod(sub);

  await activateSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: null,
    planId,
    status,
    currentPeriodStart: period.start ?? new Date(),
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: period.cancelAtPeriodEnd,
  });

  stripeLogger.info({ eventType: event.type, userId, status }, "[StripeWebhook] Subscription event processed");

  if (event.type === "customer.subscription.created" && status === "active") {
    await autoSubmitFirstLetterIfEligible(userId, planId);
  }
}

async function autoSubmitFirstLetterIfEligible(userId: number, planId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
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

    if (previouslyUnlockedLetters.length > 0) {
      stripeLogger.info({ userId }, "[StripeWebhook] New subscriber has prior unlocked letters — no auto-submit");
      return;
    }

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

    if (lockedLetters.length !== 1) return;

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
        appUrl: FALLBACK_APP_URL,
      }).catch((e) => stripeLogger.error({ err: e }, "[StripeWebhook] Failed to notify attorneys for auto-submit"));
      stripeLogger.info({ letterId: lockedLetter.id, userId }, "[StripeWebhook] Auto-submitted first letter for new subscriber");
    } catch (autoSubmitErr) {
      stripeLogger.error({ err: autoSubmitErr, letterId: lockedLetter.id }, "[StripeWebhook] Failed to auto-submit letter");
    }
  } catch (autoSubmitErr) {
    stripeLogger.error({ err: autoSubmitErr, userId }, "[StripeWebhook] Auto-submit first letter error");
  }
}

export async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const { userId, planId, customerId } = await resolveSubscriptionUserId(sub);

  if (!userId) return;

  const period = getSubscriptionPeriod(sub);

  await activateSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: null,
    planId,
    status: "canceled",
    currentPeriodStart: period.start ?? new Date(),
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: true,
  });

  stripeLogger.info({ userId }, "[StripeWebhook] Subscription canceled");
}

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subId = getSubscriptionIdFromInvoice(invoice);
  if (!subId) return;

  const stripe = getStripe();
  const sub = (await stripe.subscriptions.retrieve(subId)) as Stripe.Subscription;
  const { userId, planId, customerId } = await resolveSubscriptionUserId(sub);

  if (!userId) return;

  const period = getSubscriptionPeriod(sub);

  await activateSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: null,
    planId,
    status: "active",
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: period.cancelAtPeriodEnd,
    resetLettersUsed: true, // Reset usage counter at the start of each billing period
  });

  stripeLogger.info({ userId }, "[StripeWebhook] Invoice paid, subscription renewed");

  // ─── Recurring commission tracking ───────────────────────────────────────
  const subMeta = parseSubscriptionMetadata(sub);
  if (subMeta.discountCode && subMeta.employeeId) {
    try {
      await trackRecurringCommission({
        discountCode: subMeta.discountCode,
        employeeId: subMeta.employeeId,
        discountCodeId: subMeta.discountCodeId,
        invoiceId: invoice.id,
        paymentIntentId: getPaymentIntentIdFromInvoice(invoice),
        invoiceAmountCents: invoice.amount_paid ?? 0,
        subscriberId: userId,
        appUrl: FALLBACK_APP_URL,
        planId,
        incrementDiscountUsage: invoice.billing_reason === "subscription_create",
      });
    } catch (commErr) {
      stripeLogger.error({ err: commErr }, "[StripeWebhook] Recurring commission tracking error");
    }
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  stripeLogger.warn({ invoiceId: invoice.id }, "[StripeWebhook] Invoice payment failed");
  try {
    const subId = getSubscriptionIdFromInvoice(invoice);
    if (!subId) return;

    const stripe = getStripe();
    const sub = (await stripe.subscriptions.retrieve(subId)) as Stripe.Subscription;
    const { userId } = await resolveSubscriptionUserId(sub);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user?.email) return;

    await sendPaymentFailedEmail({
      to: user.email,
      name: user.name ?? "Subscriber",
      billingUrl: `${FALLBACK_APP_URL}/subscriber/billing`,
    }).catch(err => {
      stripeLogger.error({ err }, "[StripeWebhook] Failed to send payment failed email");
      captureServerException(err, {
        tags: { component: "stripe_webhook", error_type: "payment_failed_email" },
      });
    });
  } catch (err) {
    stripeLogger.error({ err }, "[StripeWebhook] Error handling payment_failed");
    captureServerException(err, {
      tags: { component: "stripe_webhook", error_type: "payment_failed_handler" },
    });
  }
}
