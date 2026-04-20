/**
 * Talk to My Lawyer — Pricing Constants
 *
 * SINGLE SOURCE OF TRUTH for all pricing across frontend and backend.
 * Import from here — never hardcode prices in components or procedures.
 *
 * Pricing model:
 *  - Single Letter: $299 one-time (1 letter)
 *  - Monthly:       $299/month (4 letters/month)
 *  - Yearly:        $2,400/year (8 letters total)
 */

export const PRICING = {
  /** Single Letter — $299 one-time */
  singleLetter: {
    id: "single_letter",
    name: "Single Letter",
    price: 299,
    priceDisplay: "$299",
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

  /** Monthly — $299/month for 4 letters */
  monthly: {
    id: "monthly",
    name: "Monthly",
    price: 299,
    priceDisplay: "$299",
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

  /** Yearly — $2,400/year for 8 letters total */
  yearly: {
    id: "yearly",
    name: "Yearly",
    price: 2400,
    priceDisplay: "$2,400",
    period: "per year",
    lettersIncluded: 8,
    description: "8 California-focused drafts per year, billed annually. Best value.",
    features: [
      "8 drafts per year",
      "California-focused drafting engine",
      "Structured from curated legal-letter patterns",
      "Licensed attorney review & approval",
      "PDF downloads of approved drafts",
      "Review-friendly outputs",
      "Priority support",
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

/** Affiliate commission rate in basis points (500 = 5%). Applied to sale amount in cents. */
export const AFFILIATE_COMMISSION_BASIS_POINTS = 500;

/** Single letter price in cents (for Stripe) */
export const SINGLE_LETTER_PRICE_CENTS = PRICING.singleLetter.price * 100;

/** Monthly price in cents (for Stripe) */
export const MONTHLY_PRICE_CENTS = PRICING.monthly.price * 100;

/** Yearly price in cents (for Stripe) */
export const YEARLY_PRICE_CENTS = PRICING.yearly.price * 100;

/** First letter attorney review fee — $50 one-time (payment-gates the first letter instead of free) */
export const FIRST_LETTER_REVIEW_PRICE = 50;
export const FIRST_LETTER_REVIEW_PRICE_CENTS = 5000;
