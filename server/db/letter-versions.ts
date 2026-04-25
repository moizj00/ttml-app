import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { captureServerException } from "../sentry";
import { isFreePreviewUnlocked } from "../../shared/utils/free-preview";
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
 * Free-preview visibility gate:
 *   - If `letter.isFreePreview === true`, we call `isFreePreviewUnlocked(letter)`
 *     to decide whether to return the full draft. This is the ONLY place
 *     timestamp math happens for the free-preview path. Do not re-implement
 *     it in the caller.
 *   - Pre-unlock: ai_draft is returned with empty content + `freePreviewWaiting: true`.
 *     The UI renders <FreePreviewWaiting/> instead of any content.
 *   - Post-unlock: ai_draft is returned full, un-redacted, stamped with
 *     `freePreview: true`. The UI renders <FreePreviewViewer/>.
 *
 * Non-free-preview locked letters still receive the ~20% truncated paywall preview.
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

  return applyFreePreviewGate(rows, letterStatus, letter ?? null);
}

/**
 * Letter statuses during which the paid paywall is active — ai_draft is
 * visible to the subscriber but must be truncated. Does NOT control
 * free-preview visibility (that runs whenever `isFreePreview === true`,
 * independent of status — see `applyFreePreviewGate`).
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
 * Pure version of the free-preview / paywall gate — no DB, no IO. Exported
 * for unit tests so the decision branches can be verified directly.
 *
 * The free-preview branch runs whenever `letter.isFreePreview === true`,
 * INDEPENDENT of `letterStatus`. Two reasons:
 *
 *   1. Generation now starts immediately (the 24h window is visibility-only),
 *      so an ai_draft can exist while status is still `drafting` — gating
 *      only on locked statuses would leak draft content early.
 *   2. After payment, status advances past the locked set (`pending_review`,
 *      `under_review`, …) but the subscriber's client still relies on the
 *      server stamping `freePreview: true`. Skipping the gate there would
 *      pin the UI on <FreePreviewWaiting/> indefinitely.
 *
 * `LOCKED_PREVIEW_STATUSES` now controls ONLY the non-free-preview paywall
 * truncation — that path is the only one that needs a status gate.
 *
 *   - Free-preview + unlocked → full draft, `freePreview: true`, un-redacted
 *   - Free-preview + waiting  → empty content, `freePreviewWaiting: true`
 *   - Non-free-preview + locked status → 20% truncated paywall preview
 *   - Non-free-preview + other status  → raw rows
 */
export function applyFreePreviewGate<
  T extends { versionType: string; content?: string | null }
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

  const freePreviewUnlocked = isFreePreview && isFreePreviewUnlocked({
    isFreePreview: letter?.isFreePreview,
    freePreviewUnlockAt: letter?.freePreviewUnlockAt
  });

  if (isFreePreview && !freePreviewUnlocked) {
    return rows.map(v => {
      if (v.versionType === "ai_draft") {
        return {
          ...v,
          content: "",
          truncated: true,
          freePreviewWaiting: true as const,
        };
      }
      return { ...v, truncated: false };
    });
  }

  if (!isFreePreview && !isLockedStatus) {
    return rows.map(v => ({ ...v, truncated: false }));
  }

  return rows.map(v => {
    if (v.versionType === "ai_draft" && v.content) {
      if (isFreePreview) {
        // We already know it's unlocked from the guard above
        return {
          ...v,
          truncated: false,
          freePreview: true as const,
          isRedacted: false,
        };
      }
      return { ...v, content: truncateContent(v.content), truncated: true };
    }
    return { ...v, truncated: false };
  });
}

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
