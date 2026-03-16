/**
 * Stripe Products & Pricing Configuration
 * Talk-to-My-Lawyer — Legal Letter Generation Platform
 *
 * Pricing model (source of truth — see also shared/pricing.ts):
 *  free_trial   — $0: first letter completely free (research + draft + attorney review)
 *  per_letter   — $200 one-time: pay-as-you-go (post-trial)
 *  monthly_basic — $499/month: 4 letters/month, attorney review included
 *  monthly_pro   — $699/month: 8 letters/month, attorney review included
 *
 * Legacy plan IDs kept for backward compatibility with existing Stripe subscriptions:
 *  starter      → treated as monthly_basic ($499/month, 4 letters)
 *  professional → treated as monthly_pro ($699/month, 8 letters)
 */

export interface PlanConfig {
  id: "free_trial" | "per_letter" | "monthly_basic" | "monthly_pro";
  isTrial?: boolean;
  name: string;
  description: string;
  price: number; // in cents
  interval: "one_time" | "month";
  lettersAllowed: number; // finite, non-negative
  badge?: string;
  features: string[];
}

/** Price in cents for a single pay-per-letter unlock ($200) */
export const LETTER_UNLOCK_PRICE_CENTS = 20000; // $200

/** Price in cents for Monthly Basic ($499/month) */
export const MONTHLY_BASIC_PRICE_CENTS = 49900; // $499

/** Price in cents for Monthly Pro ($699/month) */
export const MONTHLY_PRO_PRICE_CENTS = 69900; // $699

export const PLANS: Record<string, PlanConfig> = {
  free_trial: {
    id: "free_trial",
    name: "Free Trial",
    description: "Your first letter — research, drafting, and attorney review at no cost",
    price: 0,
    interval: "one_time",
    lettersAllowed: 1,
    isTrial: true,
    features: [
      "Professional legal research",
      "Attorney-drafted letter",
      "Licensed attorney review & approval",
      "Final approved PDF",
      "Email delivery",
    ],
  },
  per_letter: {
    id: "per_letter",
    name: "Pay Per Letter",
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
  monthly_basic: {
    id: "monthly_basic",
    name: "Monthly Basic",
    description: "4 attorney-reviewed letters per month",
    price: MONTHLY_BASIC_PRICE_CENTS, // $499/month
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
  monthly_pro: {
    id: "monthly_pro",
    name: "Monthly Pro",
    description: "8 attorney-reviewed letters per month",
    price: MONTHLY_PRO_PRICE_CENTS, // $699/month
    interval: "month",
    lettersAllowed: 8,
    badge: "Best Value",
    features: [
      "8 professional legal letters/month",
      "Attorney review included",
      "Professional legal research",
      "All letter types supported",
      "Final approved PDFs",
      "Email delivery",
      "Dedicated account support",
      "Cancel anytime",
    ],
  },
};

/**
 * Legacy plan ID aliases — maps old Stripe plan IDs to current plan configs.
 * Used for backward compatibility with existing subscriptions.
 */
export const LEGACY_PLAN_ALIASES: Record<string, string> = {
  starter: "monthly_basic",       // $499/month, 4 letters (was $499/month)
  professional: "monthly_pro",    // $699/month, 8 letters (was $799/month)
  free_trial_review: "free_trial", // old $50 trial review → now free
  annual: "monthly_pro",          // old annual plan → monthly_pro
  monthly: "monthly_basic",       // old monthly plan → monthly_basic
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
