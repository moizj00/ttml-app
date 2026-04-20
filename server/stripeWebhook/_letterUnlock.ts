/**
 * Stripe Webhook — Letter Unlock
 *
 * Shared transition from `generated_locked → pending_review` used by both
 * `letter_unlock` (standard paid unlock) and `first_letter_review` ($50 gate).
 *
 * Steps (in order — each is a separate DB / IO call):
 *   1. guard: skip if letter is not in `generated_locked`
 *   2. updateLetterStatus → pending_review
 *   3. logReviewAction (system, payment_received)
 *   4. createNotification (user, letter_unlocked)
 *   5. sendLetterUnlockedEmail (best-effort)
 *   6. notifyAdmins (category: letters, with email)
 *   7. notifyAllAttorneys (best-effort)
 */

import {
  updateLetterStatus,
  logReviewAction,
  getLetterRequestById,
  getUserById,
  createNotification,
  notifyAdmins,
  notifyAllAttorneys,
} from "../db";
import { sendLetterUnlockedEmail } from "../email";
import { stripeLogger } from "./_helpers";

export interface UnlockLetterForReviewParams {
  letterId: number;
  userId: number;
  sessionId: string;
  noteText: string;
  appUrl: string;
  adminNotifTitle: string;
  adminEmailSubject: string;
  adminEmailBodyHtml: string;
  /** Optional side-effect executed after the transition (e.g. setFreeReviewUsed). */
  afterTransition?: () => Promise<void>;
}

export async function unlockLetterForReview(
  params: UnlockLetterForReviewParams
): Promise<void> {
  const { letterId, userId, sessionId, noteText, appUrl } = params;

  const letter = await getLetterRequestById(letterId);
  if (!letter || letter.status !== "generated_locked") {
    stripeLogger.warn(
      { letterId, status: letter?.status },
      "[StripeWebhook] Letter not in generated_locked — skipping unlock"
    );
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

  if (params.afterTransition) {
    try {
      await params.afterTransition();
    } catch (err) {
      stripeLogger.error({ err, letterId }, "[StripeWebhook] Unlock afterTransition side-effect failed");
    }
  }

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
      title: params.adminNotifTitle,
      body: `Letter "${letter.subject}" has been unlocked and queued for attorney review.`,
      link: `/admin/letters/${letterId}`,
      emailOpts: {
        subject: params.adminEmailSubject,
        preheader: `Letter "${letter.subject}" unlocked after payment`,
        bodyHtml: params.adminEmailBodyHtml,
        ctaText: "View Letter",
        ctaUrl: `${appUrl}/admin/letters/${letterId}`,
      },
    });
  } catch (err) {
    stripeLogger.error({ err }, "[StripeWebhook] notifyAdmins (unlock) failed");
  }

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

  stripeLogger.info({ letterId }, `[StripeWebhook] Letter unlocked → pending_review (session: ${sessionId})`);
}
