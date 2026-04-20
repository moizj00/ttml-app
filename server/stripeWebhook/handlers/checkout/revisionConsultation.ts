/**
 * checkout.session.completed — `unlock_type = "revision_consultation"` ($20)
 *
 * Transitions the letter to `client_revision_requested` (allowed from
 * client_approval_pending, approved, client_approved, sent). Emails the
 * assigned attorney and notifies admins.
 */

import Stripe from "stripe";
import type { ParsedCheckoutMetadata } from "../../_metadata";
import {
  updateLetterStatus,
  logReviewAction,
  getLetterRequestById,
  getUserById,
  createNotification,
  notifyAdmins,
} from "../../../db";
import { sendClientRevisionRequestEmail } from "../../../email";
import { stripeLogger } from "../../_helpers";

const ALLOWED_REVISION_FROM_STATUSES = [
  "client_approval_pending",
  "approved",
  "client_approved",
  "sent",
];

export async function handleRevisionConsultation(
  _session: Stripe.Checkout.Session,
  meta: ParsedCheckoutMetadata
): Promise<void> {
  if (meta.letterId === null) return;
  const revisionNotes = meta.revisionNotes ?? "(no notes provided)";

  try {
    const letter = await getLetterRequestById(meta.letterId);
    if (!letter || !ALLOWED_REVISION_FROM_STATUSES.includes(letter.status)) {
      stripeLogger.warn(
        { letterId: meta.letterId, status: letter?.status },
        "[StripeWebhook] Revision consultation: letter not in an allowed revision status"
      );
      return;
    }

    await updateLetterStatus(meta.letterId, "client_revision_requested");
    await logReviewAction({
      letterRequestId: meta.letterId,
      reviewerId: meta.userId,
      actorType: "subscriber",
      action: "client_revision_requested",
      noteText: revisionNotes,
      noteVisibility: "user_visible",
      fromStatus: letter.status,
      toStatus: "client_revision_requested",
    });

    if (letter.assignedReviewerId) {
      const attorney = await getUserById(letter.assignedReviewerId);
      if (attorney?.email) {
        await sendClientRevisionRequestEmail({
          to: attorney.email,
          name: attorney.name ?? "Attorney",
          letterSubject: letter.subject,
          letterId: meta.letterId,
          subscriberNotes: revisionNotes,
          appUrl: meta.appUrl,
        }).catch((e) =>
          stripeLogger.error({ err: e }, "[StripeWebhook] Failed to send revision request email")
        );
      }
      await createNotification({
        userId: letter.assignedReviewerId,
        type: "client_revision_requested",
        title: "Client requested revisions (paid)",
        body: `A subscriber paid for a revision consultation on "${letter.subject}". Please review their notes.`,
        link: `/review/${meta.letterId}`,
      });
    }

    await createNotification({
      userId: meta.userId,
      type: "revision_payment_confirmed",
      title: "Revision consultation confirmed",
      body: `Your $20 revision consultation for "${letter.subject}" has been confirmed. The attorney will review your notes shortly.`,
      link: `/letters/${meta.letterId}`,
    });

    await notifyAdmins({
      category: "letters",
      type: "client_revision_requested",
      title: `Paid revision consultation — letter #${meta.letterId}`,
      body: `A subscriber paid $20 for a revision consultation on "${letter.subject}".`,
      link: `/admin/letters/${meta.letterId}`,
    });

    stripeLogger.info({ letterId: meta.letterId }, "[StripeWebhook] Revision consultation executed");
  } catch (revErr) {
    stripeLogger.error({ err: revErr, letterId: meta.letterId }, "[StripeWebhook] Failed to execute revision consultation");
  }
}
