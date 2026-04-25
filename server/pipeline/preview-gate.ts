import { getLetterRequestById, updateLetterStatus } from "../db";

export type DraftPreviewFinalStatus =
  | "ai_generation_completed_hidden"
  | "generated_locked";

export function resolveDraftPreviewFinalStatus(
  isPreviewGated?: boolean | null
): DraftPreviewFinalStatus {
  return isPreviewGated ? "ai_generation_completed_hidden" : "generated_locked";
}

export async function isLetterPreviewGated(letterId: number): Promise<boolean> {
  const letter = await getLetterRequestById(letterId);
  return letter?.isFreePreview === true && letter.submittedByAdmin !== true;
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
