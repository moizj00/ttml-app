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

const LOCKED_PREVIEW_STATUSES = new Set([
  "generated_locked",
  "ai_generation_completed_hidden",
  "letter_released_to_subscriber",
  "attorney_review_upsell_shown",
]);

/**
 * Pure version of the free-preview / paywall gate — no DB, no IO. Exported
 * for unit tests so the three decision branches can be verified directly.
 *
 *   - Free-preview + unlocked → full draft, `freePreview: true`, un-redacted
 *   - Free-preview + waiting  → empty content, `freePreviewWaiting: true`
 *   - Non-free-preview locked → 20% truncated paywall preview
 *   - Non-locked status       → raw rows (only final_approved should reach here)
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
  if (!letterStatus || !LOCKED_PREVIEW_STATUSES.has(letterStatus)) {
    return rows.map(v => ({ ...v, truncated: false }));
  }

  const isFreePreview = letter?.isFreePreview === true;
  const freePreviewUnlocked = isFreePreview && isFreePreviewUnlocked(letter!);

  return rows.map(v => {
    if (v.versionType === "ai_draft" && v.content) {
      if (isFreePreview) {
        if (freePreviewUnlocked) {
          return {
            ...v,
            truncated: false,
            freePreview: true as const,
            isRedacted: false,
          };
        }
        return {
          ...v,
          content: "",
          truncated: true,
          freePreviewWaiting: true as const,
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
