# Talk-To-My-Lawyer Architecture & Commit Audit Report

**Date:** April 08, 2026
**Target:** Commits `5d7e8f1` to `898590e` (Last 4 commits)
**Repository:** `moibftj/ttml-app`

## Executive Summary

A comprehensive audit of the last 4 commits reveals a critical discrepancy between the stated commit intent and the actual codebase changes. The most recent commit (`898590e`) claims to have executed a massive refactor splitting monolithic files (`server/email.ts`, `server/supabaseAuth.ts`, `server/routers/letters.ts`, etc.) into smaller modules. **This refactor did not actually happen.**

Instead, the commit only added a text file (`attached_assets/Pasted-Here-are-the-top-monolith-files-and-concrete-refactorin_1775617345259.txt`) containing the *plan* for the refactor, while leaving the monolithic files completely untouched. 

Furthermore, a critical regression was introduced in a previous commit that is currently breaking the test suite (52 failing tests across 8 files) and preventing successful builds.

## 1. The "Phantom Refactor" (Commit `898590e`)

The commit message for `898590e` states:
> "Improve code organization by splitting large files into smaller, manageable modules. Refactors `server/email.ts`, `server/supabaseAuth.ts`, `server/routers/letters.ts`..."

**Findings:**
- `server/email.ts` is still a single 1,808-line file. The `server/emails/` directory does not exist.
- `server/supabaseAuth.ts` is still a single 1,744-line file. The `server/auth/` directory does not exist.
- `server/routers/letters.ts` is still a single 1,326-line file.
- `server/stripeWebhook.ts` is still a single 843-line file.
- `server/pipeline/vetting.ts` and `orchestrator.ts` remain unchanged.

**The Reality:**
The agent generated a detailed refactoring plan and saved it to `attached_assets/Pasted-Here-are-the-top-monolith-files-and-concrete-refactorin_1775617345259.txt`, but failed to actually execute any of the file splits for the backend files. (The frontend splits for `LetterDetail.tsx` and `skeletons.tsx` *were* successfully executed in the prior commit `50441c6`).

## 2. Critical Test Regression: Admin 2FA

The test suite is currently failing with 52 broken tests across 8 files. 

**Root Cause:**
```
Error: ADMIN_2FA_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set for admin 2FA
 ❯ server/_core/admin2fa.ts:5:9
```

**Analysis:**
In commit `816781a` (Task #68), an `admin2fa.ts` module was introduced with a module-level throw:
```typescript
const _secret = process.env.ADMIN_2FA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!_secret) {
  throw new Error("ADMIN_2FA_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set for admin 2FA");
}
```

This file is imported by `server/_core/trpc.ts`, which is imported by almost every router. Recently, `server/_core/systemRouter.ts` was added/modified and imports from `trpc.ts`. 

When Vitest runs the test suite, it loads these modules. Because the test environment does not have `ADMIN_2FA_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` set in `process.env` during the module initialization phase, the `throw` executes immediately, crashing the test runner before any tests can even begin in those files.

**Impacted Test Files:**
1. `server/affiliate.test.ts`
2. `server/attorney-review-pipeline.test.ts`
3. `server/auth-integration.test.ts`
4. `server/auth.logout.test.ts`
5. `server/phase79-review-assigned-email.test.ts`
6. `server/review-approval-flow.test.ts`
7. `server/super-admin-whitelist.test.ts`
8. `server/ttml.test.ts`

## 3. Security & Config Hardening (Commit `11b4479`)

This commit successfully implemented several critical security improvements:

**Positive Findings:**
- **CORS Hardening:** Wildcard origins (`*.railway.app`, `*.replit.dev`) are now strictly gated behind `isDev` checks in `server/_core/index.ts`.
- **Vector Injection Protection:** The `server/db/lessons.ts` file now strictly validates embedding arrays using `Number()` and `isFinite()` before passing them as bound parameters (`${vectorParam}::vector`), preventing SQL injection via the vector extension.
- **Startup Migration Safety:** A new `throwIfUnexpectedMigrationError` helper ensures that if a database migration fails during startup, the server process exits immediately (`process.exit(1)`) rather than starting in a broken, half-migrated state.

## 4. Architectural Invariants Verification

Despite the phantom refactor, the core architectural invariants defined in the `ttml-pattern-recognizer` skill remain intact:

- **Super Admin Whitelist:** The hard-coded whitelist (`SUPER_ADMIN_EMAILS`) in `server/supabaseAuth.ts` is fully intact and correctly enforced at all 3 required points (Google OAuth, token verification, and email signup).
- **State Machine:** `ALLOWED_TRANSITIONS` in `shared/types/letter.ts` (successfully split from `shared/types.ts` in commit `50441c6`) remains strictly enforced.
- **RBAC Guards:** The `server/routers/review.ts` and `server/routers/letters.ts` files correctly implement and enforce `attorneyProcedure`, `subscriberProcedure`, and `adminProcedure`.

## Recommended Remediation Plan

1. **Fix the Test Suite (Immediate Priority):**
   Modify `vitest.config.ts` to include a `setupFiles` script that injects mock environment variables (`ADMIN_2FA_SECRET="test-secret"`) before any application code is imported. Alternatively, change the module-level throw in `admin2fa.ts` to a lazy evaluation that only throws when the function is actually called.

2. **Execute the Phantom Refactor:**
   Follow the plan laid out in the `attached_assets` text file to actually split `server/email.ts`, `server/supabaseAuth.ts`, `server/routers/letters.ts`, and `server/stripeWebhook.ts` into their respective directories.

3. **Implement Revalidation Loop:**
   Ensure that `pnpm test` and `pnpm build` are run *after* the refactor is actually executed to prevent further regressions.
