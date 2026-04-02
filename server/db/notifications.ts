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
          console.error(`[notifyAdmins] Email to ${admin.email} failed:`, err)
        );
      }
    }
  } catch (err) {
    console.error("[notifyAdmins] Failed:", err);
    captureServerException(err, { tags: { component: "notifications", error_type: "notify_admins_failed" } });
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

