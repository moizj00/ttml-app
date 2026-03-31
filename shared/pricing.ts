/**
 * Talk to My Lawyer — Pricing Constants
 *
 * SINGLE SOURCE OF TRUTH for all pricing across frontend and backend.
 * Import from here — never hardcode prices in components or procedures.
 *
 * Pricing model:
 *  - Single Letter: $200 one-time (1 letter)
 *  - Monthly:       $200/month (4 letters/month)
 *  - Yearly:        $2,000/year (4 letters/month, 2 months free)
 */

export const PRICING = {
  /** Single Letter — $200 one-time */
  singleLetter: {
    id: "single_letter",
    name: "Single Letter",
    price: 200,
    priceDisplay: "$200",
    period: "one-time",
    lettersIncluded: 1,
    description: "One California-focused legal-letter draft with optional attorney review. No subscription required.",
    features: [
      "California-focused drafting engine",
      "Structured from curated legal-letter patterns",
      "Licensed attorney review & approval",
      "PDF download of approved draft",
      "Review-friendly output",
    ],
  },

  /** Monthly — $200/month for 4 letters */
  monthly: {
    id: "monthly",
    name: "Monthly",
    price: 200,
    priceDisplay: "$200",
    period: "per month",
    lettersIncluded: 4,
    description: "4 California-focused drafts per month — reduce drafting time for repetitive letters.",
    features: [
      "4 drafts per month",
      "California-focused drafting engine",
      "Structured from curated legal-letter patterns",
      "Licensed attorney review & approval",
      "PDF downloads of approved drafts",
      "Review-friendly outputs",
      "Priority support",
      "Cancel anytime",
    ],
  },

  /** Yearly — $2,000/year for 4 letters/month */
  yearly: {
    id: "yearly",
    name: "Yearly",
    price: 2000,
    priceDisplay: "$2,000",
    period: "per year",
    lettersIncluded: 4,
    description: "4 California-focused drafts per month, billed annually. Best value — 2 months free vs monthly.",
    features: [
      "4 drafts per month",
      "California-focused drafting engine",
      "Structured from curated legal-letter patterns",
      "Licensed attorney review & approval",
      "PDF downloads of approved drafts",
      "Review-friendly outputs",
      "Priority support",
      "2 months free vs monthly",
      "Cancel anytime",
    ],
  },
} as const;

/** All plans in display order */
export const ALL_PLANS = [
  PRICING.singleLetter,
  PRICING.monthly,
  PRICING.yearly,
] as const;

/** Plans shown on the public Pricing page */
export const PAID_PLANS = [
  PRICING.singleLetter,
  PRICING.monthly,
  PRICING.yearly,
] as const;

/** Affiliate discount percentage */
export const AFFILIATE_DISCOUNT_PERCENT = 20;

/** Single letter price in cents (for Stripe) */
export const SINGLE_LETTER_PRICE_CENTS = PRICING.singleLetter.price * 100;

/** Monthly price in cents (for Stripe) */
export const MONTHLY_PRICE_CENTS = PRICING.monthly.price * 100;

/** Yearly price in cents (for Stripe) */
export const YEARLY_PRICE_CENTS = PRICING.yearly.price * 100;
