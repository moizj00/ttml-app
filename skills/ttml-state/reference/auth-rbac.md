# Auth & RBAC — Current State

> **Last verified:** 2026-05-14 against `server/_core/trpc.ts`, `server/routers/_shared.ts`, `server/supabaseAuth.ts`, `server/_core/admin2fa.ts`, `client/src/_core/hooks/useAuth.ts`, `client/src/components/ProtectedRoute.tsx`.

Hybrid auth: Supabase issues JWTs; the server syncs the Supabase user to a local `users` row on every authenticated request (30s in-memory cache to prevent thrash). All RBAC enforcement is server-side via tRPC procedure middleware — **never trust the client**.

---

## 1. Auth flow

1. **Login / signup** — handled by Supabase via REST endpoints `/api/auth/login` and `/api/auth/signup`. On success, Supabase returns a JWT.
2. **JWT transport** — the server accepts the token from either:
   - `Authorization: Bearer <jwt>` header, OR
   - `sb_session` httpOnly cookie (set via `/api/auth/*` responses, signed with `JWT_SECRET`).
3. **Per-request sync** — every protected request runs through context creation:
   - Verify JWT signature (Supabase JWKS).
   - Decode → Supabase user UUID.
   - Look up the local `users` row by `openId`; create if missing (`server/supabaseAuth.ts` → user sync). Result is cached for 30s.
4. **Role assignment** — the `users.role` column (`userRoleEnum`) is the authority. Promotion happens via `admin.updateRole` (admin + 2FA), which also runs the super-admin whitelist check.
5. **Cache invalidation** — `invalidateUserCache(userId)` after any role mutation; the client also uses `refetchOnWindowFocus` so subsequent tRPC calls re-sync.

---

## 2. Roles

Four flat roles in `userRoleEnum` — no `admin_sub_role`:

| Role | Dashboard | Scope |
|---|---|---|
| `subscriber` | `/dashboard` | Own letters, billing, profile, free preview, paywall, intake, document analyzer |
| `employee` | `/employee` | Affiliate dashboard, discount codes, commission ledger, payout requests (affiliate scope only — **does NOT** grant attorney-review access) |
| `attorney` | `/attorney` | Review Center queue + detail, claim/unclaim, save edit, approve / reject / request changes |
| `admin` | `/admin` | Full platform — users, letters, jobs, learning, blog, affiliate oversight. Always requires email 2FA |

For exhaustive per-area / per-role access, see [`docs/ROLE_AREA_MATRIX.md`](../../../docs/ROLE_AREA_MATRIX.md).

---

## 3. Procedure guard inventory

This is the most drifted topic in the repo's older docs. **Current (verified) locations:**

### `server/_core/trpc.ts` — auth-level guards

```ts
publicProcedure              // no auth required
protectedProcedure           // ctx.user must exist
emailVerifiedProcedure       // ctx.user exists AND ctx.user.emailVerified
adminProcedure               // ctx.user.role === 'admin' AND admin_2fa cookie verified
superAdminProcedure          // adminProcedure conditions + email in HARDCODED_OWNER_EMAILS
```

`HARDCODED_OWNER_EMAILS = ["moizj00@gmail.com", "moizj00@yahoo.com"]` (lines ~101-104 of `_core/trpc.ts`).

### `server/routers/_shared.ts` — role-level guards

```ts
subscriberProcedure           // ctx.user.role === 'subscriber'    (admin NOT allowed)
verifiedSubscriberProcedure   // subscriber + emailVerified
attorneyProcedure             // role === 'attorney' OR 'admin'    (admin allowed)
employeeProcedure             // role === 'employee' OR 'admin'    (admin allowed; NOT attorney scope)
```

**Important asymmetry**:
- `subscriberProcedure` deliberately rejects admins (most subscriber actions need a real subscriber context with billing state).
- `attorney` and `employee` procedures accept admin as an or-escape — but `employeeProcedure` is **affiliate scope only**, not attorney-review.

---

## 4. Admin 2FA

[`server/_core/admin2fa.ts`](../../../server/_core/admin2fa.ts) issues a signed cookie (`admin_2fa`) after the admin enters an email-delivered verification code (table `admin_verification_codes`). The cookie is verified by `adminProcedure` and `superAdminProcedure`. Codes are short-lived and one-time.

