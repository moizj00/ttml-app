import { expect } from "@playwright/test";
import {
  test,
  isSubscriberConfigured,
} from "./fixtures/auth";

test.describe("Subscriber dashboard & letter status tracking", () => {
  test.beforeEach(() => {
    test.skip(!isSubscriberConfigured, "E2E subscriber credentials not configured");
  });

  test("subscriber dashboard renders with welcome content and navigation", async ({ subscriberPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/dashboard/);
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });

    const myLettersLink = page.getByRole("link", { name: /my letters|letters/i }).first();
    await expect(myLettersLink).toBeVisible({ timeout: 5000 });

    const submitLink = page.getByRole("link", { name: /submit|new letter|draft/i }).first();
    await expect(submitLink).toBeVisible({ timeout: 5000 });
  });

  test("My Letters page renders with search and filter controls", async ({ subscriberPage: page }) => {
    await page.goto("/letters");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/letters/);
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill("test search");
    await page.waitForTimeout(300);
    await searchInput.clear();

    const statusFilter = page.getByRole("combobox").first();
    await expect(statusFilter).toBeVisible({ timeout: 5000 });
  });

  test("My Letters page shows letter cards or empty state message", async ({ subscriberPage: page }) => {
    await page.goto("/letters");
    await page.waitForLoadState("networkidle");

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const letterCard = page.locator('[class*="card"]').first();
    const emptyState = page.getByText(/no letters|haven't submitted|submit your first/i).first();

    const hasLetters = await letterCard.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLetters || hasEmptyState).toBe(true);
  });

  test("letter detail for invalid ID (0) shows invalid error", async ({ subscriberPage: page }) => {
    await page.goto("/letters/0");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/invalid letter/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("letter detail for nonexistent ID shows not found", async ({ subscriberPage: page }) => {
    await page.goto("/letters/999999999");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/not found|doesn't exist|don't have access/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("letter status badges render on the My Letters page", async ({ subscriberPage: page }) => {
    await page.goto("/letters");
    await page.waitForLoadState("networkidle");

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const letterCard = page.locator('[class*="card"]').first();
    const hasLetters = await letterCard.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasLetters) {
      test.skip(true, "No letters exist to verify badges — need seeded test data");
      return;
    }

    const statusBadges = page.locator('[data-testid*="status"], [class*="badge"]');
    const badgeCount = await statusBadges.count();
    expect(badgeCount).toBeGreaterThan(0);
    await expect(statusBadges.first()).toBeVisible();
  });
});
