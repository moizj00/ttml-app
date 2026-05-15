# Testing — Current State

> **Last verified:** 2026-05-14 against `package.json` test scripts, `vitest.config.ts` (referenced), `playwright.config.ts` (referenced), `e2e/platform/README.md` (referenced), `scripts/seed-test-users.ts` (referenced), `CLAUDE.md`, `AGENTS.md` §12.

Vitest for unit + integration; Playwright for end-to-end. ~1300 tests across ~54 files. Tests are co-located with source under `server/**/*.test.ts`. E2E specs live under `e2e/`.

---

## 1. Vitest (unit + integration)

- **Runner**: `vitest ^4.1.5`, configured in [`vitest.config.ts`](../../../vitest.config.ts).
- **Environment**: `node`.
- **Setup**: [`vitest.setup.ts`](../../../vitest.setup.ts) stubs required env vars so individual tests are hermetic — no real DB, no live API calls by default.
- **Timeout**: 30s per test / hook.
- **Run all**: `pnpm test`
- **Run one file**: `pnpm test -- server/phase67-pricing.test.ts`
- **Verbose**: `pnpm test -- --reporter=verbose`
- **Coverage**: `@vitest/coverage-v8 ^4.1.5` available; not part of the default gate.

### Test layout

Tests live alongside source under `server/`:

```
server/
├── phase23.test.ts           # phase-numbered integration tests (large historical surface)
├── phase67-pricing.test.ts
├── ... (many more phase*.test.ts)
├── pipeline/
│   ├── stages.test.ts
│   ├── embeddings.test.ts
│   ├── training-capture.test.ts
│   ├── fine-tune.test.ts
│   └── graph/
│       ├── mode.test.ts
│       ├── routing.test.ts
│       ├── finalize-warnings.test.ts
│       └── worker-mode.test.ts
└── __tests__/                # cross-cutting tests (status machine, sanitization, training capture, etc.)
```

### Test-naming convention

Phase-numbered (`phase{N}.test.ts`, `phase{N}-{topic}.test.ts`) — a historical naming convention that maps each test file to the phase of project work that introduced it. New tests can follow this OR be domain-named (e.g. `pipeline/stages.test.ts`). Both conventions live in the repo.

### Test conventions

- **Mock external services** — Sentry, DB, GCS, Cloudflare Workers — in unit tests.
- **Live integration tests** auto-skip when real credentials are absent. They look at env vars; if a required key is missing, the `describe.skip(...)` activates.
- **DB tests** that exercise a real database accept `DATABASE_URL` via env (see commit `4f4c723` — "accept DATABASE_URL in real-DB gate"). When unset, the test skips; when set, the test connects to that DB.
- **Pino logger** mocked / silenced in most unit tests.

---

## 2. Playwright (E2E)

- **Runner**: Playwright `^1.59.1`, configured in [`playwright.config.ts`](../../../playwright.config.ts).
- **Browser**: Chromium with `--no-sandbox` for CI.
- **Base URL**: `http://localhost:${PORT || 3000}`.
- **Web server in CI**: Playwright starts `pnpm dev` automatically.
- **Run all**: `pnpm test:e2e`
- **Run one spec**: `npx playwright test e2e/platform/07-full-lifecycle.spec.ts --reporter=list`

### E2E layout

```
e2e/
├── README.md
├── platform/
│   ├── README.md
│   ├── 01-... .spec.ts
│   ├── 02-... .spec.ts
│   ├── ...
│   └── 07-full-lifecycle.spec.ts     # complete subscriber → pipeline → paywall → attorney flow
└── (other suites — auth flow, etc.)
```

### Simple-pipeline lifecycle integration test (Vitest, verified 2026-05-14)

