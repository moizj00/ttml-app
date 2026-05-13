/**
 * Stripe Webhook — Commission Tracking
 *
 * Shared logic for creating `commission_ledger` rows + employee / admin
 * notifications. Two entry points because the checkout and invoice paths
 * have different pre-conditions:
 *
 *   - trackCheckoutCommission()   — validates the discount code, creates the
 *                                   one-time commission, increments usage, then notifies.
 *                                   Called from checkout.session.completed.
 *   - trackRecurringCommission()  — creates initial/renewal subscription
 *                                   commissions from invoice.paid only.
 */

import {
  getDiscountCodeByCode,
  incrementDiscountCodeUsage,
  createCommission,
  getUserById,
  createNotification,
  notifyAdmins,
} from "../db";
import { sendEmployeeCommissionEmail } from "../email";
import { getPlanConfig } from "../stripe-products";
import { AFFILIATE_COMMISSION_BASIS_POINTS } from "../../shared/pricing";
import { stripeLogger } from "./_helpers";

/**
 * Commission math — basis points of sale amount in cents.
 * Example: $100.00 sale (saleAmount=10000) * 500 bps = $5.00 commission (500 cents).
 */
export function calculateCommissionAmount(saleAmountCents: number): number {
  return Math.round((saleAmountCents * AFFILIATE_COMMISSION_BASIS_POINTS) / 10000);
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface EmitNotificationsParams {
  employeeId: number;
  subscriberId: number;
  discountCode: string;
  commissionAmount: number;
  planId: string;
  appUrl: string;
  /** When true, sends the extra "discount_code_used" admin notification (checkout path only). */
  includeDiscountCodeUsedNotif: boolean;
  /** When true, the admin commission-earned title says "Recurring" (invoice.paid path). */
  isRecurring: boolean;
}

async function emitCommissionNotifications(p: EmitNotificationsParams): Promise<void> {
  try {
    const employee = await getUserById(p.employeeId);
    const subscriber = await getUserById(p.subscriberId);
    const planCfg = getPlanConfig(p.planId);
    const amountStr = formatDollars(p.commissionAmount);

    await createNotification({
      userId: p.employeeId,
      type: "commission_earned",
      category: "employee",
      title: `Commission earned: ${amountStr}`,
      body: p.isRecurring
        ? `You earned a ${amountStr} commission from a subscription renewal (code: ${p.discountCode}).`
        : `You earned a ${amountStr} commission from a sale (code: ${p.discountCode}).`,
      link: `/employee`,
    });

    if (employee?.email) {
      await sendEmployeeCommissionEmail({
        to: employee.email,
        name: employee.name ?? "Employee",
        subscriberName: subscriber?.name ?? "A subscriber",
        planName: planCfg?.name ?? p.planId,
        commissionAmount: amountStr,
        discountCode: p.discountCode,
        dashboardUrl: `${p.appUrl}/employee`,
      });
    }

    if (p.includeDiscountCodeUsedNotif) {
      await notifyAdmins({
        category: "employee",
        type: "discount_code_used",
        title: `Discount code "${p.discountCode}" used`,
        body: `Referral conversion: ${amountStr} commission earned by ${employee?.name ?? `employee #${p.employeeId}`}.`,
        link: `/admin/affiliate`,
      });
    }

    await notifyAdmins({
      category: "employee",
      type: "commission_earned",
      title: p.isRecurring
        ? `Recurring commission: ${amountStr}`
        : `Commission earned: ${amountStr}`,
      body: p.isRecurring
        ? `${employee?.name ?? `Employee #${p.employeeId}`} earned a renewal commission via code "${p.discountCode}".`
        : `${employee?.name ?? `Employee #${p.employeeId}`} earned a commission from code "${p.discountCode}".`,
      link: `/admin/affiliate`,
    });
  } catch (emailErr) {
    stripeLogger.error({ err: emailErr }, "[StripeWebhook] Commission notification error");
  }
}

// ─── Checkout path ────────────────────────────────────────────────────────────

export interface TrackCheckoutCommissionParams {
  discountCode: string;
  metadataEmployeeId: number | null;
  metadataDiscountCodeId: number | null;
  paymentIntentId: string | null;
  saleAmountCents: number;
  subscriberId: number;
  letterRequestId?: number;
  appUrl: string;
  planId: string;
}

export async function trackCheckoutCommission(
  params: TrackCheckoutCommissionParams
): Promise<void> {
  const discountCodeRow = await getDiscountCodeByCode(params.discountCode);
  if (!discountCodeRow || !discountCodeRow.isActive) return;

  if (params.saleAmountCents <= 0) return;

  const commissionAmount = calculateCommissionAmount(params.saleAmountCents);
  const resolvedEmployeeId = params.metadataEmployeeId ?? discountCodeRow.employeeId;

  const commission = await createCommission({
    employeeId: resolvedEmployeeId,
    letterRequestId: params.letterRequestId,
    subscriberId: params.subscriberId,
    discountCodeId: params.metadataDiscountCodeId ?? discountCodeRow.id,
    stripePaymentIntentId: params.paymentIntentId ?? undefined,
    saleAmount: params.saleAmountCents,
    commissionRate: AFFILIATE_COMMISSION_BASIS_POINTS,
    commissionAmount,
  });
  if (commission?.created === false) return;

  await incrementDiscountCodeUsage(discountCodeRow.id);

  stripeLogger.info(
    { commissionAmount, resolvedEmployeeId, saleAmount: params.saleAmountCents },
    "[StripeWebhook] Commission created"
  );

  await emitCommissionNotifications({
    employeeId: resolvedEmployeeId,
    subscriberId: params.subscriberId,
    discountCode: params.discountCode,
    commissionAmount,
    planId: params.planId,
    appUrl: params.appUrl,
    includeDiscountCodeUsedNotif: true,
    isRecurring: false,
  });
}

// ─── Invoice path (recurring) ─────────────────────────────────────────────────

export interface TrackRecurringCommissionParams {
  discountCode: string;
  employeeId: number;
  discountCodeId: number | null;
  invoiceId: string;
  paymentIntentId: string | null;
  invoiceAmountCents: number;
  subscriberId: number;
  appUrl: string;
  planId: string;
  incrementDiscountUsage?: boolean;
}

export async function trackRecurringCommission(
  params: TrackRecurringCommissionParams
): Promise<void> {
  if (params.invoiceAmountCents <= 0) return;

  const commissionAmount = calculateCommissionAmount(params.invoiceAmountCents);

  const commission = await createCommission({
    employeeId: params.employeeId,
    letterRequestId: undefined,
    subscriberId: params.subscriberId,
    discountCodeId: params.discountCodeId ?? undefined,
    stripePaymentIntentId: params.paymentIntentId ?? undefined,
    stripeInvoiceId: params.invoiceId,
    saleAmount: params.invoiceAmountCents,
    commissionRate: AFFILIATE_COMMISSION_BASIS_POINTS,
    commissionAmount,
  });
  if (commission?.created === false) return;

  if (params.incrementDiscountUsage) {
    const discountCodeId =
      params.discountCodeId ??
      (await getDiscountCodeByCode(params.discountCode))?.id;
    if (discountCodeId) {
      await incrementDiscountCodeUsage(discountCodeId);
    }
  }

  stripeLogger.info(
    { commissionAmount, employeeId: params.employeeId, planId: params.planId },
    "[StripeWebhook] Recurring commission created"
  );

  await emitCommissionNotifications({
    employeeId: params.employeeId,
    subscriberId: params.subscriberId,
    discountCode: params.discountCode,
    commissionAmount,
    planId: params.planId,
    appUrl: params.appUrl,
    includeDiscountCodeUsedNotif: false,
    isRecurring: true,
  });
}
