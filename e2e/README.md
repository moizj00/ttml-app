# E2E Tests — Talk to My Lawyer

Playwright-based end-to-end tests covering 5 critical user flows.

## Test Suites

| File | Flow |
|------|------|
| `01-auth.spec.ts` | Auth — signup form validation, login, protected route redirects |
| `02-intake-form.spec.ts` | Letter intake — 6-step form navigation, validation, draft persistence |
| `03-subscriber-dashboard.spec.ts` | Subscriber dashboard — letter list, status display, detail navigation |
| `04-attorney-review.spec.ts` | Attorney review — queue view, claim a letter, editor, approve flow |
| `05-admin-dashboard.spec.ts` | Admin dashboard — user list, system stats, section navigation |

## Architecture

### Auth Fixtures (`e2e/fixtures/auth.ts`)

Provides Playwright test fixtures for authenticated sessions:

- `subscriberPage` — logged-in subscriber session
- `attorneyPage` — logged-in attorney session
- `adminPage` — logged-in admin session

Each fixture performs a fresh login via the UI before the test runs.
Tests import `test` from `./fixtures/auth` instead of `@playwright/test` to use these fixtures.

Tests also export `isSubscriberConfigured`, `isAttorneyConfigured`, `isAdminConfigured` booleans
for `test.skip()` guards when credentials are not set.

## Prerequisites

- Node.js 20+
- pnpm
- A running local dev server (default port from `PORT` env or `5000`)
- Test user accounts for each role (see Environment Variables below)

## Running Tests Locally

**Start the dev server first:**
```bash
npm run dev
```

**Then in a separate terminal:**
```bash
# Run all E2E tests
npx playwright test

# Run a specific suite
npx playwright test e2e/01-auth.spec.ts

# Run with browser visible (headed mode)
npx playwright test --headed

# Show HTML report after run
npx playwright show-report
```

## Environment Variables

Tests need test accounts for each role. Create a `.env.e2e` file (not committed) or export these:

```bash
# Subscriber test account
E2E_SUBSCRIBER_EMAIL=test.subscriber@e2e.ttml.test
E2E_SUBSCRIBER_PASSWORD=TestSubscriber123!

# Attorney test account
E2E_ATTORNEY_EMAIL=test.attorney@e2e.ttml.test
E2E_ATTORNEY_PASSWORD=TestAttorney123!

# Admin test account
E2E_ADMIN_EMAIL=test.admin@e2e.ttml.test
E2E_ADMIN_PASSWORD=TestAdmin123!

# Optional: override base URL (default: http://localhost:${PORT:-5000})
PLAYWRIGHT_BASE_URL=http://localhost:5000

# Optional: path to system Chromium binary (auto-detected on Replit/NixOS)
CHROMIUM_PATH=/nix/store/.../bin/chromium
```

## Creating Test Users

Before running the auth-gated tests (`02-05`), you need test accounts for each role.
These can be created by:

1. Signing up via `/signup` for the subscriber account
2. Having an admin invite the attorney via `/admin/users`
3. Creating the admin account directly in Supabase (auth + user table)

For CI, set these credentials as repository secrets and pass them as environment
variables in the GitHub Actions workflow (see `.github/workflows/ci.yml`).

## CI Integration

The tests are registered as the `test:e2e` npm script and run in the GitHub
Actions `ci.yml` workflow as a separate job named `e2e`. The dev server is
started automatically by Playwright's `webServer` config during CI.

The CI job sets `PORT=5000` to ensure the app server and Playwright's `baseURL`
agree on the same port.

When E2E secrets are not configured in the CI environment, authenticated tests
(suites 02–05) will be skipped with warnings logged to the CI output.

## Design Notes

- Auth fixtures provide deterministic `subscriberPage`, `attorneyPage`, `adminPage` test contexts.
- Data-dependent tests use `test.skip()` when no seeded data exists (e.g., no letters in queue),
  rather than silently passing with no verification.
- Tests use `data-testid` selectors where available for stability.
- Stripe payment flows are **out of scope** and not tested here.
- The Playwright config uses the system Chromium binary on Replit/NixOS via auto-detection.
