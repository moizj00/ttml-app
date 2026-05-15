# Pricing & Billing — Current State

> **Last verified:** 2026-05-14 against `shared/pricing.ts`, `server/stripeWebhook.ts` (referenced), `server/stripe/` (referenced), `server/routers/billing/`, `server/routers/affiliate/`.

`shared/pricing.ts` is the **single source of truth** for all prices. Never hardcode a cents value or display string anywhere else.

---

## 1. Current pricing constants

From [`shared/pricing.ts`](../../../shared/pricing.ts):

```ts
PRICING.singleLetter   // price: 299, period: "one-time", lettersIncluded: 1
                       //   @deprecated — removed from public plans. Kept for legacy Stripe products + existing customers.

PRICING.monthly        // price: 299, period: "per month",  lettersIncluded: 4
PRICING.yearly         // price: 2400, period: "per year",  lettersIncluded: 8

ALL_PLANS  = [monthly, yearly]   // subscription-only
PAID_PLANS = [monthly, yearly]   // shown on /pricing

AFFILIATE_DISCOUNT_PERCENT         = 20    // applied at checkout when a valid code is entered
AFFILIATE_COMMISSION_BASIS_POINTS  = 500   // 500 bps = 5% of sale amount

SINGLE_LETTER_PRICE_CENTS = 29900    // @deprecated — legacy webhook only
MONTHLY_PRICE_CENTS       = 29900
YEARLY_PRICE_CENTS        = 240000
```

**Practical implications:**

- New subscribers cannot purchase a single $299 letter through the public flow. They must subscribe to `monthly` ($299/mo, 4 letters) or `yearly` ($2,400/yr, 8 letters).
- The `singleLetter` constant + Stripe product are kept alive solely for backward compatibility with existing customers who purchased one before the switch. The webhook still honours those events.
- Per-letter affiliate commission at the $299 base sale = `$299 × 5% = $14.95` (1495 cents). Stored in `commission_ledger.commission_amount` as cents.

---

## 2. Stripe integration

### Webhook endpoint

`POST /api/stripe/webhook` (raw-body, signature verified via `STRIPE_WEBHOOK_SECRET`). Registered in [`server/_core/index.ts`](../../../server/_core/index.ts) **before** `express.json()` middleware so the signature check works on the raw payload.

Idempotency: every event ID is inserted into `processed_stripe_events` with `.onConflictDoNothing()` before processing. Replays no-op.

### Events handled

| Event | Mode | Action |
|---|---|---|
| `checkout.session.completed` | `payment` | Per-letter unlock ($299 single-letter or $50 first-letter-review) → `updateLetterStatus(letterId, "pending_review")` + commission tracking if discount code present |
| `checkout.session.completed` | `subscription` | Activate subscription plan ($299/mo for 4 letters or $2,400/yr for 8 letters) |
| `customer.subscription.updated` | — | Update subscription record (status, plan, allowed/used) |
| `customer.subscription.deleted` | — | Mark subscription cancelled |
| `invoice.paid` | — | Refresh subscription status |

### Discount-code flow on payment

When `checkout.session.completed` arrives with `metadata.discount_code`:

1. `getDiscountCodeByCode(code)` → resolve to `employeeId`.
2. `createCommission({ employeeId, letterRequestId, saleAmount, commissionRate: 500, ... })` — 5% in basis points, stored in cents.
3. `incrementDiscountCodeUsage(discountCodeId)` — tracks `usage_count`.
4. All writes inside the webhook handler run in a single Drizzle transaction for atomicity.

### Stripe API version + client

Configured in [`server/stripe/`](../../../server/stripe/) (client, checkouts, subscriptions, coupons). Pin in the client init.

---

## 3. Paywall + unlock paths

`generated_locked` is the gate. The transition to `pending_review` happens only via one of these paths:

| Path | Triggered by | Notes |
|---|---|---|
| `freeUnlock` (billing router) | Subscriber with active subscription and `letters_used < letters_allowed` | Consumes one entitlement; transitions `generated_locked → pending_review` |
| `payToUnlock` (billing router) | Single-letter Stripe Checkout completed → webhook | Legacy path for back-compat |
| Free-preview funnel | 24h hold elapses → `letter_released_to_subscriber` → upsell → checkout → `pending_review` | See §4 below |
| Admin `forceStatusTransition` | Admin + 2FA | Skips paywall entirely. Logged in `review_actions` with reason |

Server-side content truncation is in [`server/routers/versions.ts`](../../../server/routers/versions.ts) (`versions.get`): when `letter.status === "generated_locked"` and the subscriber has not unlocked, the response truncates `content` to ~100 chars. The frontend blur in [`client/src/components/LetterPaywall.tsx`](../../../client/src/components/LetterPaywall.tsx) is cosmetic.

**Never trust the client.** The truncation is the gate.

---

## 4. Free-preview funnel

This is a lead-magnet flow for first-time letter submitters. It's the live default path for new submissions and is responsible for the 24-hour hold.

### Setup at submission

When a subscriber submits a letter eligible for the free preview (e.g. first letter), `server/routers/letters/submit.ts` sets:
- `letter_requests.is_free_preview = TRUE`
- `letter_requests.free_preview_unlock_at = NOW() + INTERVAL '24 hours'`

