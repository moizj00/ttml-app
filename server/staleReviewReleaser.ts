/**
 * Stale Review Releaser
 *
 * Detects letters that have been in `under_review` status for more than
 * STALE_THRESHOLD_HOURS (48h) and automatically releases them back to
 * `pending_review`, clearing the assigned reviewer.
 *
 * Triggered by the cron scheduler every hour.
 */

import { getAllLetterRequests, updateLetterStatus, logReviewAction, getUserById, createNotification } from "./db";
import { sendStatusUpdateEmail } from "./email";
import { captureServerException } from "./sentry";
import { createLogger } from "./logger";

const staleLogger = createLogger({ module: "StaleReview" });

const STALE_THRESHOLD_HOURS = 48;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

export interface StaleReleaseResult {
  released: number;
  errors: number;
}

export async function releaseStaleReviews(): Promise<StaleReleaseResult> {
  let released = 0;
  let errors = 0;

  const underReviewLetters = await getAllLetterRequests({ status: "under_review" });

  const now = Date.now();

  for (const letter of underReviewLetters) {
    try {
      const lastChanged = letter.lastStatusChangedAt
        ? new Date(letter.lastStatusChangedAt).getTime()
        : new Date(letter.updatedAt ?? letter.createdAt).getTime();

      const idleMs = now - lastChanged;
      if (idleMs < STALE_THRESHOLD_MS) continue;

      const idleHours = Math.round(idleMs / (1000 * 60 * 60));
      staleLogger.info({ letterId: letter.id, idleHours }, "[StaleReview] Letter has been under_review — releasing back to queue");

      await updateLetterStatus(letter.id, "pending_review", {
        assignedReviewerId: null,
        force: true,
      });

      await logReviewAction({
        letterRequestId: letter.id,
        actorType: "admin",
        action: "auto_released_stale_review",
        noteText: `Letter auto-released after ${idleHours}h of idle under_review status (threshold: ${STALE_THRESHOLD_HOURS}h)`,
        noteVisibility: "internal",
        fromStatus: "under_review",
        toStatus: "pending_review",
      });

      // Notify the previously assigned attorney
      if (letter.assignedReviewerId) {
        try {
          const attorney = await getUserById(letter.assignedReviewerId);
          if (attorney?.email) {
            await sendStatusUpdateEmail({
              to: attorney.email,
              name: attorney.name ?? "Attorney",
              subject: letter.subject,
              letterId: letter.id,
              newStatus: "pending_review",
              appUrl: process.env.APP_URL ?? "",
            });
          }
        } catch (notifyErr) {
          staleLogger.error({ err: notifyErr, letterId: letter.id }, "[StaleReview] Failed to notify attorney");
          captureServerException(notifyErr, { tags: { component: "stale_review", error_type: "attorney_notify_failed" } });
        }
      }

      // Notify the subscriber (in-app + email)
      try {
        const subscriber = letter.userId ? await getUserById(letter.userId) : null;
        if (subscriber && letter.userId) {
          await createNotification({
            userId: letter.userId,
            type: "letter_review_reset",
            title: "Your letter is back in the review queue",
            body: `Your letter "${letter.subject}" has been returned to the review queue and will be assigned to a new attorney shortly.`,
            link: `/letters/${letter.id}`,
          });
          if (subscriber.email) {
            await sendStatusUpdateEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: letter.id,
              newStatus: "pending_review",
              appUrl: process.env.APP_URL ?? "",
            });
          }
        }
      } catch (notifyErr) {
        staleLogger.error({ err: notifyErr, letterId: letter.id }, "[StaleReview] Failed to notify subscriber");
        captureServerException(notifyErr, { tags: { component: "stale_review", error_type: "subscriber_notify_failed" } });
      }

      released++;
    } catch (err) {
      staleLogger.error({ err, letterId: letter.id }, "[StaleReview] Failed to release letter");
      captureServerException(err, { tags: { component: "stale_review", error_type: "release_failed" }, extra: { letterId: letter.id } });
      errors++;
    }
  }

  return { released, errors };
}
