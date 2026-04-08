import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { captureServerException } from "../sentry";
import {
  adminVerificationCodes,
  attachments,
  blogPosts,
  commissionLedger,
  discountCodes,
  emailVerificationTokens,
  letterRequests,
  letterVersions,
  letterQualityScores,
  notifications,
  payoutRequests,
  pipelineLessons,
  researchRuns,
  reviewActions,
  subscriptions,
  users,
  workflowJobs,
} from "../../drizzle/schema";
import type { InsertUser, InsertPipelineLesson, InsertLetterQualityScore } from "../../drizzle/schema";
import { getDb } from "./core";
import { getAllUsers } from "./users";
import { logger } from "../logger";

// ═══════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════

export async function createNotification(data: {
  userId: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  category?: string;
  metadataJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(notifications).values({
    userId: data.userId,
    type: data.type,
    category: data.category ?? "general",
    title: data.title,
    body: data.body,
    link: data.link,
    metadataJson: data.metadataJson as any,
  });
}

export type NotificationCategory = "users" | "letters" | "employee" | "general";

export async function notifyAdmins(opts: {
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  link?: string;
  emailOpts?: {
    subject: string;
    preheader: string;
    bodyHtml: string;
    ctaText?: string;
    ctaUrl?: string;
  };
}) {
  try {
    const admins = await getAllUsers("admin");
    for (const admin of admins) {
      await createNotification({
        userId: admin.id,
        type: opts.type,
        category: opts.category,
        title: opts.title,
        body: opts.body,
        link: opts.link,
      });
      if (opts.emailOpts && admin.email) {
        const { sendAdminAlertEmail } = await import("../email");
        await sendAdminAlertEmail({
          to: admin.email,
          name: admin.name ?? "Admin",
          ...opts.emailOpts,
        }).catch((err: unknown) =>
          logger.error({ err: err }, `[notifyAdmins] Email to ${admin.email} failed:`)
        );
      }
    }
  } catch (err) {
    logger.error({ err: err }, "[notifyAdmins] Failed:");
    captureServerException(err, { tags: { component: "notifications", error_type: "notify_admins_failed" } });
  }
}

/**
 * Centralized helper — notify every attorney about a new letter entering the review queue.
 * Sends both an email and an in-app notification to each attorney.
 * Used by: pipeline orchestrator, Stripe webhook, billing (free unlock + subscription submit).
 */
export async function notifyAllAttorneys(opts: {
  letterId: number;
  letterSubject: string;
  letterType: string;
  jurisdiction: string;
  appUrl: string;
}) {
  try {
    const { sendNewReviewNeededEmail } = await import("../email");
    const attorneys = await getAllUsers("attorney");
    logger.info(`[notifyAllAttorneys] Notifying ${attorneys.length} attorney(s) for letter #${opts.letterId}`);
    for (const attorney of attorneys) {
      // Email: attempt independently — failure does not block in-app notification
      if (attorney.email) {
        try {
          await sendNewReviewNeededEmail({
            to: attorney.email,
            name: attorney.name ?? "Attorney",
            letterSubject: opts.letterSubject,
            letterId: opts.letterId,
            letterType: opts.letterType,
            jurisdiction: opts.jurisdiction,
            appUrl: opts.appUrl,
          });
        } catch (emailErr) {
          logger.error({ err: emailErr }, `[notifyAllAttorneys] Email failed for attorney #${attorney.id}:`);
          captureServerException(emailErr, { tags: { component: "notifications", error_type: "notify_attorney_email_failed" } });
        }
      }
      // In-app notification: always attempted, even if email failed
      try {
        await createNotification({
          userId: attorney.id,
          type: "new_review_needed",
          category: "letters",
          title: "New letter ready for review",
          body: `"${opts.letterSubject}" has been queued for attorney review.`,
          link: `/attorney/queue`,
        });
      } catch (notifErr) {
        logger.error({ err: notifErr }, `[notifyAllAttorneys] In-app notification failed for attorney #${attorney.id}:`);
        captureServerException(notifErr, { tags: { component: "notifications", error_type: "notify_attorney_inapp_failed" } });
      }
    }
  } catch (err) {
    logger.error({ err: err }, "[notifyAllAttorneys] Failed:");
    captureServerException(err, { tags: { component: "notifications", error_type: "notify_all_attorneys_failed" } });
  }
}

export async function getNotificationsByUserId(
  userId: number,
  unreadOnly = false
) {
  const db = await getDb();
  if (!db) return [];
  if (unreadOnly) {
    return db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt))
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

