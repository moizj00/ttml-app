import {
  getLetterRequestById,
  hasLetterBeenPreviouslyUnlocked,
  updateLetterStatus,
} from "../db";

export type DraftPreviewFinalStatus =
  | "ai_generation_completed_hidden"
  | "generated_locked";

export function resolveDraftPreviewFinalStatus(
  isPreviewGated?: boolean | null
): DraftPreviewFinalStatus {
  // v2.1: every pipeline now lands in the new attorney-review funnel
  // (ai_generation_completed_hidden -> letter_released_to_subscriber -> ...).
  // The legacy generated_locked path is preserved behind PAYWALL_LEGACY=true
  // and only fires for non-preview-gated letters (free-preview always uses
  // the new funnel, which is what the dispatcher dispatcher expects).
  if (isPreviewGated) return "ai_generation_completed_hidden";
  const useLegacyPaywall = process.env.PAYWALL_LEGACY === "true";
  return useLegacyPaywall ? "generated_locked" : "ai_generation_completed_hidden";
}

export async function isLetterPreviewGated(letterId: number): Promise<boolean> {
  const letter = await getLetterRequestById(letterId);
  if (
    !letter ||
    letter.isFreePreview !== true ||
    letter.submittedByAdmin === true
  ) {
    return false;
  }
  return !(await hasLetterBeenPreviouslyUnlocked(letterId));
}

export async function finalizeDraftPreviewStatus(
  letterId: number,
  isPreviewGated?: boolean | null,
  options?: { force?: boolean }
): Promise<DraftPreviewFinalStatus> {
  const finalStatus = resolveDraftPreviewFinalStatus(isPreviewGated);
  await updateLetterStatus(
    letterId,
    finalStatus,
    options?.force ? { force: true } : undefined
  );
  return finalStatus;
}
