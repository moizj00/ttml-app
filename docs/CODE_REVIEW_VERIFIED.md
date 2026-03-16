# TTML Code Review — Cross-Verified Against Actual Codebase

**Date:** 2026-02-26
**Source:** Live codebase at `/home/ubuntu/talk-to-my-lawyer` (checkpoint `d3e13150`)
**Method:** Every finding verified with exact file path and line number against the running code.
**Status:** ✅ Source of Truth — all facts confirmed or corrected below.

---

## Verification Summary

| Issue | Claim in Review | Verified? | Notes |
|-------|----------------|-----------|-------|
| 1 | `USER_ROLES` / `ACTOR_TYPES` missing `attorney` | ✅ CORRECT | Exact lines confirmed |
| 2 | `SPEC_COMPLIANCE.md` has 2 wrong statements | ✅ CORRECT | Lines 65 and 69 confirmed wrong |
| 3 | `GAP_ANALYSIS.md` lists completed work as TODO | ✅ CORRECT | Lines 52–57 confirmed still unchecked |
| 4 | Dead Manus OAuth code (sdk.ts 304 lines, oauth.ts 53 lines) | ✅ CORRECT | Confirmed still registered at startup |
| 5 | Legacy Manus constants still used in production | ⚠️ PARTIALLY CORRECT | `supabaseAuth.ts` uses hardcoded `"app_session_id"` string, NOT `COOKIE_NAME` import (lines 331, 339). Review stated lines 345, 353 — actual lines are 331, 339. |
| 6 | RLS `is_app_employee_or_admin()` excludes attorney | ✅ CORRECT | Confirmed in migration 0002, no `is_app_attorney()` in any migration |
| 7 | `subscriberProcedure` blocks admins | ✅ CORRECT | Exact code confirmed at lines 99–104 |
| 8 | Three employee routes render identical component | ✅ CORRECT | AffiliateDashboard has no URL-based differentiation |
| 9 | Duplicate logout tests | ✅ CORRECT | Both files confirmed |
| 10 | Test mocks use invalid role `"user"` and stale `loginMethod: "manus"` | ✅ CORRECT | `ttml.test.ts` line 232 uses `"user"`, line 240 uses `"manus"`. `auth.logout.test.ts` line 22 uses `"user"`, line 21 uses `"email"`. |
| 11 | `getLoginUrl()` is dead code | ✅ CORRECT | Zero imports outside its own definition |
| 12 | Migration 0002 header comment is wrong | ✅ CORRECT | Line 6 still says "Manus OAuth" |

---

## 🔴 ISSUE 1: `USER_ROLES` and `ACTOR_TYPES` Constants Missing `attorney`

**File: `drizzle/schema.ts`**

| Line | Code | Has `attorney`? |
|------|------|-----------------|
| 15 | `export const USER_ROLES = ["subscriber", "employee", "admin"] as const;` | ❌ NO |
| 16 | `export type UserRole = (typeof USER_ROLES)[number];` | ❌ (derived from line 15) |
| 49 | `export const ACTOR_TYPES = ["system", "subscriber", "employee", "admin"] as const;` | ❌ NO |
| 50 | `export type ActorType = (typeof ACTOR_TYPES)[number];` | ❌ (derived from line 49) |
| 70 | `export const userRoleEnum = pgEnum("user_role", ["subscriber", "employee", "admin", "attorney"]);` | ✅ YES |
| 80 | `export const actorTypeEnum = pgEnum("actor_type", ["system", "subscriber", "employee", "admin", "attorney"]);` | ✅ YES |

The DB enum (`pgEnum`) includes `attorney`. The TypeScript `const`/`type` does **not**. So `UserRole = "subscriber" | "employee" | "admin"` — it excludes attorneys entirely at the type level. Any code that type-checks against `UserRole` will reject `"attorney"` at compile time.

### Where `attorney` IS correctly handled

| File | Line | Code |
|------|------|------|
| `client/src/components/ProtectedRoute.tsx` | 5 | `type Role = "subscriber" \| "employee" \| "admin" \| "attorney";` |
| `client/src/pages/admin/Users.tsx` | 11 | `attorney: { label: "Attorney", icon: <Scale ...>, color: "text-purple-700 bg-purple-100" }` |
| `server/routers.ts` | 93–98 | `const attorneyProcedure = protectedProcedure.use(...)` checks for `"attorney"` |
| `drizzle/0002_ambitious_leper_queen.sql` | 1–2 | `ALTER TYPE "public"."user_role" ADD VALUE 'attorney';` |

