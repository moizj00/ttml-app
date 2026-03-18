/**
 * Stripe Products & Pricing Configuration
 * Talk-to-My-Lawyer — Legal Letter Generation Platform
 *
 * Pricing model (source of truth — see also shared/pricing.ts):
 *  single_letter — $200 one-time: pay-as-you-go, 1 letter
 *  monthly       — $200/month: 4 letters/month, attorney review included
 *  yearly        — $2,000/year: 4 letters/month, attorney review included
 *
 * Legacy plan IDs kept for backward compatibility with existing Stripe subscriptions:
 *  per_letter   → treated as single_letter ($200, 1 letter)
 *  monthly_basic → treated as monthly ($200/month, 4 letters)
 *  monthly_pro   → treated as monthly ($200/month, 4 letters)
 *  starter      → treated as monthly ($200/month, 4 letters)
 *  professional → treated as monthly ($200/month, 4 letters)
 *  free_trial   → treated as single_letter (legacy, 1 letter)
 *  free_trial_review → treated as single_letter (legacy, 1 letter)
 *  annual       → treated as yearly ($2,000/year, 4 letters/month)
 */

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

/** Price in cents for a single letter unlock ($200) */
export const LETTER_UNLOCK_PRICE_CENTS = 20000; // $200

/** Price in cents for Monthly ($200/month) */
export const MONTHLY_PRICE_CENTS = 20000; // $200

/** Price in cents for Yearly ($2,000/year) */
export const YEARLY_PRICE_CENTS = 200000; // $2,000

export const PLANS: Record<string, PlanConfig> = {
  single_letter: {
    id: "single_letter",
    name: "Single Letter",
    description: "One professional legal letter with full attorney review, no commitment",
    price: LETTER_UNLOCK_PRICE_CENTS, // $200
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
    price: MONTHLY_PRICE_CENTS, // $200/month
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
    description: "4 attorney-reviewed letters per month, billed annually",
    price: YEARLY_PRICE_CENTS, // $2,000/year
    interval: "year",
    lettersAllowed: 4,
    badge: "2 Months Free",
    features: [
      "4 professional legal letters/month",
      "Attorney review included",
      "Professional legal research",
      "All letter types supported",
      "Final approved PDFs",
      "Email delivery",
      "Priority support",
      "2 months free vs monthly",
      "Cancel anytime",
    ],
  },
};

/**
 * Legacy plan ID aliases — maps old Stripe plan IDs to current plan configs.
 * Used for backward compatibility with existing subscriptions.
 */
export const LEGACY_PLAN_ALIASES: Record<string, string> = {
  per_letter: "single_letter",       // old per-letter → single_letter
  monthly_basic: "monthly",          // old monthly_basic → monthly
  monthly_pro: "monthly",            // old monthly_pro → monthly
  starter: "monthly",                // old starter → monthly
  professional: "monthly",           // old professional → monthly
  free_trial: "single_letter",       // old free trial → single_letter
  free_trial_review: "single_letter", // old free trial review → single_letter
  annual: "yearly",                  // old annual → yearly
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
    return { allowed: false, reason: "No active subscription. Please subscribe to submit a letter." };
  }
  if (lettersAllowed < 0) {
    return { allowed: false, reason: "Invalid plan configuration. Please contact support." };
  }
  if (lettersUsed >= lettersAllowed) {
    return {
      allowed: false,
      reason: `You have used all ${lettersAllowed} letter(s) in your ${plan} plan. Please upgrade to continue.`,
    };
  }
  return { allowed: true };
}
