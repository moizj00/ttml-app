const DEFAULT_FREE_PREVIEW_WINDOW_SECONDS = 24 * 60 * 60;

type FreePreviewGateInput = {
    isFreePreview: boolean | null | undefined;
    freePreviewUnlockAt: Date | string | null | undefined;
};

export function isFreePreviewUnlocked(letter: FreePreviewGateInput): boolean {
    if (letter.isFreePreview !== true) return true;
    if (!letter.freePreviewUnlockAt) return false;

    const unlockTime = new Date(letter.freePreviewUnlockAt).getTime();
    if (Number.isNaN(unlockTime)) return false;
    return unlockTime <= Date.now();
}

export function getFreePreviewRemainingSeconds(
    letter: FreePreviewGateInput
): number {
    if (letter.isFreePreview !== true) return 0;
    if (!letter.freePreviewUnlockAt) return DEFAULT_FREE_PREVIEW_WINDOW_SECONDS;

    const unlockTime = new Date(letter.freePreviewUnlockAt).getTime();
    if (Number.isNaN(unlockTime)) return DEFAULT_FREE_PREVIEW_WINDOW_SECONDS;

    return Math.max(0, Math.ceil((unlockTime - Date.now()) / 1000));
}
