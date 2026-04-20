/**
 * Stripe Webhook — Typed Metadata Parsers
 *
 * Stripe metadata is a loose string→string map. Parse once, at the edge,
 * into typed shapes so handlers don't re-parse (and re-risk typos) each time.
 */

import Stripe from "stripe";

const FALLBACK_APP_URL = "https://www.talk-to-my-lawyer.com";

export type CheckoutUnlockType =
  | "letter_unlock"
  | "first_letter_review"
  | "revision_consultation"
  | undefined;

export interface ParsedCheckoutMetadata {
  userId: number;
  planId: string;
  letterId: number | null;
  unlockType: CheckoutUnlockType;
  discountCode: string | null;
  employeeId: number | null;
  discountCodeId: number | null;
  originalPrice: number | null;
  revisionNotes: string | null;
  appUrl: string;
}

function parseIntOrNull(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function deriveAppUrl(session: Stripe.Checkout.Session): string {
  const success = session.success_url;
  if (!success) return FALLBACK_APP_URL;
  const idx = success.indexOf("/letters");
  if (idx === -1) {
    try { return new URL(success).origin; } catch { return FALLBACK_APP_URL; }
  }
  return success.slice(0, idx);
}

export function parseCheckoutMetadata(
  session: Stripe.Checkout.Session
): ParsedCheckoutMetadata {
  const meta = session.metadata ?? {};
  const userId =
    parseIntOrNull(meta.user_id) ??
    parseIntOrNull(session.client_reference_id ?? null) ??
    0;

  const rawUnlock = meta.unlock_type;
  const unlockType: CheckoutUnlockType =
    rawUnlock === "letter_unlock" ||
    rawUnlock === "first_letter_review" ||
    rawUnlock === "revision_consultation"
      ? rawUnlock
      : undefined;

  return {
    userId,
    planId: meta.plan_id ?? "per_letter",
    letterId: parseIntOrNull(meta.letter_id),
    unlockType,
    discountCode: meta.discount_code ?? null,
    employeeId: parseIntOrNull(meta.employee_id),
    discountCodeId: parseIntOrNull(meta.discount_code_id),
    originalPrice: parseIntOrNull(meta.original_price),
    revisionNotes: meta.revision_notes ?? null,
    appUrl: deriveAppUrl(session),
  };
}

export interface ParsedSubscriptionMetadata {
  userId: number | null;
  planId: string;
  discountCode: string | null;
  employeeId: number | null;
  discountCodeId: number | null;
}

export function parseSubscriptionMetadata(
  sub: Stripe.Subscription
): ParsedSubscriptionMetadata {
  const meta = sub.metadata ?? {};
  return {
    userId: parseIntOrNull(meta.user_id),
    planId: meta.plan_id ?? "monthly_basic",
    discountCode: meta.discount_code ?? null,
    employeeId: parseIntOrNull(meta.employee_id),
    discountCodeId: parseIntOrNull(meta.discount_code_id),
  };
}

export function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string {
  if (!customer) return "";
  return typeof customer === "string" ? customer : customer.id;
}

export function getPaymentIntentId(
  pi: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}
