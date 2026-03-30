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

// ═══════════════════════════════════════════════════════
// REVIEW ACTION HELPERS (AUDIT TRAIL)
// ═══════════════════════════════════════════════════════

export async function logReviewAction(data: {
  letterRequestId: number;
  reviewerId?: number;
  actorType: "system" | "subscriber" | "employee" | "attorney" | "admin";
  action: string;
  noteText?: string;
  noteVisibility?: "internal" | "user_visible";
  fromStatus?: string;
  toStatus?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reviewActions).values({
    letterRequestId: data.letterRequestId,
    reviewerId: data.reviewerId,
    actorType: data.actorType,
    action: data.action,
    noteText: data.noteText,
    noteVisibility: data.noteVisibility ?? "internal",
    fromStatus: data.fromStatus,
    toStatus: data.toStatus,
  });
}

export async function getReviewActions(
  letterRequestId: number,
  includeInternal = false
) {
  const db = await getDb();
  if (!db) return [];
  if (includeInternal) {
    return db
      .select()
      .from(reviewActions)
      .where(eq(reviewActions.letterRequestId, letterRequestId))
      .orderBy(desc(reviewActions.createdAt));
  }
  // Subscriber-safe: only return user_visible notes
  return db
    .select()
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.letterRequestId, letterRequestId),
        eq(reviewActions.noteVisibility, "user_visible")
      )
    )
    .orderBy(desc(reviewActions.createdAt));
}

