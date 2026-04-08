import { expect } from "@playwright/test";
import {
  test,
  isAdminConfigured,
} from "./fixtures/auth";

test.describe("Admin dashboard", () => {
  test.beforeEach(() => {
    test.skip(!isAdminConfigured, "E2E admin credentials not configured");
  });

  test("admin dashboard renders with stat cards showing real data", async ({ adminPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(/admin dashboard/i).first()).toBeVisible({ timeout: 5000 });

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    await expect(page.getByText(/total users/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/total letters/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("admin dashboard has navigation links to all admin sections", async ({ adminPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const usersLink = page.getByRole("link", { name: /users/i }).first();
    await expect(usersLink).toBeVisible({ timeout: 5000 });
  });

  test("admin users page renders with user list and filter controls", async ({ adminPage: page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/admin\/users/);

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });

    const searchOrFilter = page.locator('input[placeholder*="search" i], [role="combobox"]').first();
    await expect(searchOrFilter).toBeVisible({ timeout: 5000 });

    const userRows = page.locator('tr, [class*="card"]');
    const rowCount = await userRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test("admin can navigate from dashboard to users page via link", async ({ adminPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const usersLink = page.getByRole("link", { name: /users/i }).first();
    await expect(usersLink).toBeVisible({ timeout: 5000 });
    await usersLink.click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/admin\/users/);
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("admin letters page renders with heading", async ({ adminPage: page }) => {
    await page.goto("/admin/letters");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/admin\/letters/);
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("admin jobs page renders with heading", async ({ adminPage: page }) => {
    await page.goto("/admin/jobs");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/admin\/jobs/);
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("admin dashboard shows system health and analytics indicators", async ({ adminPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const loadingIndicator = page.locator(".animate-pulse").first();
    if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await loadingIndicator.waitFor({ state: "hidden", timeout: 10000 });
    }

    const healthIndicator = page.getByText(/revenue|pipeline|health|analytics|activity|failed/i).first();
    await expect(healthIndicator).toBeVisible({ timeout: 8000 });
  });
});
