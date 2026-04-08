/**
 * Stripe Webhook — checkout.session.completed handler
 *
 * Handles:
 *   - Per-letter payment → activateSubscription + letter_unlock → pending_review
 *   - first_letter_review ($50) → pending_review + setFreeReviewUsed
 *   - revision_consultation ($20) → client_revision_requested
 *   - Subscription mode → commission tracking (discount code)
 */

import Stripe from "stripe";
import { activateSubscription } from "../../stripe";
import { getPlanConfig } from "../../stripe-products";
import {
  getDb, updateLetterStatus, logReviewAction, getLetterRequestById,
  getUserById, createNotification, notifyAdmins, notifyAllAttorneys,
  getDiscountCodeByCode, incrementDiscountCodeUsage, createCommission, setFreeReviewUsed,
} from "../../db";
import {
  sendLetterUnlockedEmail,
  sendEmployeeCommissionEmail,
  sendClientRevisionRequestEmail,
} from "../../email";
import { stripeLogger } from "../_helpers";

// ─── Commission helpers ───────────────────────────────────────────────────────

interface CommissionPayload {
  discountCodeStr: string;
  metaEmployeeId: number | null;
  metaDiscountCodeId: number | null;
  paymentIntentId: string | null | undefined;
  saleAmount: number;
  originalPrice: number;
  subscriberId: number;
  letterRequestId?: number;
  appUrl: string;
  planId: string;
}

