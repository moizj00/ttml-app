/**
 * Billing Service — encapsulates business logic for Stripe checkout fulfillment
 * and plan management.
 *
 * This service takes complex webhook logic scattered across various files
 * and centralizes it to improve auditability and reuse.
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
import { logger } from "../logger";

export interface FulfillmentUnlockParams {
    letterId: number;
    userId: number;
    sessionId: string;
    source: "direct_unlock" | "first_letter_offer";
    appUrl: string;
    noteText?: string;
}

/**
 * Fulfills a letter unlock event (standard payment or first-letter offer).
 * Centralizes the transition from generated_locked -> pending_review.
 */
export async function fulfillLetterUnlock(params: FulfillmentUnlockParams) {
    const { letterId, userId, sessionId, source, appUrl } = params;
    const noteText = params.noteText || `Payment received (${source}). Letter unlocked for review. Session: ${sessionId}`;

    const letter = await getLetterRequestById(letterId);
    if (!letter) throw new Error(`Letter #${letterId} not found`);

    // Guard: idempotent check
    if (letter.status !== "generated_locked") {
        logger.info({ letterId, status: letter.status }, "[BillingService] Letter already past generated_locked — skip");
        return;
    }

    // 1. Update status
    await updateLetterStatus(letterId, "pending_review");

    // 2. Audit trail
    await logReviewAction({
        letterRequestId: letterId,
        actorType: "system",
        action: "payment_received",
        noteText,
        noteVisibility: "user_visible",
        fromStatus: "generated_locked",
        toStatus: "pending_review",
    });

    // 3. User notification
    await createNotification({
        userId,
        type: "letter_unlocked",
        title: "Payment confirmed — letter sent for review!",
        body: `Your letter "${letter.subject}" is now in the attorney review queue.`,
        link: `/letters/${letterId}`,
    });

    // 4. Send email to subscriber
    const subscriber = await getUserById(userId);
    if (subscriber?.email) {
        await sendLetterUnlockedEmail({
            to: subscriber.email,
            name: subscriber.name ?? "Subscriber",
            subject: letter.subject,
            letterId,
            appUrl,
        }).catch(err => logger.error({ err }, "[BillingService] Failed to send subscriber email"));
    }

    // 5. Admin & Attorney notifications
    const adminTitle = source === "first_letter_offer"
        ? `First Letter Offer applied — letter #${letterId}`
        : `Payment received — letter #${letterId} unlocked`;

    await notifyAdmins({
        category: "letters",
        type: "payment_received",
        title: adminTitle,
        body: `Letter "${letter.subject}" has been unlocked and queued for attorney review.`,
        link: `/admin/letters/${letterId}`,
    }).catch(err => logger.error({ err }, "[BillingService] notifyAdmins failed"));

    await notifyAllAttorneys({
        title: "New letter needs review",
        body: `Letter #${letterId} ("${letter.subject}") is ready for review.`,
        link: `/attorney/review/${letterId}`,
    }).catch(err => logger.error({ err }, "[BillingService] notifyAllAttorneys failed"));
}
