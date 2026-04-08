import { test as base, type Page } from "@playwright/test";

export const SUBSCRIBER_EMAIL =
  process.env.E2E_SUBSCRIBER_EMAIL || "test.subscriber@e2e.ttml.test";
export const SUBSCRIBER_PASSWORD =
  process.env.E2E_SUBSCRIBER_PASSWORD || "TestSubscriber123!";

export const ATTORNEY_EMAIL =
  process.env.E2E_ATTORNEY_EMAIL || "test.attorney@e2e.ttml.test";
export const ATTORNEY_PASSWORD =
  process.env.E2E_ATTORNEY_PASSWORD || "TestAttorney123!";

export const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL || "test.admin@e2e.ttml.test";
export const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || "TestAdmin123!";

export function isCredentialConfigured(email: string, defaultEmail: string): boolean {
  return email !== defaultEmail && email.length > 0;
}

export const isSubscriberConfigured = isCredentialConfigured(SUBSCRIBER_EMAIL, "test.subscriber@e2e.ttml.test");
export const isAttorneyConfigured = isCredentialConfigured(ATTORNEY_EMAIL, "test.attorney@e2e.ttml.test");
export const isAdminConfigured = isCredentialConfigured(ADMIN_EMAIL, "test.admin@e2e.ttml.test");

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
}

type AuthFixtures = {
  subscriberPage: Page;
  attorneyPage: Page;
  adminPage: Page;
};

export const test = base.extend<AuthFixtures>({
  subscriberPage: async ({ page }, use) => {
    await loginAs(page, SUBSCRIBER_EMAIL, SUBSCRIBER_PASSWORD);
    await use(page);
  },
  attorneyPage: async ({ page }, use) => {
    await loginAs(page, ATTORNEY_EMAIL, ATTORNEY_PASSWORD);
    await use(page);
  },
  adminPage: async ({ page }, use) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await use(page);
  },
});
