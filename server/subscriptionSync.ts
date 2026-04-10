import { getDb } from "./db";
import { getStripe } from "./stripe";
import { subscriptions, processedStripeEvents } from "../drizzle/schema";
import { eq, lt, sql } from "drizzle-orm";
import { captureServerException } from "./sentry";
import { logger } from "./logger";

type SubStatus = "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "none";

function mapStripeStatus(stripeStatus: string): SubStatus {
  switch (stripeStatus) {
    case "active": return "active";
    case "canceled": return "canceled";
    case "past_due": return "past_due";
    case "trialing": return "trialing";
    case "incomplete":
    case "incomplete_expired": return "incomplete";
    default: return "none";
  }
}

export async function syncSubscriptionsWithStripe(): Promise<{
  checked: number;
  corrected: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) return { checked: 0, corrected: 0, errors: 0 };

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    logger.warn("[SubscriptionSync] Stripe not configured, skipping sync");
    return { checked: 0, corrected: 0, errors: 0 };
  }

  const allSubs = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(sql`${subscriptions.stripeSubscriptionId} IS NOT NULL AND ${subscriptions.status} != 'none'`);

  let checked = 0;
  let corrected = 0;
  let errors = 0;

  for (const sub of allSubs) {
    if (!sub.stripeSubscriptionId) continue;

    checked++;

    try {
      await new Promise(r => setTimeout(r, 200));

      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
      const mappedStatus = mapStripeStatus(stripeSub.status);

      if (mappedStatus !== sub.status) {
        logger.info(
          `[SubscriptionSync] Correcting user ${sub.userId}: DB=${sub.status} → Stripe=${mappedStatus} (stripe_sub=${sub.stripeSubscriptionId})`
        );

        const updateData: Record<string, unknown> = {
          status: mappedStatus,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
          updatedAt: new Date(),
        };
        if (stripeSub.current_period_start) {
          updateData.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
        }
        if (stripeSub.current_period_end) {
          updateData.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
        }

        await db
          .update(subscriptions)
          .set(updateData)
          .where(eq(subscriptions.id, sub.id));

        corrected++;
      }
    } catch (err) {
      errors++;
      logger.error({ err }, `[SubscriptionSync] Error checking subscription ${sub.stripeSubscriptionId} for user ${sub.userId}:`);
      captureServerException(err, {
        tags: { component: "subscription_sync" },
        extra: { userId: sub.userId, stripeSubscriptionId: sub.stripeSubscriptionId },
      });
    }
  }

  return { checked, corrected, errors };
}

export async function pruneProcessedStripeEvents(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(processedStripeEvents)
    .where(lt(processedStripeEvents.processedAt, sevenDaysAgo))
    .returning({ eventId: processedStripeEvents.eventId });

  return result.length;
}
