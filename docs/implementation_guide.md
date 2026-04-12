# Implementation Guide: Timed Email Notification and Paywall System

> **Last updated:** April 12, 2026  
> **Status:** Canonical — paywall email system implementation reference

## Overview

This guide provides step-by-step implementation instructions for integrating a timed email notification system (10-15 minutes post-generation) with the existing paywall mechanism in the TTML platform. The implementation leverages existing infrastructure while introducing minimal new components.

## Phase 1: Database Schema Updates

### Step 1.1: Add `initialPaywallEmailSentAt` Column

Update `drizzle/schema.ts` to add a new timestamp column to the `letterRequests` table:

```typescript
export const letterRequests = pgTable("letter_requests", {
  // ... existing columns ...
  initialPaywallEmailSentAt: timestamp("initial_paywall_email_sent_at"),
  // ... rest of columns ...
});
```

This column will track when the initial timed paywall email has been sent, ensuring idempotency.

### Step 1.2: Create Drizzle Migration

Create a new migration file in `drizzle/migrations/` to add the column:

```sql
ALTER TABLE letter_requests ADD COLUMN initial_paywall_email_sent_at TIMESTAMP;
```

## Phase 2: Email Template Creation

### Step 2.1: Add New Email Function in `server/email.ts`

Create a new email function specifically for the timed paywall notification. This function should be distinct from the existing `sendLetterReadyEmail` and `sendDraftReminderEmail`:

```typescript
/**
 * Send timed paywall notification email (10-15 min after draft generation)
 * Informs subscriber that their letter is ready and behind a paywall
 */
export async function sendPaywallNotificationEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "paywall_notification", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const letterTypeLabel = opts.letterType
    ? opts.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = opts.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>`
    : "";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news! Your legal letter draft is ready for review.</p>
    
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;font-weight:700;">📋 Your Draft is Ready</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>

    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">What happens next?</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔒</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Your draft is behind a secure paywall</strong> — only you can access it
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Submit for attorney review</strong> — a licensed attorney will review, edit, and approve your letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📄</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">
          <strong>Download your PDF</strong> — once approved, get a professional PDF ready to send
        </td>
      </tr>
    </table>

    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1D4ED8;">
          <strong>Attorney review — $200 one-time payment or subscribe for unlimited letters.</strong>
        </p>
      </td></tr>
    </table>
  `;

  const html = buildEmailHtml({
    preheader: `Your letter draft is ready — view and unlock for attorney review`,
    title: "Your Letter Draft is Ready! 🎉",
    body,
    ctaText: "View & Unlock Your Letter",
    ctaUrl: ctaUrl,
    accentColor: "#2563EB",
  });

  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Your letter is ready — view and unlock for attorney review`,
    html,
    text: buildPlainText({
      title: "Your Letter Draft is Ready!",
      body: `Hello ${opts.name},\n\nYour legal letter draft is ready for review. View your draft and submit it for attorney review at the link below.\n\nLetter: "${opts.subject}"\nLetter ID: #${opts.letterId}\n\nYour draft is behind a secure paywall. Attorney review costs $200 one-time or you can subscribe for unlimited letters.`,
      ctaText: "View & Unlock Your Letter",
      ctaUrl: ctaUrl,
    }),
  });
}
```

## Phase 3: Cron Job Implementation

### Step 3.1: Create New Cron Handler in `server/paywall-email-cron.ts`

Create a new file to handle the timed paywall email sending:

```typescript
/**
 * Paywall Email Cron Handler
 *
 * Queries all letter_requests that:
 *   - Have status = 'generated_locked' (draft ready, not yet paid)
 *   - Were last updated 10-15 minutes ago (configurable)
 *   - Have initial_paywall_email_sent_at IS NULL (email not yet sent)
 *
 * For each matching letter, sends sendPaywallNotificationEmail to the subscriber
 * and stamps initial_paywall_email_sent_at to prevent duplicate sends.
 */

import { eq, and, isNull, lt, gte } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { letterRequests } from "../drizzle/schema";
import { getUserById } from "./db";
import { sendPaywallNotificationEmail } from "./email";

// Configuration (in minutes)
export const PAYWALL_EMAIL_MIN_DELAY_MINUTES = 10;
export const PAYWALL_EMAIL_MAX_DELAY_MINUTES = 15;

function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
}

export interface PaywallEmailResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    letterId: number;
    status: "sent" | "skipped" | "error";
    reason?: string;
  }>;
}

