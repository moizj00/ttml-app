/**
 * Stripe Products & Pricing Configuration
 * Talk-to-My-Lawyer — Legal Letter Generation Platform
 *
 * Pricing model (source of truth: shared/pricing.ts):
 *  single_letter — $299 one-time: pay-as-you-go, 1 letter
 *  monthly       — $299/month: 4 letters/month, attorney review included
 *  yearly        — $2,400/year: 8 letters total, attorney review included
 *
 * Legacy plan IDs kept for backward compatibility with existing Stripe subscriptions:
 *  per_letter   → treated as single_letter ($299, 1 letter)
 *  monthly_basic → treated as monthly ($299/month, 4 letters)
 *  monthly_pro   → treated as monthly ($299/month, 4 letters)
 *  starter      → treated as monthly ($299/month, 4 letters)
 *  professional → treated as monthly ($299/month, 4 letters)
 *  free_trial   → treated as single_letter (legacy, 1 letter)
 *  free_trial_review → treated as single_letter (legacy, 1 letter)
 *  annual       → treated as yearly ($2,400/year, 8 letters)
 */

import {
  SINGLE_LETTER_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
} from "../shared/pricing";

export {
  MONTHLY_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
};

export interface PlanConfig {
  id: "single_letter" | "monthly" | "yearly";
  name: string;
  description: string;
  price: number; // in cents
  interval: "one_time" | "month" | "year";
  lettersAllowed: number; // finite, non-negative
  badge?: string;
  features: string[];
}

/** Price in cents for a single letter unlock ($299) — aliased from shared/pricing.ts */
export const LETTER_UNLOCK_PRICE_CENTS = SINGLE_LETTER_PRICE_CENTS;

/** Price in cents for Monthly ($299/month) — from shared/pricing.ts */
// MONTHLY_PRICE_CENTS re-exported above from shared/pricing.ts

/** Price in cents for Yearly ($2,400/year) — from shared/pricing.ts */
// YEARLY_PRICE_CENTS re-exported above from shared/pricing.ts

export const PLANS: Record<string, PlanConfig> = {
  single_letter: {
    id: "single_letter",
    name: "Single Letter",
    description:
      "One professional legal letter with full attorney review, no commitment",
    price: LETTER_UNLOCK_PRICE_CENTS, // $299
    interval: "one_time",
    lettersAllowed: 1,
    features: [
      "1 professional legal letter",
      "Professional legal research",
      "Attorney-drafted letter",
      "Licensed attorney review & approval",
      "Final approved PDF",
      "Email delivery",
    ],
  },
  monthly: {
    id: "monthly",
    name: "Monthly",
    description: "4 attorney-reviewed letters per month",
    price: MONTHLY_PRICE_CENTS, // $299/month
    interval: "month",
    lettersAllowed: 4,
    badge: "Most Popular",
    features: [
      "4 professional legal letters/month",
      "Attorney review included",
      "Professional legal research",
      "All letter types supported",
      "Final approved PDFs",
      "Email delivery",
      "Priority support",
      "Cancel anytime",
    ],
  },
  yearly: {
    id: "yearly",
    name: "Yearly",
    description: "8 attorney-reviewed letters per year, billed annually",
    price: YEARLY_PRICE_CENTS, // $2,400/year
    interval: "year",
    lettersAllowed: 8,
    badge: "Best Value",
    features: [
      "8 professional legal letters per year",
      "Attorney review included",
      "Professional legal research",
      "All letter types supported",
      "Final approved PDFs",
      "Email delivery",
      "Priority support",
      "Cancel anytime",
    ],
  },
};

/**
 * Legacy plan ID aliases — maps old Stripe plan IDs to current plan configs.
 * Used for backward compatibility with existing subscriptions.
 */
export const LEGACY_PLAN_ALIASES: Record<string, string> = {
  per_letter: "single_letter", // old per-letter → single_letter
  monthly_basic: "monthly", // old monthly_basic → monthly
  monthly_pro: "monthly", // old monthly_pro → monthly
  starter: "monthly", // old starter → monthly
  professional: "monthly", // old professional → monthly
  free_trial: "single_letter", // old free trial → single_letter
  free_trial_review: "single_letter", // old free trial review → single_letter
  annual: "yearly", // old annual → yearly
};

export const PLAN_LIST = Object.values(PLANS);

export function getPlanConfig(planId: string): PlanConfig | undefined {
  // Check direct match first
  if (PLANS[planId]) return PLANS[planId];
  // Fall back to legacy alias
  const aliasId = LEGACY_PLAN_ALIASES[planId];
  if (aliasId) return PLANS[aliasId];
  return undefined;
}

export function canSubmitLetter(
  plan: string,
  lettersAllowed: number,
  lettersUsed: number,
  status: string
): { allowed: boolean; reason?: string } {
  if (status !== "active") {
    return {
      allowed: false,
      reason: "No active subscription. Please subscribe to submit a letter.",
    };
  }
  if (lettersAllowed < 0) {
    return {
      allowed: false,
      reason: "Invalid plan configuration. Please contact support.",
    };
  }
  if (lettersUsed >= lettersAllowed) {
    return {
      allowed: false,
      reason: `You have used all ${lettersAllowed} letter(s) in your ${plan} plan. Please upgrade to continue.`,
    };
  }
  return { allowed: true };
}
