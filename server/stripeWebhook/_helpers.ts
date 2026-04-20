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

/**
 * Reads `current_period_start` / `current_period_end` off a Subscription.
 * Stripe SDK v20 moved these off the top-level type on some API versions,
 * but the fields are still present on the runtime payload for our API
 * version. Centralize the cast so it's one site, not six.
 */
interface SubscriptionWithPeriod {
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
}

export function getSubscriptionPeriod(sub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
  cancelAtPeriodEnd: boolean;
} {
  const raw = sub as unknown as SubscriptionWithPeriod;
  return {
    start: raw.current_period_start ? new Date(raw.current_period_start * 1000) : null,
    end: raw.current_period_end ? new Date(raw.current_period_end * 1000) : null,
    cancelAtPeriodEnd: raw.cancel_at_period_end ?? false,
  };
}

/**
 * Extracts the subscription ID from an Invoice. Stripe API versions moved
 * this reference around (top-level `subscription`, then
 * `parent.subscription_details.subscription`). Centralize lookup so the
 * handlers stay readable.
 */
interface InvoiceParentWithSubDetails {
  subscription_details?: {
    subscription?: string | { id: string } | null;
  };
}

export function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: InvoiceParentWithSubDetails }).parent;
  const sub = parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/**
 * Extracts the PaymentIntent ID from an Invoice. The `payment_intent` field
 * on Invoice was deprecated in the 2024-10+ API versions but remains on the
 * runtime payload for older charges — read via unknown cast.
 */
export function getPaymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const raw = (invoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent;
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.id;
}
