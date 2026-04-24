import { describe, it, expect, vi, afterEach } from "vitest";
import {
    isFreePreviewUnlocked,
    getFreePreviewRemainingSeconds,
} from "../shared/utils/free-preview";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Phase 96 — free-preview visibility gate helper", () => {
    it("treats non-free-preview letters as unlocked", () => {
        expect(
            isFreePreviewUnlocked({
                isFreePreview: false,
                freePreviewUnlockAt: null,
            })
        ).toBe(true);
    });

    it("keeps free-preview locked when unlock timestamp is missing", () => {
        expect(
            isFreePreviewUnlocked({
                isFreePreview: true,
                freePreviewUnlockAt: null,
            })
        ).toBe(false);
    });

    it("keeps free-preview locked when unlock timestamp is invalid", () => {
        expect(
            isFreePreviewUnlocked({
                isFreePreview: true,
                freePreviewUnlockAt: "not-a-date",
            })
        ).toBe(false);
    });

    it("keeps free-preview locked before unlock time", () => {
        vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-24T10:00:00.000Z").getTime());

        expect(
            isFreePreviewUnlocked({
                isFreePreview: true,
                freePreviewUnlockAt: "2026-04-24T10:05:00.000Z",
            })
        ).toBe(false);
    });

    it("unlocks free-preview at unlock time and after", () => {
        vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-24T10:00:00.000Z").getTime());

        expect(
            isFreePreviewUnlocked({
                isFreePreview: true,
                freePreviewUnlockAt: "2026-04-24T10:00:00.000Z",
            })
        ).toBe(true);

        expect(
            isFreePreviewUnlocked({
                isFreePreview: true,
                freePreviewUnlockAt: "2026-04-24T09:59:00.000Z",
            })
        ).toBe(true);
    });

    it("returns zero remaining seconds for non-free-preview", () => {
        expect(
            getFreePreviewRemainingSeconds({
                isFreePreview: false,
                freePreviewUnlockAt: null,
            })
        ).toBe(0);
    });

    it("returns default remaining seconds when free-preview unlock is missing or invalid", () => {
        expect(
            getFreePreviewRemainingSeconds({
                isFreePreview: true,
                freePreviewUnlockAt: null,
            })
        ).toBe(24 * 60 * 60);

        expect(
            getFreePreviewRemainingSeconds({
                isFreePreview: true,
                freePreviewUnlockAt: "not-a-date",
            })
        ).toBe(24 * 60 * 60);
    });

    it("returns ceil seconds for future unlock and zero after unlock", () => {
        vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-24T10:00:00.000Z").getTime());

        expect(
            getFreePreviewRemainingSeconds({
                isFreePreview: true,
                freePreviewUnlockAt: "2026-04-24T10:00:03.100Z",
            })
        ).toBe(4);

        expect(
            getFreePreviewRemainingSeconds({
                isFreePreview: true,
                freePreviewUnlockAt: "2026-04-24T09:59:59.000Z",
            })
        ).toBe(0);
    });
});