**Fix:** Add `"attorney"` to both `USER_ROLES` (line 15) and `ACTOR_TYPES` (line 49) in `drizzle/schema.ts`.

---

## 🔴 ISSUE 2: `SPEC_COMPLIANCE.md` Has Two Factually Wrong Statements

**File: `SPEC_COMPLIANCE.md`**

**Line 65 — Claims 3 roles:**
```
The implementation uses 3 roles (`subscriber`, `employee`, `admin`).
Attorneys use the `employee` role and access the review center.
```
**Reality:** `server/routers.ts` lines 93–98 has a dedicated `attorneyProcedure`. `client/src/App.tsx` lines 104–131 gates `/attorney/*` and `/review/*` to `["attorney", "admin"]`, not employee. The 4-role system has been live since Phase 57.

**Line 69 — Previously claimed MySQL (now corrected):**
The application uses Supabase (PostgreSQL). `drizzle/schema.ts` line 1 imports `pgTable`, `pgEnum` from `drizzle-orm/pg-core`. `drizzle/migrations/0002_rls_policies_and_indexes.sql` enables RLS on all 9 tables. The migration to Supabase PostgreSQL happened in Phase 33 (confirmed in `todo.md`). `SPEC_COMPLIANCE.md` line 69 has been updated to reflect this.

---

## 🔴 ISSUE 3: `docs/GAP_ANALYSIS.md` Lists Completed Work as TODO

**File: `docs/GAP_ANALYSIS.md`**, lines 52–57

```
### GAP 1: Role Split — Attorney vs Employee (HIGH PRIORITY)
- [ ] Add `attorney` to userRoleEnum in drizzle/schema.ts
- [ ] Create `attorneyProcedure` guard in routers.ts
- [ ] Move review center routes from `/employee/` to `/attorney/` path
- [ ] Update ProtectedRoute to handle attorney role
```

**Already done (confirmed in codebase):**

| Task | Evidence |
|------|----------|
| `attorney` in `userRoleEnum` | `drizzle/schema.ts` line 70 |
| `attorneyProcedure` exists | `server/routers.ts` lines 93–98 |
| Routes moved to `/attorney/*` | `client/src/App.tsx` lines 104–131 |
| `ProtectedRoute` has `attorney` | `client/src/components/ProtectedRoute.tsx` line 5 |

---

## 🟡 ISSUE 4: Dead Manus OAuth Code (357 lines + supporting files)

Auth now uses Supabase (`server/_core/context.ts` line 3 imports from `../supabaseAuth`). The entire Manus OAuth system is dead code still running at startup.

| File | Lines | What it is | Used by |
|------|-------|-----------|---------|
| `server/_core/sdk.ts` | 304 | Full `OAuthService` class (token exchange, session JWT, user info) | Only `server/_core/oauth.ts` |
| `server/_core/oauth.ts` | 53 | `/api/oauth/callback` route handler | `server/_core/index.ts` lines 6, 61 |
| `server/_core/types/manusTypes.ts` | — | TypeScript types for Manus API responses | Only `server/_core/sdk.ts` line 16 |
| `client/src/const.ts` | 4–16 | `getLoginUrl()` builds Manus OAuth URL | **Nothing** — zero imports anywhere |

**Still actively registered at startup:**
- `server/_core/index.ts` line 6: `import { registerOAuthRoutes } from "./oauth";`
- `server/_core/index.ts` line 61: `registerOAuthRoutes(app);`
- Comment on line 60: `// Legacy Manus OAuth callback (kept for backward compatibility)`

---

## 🟡 ISSUE 5: Legacy Manus Constants Still Used in Production Code

**File: `shared/const.ts`** (all 5 lines)

```ts
export const COOKIE_NAME = "app_session_id";        // Manus cookie name
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;              // Only used by sdk.ts (dead code)
export const UNAUTHED_ERR_MSG = 'Please login (10001)';   // Manus error code
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';  // Manus error code
```

**Where these are still actively used in production:**

