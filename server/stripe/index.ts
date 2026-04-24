/**
 * Stripe Service — Talk-to-My-Lawyer
 * Directory module index — re-exports all public APIs for backward compatibility.
 *
 * Internal structure:
 *   client.ts       — Stripe singleton + customer management
 *   coupons.ts      — Discount code → Stripe coupon resolution
 *   subscriptions.ts — Subscription lifecycle (activate, check, increment)
 *   checkouts.ts    — All checkout session creation functions
 */
export { getStripe, getOrCreateStripeCustomer } from "./client";
export { resolveStripeCoupon } from "./coupons";
export {
  getUserSubscription,
  activateSubscription,
  incrementLettersUsed,
  checkLetterSubmissionAllowed,
  hasActiveRecurringSubscription,
  hasEverSubscribed,
  createBillingPortalSession,
} from "./subscriptions";
export {
  createCheckoutSession,
  createLetterUnlockCheckout,
  createRevisionConsultationCheckout,
  createTrialReviewCheckout,
} from "./checkouts";
