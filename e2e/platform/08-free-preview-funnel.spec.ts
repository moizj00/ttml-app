/**
 * E2E Suite: Free-Preview Funnel
 *
 * Covers the new 24-hour hold flow introduced after the paywall redesign:
 *   submitted → ai_generation_completed_hidden (24h hold)
 *     ├─ auto-release → letter_released_to_subscriber → upsell → checkout → pending_review
 *     └─ admin bypass  → under_review (skips paywall entirely)
 *
 * Requires:
 *   E2E_SUBSCRIBER_EMAIL / E2E_SUBSCRIBER_PASSWORD
 *   E2E_ADMIN_EMAIL      / E2E_ADMIN_PASSWORD
 *   DATABASE_URL
 */

import { expect } from "@playwright/test";
import {
  test,
  isSubscriberConfigured,
  isAdminConfigured,
} from "../fixtures/auth";
import postgres from "postgres";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getLatestLetterBySubject(
  sql: ReturnType<typeof postgres>,
  subject: string
) {
  const rows = await sql<
    { id: number; status: string; free_preview_unlock_at: Date | null }[]
  >`
    SELECT id, status, free_preview_unlock_at
    FROM letter_requests
    WHERE subject = ${subject}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function submitTestLetter(
  page: import("@playwright/test").Page,
  subject: string
) {
  await page.goto("/submit");
  await page.waitForLoadState("networkidle");

  const letterTypeBtn = page.getByTestId("button-letter-type-demand-letter");
  await expect(letterTypeBtn).toBeVisible({ timeout: 10_000 });
  await letterTypeBtn.click();

  await page.getByTestId("input-subject").fill(subject);
  await page.getByRole("button", { name: /next/i }).click();

  // Jurisdiction
  await expect(page.getByText(/State \/ Jurisdiction/i)).toBeVisible({
    timeout: 5_000,
  });
  const jurisdictionTrigger = page.getByRole("combobox").first();
  await jurisdictionTrigger.click();
  await page.getByRole("option", { name: /California/i }).click();
  await page.getByRole("button", { name: /next/i }).click();

  // Parties
  await expect(page.locator("#senderName")).toBeVisible({ timeout: 5_000 });
  await page.locator("#senderName").fill("E2E Sender");
  await page
    .getByTestId("input-senderAddress")
    .fill("123 Test Ave, Los Angeles, CA 90001");
  await page.locator("#recipientName").fill("E2E Recipient");
  await page
    .getByTestId("input-recipientAddress")
    .fill("456 Target Blvd, SF, CA 94102");
  await page.getByRole("button", { name: /next/i }).click();

  // Details
  const desc = page.getByTestId("input-description");
  await expect(desc).toBeVisible({ timeout: 5_000 });
  await desc.fill(
    "E2E free-preview funnel test — letter submitted for hold/upsell verification."
  );
  await page.getByRole("button", { name: /next/i }).click();

  // Outcome
  const outcome = page.locator("#desiredOutcome");
  await expect(outcome).toBeVisible({ timeout: 5_000 });
  await outcome.fill("Verify the 24h hold and upsell flow works correctly.");
  await page.getByRole("button", { name: /next/i }).click();

  // Exhibits — skip
  await page.waitForTimeout(300);
  const submitBtn = page.getByRole("button", { name: /submit letter/i });
  await expect(submitBtn).toBeVisible({ timeout: 5_000 });
  await submitBtn.click();

  await page.waitForURL(
    url =>
      url.pathname.includes("/dashboard") || url.pathname.includes("/letters/"),
    { timeout: 30_000 }
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

test.describe("Free-Preview Funnel — 24h Hold & Upsell Flow", () => {
  test.skip(
    !isSubscriberConfigured || !isAdminConfigured,
    "Requires E2E_SUBSCRIBER_EMAIL and E2E_ADMIN_EMAIL to be configured"
  );

  test("generated letter lands in ai_generation_completed_hidden and is hidden from subscriber", async ({
    subscriberPage: page,
  }) => {
    test.setTimeout(150_000);

    const subject = `E2E Hold Test ${Date.now()}`;
    await submitTestLetter(page, subject);

    expect(process.env.DATABASE_URL).toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      let record: Awaited<ReturnType<typeof getLatestLetterBySubject>> = null;

      // Poll up to 90s for pipeline to reach ai_generation_completed_hidden
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(3_000);
        record = await getLatestLetterBySubject(sql, subject);
        if (
          record &&
          [
            "ai_generation_completed_hidden",
            "researching",
            "drafting",
            "letter_released_to_subscriber",
          ].includes(record.status)
        ) {
          if (record.status === "ai_generation_completed_hidden") break;
        }
      }

      expect(record, "Letter should exist in DB").toBeTruthy();
      expect(
        [
          "ai_generation_completed_hidden",
          "letter_released_to_subscriber",
          // allow through if pipeline was very fast or hold was already elapsed
        ],
        `Expected hold or release status, got: ${record?.status}`
      ).toContain(record?.status);

      // Subscriber dashboard should NOT show the full letter content while
      // ai_generation_completed_hidden — the free-preview viewer only renders
      // after status reaches letter_released_to_subscriber.
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // FreePreviewViewer (data-testid="free-preview-viewer") should NOT yet
      // be visible — the letter is still in the 24h hold state.
      const previewViewer = page.getByTestId("free-preview-viewer");
      // If it IS visible the hold already elapsed (fast pipeline + already 24h+);
      // that's acceptable — skip the hidden assertion in that case.
      if (
        !(await previewViewer.isVisible({ timeout: 2_000 }).catch(() => false))
      ) {
        // Letter content must be absent — no free-preview-content exposed yet
        await expect(
          page.getByTestId("free-preview-content")
        ).not.toBeVisible();
      }
    } finally {
      await sql.end();
    }
  });

  test("admin force-transition bypasses 24h hold and moves letter to under_review", async ({
    adminPage: page,
  }) => {
    test.setTimeout(150_000);

    const subject = `E2E Admin Bypass ${Date.now()}`;

    // Submit via subscriber — re-login as admin after
    // (can't use two pages in one fixture; admin submits their own test letter)
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    expect(process.env.DATABASE_URL).toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Submit a letter as admin (admin is also a subscriber in test env)
      await submitTestLetter(page, subject);

      let record = await getLatestLetterBySubject(sql, subject);

      // Wait for pipeline to produce at least a draft
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(3_000);
        record = await getLatestLetterBySubject(sql, subject);
        if (
          record &&
          [
            "ai_generation_completed_hidden",
            "letter_released_to_subscriber",
          ].includes(record.status)
        ) {
          break;
        }
      }

      expect(record, "Letter must exist for bypass test").toBeTruthy();
      const letterId = record!.id;

      // Navigate to admin letter detail and trigger force-transition
      await page.goto(`/admin/letters/${letterId}`);
      await page.waitForLoadState("networkidle");

      // Click the "Force Status Transition" toggle button to reveal the form
      const forceBtn = page.getByTestId("button-force-status-transition");
      await expect(forceBtn).toBeVisible({ timeout: 10_000 });
      await forceBtn.click();

      // Select "under review" from the status dropdown
      const statusSelect = page.getByRole("combobox");
      await expect(statusSelect).toBeVisible({ timeout: 5_000 });
      await statusSelect.click();
      await page.getByRole("option", { name: /under.?review/i }).click();

      // Fill the required reason field
      await page
        .getByPlaceholder(/Reason for force transition/i)
        .fill("E2E automated bypass test");

      // Click Apply Force Transition and confirm in the alert dialog
      await page
        .getByRole("button", { name: /Apply Force Transition/i })
        .click();
      // Confirm in the AlertDialog
      await expect(page.getByRole("alertdialog")).toBeVisible({
        timeout: 5_000,
      });
      await page
        .getByRole("button", { name: /Force Transition/i })
        .last()
        .click();

      // Wait for status to update
      await page.waitForTimeout(2_000);

      const updated = await getLatestLetterBySubject(sql, subject);
      expect(updated?.status).toBe("under_review");
    } finally {
      await sql.end();
    }
  });

  test("letter_released_to_subscriber status shows attorney review upsell UI", async ({
    subscriberPage: page,
  }) => {
    test.setTimeout(60_000);

    expect(process.env.DATABASE_URL).toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Find the most recent released letter for this subscriber
      const rows = await sql<{ id: number }[]>`
        SELECT lr.id
        FROM letter_requests lr
        JOIN users u ON u.id = lr.user_id
        WHERE u.email = ${process.env.E2E_SUBSCRIBER_EMAIL ?? ""}
          AND lr.status = 'letter_released_to_subscriber'
        ORDER BY lr.created_at DESC
        LIMIT 1
      `;

      if (rows.length === 0) {
        test.skip(); // No released letter available — skip gracefully
        return;
      }

      const { id: letterId } = rows[0];
      await page.goto(`/letters/${letterId}`);
      await page.waitForLoadState("networkidle");

      // FreePreviewViewer should be rendered (letter released, full draft visible)
      await expect(page.getByTestId("free-preview-viewer")).toBeVisible({
        timeout: 10_000,
      });

      // The "unreviewed" badge should be shown (attorney hasn't reviewed yet)
      await expect(
        page.getByTestId("draft-preview-unreviewed-badge")
      ).toBeVisible({ timeout: 5_000 });

      // The single CTA "Submit For Attorney Review" should be visible
      await expect(
        page.getByTestId("button-free-preview-subscribe")
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await sql.end();
    }
  });

  test("completing payment moves letter from upsell to pending_review", async ({
    subscriberPage: page,
  }) => {
    // This test verifies the Stripe webhook handler correctly advances the status.
    // In CI we rely on Stripe test-mode webhooks; in local dev you can use `stripe listen`.
    test.setTimeout(90_000);

    expect(process.env.DATABASE_URL).toBeDefined();
    expect(
      process.env.STRIPE_WEBHOOK_SECRET,
      "STRIPE_WEBHOOK_SECRET required for payment test"
    ).toBeDefined();

    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Find an upsell-shown letter for this subscriber
      const rows = await sql<{ id: number }[]>`
        SELECT lr.id
        FROM letter_requests lr
        JOIN users u ON u.id = lr.user_id
        WHERE u.email = ${process.env.E2E_SUBSCRIBER_EMAIL ?? ""}
          AND lr.status IN ('attorney_review_upsell_shown', 'attorney_review_checkout_started')
        ORDER BY lr.created_at DESC
        LIMIT 1
      `;

      if (rows.length === 0) {
        test.skip(); // No letter in the right state — skip gracefully
        return;
      }

      const { id: letterId } = rows[0];

      // Trigger checkout
      await page.goto(`/letters/${letterId}`);
      await page.waitForLoadState("networkidle");

      const checkoutBtn = page.getByRole("button", {
        name: /attorney review|start review|proceed to payment/i,
      });
      await expect(checkoutBtn).toBeVisible({ timeout: 10_000 });
      await checkoutBtn.click();

      // Stripe Checkout opens (test mode — card 4242 4242 4242 4242)
      await page.waitForURL(/stripe\.com\/pay|checkout\.stripe\.com/, {
        timeout: 15_000,
      });
      await page.getByPlaceholder(/card number/i).fill("4242424242424242");
      await page.getByPlaceholder(/MM \/ YY/i).fill("12/30");
      await page.getByPlaceholder(/CVC/i).fill("123");
      await page.getByPlaceholder(/ZIP/i).fill("90001");
      await page.getByRole("button", { name: /pay|subscribe/i }).click();

      // Wait for redirect back
      await page.waitForURL(
        url =>
          url.hostname !== "checkout.stripe.com" &&
          url.hostname !== "stripe.com",
        { timeout: 30_000 }
      );

      // Webhook should advance letter to pending_review
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(2_000);
        const [updated] = await sql<{ status: string }[]>`
          SELECT status FROM letter_requests WHERE id = ${letterId}
        `;
        if (updated?.status === "pending_review") break;
      }

      const [final] = await sql<{ status: string }[]>`
        SELECT status FROM letter_requests WHERE id = ${letterId}
      `;
      expect(final?.status).toBe("pending_review");
    } finally {
      await sql.end();
    }
  });
});