| Constant | File | Line | Context |
|----------|------|------|---------|
| `COOKIE_NAME` | `server/routers.ts` | 127 | `ctx.res.clearCookie(COOKIE_NAME, ...)` in logout |
| `COOKIE_NAME` | `server/_core/sdk.ts` | 1 | Imported by dead Manus SDK |
| `"app_session_id"` (hardcoded) | `server/supabaseAuth.ts` | 331, 339 | Clears legacy cookie on logout — **does NOT import `COOKIE_NAME`** |
| `UNAUTHED_ERR_MSG` | `server/_core/trpc.ts` | 17 | Thrown on unauthenticated requests |
| `UNAUTHED_ERR_MSG` | `client/src/main.tsx` | 16 | Client checks this exact string to detect 401s |
| `NOT_ADMIN_ERR_MSG` | `server/_core/trpc.ts` | 35 | Thrown on non-admin access |
| `AXIOS_TIMEOUT_MS` | `server/_core/sdk.ts` | 82 | Only used in dead Manus SDK |

> **Correction from original review:** `supabaseAuth.ts` does NOT import `COOKIE_NAME`. It uses the hardcoded string `"app_session_id"` directly at lines 331 and 339 (not 345/353 as stated in the original review).

The `(10001)` and `(10002)` error codes are Manus platform codes that appear in error messages to end users.

---

## 🟡 ISSUE 6: RLS Policies Don't Include `attorney` Role

**File: `drizzle/migrations/0002_rls_policies_and_indexes.sql`**, lines 49–55

```sql
CREATE OR REPLACE FUNCTION public.is_app_employee_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT public.app_user_role() IN ('employee', 'admin');
$$;
```

This function gates SELECT access on `letter_requests` (line 117), `letter_versions` (line 145), `review_actions` (line 167), `research_runs` (line 202), and `attachments` (line 230). **Attorneys are NOT included.**

No `is_app_attorney()` function exists in any of the 3 migrations (`0001_initial_pg_schema.sql`, `0002_rls_policies_and_indexes.sql`, `0003_atomic_functions_and_audit.sql`), nor in the Drizzle-generated migrations (`0002_ambitious_leper_queen.sql`, etc.).

**Why it works today:** The Drizzle ORM connects as the DB owner, which bypasses RLS. But if RLS were enforced (e.g., via Supabase client SDK), attorneys would be completely locked out of review data.

---

## 🟡 ISSUE 7: `subscriberProcedure` Blocks Admins (Inconsistent with Other Guards)

**File: `server/routers.ts`**

| Guard | Lines | Allows admin? |
|-------|-------|---------------|
| `employeeProcedure` | 85–91 | ✅ Yes — `role !== "employee" && role !== "admin"` |
| `attorneyProcedure` | 93–98 | ✅ Yes — `role !== "attorney" && role !== "admin"` |
| `subscriberProcedure` | 99–104 | ❌ **No** — `role !== "subscriber"` (strict) |

This means admins cannot call any subscriber endpoints (submit letter, view letters, billing, etc.) via the API. This is a deliberate design choice but is inconsistent with the other two guards.

---

## 🟡 ISSUE 8: Three Employee Routes Render Identical Component

**File: `client/src/App.tsx`**, lines 136–152

```tsx
<Route path="/employee">
  <ProtectedRoute allowedRoles={["employee", "admin"]}>
    <EmployeeAffiliateDashboard />        ← same component
  </ProtectedRoute>
</Route>
<Route path="/employee/referrals">
  <ProtectedRoute allowedRoles={["employee", "admin"]}>
    <EmployeeAffiliateDashboard />        ← same component
  </ProtectedRoute>
</Route>
<Route path="/employee/earnings">
  <ProtectedRoute allowedRoles={["employee", "admin"]}>
    <EmployeeAffiliateDashboard />        ← same component
  </ProtectedRoute>
</Route>
```

`AffiliateDashboard.tsx` does not use `useLocation()` or any URL-based differentiation. Three routes, one component, no tab switching. Either consolidate into one route, or add URL-based tab selection inside the component.

---

## 🟡 ISSUE 9: Duplicate Auth Logout Tests

The same logout test exists in **two separate files**:

| File | Test description | Difference |
|------|-----------------|------------|
| `server/auth.logout.test.ts` | Full standalone test file (2 tests) | Uses `loginMethod: "email"`, role `"user"` |
| `server/ttml.test.ts` lines 259–280 | Copy embedded in main test file (1 test) | Uses `loginMethod: "manus"`, role `"user"` |

