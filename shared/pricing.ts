/**
 * Talk to My Lawyer — Pricing Constants
 *
 * SINGLE SOURCE OF TRUTH for all pricing across frontend and backend.
 * Import from here — never hardcode prices in components or procedures.
 *
 * Pricing model:
 *  - Free Trial: first letter is free (research + draft + attorney review)
 *  - Pay-per-letter: $200 one-time per letter
 *  - Monthly Basic: $499/month for 4 letters
 *  - Monthly Pro:   $699/month for 8 letters
 */

export const PRICING = {
  /** Free trial — first letter is completely free */
  freeTrial: {
    id: "free_trial",
    name: "Free Trial",
    price: 0,
    priceDisplay: "Free",
    period: "first letter",
    lettersIncluded: 1,
    description: "Your first letter — research, drafting, and attorney review included at no cost.",
    features: [
      "Professional legal research",
      "Attorney-drafted letter",
      "Licensed attorney review & approval",
      "PDF download of approved letter",
      "Jurisdiction-specific language",
    ],
  },

  /** Pay-per-letter — $200 one-time */
  perLetter: {
    id: "per_letter",
    name: "Pay Per Letter",
    price: 200,
    priceDisplay: "$200",
    period: "per letter",
    lettersIncluded: 1,
    description: "One professionally drafted and attorney-reviewed letter. No subscription required.",
    features: [
      "Professional legal research",
      "Attorney-drafted letter",
      "Licensed attorney review & approval",
      "PDF download of approved letter",
      "Jurisdiction-specific language",
    ],
  },

  /** Monthly Basic — $499/month for 4 letters */
  monthlyBasic: {
    id: "monthly_basic",
    name: "Monthly Basic",
    price: 499,
    priceDisplay: "$499",
    period: "per month",
    lettersIncluded: 4,
    description: "4 attorney-reviewed letters per month. Best for individuals with regular legal needs.",
    features: [
      "4 letters per month",
      "Professional legal research",
      "Attorney-drafted letters",
      "Licensed attorney review & approval",
      "PDF downloads of approved letters",
      "Jurisdiction-specific language",
      "Priority support",
    ],
  },

  /** Monthly Pro — $699/month for 8 letters */
  monthlyPro: {
    id: "monthly_pro",
    name: "Monthly Pro",
    price: 699,
    priceDisplay: "$699",
    period: "per month",
    lettersIncluded: 8,
    description: "8 attorney-reviewed letters per month. Best for businesses and high-volume users.",
    features: [
      "8 letters per month",
      "Professional legal research",
      "Attorney-drafted letters",
      "Licensed attorney review & approval",
      "PDF downloads of approved letters",
      "Jurisdiction-specific language",
      "Priority support",
      "Dedicated account support",
    ],
  },
} as const;

/** All plans in display order */
export const ALL_PLANS = [
  PRICING.freeTrial,
  PRICING.perLetter,
  PRICING.monthlyBasic,
  PRICING.monthlyPro,
] as const;

/** Plans shown on the public Pricing page (excludes free trial — shown separately) */
export const PAID_PLANS = [
  PRICING.perLetter,
  PRICING.monthlyBasic,
  PRICING.monthlyPro,
] as const;

/** Affiliate discount percentage */
export const AFFILIATE_DISCOUNT_PERCENT = 20;

/** Per-letter price in cents (for Stripe) */
export const PER_LETTER_PRICE_CENTS = PRICING.perLetter.price * 100;

/** Monthly Basic price in cents (for Stripe) */
export const MONTHLY_BASIC_PRICE_CENTS = PRICING.monthlyBasic.price * 100;

/** Monthly Pro price in cents (for Stripe) */
export const MONTHLY_PRO_PRICE_CENTS = PRICING.monthlyPro.price * 100;
