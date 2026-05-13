import {
  DEFAULT_DRAFT_PREVIEW_WINDOW_SECONDS,
  getDraftPreviewRemainingSeconds,
  isDraftPreviewUnlocked,
} from "./draft-preview";

export const DEFAULT_FREE_PREVIEW_WINDOW_SECONDS =
  DEFAULT_DRAFT_PREVIEW_WINDOW_SECONDS;

type FreePreviewGateInput = {
  isFreePreview: boolean | null | undefined;
  freePreviewUnlockAt: Date | string | null | undefined;
};

/**
 * Backward-compatible alias. Prefer isDraftPreviewUnlocked() for new code.
 * Historical DB field freePreviewUnlockAt is now the generic draftVisibleAt.
 */
export function isFreePreviewUnlocked(letter: FreePreviewGateInput): boolean {
  return isDraftPreviewUnlocked({
    isFreeTrialPreview: letter.isFreePreview,
    draftVisibleAt: letter.freePreviewUnlockAt,
  });
}

/** Backward-compatible alias. Prefer getDraftPreviewRemainingSeconds(). */
export function getFreePreviewRemainingSeconds(
  letter: FreePreviewGateInput
): number {
  return getDraftPreviewRemainingSeconds({
    isFreeTrialPreview: letter.isFreePreview,
    draftVisibleAt: letter.freePreviewUnlockAt,
  });
}