Both import `COOKIE_NAME` from `shared/const`, both create identical `createAuthContext` helpers, both test the same `auth.logout` behavior. One should be removed.

---

## 🟡 ISSUE 10: Test Mocks Use Invalid Role `"user"` and Stale `loginMethod: "manus"`

**File: `server/ttml.test.ts`**, lines 232 and 240

```ts
function createAuthContext(role: "user" | "admin" = "user") {  // line 232
  ...
  loginMethod: "manus",   // line 240 — stale, should be "email"
  role,                   // "user" is not a valid role
```

**File: `server/auth.logout.test.ts`**, lines 21–22

```ts
loginMethod: "email",    // line 21 — correct
role: "user",            // line 22 — not a valid role
```

Valid roles are `subscriber`, `employee`, `attorney`, `admin`. The value `"user"` does not exist in `userRoleEnum`. Tests pass because logout does not check roles, but `ttml.test.ts` line 292 asserts `expect(me?.role).toBe("user")` — testing against a nonexistent role value.

> **Correction from original review:** `auth.logout.test.ts` already uses `loginMethod: "email"` (correct). Only `ttml.test.ts` uses `loginMethod: "manus"` (stale).

---

## 🟢 ISSUE 11: `client/src/const.ts` — `getLoginUrl()` Is Dead Code

**File: `client/src/const.ts`**, lines 4–16

```ts
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  // ...builds Manus OAuth URL
};
```

`grep -rn "getLoginUrl"` returns only the definition itself. **Zero imports anywhere.** Safe to delete.

---

## 🟢 ISSUE 12: Migration 0002 Header Comment Is Wrong

**File: `drizzle/migrations/0002_rls_policies_and_indexes.sql`**, line 6

```sql
-- ARCHITECTURE NOTE:
-- This app uses Manus OAuth (not Supabase Auth), so auth.uid() is NOT available.
```

This was true when written but is now incorrect — the app uses Supabase Auth since Phase 33. The rest of the comment (explaining why RLS is bypassed by Drizzle's service-role connection) remains accurate.

---

## Summary — Prioritized Fix List

| # | Priority | Issue | File(s) | Effort |
|---|----------|-------|---------|--------|
| 1 | 🔴 | Add `"attorney"` to `USER_ROLES` and `ACTOR_TYPES` | `drizzle/schema.ts` lines 15, 49 | 2 min |
| 2 | 🔴 | Fix stale claims in `SPEC_COMPLIANCE.md` | `SPEC_COMPLIANCE.md` lines 65, 69 | 10 min |
| 3 | 🔴 | Mark completed items in `GAP_ANALYSIS.md` | `docs/GAP_ANALYSIS.md` lines 52–57 | 10 min |
| 4 | 🟡 | Delete dead Manus OAuth code | `server/_core/sdk.ts`, `oauth.ts`, `types/manusTypes.ts`, `client/src/const.ts` (`getLoginUrl`) | 30 min |
| 5 | 🟡 | Remove OAuth registration from startup | `server/_core/index.ts` lines 6, 61 | 2 min |
| 6 | 🟡 | Clean Manus error codes from const | `shared/const.ts` lines 3–5, `server/_core/trpc.ts` lines 17, 35 | 10 min |
| 7 | 🟡 | Add `attorney` to RLS helper function | New migration: update `is_app_employee_or_admin()` to include `'attorney'` | 15 min |
| 8 | 🟡 | Decide: should `subscriberProcedure` allow admin? | `server/routers.ts` line 100 | 5 min |
| 9 | 🟡 | Consolidate 3 identical employee routes | `client/src/App.tsx` lines 136–152 | 10 min |
| 10 | 🟡 | Remove duplicate logout test | `server/ttml.test.ts` lines 259–280 OR `server/auth.logout.test.ts` | 5 min |
| 11 | 🟡 | Fix test mocks: `"user"` → `"subscriber"`, `"manus"` → `"email"` | `server/ttml.test.ts` lines 232, 240; `server/auth.logout.test.ts` line 22 | 5 min |
| 12 | 🟢 | Delete dead `getLoginUrl()` | `client/src/const.ts` lines 4–16 | 1 min |
| 13 | 🟢 | Fix migration 0002 header comment | `drizzle/migrations/0002_rls_policies_and_indexes.sql` line 6 | 1 min |