export async function processPaywallEmails(): Promise<PaywallEmailResult> {
  const result: PaywallEmailResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const db = await getDb();
  if (!db) {
    console.warn("[PaywallEmails] Database not available — skipping");
    return result;
  }

  // Calculate time window: 10-15 minutes ago
  const minThresholdDate = new Date(
    Date.now() - PAYWALL_EMAIL_MAX_DELAY_MINUTES * 60 * 1000
  );
  const maxThresholdDate = new Date(
    Date.now() - PAYWALL_EMAIL_MIN_DELAY_MINUTES * 60 * 1000
  );

  // Query: generated_locked letters in the 10-15 min window with no email sent yet
  const eligibleLetters = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        eq(letterRequests.status, "generated_locked"),
        isNull(letterRequests.initialPaywallEmailSentAt),
        gte(letterRequests.lastStatusChangedAt, minThresholdDate),
        lt(letterRequests.lastStatusChangedAt, maxThresholdDate)
      )
    );

  console.log(
    `[PaywallEmails] Found ${eligibleLetters.length} eligible letters for paywall email`
  );
  result.processed = eligibleLetters.length;

  const appBaseUrl = getAppBaseUrl();

  for (const letter of eligibleLetters) {
    try {
      if (letter.userId == null) {
        result.skipped++;
        result.details.push({
          letterId: letter.id,
          status: "skipped",
          reason: "no user associated",
        });
        continue;
      }

      const subscriber = await getUserById(letter.userId);

      if (!subscriber?.email) {
        result.skipped++;
        result.details.push({
          letterId: letter.id,
          status: "skipped",
          reason: "no subscriber email",
        });
        continue;
      }

      // Send the paywall notification email
      await sendPaywallNotificationEmail({
        to: subscriber.email,
        name: subscriber.name ?? "Subscriber",
        subject: letter.subject,
        letterId: letter.id,
        appUrl: appBaseUrl,
        letterType: letter.letterType ?? undefined,
        jurisdictionState: letter.jurisdictionState ?? undefined,
      });

      // Stamp the email timestamp to prevent re-sending
      await db
        .update(letterRequests)
        .set({ initialPaywallEmailSentAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(letterRequests.id, letter.id));

      result.sent++;
      result.details.push({ letterId: letter.id, status: "sent" });
      console.log(
        `[PaywallEmails] Paywall email sent for letter #${letter.id} to ${subscriber.email}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors++;
      result.details.push({
        letterId: letter.id,
        status: "error",
        reason: msg,
      });
      console.error(
        `[PaywallEmails] Failed to send paywall email for letter #${letter.id}:`,
        msg
      );
    }
  }

  console.log(
    `[PaywallEmails] Done — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
  );
  return result;
}

export function registerPaywallEmailRoute(app: Express): void {
  app.post("/api/cron/paywall-emails", async (req: Request, res: Response) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers["authorization"] ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (token !== cronSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    try {
      const result = await processPaywallEmails();
      return res.json({ success: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PaywallEmails] Cron handler error:", msg);
      return res.status(500).json({ error: msg });
    }
  });

  console.log("[PaywallEmails] Route registered: POST /api/cron/paywall-emails");
}
```

### Step 3.2: Update `server/cronScheduler.ts`

Integrate the new paywall email cron job into the scheduler:

```typescript
import { processPaywallEmails } from "./paywall-email-cron";

// In the startCronScheduler function, add:
schedule.scheduleJob("*/15 * * * *", async () => {
  try {
    console.log("[Cron] Running paywall email processor...");
    const result = await processPaywallEmails();
    console.log(`[Cron] Paywall emails: sent=${result.sent}, skipped=${result.skipped}, errors=${result.errors}`);
  } catch (err) {
    console.error("[Cron] Paywall email processor failed:", err);
  }
});
```

This schedules the paywall email processor to run every 15 minutes.

### Step 3.3: Register Route in `server/_core/index.ts`

Add the route registration to the Express app setup:

```typescript
import { registerPaywallEmailRoute } from "../paywall-email-cron";

// In the app setup:
registerPaywallEmailRoute(app);
```

## Phase 4: Pipeline Integration

### Step 4.1: Update `server/n8nCallback.ts`

Modify the n8n callback handler to NOT immediately send the draft-ready email. Instead, rely on the cron job:

```typescript
// Around line 360-403, replace the sendLetterReadyEmail logic with:
if (!assemblyHandledEmails) {
  const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
  if (!wasAlreadyUnlocked) {
    // Do NOT send email immediately; let the cron job handle it
    console.log(
      `[n8n Callback] Paywall email will be sent by cron job for letter #${letterId}`
    );
  } else {
    console.log(
      `[n8n Callback] Skipping paywall email for #${letterId} — previously unlocked`
    );
  }

  try {
    await autoAdvanceIfPreviouslyUnlocked(letterId);
  } catch (autoUnlockErr) {
    console.error(
      `[n8n Callback] Auto-unlock check failed for #${letterId}:`,
      autoUnlockErr
    );
  }
}
```

### Step 4.2: Update `server/pipeline/vetting.ts`

Similarly, update the `finalizeLetterAfterVetting` function to not immediately send the draft-ready email:

```typescript
// Around line 941-977, replace the sendLetterReadyEmail logic with:
const letterRecord = await getLetterById(letterId);
const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
if (!wasAlreadyUnlocked) {
  // Do NOT send email immediately; let the cron job handle it
  console.log(
    `[Pipeline] Paywall email will be sent by cron job for letter #${letterId}`
  );
} else {
  console.log(
    `[Pipeline] Skipping paywall email for #${letterId} — previously unlocked`
  );
}
```

## Phase 5: Testing

### Step 5.1: Manual Testing

1.  Submit a letter and monitor the pipeline completion.
2.  Verify that the letter reaches `generated_locked` status.
3.  Wait 10-15 minutes (or manually trigger the cron endpoint for testing).
4.  Verify that the subscriber receives the paywall notification email.
5.  Click the email link and verify the `LetterPaywall` component displays correctly.
6.  Test both free unlock (if eligible) and paid unlock paths.

### Step 5.2: Automated Testing

Create a test file `server/paywall-email-cron.test.ts` to verify:

- The cron job correctly identifies eligible letters.
- The email is sent only once per letter.
- The `initialPaywallEmailSentAt` timestamp is correctly set.
- Errors are handled gracefully.

## Phase 6: Deployment

1.  Run the Drizzle migration to add the new column.
2.  Deploy the updated code to production.
3.  Monitor the cron job execution via logs.
4.  Verify email delivery and user engagement metrics.

## Conclusion

This implementation provides a seamless timed email notification system that guides users toward payment or subscription while maintaining the existing paywall and unlock mechanisms. The 10-15 minute delay allows the user time to receive and read the email, creating a natural call-to-action without being too aggressive.
