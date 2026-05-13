import {
  getLetterRequestById,
  hasLetterBeenPreviouslyUnlocked,
  updateLetterStatus,
} from "../db";

export type DraftPreviewFinalStatus =
  | "ai_generation_completed_hidden"
  | "generated_locked";

export function resolveDraftPreviewFinalStatus(
  isDraftVisibilityGated?: boolean | null
): DraftPreviewFinalStatus {
  // Gated subscriber drafts, whether free-trial or paid subscription, must be
  // hidden until the 24h draft reveal timestamp. Non-gated legacy/admin flows can
  // still land in the normal paywall-ready state.
  return isDraftVisibilityGated ? "ai_generation_completed_hidden" : "generated_locked";
}

export async function isLetterPreviewGated(letterId: number): Promise<boolean> {
  const letter = await getLetterRequestById(letterId);
  if (!letter || letter.submittedByAdmin === true || !letter.freePreviewUnlockAt) {
    return false;
  }
  return !(await hasLetterBeenPreviouslyUnlocked(letterId));
}

export async function finalizeDraftPreviewStatus(
  letterId: number,
  isDraftVisibilityGated?: boolean | null,
  options?: { force?: boolean }
): Promise<DraftPreviewFinalStatus> {
  const finalStatus = resolveDraftPreviewFinalStatus(isDraftVisibilityGated);
  await updateLetterStatus(
    letterId,
    finalStatus,
    options?.force ? { force: true } : undefined
  );
  return finalStatus;
}
