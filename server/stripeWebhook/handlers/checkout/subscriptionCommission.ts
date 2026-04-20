/**
 * checkout.session.completed — session.mode === "subscription" commission tracking
 *
 * The subscription itself is activated by the `customer.subscription.created`
 * event; this path only logs the initial commission when a discount code was
 * used at checkout.
 */

import Stripe from "stripe";
import type { ParsedCheckoutMetadata } from "../../_metadata";
import { getPaymentIntentId } from "../../_metadata";
import { trackCheckoutCommission } from "../../_commission";
import { stripeLogger } from "../../_helpers";

export async function handleSubscriptionModeCommission(
  session: Stripe.Checkout.Session,
  meta: ParsedCheckoutMetadata
): Promise<void> {
  if (!meta.discountCode) return;

  await trackCheckoutCommission({
    discountCode: meta.discountCode,
    metadataEmployeeId: meta.employeeId,
    metadataDiscountCodeId: meta.discountCodeId,
    paymentIntentId: getPaymentIntentId(session.payment_intent),
    saleAmountCents: session.amount_total ?? 0,
    subscriberId: meta.userId,
    appUrl: meta.appUrl,
    planId: meta.planId,
  }).catch((commErr) =>
    stripeLogger.error({ err: commErr }, "[StripeWebhook] Subscription commission tracking error")
  );
}
