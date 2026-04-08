/**
 * Stripe Webhook — Shared Helpers
 */

import Stripe from "stripe";
import { getStripe } from "../stripe";
import { createLogger } from "../logger";

export const stripeLogger = createLogger({ module: "StripeWebhook" });

export async function getUserIdFromStripeCustomer(customerId: string): Promise<number | null> {
  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const meta = (customer as Stripe.Customer).metadata;
    if (meta?.userId) return parseInt(meta.userId, 10);
    return null;
  } catch (err) {
    stripeLogger.warn({ err, customerId }, "[StripeWebhook] Failed to retrieve Stripe customer");
    return null;
  }
}

export function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "none" {
  switch (stripeStatus) {
    case "active": return "active";
    case "canceled": return "canceled";
    case "past_due": return "past_due";
    case "trialing": return "trialing";
    case "incomplete":
    case "incomplete_expired": return "incomplete";
    default: return "none";
  }
}
