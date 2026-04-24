/**
 * Free-Preview visibility gate — single source of truth.
 *
 * The 24-hour cooling window is a VISIBILITY gate, not a generation gate.
 * The AI draft may be saved to letter_versions at any time (often before the
 * 24h window elapses). Subscriber-facing APIs must not return the full
 * content until `free_preview_unlock_at <= NOW()`.
 *
 * Everywhere that decides "is the free preview unlocked?" must call this
 * helper. Do not inline the timestamp math anywhere else — one invariant,
 * one function.
 *
 * Called from:
 *   - server/db/letter-versions.ts (getLetterVersionsByRequestId)
 *   - server/routers/letters/subscriber.ts (detail query)
 *   - server/routers/versions.ts (single-version get)
 *   - server/draftPdfRoute.ts (PDF streaming gate)
 *   - server/freePreviewEmailCron.ts implicitly via the SQL filter
 */
export function isFreePreviewUnlocked(letter: {
  isFreePreview?: boolean | null;
  freePreviewUnlockAt?: Date | string | null;
}): boolean {
  if (letter.isFreePreview !== true) return false;
  if (!letter.freePreviewUnlockAt) return false;
  const unlockAt =
    letter.freePreviewUnlockAt instanceof Date
      ? letter.freePreviewUnlockAt
      : new Date(letter.freePreviewUnlockAt);
  if (Number.isNaN(unlockAt.getTime())) return false;
  return unlockAt.getTime() <= Date.now();
}