async function trackCommission(payload: CommissionPayload): Promise<void> {
  const {
    discountCodeStr, metaEmployeeId, metaDiscountCodeId, paymentIntentId,
    saleAmount, subscriberId, letterRequestId, appUrl, planId,
  } = payload;

  const discountCode = await getDiscountCodeByCode(discountCodeStr);
  if (!discountCode || !discountCode.isActive) return;

  await incrementDiscountCodeUsage(discountCode.id);
  if (saleAmount <= 0) return;

  const commissionRate = 500; // 5% = 500 basis points
  const commissionAmount = Math.round(saleAmount * commissionRate / 10000);
  const resolvedEmployeeId = metaEmployeeId ?? discountCode.employeeId;

  await createCommission({
    employeeId: resolvedEmployeeId,
    letterRequestId,
    subscriberId,
    discountCodeId: metaDiscountCodeId ?? discountCode.id,
    stripePaymentIntentId: paymentIntentId ?? undefined,
    saleAmount,
    commissionRate,
    commissionAmount,
  });

  stripeLogger.info({ commissionAmount, resolvedEmployeeId, saleAmount }, "[StripeWebhook] Commission created");

  try {
    const employee = await getUserById(resolvedEmployeeId);
    const subscriber = await getUserById(subscriberId);
    const planCfg = getPlanConfig(planId);

    await createNotification({
      userId: resolvedEmployeeId,
      type: "commission_earned",
      category: "employee",
      title: `Commission earned: $${(commissionAmount / 100).toFixed(2)}`,
      body: `You earned a $${(commissionAmount / 100).toFixed(2)} commission from a sale (code: ${discountCodeStr}).`,
      link: `/employee`,
    });

    if (employee?.email) {
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
    stripeLogger.error({ err: emailErr }, "[StripeWebhook] Commission email error");
  }
}

// ─── Letter unlock helpers ────────────────────────────────────────────────────

async function unlockLetterForReview(
  letterId: number,
  userId: number,
  sessionId: string,
  noteText: string,
  appUrl: string,
  notifyAttorneys: boolean
): Promise<void> {
  const letter = await getLetterRequestById(letterId);
  if (!letter || letter.status !== "generated_locked") {
    stripeLogger.warn({ letterId, status: letter?.status }, "[StripeWebhook] Letter not in generated_locked");
    return;
  }

  await updateLetterStatus(letterId, "pending_review");
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "payment_received",
    noteText,
    noteVisibility: "user_visible",
    fromStatus: "generated_locked",
    toStatus: "pending_review",
  });

  await createNotification({
    userId,
    type: "letter_unlocked",
    title: "Payment confirmed — letter sent for review!",
    body: `Your letter "${letter.subject}" is now in the attorney review queue.`,
    link: `/letters/${letterId}`,
  });

  const subscriber = await getUserById(userId);
  if (subscriber?.email) {
    await sendLetterUnlockedEmail({
      to: subscriber.email,
      name: subscriber.name ?? "Subscriber",
      subject: letter.subject,
      letterId,
      appUrl,
    }).catch((e) => stripeLogger.error({ err: e }, "[StripeWebhook] Failed to send letter unlocked email"));
  }

  try {
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
        ctaUrl: `${appUrl}/admin/letters/${letterId}`,
      },
    });
  } catch (err) {
    stripeLogger.error({ err }, "[notifyAdmins] payment_received");
  }

  if (notifyAttorneys) {
    try {
      await notifyAllAttorneys({
        letterId,
        letterSubject: letter.subject,
        letterType: letter.letterType,
        jurisdiction: letter.jurisdictionState ?? "Unknown",
        appUrl,
      });
    } catch (notifyErr) {
      stripeLogger.error({ err: notifyErr, letterId }, "[StripeWebhook] Failed to notify attorneys");
    }
  }

  stripeLogger.info({ letterId }, `[StripeWebhook] Letter unlocked → pending_review (session: ${sessionId})`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = parseInt(session.metadata?.user_id ?? session.client_reference_id ?? "0", 10);
  const planId = session.metadata?.plan_id ?? "per_letter";

  if (!userId) {
    stripeLogger.warn({}, "[StripeWebhook] checkout.session.completed: no userId in metadata");
    return;
  }

  if (session.mode === "payment") {
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

    const unlockType = session.metadata?.unlock_type;
    const appUrl = session.success_url?.split("/letters")[0] ?? "https://www.talk-to-my-lawyer.com";

    // ─── Standard subscription activation (not a special unlock type) ────────
    if (unlockType !== "first_letter_review" && unlockType !== "revision_consultation") {
      await activateSubscription({
        userId,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? "",
        stripeSubscriptionId: null,
        stripePaymentIntentId: paymentIntentId,
        planId,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
      });
      stripeLogger.info({ userId }, "[StripeWebhook] Per-letter payment activated");
    }

    // ─── Letter unlock: generated_locked → pending_review ────────────────────
    const letterIdStr = session.metadata?.letter_id;
    if (letterIdStr && unlockType === "letter_unlock") {
      const letterId = parseInt(letterIdStr, 10);
      if (!isNaN(letterId)) {
        try {
          await unlockLetterForReview(
            letterId, userId, session.id,
            `Payment received. Letter unlocked and queued for attorney review. Stripe session: ${session.id}`,
            appUrl, true
          );
          // Commission tracking
          const discountCodeStr = session.metadata?.discount_code;
          if (discountCodeStr) {
            await trackCommission({
              discountCodeStr,
              metaEmployeeId: session.metadata?.employee_id ? parseInt(session.metadata.employee_id, 10) : null,
              metaDiscountCodeId: session.metadata?.discount_code_id ? parseInt(session.metadata.discount_code_id, 10) : null,
              paymentIntentId,
              saleAmount: session.amount_total ?? 29900,
              originalPrice: session.metadata?.original_price ? parseInt(session.metadata.original_price, 10) : (session.amount_total ?? 29900),
              subscriberId: userId,
              letterRequestId: letterId,
              appUrl,
              planId,
            }).catch((commErr) => stripeLogger.error({ err: commErr }, "[StripeWebhook] Commission tracking error"));
          }
        } catch (unlockErr) {
          stripeLogger.error({ err: unlockErr, letterId }, "[StripeWebhook] Failed to unlock letter");
        }
      }
    }

    // ─── First Letter Review: $50 attorney review gate ───────────────────────
    if (unlockType === "first_letter_review") {
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
              await setFreeReviewUsed(userId);
              await createNotification({
                userId,
                type: "letter_unlocked",
                title: "Payment confirmed — letter sent for review!",
                body: `Your letter "${flLetter.subject}" is now in the attorney review queue.`,
                link: `/letters/${flLetterId}`,
              });
              const flSubscriber = await getUserById(userId);
              if (flSubscriber?.email) {
                await sendLetterUnlockedEmail({
                  to: flSubscriber.email,
                  name: flSubscriber.name ?? "Subscriber",
                  subject: flLetter.subject,
                  letterId: flLetterId,
                  appUrl,
                }).catch((e) => stripeLogger.error({ err: e }, "[StripeWebhook] Failed to send first-letter unlock email"));
              }
              try {
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
                    ctaUrl: `${appUrl}/admin/letters/${flLetterId}`,
                  },
                });
              } catch (err) {
                stripeLogger.error({ err }, "[notifyAdmins] first_letter_review");
              }
              try {
                await notifyAllAttorneys({
                  letterId: flLetterId,
                  letterSubject: flLetter.subject,
                  letterType: flLetter.letterType,
                  jurisdiction: flLetter.jurisdictionState ?? "Unknown",
                  appUrl,
                });
              } catch (notifyErr) {
                stripeLogger.error({ err: notifyErr, letterId: flLetterId }, "[StripeWebhook] Failed to notify attorneys for first_letter_review");
              }
              stripeLogger.info({ letterId: flLetterId }, "[StripeWebhook] Letter first_letter_review → pending_review via $50 payment");
            } else {
              stripeLogger.warn({ letterId: flLetterId, status: flLetter?.status }, "[StripeWebhook] first_letter_review: letter not in generated_locked");
            }
          } catch (flErr) {
            stripeLogger.error({ err: flErr, letterId: flLetterId }, "[StripeWebhook] Failed to process first_letter_review");
          }
        }
      }
    }

    // ─── Revision Consultation: $20 → client_revision_requested ─────────────
    if (unlockType === "revision_consultation") {
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
              if (revLetter.assignedReviewerId) {
                const attorney = await getUserById(revLetter.assignedReviewerId);
                if (attorney?.email) {
                  await sendClientRevisionRequestEmail({
                    to: attorney.email,
                    name: attorney.name ?? "Attorney",
                    letterSubject: revLetter.subject,
                    letterId: revLetterId,
                    subscriberNotes: revisionNotes,
                    appUrl,
                  }).catch((e) => stripeLogger.error({ err: e }, "[StripeWebhook] Failed to send revision request email"));
                }
                await createNotification({
                  userId: revLetter.assignedReviewerId,
                  type: "client_revision_requested",
                  title: "Client requested revisions (paid)",
                  body: `A subscriber paid for a revision consultation on "${revLetter.subject}". Please review their notes.`,
                  link: `/review/${revLetterId}`,
                });
              }
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
              stripeLogger.info({ letterId: revLetterId }, "[StripeWebhook] Revision consultation executed");
            } else {
              stripeLogger.warn({ letterId: revLetterId, status: revLetter?.status }, "[StripeWebhook] Revision consultation: letter not in client_approval_pending");
            }
          } catch (revErr) {
            stripeLogger.error({ err: revErr, letterId: revLetterId }, "[StripeWebhook] Failed to execute revision consultation");
          }
        }
      }
    }
  }

  // ─── Subscription mode: commission tracking ───────────────────────────────
  if (session.mode === "subscription") {
    const discountCodeStr = session.metadata?.discount_code;
    if (discountCodeStr) {
      const appUrl = session.success_url?.split("/letters")[0] ?? "https://www.talk-to-my-lawyer.com";
      await trackCommission({
        discountCodeStr,
        metaEmployeeId: session.metadata?.employee_id ? parseInt(session.metadata.employee_id, 10) : null,
        metaDiscountCodeId: session.metadata?.discount_code_id ? parseInt(session.metadata.discount_code_id, 10) : null,
        paymentIntentId: typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? undefined,
        saleAmount: session.amount_total ?? 0,
        originalPrice: session.metadata?.original_price ? parseInt(session.metadata.original_price, 10) : (session.amount_total ?? 0),
        subscriberId: userId,
        appUrl,
        planId,
      }).catch((commErr) => stripeLogger.error({ err: commErr }, "[StripeWebhook] Subscription commission tracking error"));
    }
  }
}