### Status transitions

```
submitted → researching → drafting → ai_generation_completed_hidden    [24h hold]
                                              ↓ (after free_preview_unlock_at)
                                  letter_released_to_subscriber
                                              ↓ (subscriber views the preview)
                                  attorney_review_upsell_shown
                                              ↓ (clicks "Submit for attorney review")
                                  attorney_review_checkout_started
                                              ↓ (Stripe webhook confirms payment)
                                  attorney_review_payment_confirmed
                                              ↓
                                  pending_review
```

### Reading the preview

When the subscriber requests the letter detail (`letters.detail` → `getLetterVersionsByRequestId`), the subscriber router ([`server/routers/letters/subscriber.ts`](../../../server/routers/letters/subscriber.ts)) checks:

```ts
if (letter.isFreePreview && letter.freePreviewUnlockAt <= now) {
  return { ...version, freePreview: true };  // FULL content, NOT truncated
}
```

The client renders `FreePreviewViewer` (non-selectable text + "DRAFT" watermark) instead of `LetterPaywall`. The only CTA inside the viewer is "Submit For Attorney Review" → routes to `/pricing` for subscription.

### Admin force-unlock override

`forceFreePreviewUnlock` mutation in [`server/routers/admin/letters.ts`](../../../server/routers/admin/letters.ts) collapses the 24h cooling window:

1. Sets `free_preview_unlock_at = NOW()`.
2. Logs `free_preview_force_unlock` review action.
3. Invokes [`dispatchFreePreviewIfReady`](../../../server/freePreviewEmailCron.ts) — the shared dispatcher.
4. If the draft is already saved, the "your preview is ready" email fires immediately. If the pipeline is still running, the email fires the moment the draft lands (the finalize nodes — `simple.ts`, `graph/nodes/finalize.ts`, `fallback.ts` — all call the dispatcher too).
5. The dispatcher uses an atomic `UPDATE ... RETURNING` on `free_preview_email_sent_at` so cron, pipeline, and admin paths cannot double-send. A failed send rolls the stamp back so the cron retries.

Non-free-preview letters cannot use this path — the mutation rejects with `BAD_REQUEST`.

### Email dispatcher idempotency contract

Three paths can dispatch the "preview ready" email: cron (every minute), pipeline finalize, admin force-unlock. The contract:

- `UPDATE letter_requests SET free_preview_email_sent_at = NOW() WHERE id = $1 AND free_preview_email_sent_at IS NULL RETURNING ...` — atomic claim.
- If 0 rows returned, another path already claimed it — no-op.
- If 1 row returned, this path sends. On send failure, `UPDATE … SET free_preview_email_sent_at = NULL` so the next cron tick retries.

---

## 5. Subscription entitlement tracking

`subscriptions` table columns of note:

| Column | Purpose |
|---|---|
| `lettersAllowed` | 4 for monthly, 8 for yearly. Reset on renewal. |
| `lettersUsed` | Incremented on each `freeUnlock` |
| **(NOT `remaining_letters`)** | Compute as `lettersAllowed - lettersUsed`. Do not introduce a `remaining_letters` column. |

`billing.checkCanSubmit` returns whether the subscriber has remaining entitlement, taking active subscription + reset window into account.

---

## 6. Affiliate / commission system

```
Employee → discount code (auto-generated on first myCode query)
         → Subscriber uses code at checkout
         → Stripe webhook fires → createCommission() → row in commission_ledger
         → Employee sees pending earnings in myEarnings
         → Employee requests payout (min $10.00 / 1000 cents)
         → Admin processes (completed → marks commissions paid | rejected → records reason)
```

Commission rate: 500 basis points = 5% of `sale_amount`. Per-letter commission at $299 base = $14.95 = 1495 cents.

Idempotency: `commission_ledger` has a unique index on `stripe_payment_intent_id`. Replayed webhooks no-op cleanly.

Public validation of a code at checkout time: `affiliate.validateCode` (publicProcedure) → returns `{ valid, discountPercent, employeeId }` so the frontend can show the adjusted total.

Cloudflare Worker integration: when an employee creates a code, `syncCodeToWorkerAllowlist(code, "add")` in [`server/routers/_shared.ts`](../../../server/routers/_shared.ts) fire-and-forgets a POST to `AFFILIATE_WORKER_URL/admin/codes` (5s timeout) so the worker's KV-backed referral link recognizer learns the new code. Worker degrades gracefully if sync fails.

---

## 7. Deeper reading

- Specialist skill: [`skills-audit/corrected/ttml-payment-subscription-management/SKILL.md`](../../../skills-audit/corrected/ttml-payment-subscription-management/SKILL.md)
- Pattern enforcement: [`skills/architectural-patterns/payment_gate.md`](../../architectural-patterns/payment_gate.md)

---

**Sources read:** `shared/pricing.ts`, `server/routers/_shared.ts` (worker sync), `CLAUDE.md` §5 (free-preview detail), `AGENTS.md` §11 (status machine context). Stripe webhook handler referenced — re-verify exact handler shape if changing webhook behaviour.
