/**
 * Stripe Products & Pricing Configuration
 * Talk-to-My-Lawyer — Legal Letter Generation Platform
 *
 * Pricing model (source of truth: shared/pricing.ts):
 *  monthly       — $299/month: 4 letters/month, attorney review included
 *  yearly        — $2,400/year: 8 letters total, attorney review included
 *
 * Legacy plan IDs kept for backward compatibility with existing Stripe subscriptions:
 *  per_letter   → treated as monthly ($299/month, 4 letters)
 *  monthly_basic → treated as monthly ($299/month, 4 letters)
 *  monthly_pro   → treated as monthly ($299/month, 4 letters)
 *  starter      → treated as monthly ($299/month, 4 letters)
 *  professional → treated as monthly ($299/month, 4 letters)
 *  free_trial   → treated as monthly (legacy)
 *  free_trial_review → treated as monthly (legacy)
 *  annual       → treated as yearly ($2,400/year, 8 letters)
 */

import {
  MONTHLY_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
} from "../shared/pricing";

export {
  MONTHLY_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
};

export interface PlanConfig {
  id: "monthly" | "yearly";
  name: string;
  description: string;
  price: number; // in cents
  interval: "one_time" | "month" | "year";
  lettersAllowed: number; // finite, non-negative
  badge?: string;
  features: string[];
}

/** Price in cents for Monthly ($299/month) — from shared/pricing.ts */
// MONTHLY_PRICE_CENTS re-exported above from shared/pricing.ts

/** Price in cents for Yearly ($2,400/year) — from shared/pricing.ts */
// YEARLY_PRICE_CENTS re-exported above from shared/pricing.ts

export const PLANS: Record<string, PlanConfig> = {
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
  per_letter: "monthly", // old per-letter → monthly
  monthly_basic: "monthly", // old monthly_basic → monthly
  monthly_pro: "monthly", // old monthly_pro → monthly
  starter: "monthly", // old starter → monthly
  professional: "monthly", // old professional → monthly
  free_trial: "monthly", // old free trial → monthly
  free_trial_review: "monthly", // old free trial review → monthly
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
