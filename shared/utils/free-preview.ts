/**
 * Free-Preview visibility gate — single source of truth.
 *
 * The 24-hour cooling window is a VISIBILITY gate, not a generation gate.
 * The AI draft may be saved to letter_versions at any time (often before the
 * 24h window elapses). Subscriber-facing APIs must not return the full
 * content until `free_preview_unlock_at <= NOW()`.
 *
 * Everywhere that decides "is the free preview unlocked?" must use this
 * helper directly or flow through a DAL method that applies the same rule
 * (e.g. `applyFreePreviewGate` in `server/db/letter-versions.ts`). Do not
 * inline the timestamp math anywhere else — one invariant, one function.
 * SQL-based paths must preserve the same `free_preview_unlock_at <= NOW()`
 * visibility check.
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