Frontend flow:
- Admin logs in → no 2FA cookie → `ProtectedRoute` redirects to `/admin/verify`
- Admin enters the code from email → `/api/auth/admin-2fa` mutation issues the cookie
- Subsequent admin tRPC calls succeed

There is no SMS or TOTP path — email is the only second factor.

---

## 5. Super-admin whitelists (two layers)

| Constant | File | Role |
|---|---|---|
| `SUPER_ADMIN_EMAILS` | [`server/supabaseAuth.ts`](../../../server/supabaseAuth.ts) | Used during user sync. Determines who can be promoted to `admin` via `admin.updateRole`. If an email is in the whitelist, sync grants admin on first login automatically (subject to environment) |
| `HARDCODED_OWNER_EMAILS` | [`server/_core/trpc.ts`](../../../server/_core/trpc.ts) | Used by `superAdminProcedure`. Restricts the most destructive operations (`forceStatusTransition`, `forceFreePreviewUnlock`) to the platform owner only |

Both lists are **source-controlled and hard-coded** — they cannot be modified through any UI or API. To rotate them you must edit the file and redeploy. Per [`skills/architectural-patterns/super_admin_whitelist.md`](../../architectural-patterns/super_admin_whitelist.md), do not generate any endpoint or UI that assigns the `admin` role dynamically.

---

## 6. Frontend route protection

[`client/src/components/ProtectedRoute.tsx`](../../../client/src/components/ProtectedRoute.tsx) wraps any route that requires auth. Decision tree:

1. Not authenticated → redirect to `/login?next=<currentPath>`
2. Email not verified (non-admin) → redirect to `/verify-email`
3. Admin without 2FA cookie → redirect to `/admin/verify`
4. Wrong role for this route → redirect to the user's own role dashboard (`/dashboard`, `/employee`, `/attorney`, `/admin`)

The auth hook lives at the unusual path **[`client/src/_core/hooks/useAuth.ts`](../../../client/src/_core/hooks/useAuth.ts)** (note the `_core` segment). Do not import from `client/src/hooks/useAuth.ts` — it doesn't exist.

---

## 7. CORS, headers, cookies

Security headers (set in `server/_core/index.ts`):
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (production only)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (production only) — restricts scripts, styles, frames
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Robots-Tag` — `noindex` on auth/dashboard/API routes; `index,follow` on public marketing pages

Cookie config in [`server/_core/cookies.ts`](../../../server/_core/cookies.ts):
- `sb_session` — httpOnly, signed with `JWT_SECRET`, `SameSite=Lax`, `Secure` in production
- `admin_2fa` — httpOnly, signed, short-lived

---

## 8. Common pitfalls

- **Stale role after promotion** — Always call `invalidateUserCache(userId)` after `admin.updateRole`; the client `refetchOnWindowFocus` picks up the change on next focus.
- **2FA cookie expired** — Returns `FORBIDDEN: ADMIN_2FA_REQUIRED`. Send the admin back through `/admin/verify`.
- **Subscriber actions with admin user** — Most subscriber procedures reject admin context deliberately. Use `forceStatusTransition` or admin-specific endpoints instead of impersonating.
- **JWT in `Authorization` AND cookie** — Authorization header takes precedence in context creation. Useful for server-to-server or test scripts.
- **RLS bypass** — `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — server-only, never expose to the client.

---

## 9. Specialist-skill cross-references

- Database RLS + security: [`skills-audit/corrected/ttml-database-rls-security/SKILL.md`](../../../skills-audit/corrected/ttml-database-rls-security/SKILL.md)
- Security review playbook: [`skills-audit/corrected/ttml-security-review/SKILL.md`](../../../skills-audit/corrected/ttml-security-review/SKILL.md)
- Pattern files: [`skills/architectural-patterns/rbac_enforcement.md`](../../architectural-patterns/rbac_enforcement.md), [`skills/architectural-patterns/super_admin_whitelist.md`](../../architectural-patterns/super_admin_whitelist.md)

---

**Sources read:** `server/_core/trpc.ts`, `server/routers/_shared.ts`, `server/supabaseAuth.ts` (referenced — re-verify whitelist constant before any rotation), `server/_core/admin2fa.ts` (referenced), `client/src/components/ProtectedRoute.tsx` (referenced), `client/src/_core/hooks/useAuth.ts` (referenced), `AGENTS.md` §7, `ARCHITECTURE.md` (User Roles table), `CLAUDE.md`.
