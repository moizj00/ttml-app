import { expect } from "@playwright/test";
import {
  test,
  isAttorneyConfigured,
} from "./fixtures/auth";

test.describe("Attorney review flow", () => {
  test.beforeEach(() => {
    test.skip(!isAttorneyConfigured, "E2E attorney credentials not configured");
  });

  test("attorney dashboard renders with heading and navigation", async ({ attorneyPage: page }) => {
    await page.goto("/attorney");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/attorney/);
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("review queue page renders with search and status filter", async ({ attorneyPage: page }) => {
    await page.goto("/attorney/queue");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/attorney\/queue/);
    await expect(page.getByText(/review queue|letter review/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("select-status-filter")).toBeVisible({ timeout: 5000 });
  });

  test("review queue shows letter cards or empty state", async ({ attorneyPage: page }) => {
    await page.goto("/attorney/queue");
    await page.waitForLoadState("networkidle");

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const letterCard = page.locator('[data-testid^="card-letter-"]').first();
    const emptyState = page.getByText(/no letters|queue is empty|nothing to review/i).first();

    const hasLetters = await letterCard.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLetters || hasEmptyState).toBe(true);
  });

  test("review queue search filters results deterministically", async ({ attorneyPage: page }) => {
    await page.goto("/attorney/queue");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByTestId("input-search");
    await expect(searchInput).toBeVisible();

    const cardsBefore = await page.locator('[data-testid^="card-letter-"]').count();

    await searchInput.fill("zzz_nonexistent_query_xyz_12345");
    await page.waitForTimeout(500);

    const cardsAfter = await page.locator('[data-testid^="card-letter-"]').count();

    if (cardsBefore > 0) {
      expect(cardsAfter).toBeLessThan(cardsBefore);
    } else {
      expect(cardsAfter).toBe(0);
    }

    await searchInput.clear();
    await page.waitForTimeout(500);
    const cardsRestored = await page.locator('[data-testid^="card-letter-"]').count();
    expect(cardsRestored).toBe(cardsBefore);
  });

  test("clicking a letter card in queue opens review detail panel", async ({ attorneyPage: page }) => {
    await page.goto("/attorney/queue");
    await page.waitForLoadState("networkidle");

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const letterCard = page.locator('[data-testid^="card-letter-"]').first();
    const hasLetters = await letterCard.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasLetters) {
      test.skip(true, "No letters in queue to test — need seeded test data");
      return;
    }

    await letterCard.click();
    await page.waitForTimeout(500);

    const claimButton = page.getByTestId("button-claim");
    const editorArea = page.getByTestId("editor-letter-view");
    const editorEdit = page.getByTestId("editor-letter-edit");
    const reviewTabs = page.getByTestId("tabs-review-panel");

    const hasClaimButton = await claimButton.isVisible({ timeout: 5000 }).catch(() => false);
    const hasViewEditor = await editorArea.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEditEditor = await editorEdit.isVisible({ timeout: 3000 }).catch(() => false);
    const hasTabs = await reviewTabs.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasClaimButton || hasViewEditor || hasEditEditor || hasTabs).toBe(true);
  });

  test("attorney can claim a letter and see editor controls", async ({ attorneyPage: page }) => {
    await page.goto("/attorney/queue");
    await page.waitForLoadState("networkidle");

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const letterCard = page.locator('[data-testid^="card-letter-"]').first();
    const hasLetters = await letterCard.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasLetters) {
      test.skip(true, "No letters in queue to claim — need seeded test data");
      return;
    }

    await letterCard.click();
    await page.waitForTimeout(500);

    const claimButton = page.getByTestId("button-claim");
    const hasClaim = await claimButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasClaim) {
      const editDraftButton = page.getByTestId("button-edit-draft");
      const hasEditDraft = await editDraftButton.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasEditDraft).toBe(true);
      return;
    }

    await claimButton.click();

    const editorArea = page.locator(".ProseMirror, [contenteditable='true']").first();
    const editDraftButton = page.getByTestId("button-edit-draft");
    const releaseButton = page.getByTestId("button-release");

    const hasEditor = await editorArea.isVisible({ timeout: 8000 }).catch(() => false);
    const hasEditDraft = await editDraftButton.isVisible({ timeout: 5000 }).catch(() => false);
    const hasRelease = await releaseButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasEditor || hasEditDraft || hasRelease).toBe(true);
  });

  test("review detail for nonexistent letter shows error", async ({ attorneyPage: page }) => {
    await page.goto("/attorney/review/999999999");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/not found|error|invalid|don't have access/i).first()
    ).toBeVisible({ timeout: 8000 });
  });
});
