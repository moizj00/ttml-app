/**
 * Stripe Coupons — discount code resolution and coupon management
 */
import { getDiscountCodeByCode } from "../db";
import { getStripe } from "./client";
import { logger } from "../logger";

interface ResolvedDiscount {
  stripeCouponId: string;
  discountCodeId: number;
  employeeId: number;
  discountPercent: number;
}

/**
 * Resolves a discount code from our DB into a Stripe coupon ID.
 * Creates a Stripe coupon on-the-fly if the code is valid and active.
 * Returns the coupon ID + discount code details for metadata enrichment,
 * or null if the code is invalid/expired.
 */
export async function resolveStripeCoupon(
  discountCode: string | undefined
): Promise<ResolvedDiscount | null> {
  if (!discountCode) return null;
  try {
    const code = await getDiscountCodeByCode(discountCode);
    if (!code || !code.isActive) return null;
    if (code.maxUses && code.usageCount >= code.maxUses) return null;
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) return null;

    const stripe = getStripe();
    // Use a deterministic coupon ID so we reuse the same Stripe coupon for the same discount %
    const couponId = `ttml_${code.discountPercent}pct`;
    try {
      await stripe.coupons.retrieve(couponId);
    } catch {
      // Coupon doesn't exist yet — create it
      // Business intent: "once" means the discount applies only to the first invoice
      // (i.e. the subscriber's first payment). This is a one-time introductory discount
      // for customer acquisition — subsequent renewals are charged at full price.
      await stripe.coupons.create({
        id: couponId,
        percent_off: code.discountPercent,
        duration: "once",
        name: `${code.discountPercent}% Off — Referral Discount`,
      });
    }
    return {
      stripeCouponId: couponId,
      discountCodeId: code.id,
      employeeId: code.employeeId,
      discountPercent: code.discountPercent,
    };
  } catch (err) {
    logger.error({ err: err }, "[Stripe] Failed to resolve discount coupon:");
    return null;
  }
}
