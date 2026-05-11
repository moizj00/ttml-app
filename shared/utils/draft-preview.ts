export const DEFAULT_DRAFT_PREVIEW_WINDOW_SECONDS = 24 * 60 * 60;

export type DraftPreviewGateInput = {
  /** True only for first-time/free-trial users. Does not control the 24h gate. */
  isFreeTrialPreview?: boolean | null | undefined;
  /** Backward-compatible DB field used as the generic draft visibility timestamp. */
  draftVisibleAt: Date | string | null | undefined;
};

/** Returns true once the server-side 24h draft visibility window has elapsed. */
export function isDraftPreviewUnlocked(gate: DraftPreviewGateInput): boolean {
  if (!gate.draftVisibleAt) return true;

  const visibleAt = new Date(gate.draftVisibleAt).getTime();
  if (Number.isNaN(visibleAt)) return false;
  return visibleAt <= Date.now();
}

/** Returns whole seconds remaining before draft visibility opens. */
export function getDraftPreviewRemainingSeconds(
  gate: DraftPreviewGateInput
): number {
  if (!gate.draftVisibleAt) return 0;

  const visibleAt = new Date(gate.draftVisibleAt).getTime();
  if (Number.isNaN(visibleAt)) return DEFAULT_DRAFT_PREVIEW_WINDOW_SECONDS;

  return Math.max(0, Math.ceil((visibleAt - Date.now()) / 1000));
}
