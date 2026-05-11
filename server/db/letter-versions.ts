import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { captureServerException } from "../sentry";
import { isDraftPreviewUnlocked } from "../../shared/utils/draft-preview";
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
import type {
  InsertUser,
  InsertPipelineLesson,
  InsertLetterQualityScore,
} from "../../drizzle/schema";
import { getDb } from "./core";

// ═══════════════════════════════════════════════════════
// LETTER VERSION HELPERS
// ═══════════════════════════════════════════════════════

export async function createLetterVersion(data: {
  letterRequestId: number;
  versionType: "ai_draft" | "attorney_edit" | "final_approved";
  content: string;
  createdByType: "system" | "subscriber" | "employee" | "attorney" | "admin";
  createdByUserId?: number;
  metadataJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(letterVersions)
    .values({
      letterRequestId: data.letterRequestId,
      versionType: data.versionType,
      content: data.content,
      createdByType: data.createdByType,
      createdByUserId: data.createdByUserId,
      metadataJson: data.metadataJson as any,
    })
    .returning({ insertId: letterVersions.id });
  return result[0];
}

/**
 * Return the versions visible to a subscriber for a given letter.
 *
 * Draft-preview visibility gate:
 *   - freePreviewUnlockAt is the persisted draftVisibleAt timestamp.
 *   - Pre-unlock: ai_draft is returned with empty content + draftPreviewWaiting.
 *   - Post-unlock: ai_draft is returned full, un-redacted, stamped with draftPreview.
 *
 * isFreePreview remains only as a monetization flag: free-trial users must
 * subscribe before attorney review; active subscribers can submit directly.
 */
export async function getLetterVersionsByRequestId(
  letterRequestId: number,
  includeInternal = false,
  letterStatus?: string,
  letter?: {
    isFreePreview?: boolean | null;
    freePreviewUnlockAt?: Date | string | null;
  } | null
) {
  const db = await getDb();
  if (!db) return [];
  if (includeInternal) {
    return db
      .select()
      .from(letterVersions)
      .where(eq(letterVersions.letterRequestId, letterRequestId))
      .orderBy(desc(letterVersions.createdAt));
  }
  // Subscriber-safe: return final_approved + ai_draft (for generated_locked preview)
  const rows = await db
    .select()
    .from(letterVersions)
    .where(
      and(
        eq(letterVersions.letterRequestId, letterRequestId),
        inArray(letterVersions.versionType, ["final_approved", "ai_draft"])
      )
    )
    .orderBy(desc(letterVersions.createdAt));

  return applyDraftPreviewGate(rows, letterStatus, letter ?? null);
}

/**
 * Letter statuses during which legacy locked previews are active. The generic
 * 24h draft-preview gate is timestamp-based and handled by applyDraftPreviewGate.
 *
 * Exported so router-level access checks (e.g. versions.get) can refuse
 * ai_draft requests for statuses outside the locked band AND outside the
 * free-preview path.
 */
export const LOCKED_PREVIEW_STATUSES = new Set([
  "generated_locked",
  "ai_generation_completed_hidden",
  "letter_released_to_subscriber",
  "attorney_review_upsell_shown",
]);

/**
 * Pure draft-preview / legacy-paywall gate — no DB, no IO.
 *
 *   - Draft-gated + unlocked → full draft, draftPreview=true, un-redacted
 *   - Draft-gated + waiting  → empty content, draftPreviewWaiting=true
 *   - Legacy locked status   → truncated preview
 *   - Other status           → raw rows
 */
export function applyDraftPreviewGate<
  T extends { versionType: string; content?: string | null },
>(
  rows: T[],
  letterStatus: string | undefined,
  letter: {
    isFreePreview?: boolean | null;
    freePreviewUnlockAt?: Date | string | null;
  } | null
): Array<T & Record<string, any>> {
  const isFreePreview = letter?.isFreePreview === true;
  const isLockedStatus =
    !!letterStatus && LOCKED_PREVIEW_STATUSES.has(letterStatus);
  const isDraftVisibilityGated = Boolean(letter?.freePreviewUnlockAt);
  const draftPreviewUnlocked = isDraftPreviewUnlocked({
    isFreeTrialPreview: letter?.isFreePreview,
    draftVisibleAt: letter?.freePreviewUnlockAt,
  });

  // 24h gate applies to both first-letter/free-preview users and paid subscribers.
  if (isDraftVisibilityGated && !draftPreviewUnlocked) {
    return rows.map(v => {
      if (v.versionType === "ai_draft") {
        return {
          ...v,
          content: "",
          truncated: true,
          draftPreviewWaiting: true as const,
          freePreviewWaiting: isFreePreview ? (true as const) : undefined,
        };
      }
      return { ...v, truncated: false };
    });
  }

  if (isDraftVisibilityGated && draftPreviewUnlocked) {
    return rows.map(v => {
      if (v.versionType === "ai_draft" && v.content) {
        return {
          ...v,
          truncated: false,
          draftPreview: true as const,
          freePreview: isFreePreview ? (true as const) : undefined,
          isRedacted: false,
        };
      }
      return { ...v, truncated: false };
    });
  }

  if (!isLockedStatus) {
    return rows.map(v => ({ ...v, truncated: false }));
  }

  return rows.map(v => {
    if (v.versionType === "ai_draft" && v.content) {
      return { ...v, content: truncateContent(v.content), truncated: true };
    }
    return { ...v, truncated: false };
  });
}

// Backward-compatible alias for tests/legacy imports. New code should use
// applyDraftPreviewGate.
export const applyFreePreviewGate = applyDraftPreviewGate;

function truncateContent(content: string): string {
  const lines = content.split("\n");
  const visibleCount = Math.max(5, Math.floor(lines.length * 0.2));
  return lines.slice(0, visibleCount).join("\n");
}

export async function getLetterVersionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(letterVersions)
    .where(eq(letterVersions.id, id))
    .limit(1);
  return result[0];
}
