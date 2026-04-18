# Platform E2E Tests — Full Lifecycle Verification

End-to-end tests that verify the **complete letter lifecycle** from submission through AI pipeline, paywall, payment, attorney review, and claim. These tests exercise the full platform integration across multiple user roles.

## Test Suites

| File | Flow | Role(s) |
|------|------|---------|
| `01-pipeline-submission.spec.ts` | 6-step intake form → AI pipeline → DB save | Subscriber |
| `02-paywall-verification.spec.ts` | Draft locked behind paywall with payment options | Subscriber |
| `03-attorney-review-queue.spec.ts` | Letter in review queue → claim → under_review | Attorney |
| `04-full-lifecycle.spec.ts` | All-in-one: submit → pipeline → paywall → claim | Both |

## Prerequisites

1. **Dev server running** with `PIPELINE_MODE=simple` for inline AI pipeline:
   ```bash
   PORT=3000 PIPELINE_MODE=simple pnpm run dev
   ```

2. **Environment variables** set:
   ```bash
   DATABASE_URL="postgresql://..."         # Direct Supabase connection
   PLAYWRIGHT_BASE_URL="http://localhost:3000"
   E2E_SUBSCRIBER_EMAIL="test.subscriber@e2e.ttml.test"
   E2E_SUBSCRIBER_PASSWORD="TestPassword123!"
   E2E_ATTORNEY_EMAIL="test.attorney@e2e.ttml.test"
   E2E_ATTORNEY_PASSWORD="TestPassword123!"
   ANTHROPIC_API_KEY="..."                 # Required for pipeline
   ```

3. **Test user accounts** must exist in Supabase Auth + users table with correct roles.

## Running

```bash
# Run all platform tests
npx playwright test e2e/platform/ --reporter=list

# Run a specific suite
npx playwright test e2e/platform/01-pipeline-submission.spec.ts --reporter=list

# Run full lifecycle (longest, does everything)
npx playwright test e2e/platform/04-full-lifecycle.spec.ts --reporter=list
```

## Key Patterns

- **Onboarding modal**: Always dismiss with `page.getByRole("button", { name: /skip/i })` — it appears on first dashboard visit.
- **Review queue**: Letters are clickable rows (not buttons). Click text to open modal.
- **Claim button**: Inside the review modal after draft loads. Wait 5s for content.
- **Rate limiting**: Bypassed in dev via `NODE_ENV=development` check in `server/rateLimiter.ts`.
- **Simple pipeline**: `PIPELINE_MODE=simple` runs Claude inline (no pg-boss worker needed).

## Screenshots

Tests save diagnostic screenshots to `test-results/`:
- `paywall-view.png` — Locked draft with DRAFT watermark
- `review-queue.png` — Attorney review queue
- `review-detail.png` — Review modal with draft content
- `review-claimed.png` — After claim action

## DB Verification

Tests use `postgres` package to verify status transitions directly:
```
submitted → researching → drafting → generated_locked → pending_review → under_review
```