[`server/simple-pipeline-lifecycle.test.ts`](../../../server/simple-pipeline-lifecycle.test.ts) (added in commit `4f3d5bc`, refined in `4f4c723`, merged in PRs #39 + #40) is a **DB-backed integration test** that covers the complete letter lifecycle with mocked LLM clients:

1. **Submission** — `createLetterRequest` → status `submitted`
2. **Simple pipeline** — `runSimplePipeline` → `researching → drafting → generated_locked`, `ai_draft` version written, `workflow_jobs` row `completed`
3. **Paywall** — subscriber view returns `truncated: true`; admin view returns full content
4. **Payment unlock** — `generated_locked → pending_review`, subscriber now sees full content
5. **Attorney claim** — `claimLetterForReview` → `under_review`
6. **Attorney approval** — new `final_approved` version (original `ai_draft` immutable), auto-advance to `client_approval_pending`
7. **Client approval** — `client_approved`, both versions readable, `ai_draft` byte-equal to pipeline output

Gated on `DATABASE_URL` / `SUPABASE_DATABASE_URL` / `SUPABASE_DIRECT_URL` (skips when no real DB available). Run manually:

```bash
DATABASE_URL="postgresql://..." pnpm test -- server/simple-pipeline-lifecycle.test.ts
```

### Platform full-lifecycle test (Playwright)

The `e2e/platform/07-full-lifecycle.spec.ts` covers: submission → AI pipeline → paywall → payment → attorney review → claim. It is the canonical end-to-end smoke test for the platform.

The companion skill [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md) documents the full prereqs, commands, and pitfalls — read that before extending the lifecycle test.

To run the full lifecycle with a real DB:

```bash
DATABASE_URL="postgresql://..." \
PLAYWRIGHT_BASE_URL="http://localhost:3000" \
E2E_SUBSCRIBER_EMAIL="test.subscriber@e2e.ttml.test" \
E2E_SUBSCRIBER_PASSWORD="TestPassword123!" \
E2E_ATTORNEY_EMAIL="test.attorney@e2e.ttml.test" \
E2E_ATTORNEY_PASSWORD="TestPassword123!" \
npx playwright test e2e/platform/07-full-lifecycle.spec.ts --reporter=list
```

`PIPELINE_MODE=simple` on the dev server collapses the pipeline to a single inline Claude call so the test doesn't need a pg-boss worker.

---

## 3. Seeded test users

Seeded via `pnpm exec tsx scripts/seed-test-users.ts` (script reads the user list and creates them in Supabase Auth + the local `users` table). Password for all: `TestPass123!`.

| Role | Email |
|---|---|
| subscriber | `test-subscriber@ttml.dev` |
| employee | `test-employee@ttml.dev` |
| attorney | `test-attorney@ttml.dev` |
| admin | `test-admin@ttml.dev` |

Use these for manual smoke testing of role-specific flows. For E2E tests, the script may create additional `@e2e.ttml.test` users — check the Playwright config / setup file for the exact list.

---

## 4. Validation gate (mandatory before every PR)

```
pnpm check    # tsc --noEmit
pnpm test     # vitest run
pnpm build    # vite + esbuild × 4
```

All three must pass. CI enforces this on PRs (see `.github/workflows/`).

The `revalidate` script chains them: `pnpm revalidate`.

---

## 5. Test gotchas

- **Hermetic by default** — `vitest.setup.ts` stubs env vars, so tests don't try to dial out unless they explicitly request a real credential and one is present.
- **Phase test ordering** — phase-numbered tests are NOT meant to run in a strict numeric order; each is independent. The numbering is historical.
- **Drizzle-zod schemas** — when adding a new table, regenerate the `createInsertSchema` to avoid Zod compile errors elsewhere.
- **Real-DB gate** — tests that need a live DB (e.g. pipeline lifecycle) check `process.env.DATABASE_URL`. Set it locally to exercise; CI sets it for integration runs.
- **Mocking AI providers** — pipeline tests mock at the provider boundary (`getDraftModel`, `getResearchModel`, `getVettingModelFallback`, etc.). See `server/pipeline/stages.test.ts` line 52ish for the canonical mock pattern.
- **Playwright timeouts** — pipeline stages have 90s timeouts; the lifecycle E2E test should set Playwright `expect.poll` with appropriate `timeout: 120_000`.

---

## 6. Specialist-skill cross-references

- E2E verification playbook: [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md)
- Code review QA: [`skills-audit/corrected/ttml-code-review-qa/SKILL.md`](../../../skills-audit/corrected/ttml-code-review-qa/SKILL.md)
- Testing gap analysis: [`docs/TESTING_GAP_ANALYSIS_2026-04-30.md`](../../../docs/TESTING_GAP_ANALYSIS_2026-04-30.md)

---

**Sources read:** `package.json` scripts, `CLAUDE.md` (Testing section), `AGENTS.md` §12, [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md) (referenced).
