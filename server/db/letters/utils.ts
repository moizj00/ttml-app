import { and, eq, inArray, ne, or, sql, notInArray } from "drizzle-orm";
import {
  letterRequests,
  reviewActions,
  clientPortalTokens,
} from "../../../drizzle/schema";
import type { LetterStatus } from "../../../drizzle/schema/constants";
import { getDb } from "../core";

const NON_COMPLETED_LETTER_STATUSES: LetterStatus[] = [
  "submitted",
  "researching",
  "drafting",
  "ai_generation_completed_hidden",
  "letter_released_to_subscriber",
  "attorney_review_upsell_shown",
  "attorney_review_checkout_started",
  "attorney_review_payment_confirmed",
  "generated_locked",
  "pipeline_failed",
];

export async function countCompletedLetters(
  userId: number,
  excludeLetterId?: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [
    eq(letterRequests.userId, userId),
    sql`${letterRequests.status} NOT IN (${sql.join(
      NON_COMPLETED_LETTER_STATUSES.map(s => sql`${s}`),
      sql`, `
    )})`,
  ];
  if (excludeLetterId) {
    conditions.push(ne(letterRequests.id, excludeLetterId));
  }
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests)
    .where(and(...conditions));
  return Number(result[0]?.count ?? 0);
}

export async function isUserFirstLetterEligible(
  userId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const unlockedLetters = await db
    .select({ id: letterRequests.id })
    .from(letterRequests)
    .where(
      and(
        eq(letterRequests.userId, userId),
        notInArray(letterRequests.status, NON_COMPLETED_LETTER_STATUSES)
      )
    )
    .limit(1);
  return unlockedLetters.length === 0;
}

export async function hasLetterBeenPreviouslyUnlocked(
  letterId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: reviewActions.id })
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.letterRequestId, letterId),
        or(
          inArray(reviewActions.action, ["payment_received", "free_unlock"]),
          inArray(reviewActions.toStatus, [
            "pending_review",
            "under_review",
            "approved",
            "needs_changes",
          ] as any)
        )
      )
    )
    .limit(1);
  return result.length > 0;
}

/**
 * Create a single-use portal token for the letter recipient.
 */
export async function createClientPortalToken(
  letterRequestId: number,
  opts: { recipientEmail?: string; recipientName?: string }
): Promise<string> {
  const { nanoid } = await import("nanoid");
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const token = nanoid(64);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.insert(clientPortalTokens).values({
    letterRequestId,
    token,
    recipientEmail: opts.recipientEmail ?? null,
    recipientName: opts.recipientName ?? null,
    expiresAt,
  });
  return token;
}

/**
 * Look up a portal token. Returns null if not found or expired.
 */
export async function redeemClientPortalToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(clientPortalTokens)
    .where(eq(clientPortalTokens.token, token))
    .limit(1);
  const record = rows[0];
  if (!record) return null;
  if (new Date() > record.expiresAt) return null;
  if (!record.viewedAt) {
    await db
      .update(clientPortalTokens)
      .set({ viewedAt: new Date() })
      .where(eq(clientPortalTokens.id, record.id));
  }
  return record;
}
