import { test, expect } from "@playwright/test";
import {
  test as authTest,
  SUBSCRIBER_EMAIL,
  SUBSCRIBER_PASSWORD,
  isSubscriberConfigured,
} from "./fixtures/auth";

test.describe("Auth flow", () => {
  test.describe("Signup page", () => {
    test("renders the signup form with all required fields", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(/create account/i).first()).toBeVisible();
      await expect(page.getByTestId("input-email")).toBeVisible();
      await expect(page.getByTestId("input-password")).toBeVisible();
      await expect(page.getByTestId("input-confirm-password")).toBeVisible();
      await expect(page.getByTestId("button-signup")).toBeVisible();
      await expect(page.getByTestId("button-google-signup")).toBeVisible();
    });

    test("shows validation error for mismatched passwords", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("input-name").fill("Test User");
      await page.getByTestId("input-email").fill("newuser@example.com");
      await page.getByTestId("input-password").fill("Password123!");
      await page.getByTestId("input-confirm-password").fill("DifferentPassword!");

      await page.getByTestId("button-signup").click();

      await expect(page.getByText(/password.*match|do not match/i).first()).toBeVisible({ timeout: 5000 });
    });

    test("disables submit button when password is too short", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("input-email").fill("newuser@example.com");
      await page.getByTestId("input-password").fill("weak");
      await page.getByTestId("input-confirm-password").fill("weak");

      await expect(page.getByTestId("button-signup")).toBeDisabled();

      await page.getByTestId("input-password").fill("StrongPassword123!");
      await page.getByTestId("input-confirm-password").fill("StrongPassword123!");

      await expect(page.getByTestId("button-signup")).toBeEnabled();
    });

    test("has a link to the login page that navigates correctly", async ({ page }) => {
      await page.goto("/signup");
      await page.waitForLoadState("networkidle");

      const loginLink = page.getByTestId("link-login");
      await expect(loginLink).toBeVisible();
      await loginLink.click();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("Login page", () => {
    test("renders the login form with email and password fields", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await expect(page.getByTestId("input-email")).toBeVisible();
      await expect(page.getByTestId("input-password")).toBeVisible();
      await expect(page.getByTestId("button-login")).toBeVisible();
      await expect(page.getByTestId("button-google-login")).toBeVisible();
      await expect(page.getByTestId("link-forgot-password")).toBeVisible();
      await expect(page.getByTestId("link-signup")).toBeVisible();
    });

    test("shows an error for invalid credentials", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("input-email").fill("nobody@nowhere.com");
      await page.getByTestId("input-password").fill("wrongpassword");
      await page.getByTestId("button-login").click();

      await expect(page.getByText(/invalid|incorrect|failed|check your credentials/i).first()).toBeVisible({ timeout: 10000 });
    });

    test("shows HTML5 validation when email field is empty and form is submitted", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("button-login").click();
      const emailInput = page.getByTestId("input-email");
      const validationMessage = await emailInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage
      );
      expect(validationMessage).toBeTruthy();
    });

    test("can toggle password visibility", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      const passwordInput = page.getByTestId("input-password");
      const toggleButton = page.getByTestId("button-toggle-password");

      await expect(passwordInput).toHaveAttribute("type", "password");
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute("type", "text");
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute("type", "password");
    });

    test("has a link to the signup page that navigates correctly", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await page.getByTestId("link-signup").click();
      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe("Protected route redirect", () => {
    test("redirects unauthenticated users from /dashboard to /login", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/(login|signup)/);
    });

    test("redirects unauthenticated users from /letters to /login", async ({ page }) => {
      await page.goto("/letters");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/(login|signup)/);
    });

    test("redirects unauthenticated users from /submit to /login", async ({ page }) => {
      await page.goto("/submit");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/(login|signup)/);
    });

    test("redirects unauthenticated users from /attorney/queue to /login", async ({ page }) => {
      await page.goto("/attorney/queue");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/(login|signup)/);
    });

    test("redirects unauthenticated users from /admin to /login", async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/(login|signup)/);
    });
  });

});

authTest.describe("Authenticated auth flow", () => {
  authTest.beforeEach(() => {
    authTest.skip(!isSubscriberConfigured, "E2E subscriber credentials not configured");
  });

  authTest("subscriber fixture logs in and reaches the dashboard", async ({ subscriberPage: page }) => {
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  authTest("subscriber can log out after login", async ({ subscriberPage: page }) => {
    const logoutButton = page.getByRole("button", { name: /log\s*out|sign\s*out/i }).first();
    const logoutLink = page.getByRole("link", { name: /log\s*out|sign\s*out/i }).first();
    const menuButton = page.getByRole("button", { name: /menu|profile|avatar/i }).first();

    if (await menuButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuButton.click();
    }

    const logoutEl = (await logoutButton.isVisible({ timeout: 3000 }).catch(() => false))
      ? logoutButton
      : logoutLink;

    await logoutEl.click();
    await page.waitForURL(/\/(login|$)/, { timeout: 10000 });
  });
});
