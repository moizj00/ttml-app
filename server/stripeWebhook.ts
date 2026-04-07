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
  getUserById, createNotification, notifyAdmins, notifyAllAttorneys, getDiscountCodeByCode,
  incrementDiscountCodeUsage, createCommission, setFreeReviewUsed,
} from "./db";
import { sendLetterApprovedEmail, sendLetterUnlockedEmail, sendEmployeeCommissionEmail, sendPaymentFailedEmail, sendClientRevisionRequestEmail } from "./email";
import { users, processedStripeEvents } from "../drizzle/schema";
import { eq, lt, sql } from "drizzle-orm";
import { captureServerException, addServerBreadcrumb } from "./sentry";

async function getUserIdFromStripeCustomer(customerId: string): Promise<number | null> {
  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const meta = (customer as Stripe.Customer).metadata;
    if (meta?.userId) return parseInt(meta.userId, 10);
    return null;
  } catch (err) {
    console.warn(`[StripeWebhook] Failed to retrieve Stripe customer ${customerId}:`, err);
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

  const db = await getDb();
  if (db) {
    const existing = await db
      .select({ eventId: processedStripeEvents.eventId })
      .from(processedStripeEvents)
      .where(eq(processedStripeEvents.eventId, event.id))
      .limit(1);
    if (existing.length > 0) {
      console.log(`[StripeWebhook] Duplicate event ${event.id}, skipping`);
      res.json({ received: true, duplicate: true });
      return;
    }
  }

  let responded = false;
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
          const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

          // Only activate subscription record for known plan types
          // first_letter_review and revision_consultation are standalone payments, not plans
          const unlockTypeForActivation = session.metadata?.unlock_type;
          if (unlockTypeForActivation !== "first_letter_review" && unlockTypeForActivation !== "revision_consultation") {
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
          }

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

                  try {
                    const adminAppUrl = session.success_url?.split('/letters')[0] ?? "https://www.talk-to-my-lawyer.com";
                    await notifyAdmins({
                      category: "letters",
                      type: "payment_received",
                      title: `Payment received — letter #${letterId} unlocked`,
                      body: `Letter "${letter.subject}" has been unlocked and queued for attorney review.`,
                      link: `/admin/letters/${letterId}`,
                      emailOpts: {
                        subject: `Payment Received — Letter #${letterId} Unlocked`,
                        preheader: `Letter "${letter.subject}" unlocked after payment`,
                        bodyHtml: `<p>Hello,</p><p>Payment has been received for letter <strong>#${letterId}</strong> — "${letter.subject}". The letter is now in the attorney review queue.</p>`,
                        ctaText: "View Letter",
                        ctaUrl: `${adminAppUrl}/admin/letters/${letterId}`,
                      },
                    });
                  } catch (err) {
                    console.error("[notifyAdmins] payment_received:", err);
                  }

                  // ─── Notify all attorneys (email + in-app) that a new letter is ready ───
                  console.log(`[StripeWebhook] Letter #${letterId} generated_locked → pending_review via payment`);
                  try {
                    const origin2 = session.success_url?.split('/letters')[0]
                      ?? "https://www.talk-to-my-lawyer.com";
                    await notifyAllAttorneys({
                      letterId,
                      letterSubject: letter.subject,
                      letterType: letter.letterType,
                      jurisdiction: letter.jurisdictionState ?? "Unknown",
                      appUrl: origin2,
                    });
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
                        const saleAmount = session.amount_total ?? 29900; // cents (final price after discount)
                        const originalPrice = session.metadata?.original_price ? parseInt(session.metadata.original_price, 10) : saleAmount;
                        if (saleAmount > 0) {
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
                          const resolvedEmployeeId = metaEmployeeId ?? discountCode.employeeId;
                          console.log(`[StripeWebhook] Commission created: $${(commissionAmount / 100).toFixed(2)} for employee #${resolvedEmployeeId} (original: $${(originalPrice / 100).toFixed(2)}, final: $${(saleAmount / 100).toFixed(2)})`);
                          try {
                            const employee = await getUserById(resolvedEmployeeId);
                            const subscriber = await getUserById(userId);
                            const appUrl = session.success_url?.split('/letters')[0]
                              ?? "https://www.talk-to-my-lawyer.com";
                            // In-app notification for employee
                            await createNotification({
                              userId: resolvedEmployeeId,
                              type: "commission_earned",
                              category: "employee",
                              title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
                              body: `You earned a $${(commissionAmount / 100).toFixed(2)} commission from a per-letter sale (code: ${discountCodeStr}).`,
                              link: `/employee`,
                            });
                            if (employee?.email) {
                              const planCfg = getPlanConfig(planId);
                              await sendEmployeeCommissionEmail({
                                to: employee.email,
                                name: employee.name ?? "Employee",
                                subscriberName: subscriber?.name ?? "A subscriber",
                                planName: planCfg?.name ?? "Pay Per Letter",
                                commissionAmount: `$${(commissionAmount / 100).toFixed(2)}`,
                                discountCode: discountCodeStr,
                                dashboardUrl: `${appUrl}/employee`,
                              });
                            }
                            await notifyAdmins({
                              category: "employee",
                              type: "discount_code_used",
                              title: `Discount code "${discountCodeStr}" used`,
                              body: `Referral conversion: $${(commissionAmount / 100).toFixed(2)} commission earned by ${employee?.name ?? `employee #${resolvedEmployeeId}`}.`,
                              link: `/admin/affiliate`,
                            });
                            await notifyAdmins({
                              category: "employee",
                              type: "commission_earned",
                              title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
                              body: `${employee?.name ?? `Employee #${resolvedEmployeeId}`} earned a commission from code "${discountCodeStr}".`,
                              link: `/admin/affiliate`,
                            });
                          } catch (emailErr) {
                            console.error(`[StripeWebhook] Commission email error (per-letter):`, emailErr);
                          }
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

          // ─── First Letter Review: $50 attorney review gate ────────────────────────────
          if (session.mode === "payment" && session.metadata?.unlock_type === "first_letter_review") {
            const flLetterIdStr = session.metadata?.letter_id;
            if (flLetterIdStr) {
              const flLetterId = parseInt(flLetterIdStr, 10);
              if (!isNaN(flLetterId)) {
                try {
                  const flLetter = await getLetterRequestById(flLetterId);
                  if (flLetter && flLetter.status === "generated_locked") {
                    await updateLetterStatus(flLetterId, "pending_review");
                    await logReviewAction({
                      letterRequestId: flLetterId,
                      actorType: "system",
                      action: "payment_received",
                      noteText: `$50 first-letter review payment received. Letter queued for attorney review. Stripe session: ${session.id}`,
                      noteVisibility: "user_visible",
                      fromStatus: "generated_locked",
                      toStatus: "pending_review",
                    });
                    // Mark the free review slot as used so future paywall checks reflect this
                    await setFreeReviewUsed(userId);
                    // Notify subscriber
                    await createNotification({
                      userId,
                      type: "letter_unlocked",
                      title: "Payment confirmed — letter sent for review!",
                      body: `Your letter "${flLetter.subject}" is now in the attorney review queue.`,
                      link: `/letters/${flLetterId}`,
                    });
                    // Send unlock confirmation email to subscriber
                    const flSubscriber = await getUserById(userId);
                    if (flSubscriber?.email) {
                      const flOrigin = session.success_url?.split('/letters')[0]
                        ?? "https://www.talk-to-my-lawyer.com";
                      await sendLetterUnlockedEmail({
                        to: flSubscriber.email,
                        name: flSubscriber.name ?? "Subscriber",
                        subject: flLetter.subject,
                        letterId: flLetterId,
                        appUrl: flOrigin,
                      }).catch(console.error);
                    }
                    // Notify admins
                    try {
                      const flAdminUrl = session.success_url?.split('/letters')[0] ?? "https://www.talk-to-my-lawyer.com";
                      await notifyAdmins({
                        category: "letters",
                        type: "payment_received",
                        title: `$50 first-letter review payment — letter #${flLetterId} unlocked`,
                        body: `Letter "${flLetter.subject}" unlocked via $50 first-letter review fee and queued for attorney review.`,
                        link: `/admin/letters/${flLetterId}`,
                        emailOpts: {
                          subject: `$50 First-Letter Review Payment — Letter #${flLetterId}`,
                          preheader: `Letter "${flLetter.subject}" unlocked after $50 payment`,
                          bodyHtml: `<p>Hello,</p><p>A $50 first-letter review payment has been received for letter <strong>#${flLetterId}</strong> — "${flLetter.subject}". The letter is now in the attorney review queue.</p>`,
                          ctaText: "View Letter",
                          ctaUrl: `${flAdminUrl}/admin/letters/${flLetterId}`,
                        },
                      });
                    } catch (err) {
                      console.error("[notifyAdmins] first_letter_review:", err);
                    }
                    // Notify all attorneys
                    try {
                      const flOrigin2 = session.success_url?.split('/letters')[0]
                        ?? "https://www.talk-to-my-lawyer.com";
                      await notifyAllAttorneys({
                        letterId: flLetterId,
                        letterSubject: flLetter.subject,
                        letterType: flLetter.letterType,
                        jurisdiction: flLetter.jurisdictionState ?? "Unknown",
                        appUrl: flOrigin2,
                      });
                    } catch (notifyErr) {
                      console.error(`[StripeWebhook] Failed to notify attorneys for letter #${flLetterId}:`, notifyErr);
                    }
                    console.log(`[StripeWebhook] Letter #${flLetterId} first_letter_review → pending_review via $50 payment`);
                  } else {
                    console.warn(`[StripeWebhook] first_letter_review: letter #${flLetterId} not in generated_locked (status: ${flLetter?.status})`);
                  }
                } catch (flErr) {
                  console.error(`[StripeWebhook] Failed to process first_letter_review for letter #${flLetterId}:`, flErr);
                }
              }
            }
          }

          // ─── Revision Consultation: execute revision after $20 payment ─────────────────
          if (session.mode === "payment" && session.metadata?.unlock_type === "revision_consultation") {
            const revLetterIdStr = session.metadata?.letter_id;
            const revisionNotes = session.metadata?.revision_notes ?? "(no notes provided)";
            if (revLetterIdStr) {
              const revLetterId = parseInt(revLetterIdStr, 10);
              if (!isNaN(revLetterId)) {
                try {
                  const revLetter = await getLetterRequestById(revLetterId);
                  if (revLetter && revLetter.status === "client_approval_pending") {
                    await updateLetterStatus(revLetterId, "client_revision_requested");
                    await logReviewAction({
                      letterRequestId: revLetterId,
                      reviewerId: userId,
                      actorType: "subscriber",
                      action: "client_revision_requested",
                      noteText: revisionNotes,
                      noteVisibility: "user_visible",
                      fromStatus: "client_approval_pending",
                      toStatus: "client_revision_requested",
                    });
                    // Notify assigned attorney
                    if (revLetter.assignedReviewerId) {
                      const attorney = await getUserById(revLetter.assignedReviewerId);
                      const appUrl = session.success_url?.split('/letters')[0] ?? "https://www.talk-to-my-lawyer.com";
                      if (attorney?.email) {
                        await sendClientRevisionRequestEmail({
                          to: attorney.email,
                          name: attorney.name ?? "Attorney",
                          letterSubject: revLetter.subject,
                          letterId: revLetterId,
                          subscriberNotes: revisionNotes,
                          appUrl,
                        }).catch(console.error);
                      }
                      await createNotification({
                        userId: revLetter.assignedReviewerId,
                        type: "client_revision_requested",
                        title: "Client requested revisions (paid)",
                        body: `A subscriber paid for a revision consultation on "${revLetter.subject}". Please review their notes.`,
                        link: `/review/${revLetterId}`,
                      });
                    }
                    // Notify subscriber
                    await createNotification({
                      userId,
                      type: "revision_payment_confirmed",
                      title: "Revision consultation confirmed",
                      body: `Your $20 revision consultation for "${revLetter.subject}" has been confirmed. The attorney will review your notes shortly.`,
                      link: `/letters/${revLetterId}`,
                    });
                    await notifyAdmins({
                      category: "letters",
                      type: "client_revision_requested",
                      title: `Paid revision consultation — letter #${revLetterId}`,
                      body: `A subscriber paid $20 for a revision consultation on "${revLetter.subject}".`,
                      link: `/admin/letters/${revLetterId}`,
                    });
                    console.log(`[StripeWebhook] Revision consultation executed for letter #${revLetterId}`);
                  } else {
                    console.warn(`[StripeWebhook] Revision consultation: letter #${revLetterId} not in client_approval_pending (status: ${revLetter?.status})`);
                  }
                } catch (revErr) {
                  console.error(`[StripeWebhook] Failed to execute revision consultation for letter #${revLetterId}:`, revErr);
                }
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
                  const resolvedEmployeeId = metaEmployeeId ?? discountCode.employeeId;
                  console.log(`[StripeWebhook] Subscription commission: $${(commissionAmount / 100).toFixed(2)} for employee #${resolvedEmployeeId} (original: $${(originalPrice / 100).toFixed(2)}, final: $${(saleAmount / 100).toFixed(2)}, plan: ${planId})`);
                  try {
                    const employee = await getUserById(resolvedEmployeeId);
                    const subscriber = await getUserById(userId);
                    const appUrl = session.success_url?.split('/letters')[0]
                      ?? "https://www.talk-to-my-lawyer.com";
                    // In-app notification for employee
                    await createNotification({
                      userId: resolvedEmployeeId,
                      type: "commission_earned",
                      category: "employee",
                      title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
                      body: `You earned a $${(commissionAmount / 100).toFixed(2)} commission from a subscription signup (code: ${discountCodeStr}).`,
                      link: `/employee`,
                    });
                    if (employee?.email) {
                      const planCfg = getPlanConfig(planId);
                      await sendEmployeeCommissionEmail({
                        to: employee.email,
                        name: employee.name ?? "Employee",
                        subscriberName: subscriber?.name ?? "A subscriber",
                        planName: planCfg?.name ?? planId,
                        commissionAmount: `$${(commissionAmount / 100).toFixed(2)}`,
                        discountCode: discountCodeStr,
                        dashboardUrl: `${appUrl}/employee`,
                      });
                    }
                    await notifyAdmins({
                      category: "employee",
                      type: "discount_code_used",
                      title: `Discount code "${discountCodeStr}" used (subscription)`,
                      body: `Referral conversion: $${(commissionAmount / 100).toFixed(2)} commission earned by ${(await getUserById(resolvedEmployeeId))?.name ?? `employee #${resolvedEmployeeId}`}.`,
                      link: `/admin/affiliate`,
                    });
                    await notifyAdmins({
                      category: "employee",
                      type: "commission_earned",
                      title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
                      body: `Subscription referral commission via code "${discountCodeStr}".`,
                      link: `/admin/affiliate`,
                    });
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

        // ─── Auto-submit first letter for new subscribers (waives the $50 fee) ───
        // When a user subscribes and has a generated_locked first letter that hasn't been
        // reviewed yet, automatically submit it for attorney review under their new plan.
        // Only applies to the FIRST letter — if the user already has unlocked letters,
        // the $50 gate doesn't apply (they'd be paying $299 for subsequent letters anyway).
        if (event.type === "customer.subscription.created" && status === "active") {
          try {
            const db = await getDb();
            if (db) {
              const { letterRequests } = await import("../drizzle/schema");
              const { eq, and, notInArray } = await import("drizzle-orm");

              // Verify this user has no previously unlocked letters (first-letter eligibility)
              const previouslyUnlockedLetters = await db
                .select({ id: letterRequests.id })
                .from(letterRequests)
                .where(
                  and(
                    eq(letterRequests.userId, userId),
                    notInArray(letterRequests.status, [
                      "submitted",
                      "researching",
                      "drafting",
                      "generated_locked",
                      "pipeline_failed",
                    ])
                  )
                )
                .limit(1);

              if (previouslyUnlockedLetters.length === 0) {
                // User has no prior unlocked letters — find their single generated_locked letter
                const lockedLetters = await db
                  .select()
                  .from(letterRequests)
                  .where(
                    and(
                      eq(letterRequests.userId, userId),
                      eq(letterRequests.status, "generated_locked")
                    )
                  )
                  .limit(1);

                if (lockedLetters.length === 1) {
                  const lockedLetter = lockedLetters[0];
                  try {
                    await updateLetterStatus(lockedLetter.id, "pending_review");
                    await logReviewAction({
                      letterRequestId: lockedLetter.id,
                      actorType: "system",
                      action: "payment_received",
                      noteText: `Subscriber signed up — first letter auto-submitted for attorney review (subscription waives $50 fee). Plan: ${planId}`,
                      noteVisibility: "user_visible",
                      fromStatus: "generated_locked",
                      toStatus: "pending_review",
                    });
                    await createNotification({
                      userId,
                      type: "letter_unlocked",
                      title: "Subscription activated — letter submitted for review!",
                      body: `Your letter "${lockedLetter.subject}" has been submitted for attorney review as part of your new plan.`,
                      link: `/letters/${lockedLetter.id}`,
                    });
                    // Notify all attorneys
                    await notifyAllAttorneys({
                      letterId: lockedLetter.id,
                      letterSubject: lockedLetter.subject,
                      letterType: lockedLetter.letterType,
                      jurisdiction: lockedLetter.jurisdictionState ?? "Unknown",
                      appUrl: "https://www.talk-to-my-lawyer.com",
                    }).catch(console.error);
                    console.log(`[StripeWebhook] Auto-submitted first letter #${lockedLetter.id} for new subscriber ${userId}`);
                  } catch (autoSubmitErr) {
                    console.error(`[StripeWebhook] Failed to auto-submit letter #${lockedLetter.id}:`, autoSubmitErr);
                  }
                }
              } else {
                console.log(`[StripeWebhook] New subscriber ${userId} has prior unlocked letters — no auto-submit`);
              }
            }
          } catch (autoSubmitErr) {
            console.error(`[StripeWebhook] Auto-submit first letter error for user ${userId}:`, autoSubmitErr);
          }
        }

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

            // ─── Recurring commission tracking ───────────────────────────
            const subDiscountCode = sub.metadata?.discount_code as string | undefined;
            const subEmployeeId = sub.metadata?.employee_id ? parseInt(sub.metadata.employee_id, 10) : null;
            const subDiscountCodeId = sub.metadata?.discount_code_id ? parseInt(sub.metadata.discount_code_id, 10) : null;
            if (subDiscountCode && subEmployeeId) {
              try {
                const invoiceAmount = invoice.amount_paid ?? 0;
                if (invoiceAmount > 0) {
                  // Use invoice payment_intent as idempotency key
                  const invoicePaymentIntent = typeof (invoice as any).payment_intent === "string"
                    ? (invoice as any).payment_intent
                    : (invoice as any).payment_intent?.id ?? undefined;
                  const commissionRate = 500; // 5% = 500 basis points
                  const commissionAmount = Math.round(invoiceAmount * commissionRate / 10000);
                  await createCommission({
                    employeeId: subEmployeeId,
                    letterRequestId: undefined,
                    subscriberId: userId,
                    discountCodeId: subDiscountCodeId ?? undefined,
                    stripePaymentIntentId: invoicePaymentIntent,
                    saleAmount: invoiceAmount,
                    commissionRate,
                    commissionAmount,
                  });
                  console.log(`[StripeWebhook] Recurring commission: $${(commissionAmount / 100).toFixed(2)} for employee #${subEmployeeId} (plan: ${planId})`);
                  try {
                    const employee = await getUserById(subEmployeeId);
                    const subscriber = await getUserById(userId);
                    const planCfg = getPlanConfig(planId);
                    const appUrl = "https://www.talk-to-my-lawyer.com";
                    // In-app notification for employee
                    await createNotification({
                      userId: subEmployeeId,
                      type: "commission_earned",
                      category: "employee",
                      title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
                      body: `You earned a $${(commissionAmount / 100).toFixed(2)} commission from a subscription renewal (code: ${subDiscountCode}).`,
                      link: `/employee`,
                    });
                    if (employee?.email) {
                      await sendEmployeeCommissionEmail({
                        to: employee.email,
                        name: employee.name ?? "Employee",
                        subscriberName: subscriber?.name ?? "A subscriber",
                        planName: planCfg?.name ?? planId,
                        commissionAmount: `$${(commissionAmount / 100).toFixed(2)}`,
                        discountCode: subDiscountCode,
                        dashboardUrl: `${appUrl}/employee`,
                      });
                    }
                    await notifyAdmins({
                      category: "employee",
                      type: "commission_earned",
                      title: `Recurring commission: $${(commissionAmount / 100).toFixed(2)}`,
                      body: `${employee?.name ?? `Employee #${subEmployeeId}`} earned a renewal commission via code "${subDiscountCode}".`,
                      link: `/admin/affiliate`,
                    });
                  } catch (notifyErr) {
                    console.error(`[StripeWebhook] Recurring commission notification error:`, notifyErr);
                  }
                }
              } catch (commErr) {
                console.error(`[StripeWebhook] Recurring commission tracking error:`, commErr);
              }
            }
          }
        }
        break;
      }

      // ─── Invoice payment failed ────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[StripeWebhook] Invoice payment failed: ${invoice.id}`);
        try {
          const parentSub = (invoice.parent as any)?.subscription_details?.subscription;
          const subId = typeof parentSub === "string" ? parentSub : parentSub?.id;
          if (subId) {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subId) as any;
            const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
            const resolvedUserId = parseInt(sub.metadata?.user_id ?? "0", 10);
            const userId = resolvedUserId || (customerId ? await getUserIdFromStripeCustomer(customerId) : null) || 0;
            if (userId) {
              const user = await getUserById(userId);
              if (user?.email) {
                await sendPaymentFailedEmail({
                  to: user.email,
                  name: user.name ?? "Subscriber",
                  billingUrl: "https://www.talk-to-my-lawyer.com/subscriber/billing",
                }).catch(err => {
                  console.error("[StripeWebhook] Failed to send payment failed email:", err);
                  captureServerException(err, {
                    tags: { component: "stripe_webhook", error_type: "payment_failed_email" },
                  });
                });
              }
            }
          }
        } catch (err) {
          console.error("[StripeWebhook] Error handling payment_failed:", err);
          captureServerException(err, {
            tags: { component: "stripe_webhook", error_type: "payment_failed_handler" },
          });
        }
        break;
      }

      default:
        console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
    }

    if (db) {
      await db.insert(processedStripeEvents).values({
        eventId: event.id,
        eventType: event.type,
      }).onConflictDoNothing();
    }

    res.json({ received: true });
    responded = true;
  } catch (err: any) {
    console.error("[StripeWebhook] Error processing event:", err);
    captureServerException(err, {
      tags: { component: "stripe_webhook", event_type: event.type },
      extra: { eventId: event.id, eventType: event.type },
    });
    if (!responded) {
      res.status(500).json({ error: "Webhook processing failed" });
    }
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
