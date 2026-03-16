/**
 * Stripe Webhook Handler — Talk-to-My-Lawyer
 * Handles checkout.session.completed, customer.subscription.*, invoice.paid
 */

import type { Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getStripe, activateSubscription } from "./stripe";
import { getPlanConfig } from "./stripe-products";
import {
  getDb, updateLetterStatus, logReviewAction, getLetterRequestById,
  getUserById, createNotification, getDiscountCodeByCode,
  incrementDiscountCodeUsage, createCommission,
} from "./db";
import { sendLetterApprovedEmail, sendLetterUnlockedEmail, sendEmployeeCommissionEmail, sendNewReviewNeededEmail } from "./email";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { captureServerException, addServerBreadcrumb } from "./sentry";

async function getUserIdFromStripeCustomer(customerId: string): Promise<number | null> {
  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const meta = (customer as Stripe.Customer).metadata;
    if (meta?.userId) return parseInt(meta.userId, 10);
    return null;
  } catch {
    return null;
  }
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      ENV.stripeWebhookSecret
    );
  } catch (err: any) {
    console.error("[StripeWebhook] Signature verification failed:", err.message);
    captureServerException(err, {
      tags: { component: "stripe_webhook", error_type: "signature_verification" },
    });
    res.status(400).json({ error: "Webhook signature verification failed" });
    return;
  }

  // ─── Handle test events ───────────────────────────────────────────────────
  if (event.id.startsWith("evt_test_")) {
    console.log("[StripeWebhook] Test event detected, returning verification response");
    res.json({ verified: true });
    return;
  }

  console.log(`[StripeWebhook] Processing event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      // ─── One-time payment completed ────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = parseInt(session.metadata?.user_id ?? session.client_reference_id ?? "0", 10);
        const planId = session.metadata?.plan_id ?? "per_letter";

        if (!userId) {
          console.warn("[StripeWebhook] checkout.session.completed: no userId in metadata");
          break;
        }

        if (session.mode === "payment") {
          // One-time per_letter payment
          const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

          await activateSubscription({
            userId,
            stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? "",
            stripeSubscriptionId: null,
            stripePaymentIntentId: paymentIntentId,
            planId,
            status: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: null, // one-time, no period end
          });

          console.log(`[StripeWebhook] Per-letter payment activated for user ${userId}`);

          // ─── Letter unlock: transition generated_locked → pending_review ───
          const letterIdStr = session.metadata?.letter_id;
          const unlockType = session.metadata?.unlock_type;
          if (letterIdStr && unlockType === "letter_unlock") {
            const letterId = parseInt(letterIdStr, 10);
            if (!isNaN(letterId)) {
              try {
                const letter = await getLetterRequestById(letterId);
                if (letter && letter.status === "generated_locked") {
                  await updateLetterStatus(letterId, "pending_review");
                  await logReviewAction({
                    letterRequestId: letterId,
                    actorType: "system",
                    action: "payment_received",
                    noteText: `Payment received. Letter unlocked and queued for attorney review. Stripe session: ${session.id}`,
                    noteVisibility: "user_visible",
                    fromStatus: "generated_locked",
                    toStatus: "pending_review",
                  });
                  // Notify subscriber
                  await createNotification({
                    userId,
                    type: "letter_unlocked",
                    title: "Payment confirmed — letter sent for review!",
                    body: `Your letter "${letter.subject}" is now in the attorney review queue.`,
                    link: `/letters/${letterId}`,
                  });
                  // Send unlock confirmation email to subscriber
                  const subscriber = await getUserById(userId);
                  if (subscriber?.email) {
                    const origin = session.success_url?.split('/letters')[0]
                      ?? "https://www.talk-to-my-lawyer.com";
                    await sendLetterUnlockedEmail({
                      to: subscriber.email,
                      name: subscriber.name ?? "Subscriber",
                      subject: letter.subject,
                      letterId,
                      appUrl: origin,
                    }).catch(console.error);
                  }
                  console.log(`[StripeWebhook] Letter #${letterId} unlocked → pending_review`);

                  // ─── Notify attorneys that a new letter is ready for review ───
                  try {
                    const { getAllUsers } = await import("./db");
                    const attorneys = await getAllUsers("attorney");
                    const origin2 = session.success_url?.split('/letters')[0]
                      ?? "https://www.talk-to-my-lawyer.com";
                    for (const attorney of attorneys) {
                      if (attorney.email) {
                        await sendNewReviewNeededEmail({
                          to: attorney.email,
                          name: attorney.name ?? "Attorney",
                          letterSubject: letter.subject,
                          letterId,
                          letterType: letter.letterType,
                          jurisdiction: letter.jurisdictionState ?? "Unknown",
                          appUrl: origin2,
                        });
                      }
                    }
                  } catch (notifyErr) {
                    console.error(`[StripeWebhook] Failed to notify attorneys for letter #${letterId}:`, notifyErr);
                  }

                  // ─── Commission tracking: if a discount code was used ───
                  const discountCodeStr = session.metadata?.discount_code;
                  if (discountCodeStr) {
                    try {
                      // Use enriched metadata when available, fall back to DB lookup
                      const metaEmployeeId = session.metadata?.employee_id ? parseInt(session.metadata.employee_id, 10) : null;
                      const metaDiscountCodeId = session.metadata?.discount_code_id ? parseInt(session.metadata.discount_code_id, 10) : null;
                      const discountCode = await getDiscountCodeByCode(discountCodeStr);
          if (discountCode && discountCode.isActive) {
            await incrementDiscountCodeUsage(discountCode.id);
            const saleAmount = session.amount_total ?? 20000; // cents (final price after discount)
            const originalPrice = session.metadata?.original_price ? parseInt(session.metadata.original_price, 10) : saleAmount;
            const commissionRate = 500; // 5% = 500 basis points
            const commissionAmount = Math.round(saleAmount * commissionRate / 10000);
            await createCommission({
                          employeeId: metaEmployeeId ?? discountCode.employeeId,
                          letterRequestId: letterId,
                          subscriberId: userId,
                          discountCodeId: metaDiscountCodeId ?? discountCode.id,
                          stripePaymentIntentId: paymentIntentId ?? undefined,
                          saleAmount,
                          commissionRate,
                          commissionAmount,
                        });
                        console.log(`[StripeWebhook] Commission created: $${(commissionAmount / 100).toFixed(2)} for employee #${metaEmployeeId ?? discountCode.employeeId} (original: $${(originalPrice / 100).toFixed(2)}, final: $${(saleAmount / 100).toFixed(2)})`);
                        // ─── Notify employee of commission earned ───
                        try {
                          const employee = await getUserById(discountCode.employeeId);
                          const subscriber = await getUserById(userId);
                          if (employee?.email) {
                            const planCfg = getPlanConfig(planId);
                    const appUrl = session.success_url?.split('/letters')[0]
                      ?? "https://www.talk-to-my-lawyer.com";
                            await sendEmployeeCommissionEmail({
                              to: employee.email,
                              name: employee.name ?? "Employee",
                              subscriberName: subscriber?.name ?? "A subscriber",
                              planName: planCfg?.name ?? "Pay Per Letter",
                              commissionAmount: `$${(commissionAmount / 100).toFixed(2)}`,
                              discountCode: discountCodeStr,
                              dashboardUrl: `${appUrl}/employee/dashboard`,
                            });
                          }
                        } catch (emailErr) {
                          console.error(`[StripeWebhook] Commission email error (per-letter):`, emailErr);
                        }
                      }
                    } catch (commErr) {
                      console.error(`[StripeWebhook] Commission tracking error:`, commErr);
                    }
                  }
                } else {
                  console.warn(`[StripeWebhook] Letter #${letterId} not in generated_locked (status: ${letter?.status})`);
                }
              } catch (unlockErr) {
                console.error(`[StripeWebhook] Failed to unlock letter #${letterId}:`, unlockErr);
              }
            }
          }
        }
        // For subscription mode, the subscription.* events handle activation.
        // Commission tracking must happen here because discount_code is only
        // available in the checkout session metadata, not in the subscription object.
        if (session.mode === "subscription") {
          const discountCodeStr = session.metadata?.discount_code;
          if (discountCodeStr) {
            try {
              // Use enriched metadata when available, fall back to DB lookup
              const metaEmployeeId = session.metadata?.employee_id ? parseInt(session.metadata.employee_id, 10) : null;
              const metaDiscountCodeId = session.metadata?.discount_code_id ? parseInt(session.metadata.discount_code_id, 10) : null;
              const discountCode = await getDiscountCodeByCode(discountCodeStr);
              if (discountCode && discountCode.isActive) {
                await incrementDiscountCodeUsage(discountCode.id);
                const saleAmount = session.amount_total ?? 0;
                const originalPrice = session.metadata?.original_price ? parseInt(session.metadata.original_price, 10) : saleAmount;
                if (saleAmount > 0) {
                  const commissionRate = 500; // 5% = 500 basis points
                  const commissionAmount = Math.round(saleAmount * commissionRate / 10000);
                  await createCommission({
                    employeeId: metaEmployeeId ?? discountCode.employeeId,
                    letterRequestId: undefined,
                    subscriberId: userId,
                    discountCodeId: metaDiscountCodeId ?? discountCode.id,
                    stripePaymentIntentId: typeof session.payment_intent === "string"
                      ? session.payment_intent
                      : session.payment_intent?.id ?? undefined,
                    saleAmount,
                    commissionRate,
                    commissionAmount,
                  });
                  console.log(`[StripeWebhook] Subscription commission: $${(commissionAmount / 100).toFixed(2)} for employee #${metaEmployeeId ?? discountCode.employeeId} (original: $${(originalPrice / 100).toFixed(2)}, final: $${(saleAmount / 100).toFixed(2)}, plan: ${planId})`);
                  // ─── Notify employee of commission earned ───
                  try {
                    const employee = await getUserById(discountCode.employeeId);
                    const subscriber = await getUserById(userId);
                    if (employee?.email) {
                      const planCfg = getPlanConfig(planId);
                      const appUrl = session.success_url?.split('/letters')[0]
                        ?? "https://www.talk-to-my-lawyer.com";
                      await sendEmployeeCommissionEmail({
                        to: employee.email,
                        name: employee.name ?? "Employee",
                        subscriberName: subscriber?.name ?? "A subscriber",
                        planName: planCfg?.name ?? planId,
                        commissionAmount: `$${(commissionAmount / 100).toFixed(2)}`,
                        discountCode: discountCodeStr,
                        dashboardUrl: `${appUrl}/employee/dashboard`,
                      });
                    }
                  } catch (emailErr) {
                    console.error(`[StripeWebhook] Commission email error (subscription):`, emailErr);
                  }
                }
              }
            } catch (commErr) {
              console.error(`[StripeWebhook] Subscription commission tracking error:`, commErr);
            }
          }
        }
        break;
      }

      // ─── Subscription created or updated ──────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as any;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
        const userId = resolvedUserId || (await getUserIdFromStripeCustomer(customerId)) || 0;

        if (!userId) {
          console.warn(`[StripeWebhook] ${event.type}: could not resolve userId`);
          break;
        }

        const planId = sub.metadata?.plan_id ?? "monthly_basic";
        const status = mapStripeStatus(sub.status);

        await activateSubscription({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          stripePaymentIntentId: null,
          planId,
          status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });

        console.log(`[StripeWebhook] Subscription ${event.type} for user ${userId}, status: ${status}`);
        break;
      }

      // ─── Subscription deleted/canceled ────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
        const userId = resolvedUserId || (await getUserIdFromStripeCustomer(customerId)) || 0;

        if (!userId) break;

        const planId = sub.metadata?.plan_id ?? "monthly_basic";

        await activateSubscription({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          stripePaymentIntentId: null,
          planId,
          status: "canceled",
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: true,
        });

        console.log(`[StripeWebhook] Subscription canceled for user ${userId}`);
        break;
      }

        // ─── Invoice paid (renewal) ────────────────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // In Stripe v20, subscription is accessed via parent.subscription_details
        const parentSub = (invoice.parent as any)?.subscription_details?.subscription;
        const subId = typeof parentSub === "string" ? parentSub : parentSub?.id;

        if (subId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subId) as any;
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
          const userId = resolvedUserId || (await getUserIdFromStripeCustomer(customerId)) || 0;

          if (userId) {
            const planId = sub.metadata?.plan_id ?? "monthly_basic";
            await activateSubscription({
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              stripePaymentIntentId: null,
              planId,
              status: "active",
              currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
              currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
              cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            });
            console.log(`[StripeWebhook] Invoice paid, subscription renewed for user ${userId}`);
          }
        }
        break;
      }

      // ─── Invoice payment failedd ────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[StripeWebhook] Invoice payment failed: ${invoice.id}`);
        // Could send email notification here
        break;
      }

      default:
        console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("[StripeWebhook] Error processing event:", err);
    captureServerException(err, {
      tags: { component: "stripe_webhook", event_type: event.type },
      extra: { eventId: event.id, eventType: event.type },
    });
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "none" {
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
