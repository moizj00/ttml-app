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

export async function getLetterVersionsByRequestId(
  letterRequestId: number,
  includeInternal = false,
  letterStatus?: string,
  /**
   * When true, the ai_draft is returned un-truncated even if the letter is in
   * `generated_locked`. This is the free-preview lead-magnet path — the caller
   * (subscriber router) sets this once the 24h cooling-off window has elapsed
   * (letter.isFreePreview AND letter.freePreviewUnlockAt <= NOW()).
   * The UI is responsible for rendering the content non-selectable with a
   * DRAFT watermark (see client/src/components/FreePreviewViewer.tsx).
   */
  freePreviewUnlocked = false,
  /**
   * When true AND `freePreviewUnlocked` is false, the ai_draft is returned with
   * empty content + `freePreviewWaiting: true`. Prevents leaking even the
   * truncated 20% slice to free-preview subscribers during the 24h cooling
   * window — the UI renders <FreePreviewWaiting/> instead of the paywall.
   */
  isFreePreview = false
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

  if (letterStatus === "generated_locked") {
    return rows.map((v) => {
      if (v.versionType === "ai_draft" && v.content) {
        // Free-preview lead-magnet override: return the full draft, stamped
        // with `freePreview: true` so the frontend can route to the
        // FreePreviewViewer (un-redacted + watermark) instead of the paywall.
        if (freePreviewUnlocked) {
          return { ...v, truncated: false, freePreview: true as const };
        }
        // Pre-unlock free-preview: do NOT leak even the 20% slice. The UI
        // shows <FreePreviewWaiting/> based on the `freePreviewWaiting` flag.
        if (isFreePreview) {
          return { ...v, content: "", truncated: true, freePreviewWaiting: true as const };
        }
        return { ...v, content: truncateContent(v.content), truncated: true };
      }
      return { ...v, truncated: false };
    });
  }
  return rows.map((v) => ({ ...v, truncated: false }));
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

