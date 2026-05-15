# API Surface — Current State

> **Last verified:** 2026-05-14 against `server/routers/index.ts` (composition), `server/routers/_shared.ts` (role guards), `server/_core/trpc.ts` (auth-level guards), and a full glob of `server/routers/**/*.ts`.

The TTML API is overwhelmingly **tRPC v11** (mounted at `/api/trpc`). REST is reserved for webhooks, raw-body endpoints, and a handful of streaming routes.

---

## appRouter composition

From [`server/routers/index.ts`](../../../server/routers/index.ts):

```ts
export const appRouter = router({
  system, auth, letters, review, admin,
  notifications, versions, billing, affiliate, profile,
  documents, blog, templates, intakeFormTemplates,
});
export type AppRouter = typeof appRouter;
```

14 sub-routers. The `system` router lives at [`server/_core/systemRouter.ts`](../../../server/_core/systemRouter.ts); the rest live under [`server/routers/`](../../../server/routers/).

---

## Per-sub-router map

| Sub-router | Base auth tier | File / files | Key procedures |
|---|---|---|---|
| `system` | public | `server/_core/systemRouter.ts` | `healthCheck`, `stats` |
| `auth` | public + protected | `server/routers/auth.ts` | `me`, `logout`, `completeOnboarding` |
| `letters` | `subscriberProcedure` / `verifiedSubscriberProcedure` | `server/routers/letters/index.ts` composing `submit.ts`, `subscriber.ts`, `client-approval.ts` | `submit`, `myLetters`, `detail`, `clientApprove`, `clientRequestRevision`, free-preview helpers |
| `review` | `attorneyProcedure` | `server/routers/review/index.ts` composing `queue.ts`, `actions.ts` | `queue`, `letterDetail`, `claim`, `unclaim`, `saveEdit`, `approve`, `reject`, `requestChanges`, `requestClientApproval` |
| `admin` | `adminProcedure` (role + 2FA) | `server/routers/admin/index.ts` composing `letters.ts`, `users.ts`, `jobs.ts`, `learning.ts` | `allLetters`, `users`, `updateRole`, `failedJobs`, `retryJob`, `letterJobs`, `forceStatusTransition`, `forceFreePreviewUnlock`, `repairLetterState`, learning analytics |
| `notifications` | `protectedProcedure` | `server/routers/notifications.ts` | `list`, `markRead`, `markAllRead` |
| `versions` | `protectedProcedure` (role-aware truncation) | `server/routers/versions.ts` | `get` — server-side truncates content (~100 chars) for subscribers when status is `generated_locked` and not unlocked. Full free-preview content returned when `freePreviewUnlocked = true` |
| `billing` | `protectedProcedure` / `subscriberProcedure` | `server/routers/billing/index.ts` composing `letters.ts`, `subscriptions.ts` | `getSubscription`, `checkCanSubmit`, `createCheckout`, `createBillingPortal`, `checkFirstLetterFree`, `freeUnlock`, `payToUnlock` |
| `affiliate` | `employeeProcedure` / `adminProcedure` / `publicProcedure` | `server/routers/affiliate/index.ts` composing `employee.ts`, `admin.ts` | Employee: `myCode`, `myEarnings`, `myCommissions`, `requestPayout`, `myPayouts`. Public: `validateCode`. Admin: oversight procedures |
| `profile` | `protectedProcedure` | `server/routers/profile.ts` | `get`, `update`, password / email changes |
| `documents` | `subscriberProcedure` (or `protectedProcedure`) | `server/routers/documents.ts` | `analyze` — free GPT-4o document analyzer |
| `blog` | `publicProcedure` (read) / `adminProcedure` (write) | `server/routers/blog.ts` | `getPost`, `listPosts`, admin CRUD |
| `templates` | mixed | `server/routers/templates.ts` | Pre-canned `letter_templates` CRUD |
| `intakeFormTemplates` | `protectedProcedure` | `server/routers/intakeFormTemplates.ts` | Per-user custom intake form definitions |

**Composition pattern**: `index.ts` for each multi-file router uses `router({ ... })` to merge procedures from each sub-file. Admin and affiliate were split for maintainability — do not re-collapse them into monolithic files.

---

## REST endpoints (the only non-tRPC routes)

All registered in [`server/_core/index.ts`](../../../server/_core/index.ts):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` | none | Manual signup (Supabase) |
| `POST` | `/api/auth/login` | none | Manual login (Supabase) |
| `POST` | `/api/stripe/webhook` | Stripe signature (`STRIPE_WEBHOOK_SECRET`) | Stripe events. Raw-body route — must come before `express.json()` |
| `POST` | `/api/pipeline/n8n-callback` | `x-ttml-callback-secret` (`N8N_CALLBACK_SECRET`) | n8n alternative pipeline callback (dormant — only active when `N8N_PRIMARY=true`) |
| `GET` | `/api/letters/:id/draft-pdf` | session | PDF streaming endpoint (returns `application/pdf`) |
| `GET` | `/health`, `/api/health`, `/api/system/health` | none | Health checks for Railway / load balancers |

No other REST routes. If you're tempted to add one, ask: can this be a tRPC mutation? Almost always yes.

---

## Procedure guard locations (verified)

This is the most-drifted bit of documentation in the repo. **Correct as of 2026-05-14:**

### `server/_core/trpc.ts` exports

```ts
publicProcedure
protectedProcedure        // requires ctx.user
emailVerifiedProcedure    // requires ctx.user + ctx.user.emailVerified
adminProcedure            // role === 'admin' + admin_2fa cookie
superAdminProcedure       // role === 'admin' + admin_2fa cookie + email in HARDCODED_OWNER_EMAILS
                          // HARDCODED_OWNER_EMAILS = ["moizj00@gmail.com", "moizj00@yahoo.com"]
```

### `server/routers/_shared.ts` exports

```ts
subscriberProcedure          // role === 'subscriber' (admin NOT allowed here)
verifiedSubscriberProcedure  // subscriber + emailVerified
attorneyProcedure            // role === 'attorney' OR 'admin'
employeeProcedure            // role === 'employee' OR 'admin'
```

Note: `subscriberProcedure` strictly excludes admins (deliberate — most admin actions don't have a subscriber-context to test against). `attorney` and `employee` procedures grant access to admin as an or-escape-hatch, but **`employeeProcedure` does NOT confer attorney-review access** — those are independent permission scopes.

### `adminProcedure` vs `superAdminProcedure`

Both require the `admin_2fa` cookie (validated by `verifyAdmin2FAToken`). The difference is the additional email whitelist. Use `superAdminProcedure` for genuinely destructive / bypass operations (`forceStatusTransition`, `forceFreePreviewUnlock`) that should not be available to non-owner admins. The current owner whitelist is **hard-coded in `_core/trpc.ts`**, separate from the `SUPER_ADMIN_EMAILS` constant in [`server/supabaseAuth.ts`](../../../server/supabaseAuth.ts) which gates role-promotion on user sync.

---

## tRPC + TanStack Query patterns

Standard, but the gotchas trip people:

- **Object form only**: `useQuery({ queryKey: ['...'] })`. Positional `useQuery(['key'])` is rejected by v5.
- **No custom `queryFn` on tRPC queries** — the default fetcher is pre-configured via `@trpc/react-query`.
- **Invalidation** — after every mutation, `queryClient.invalidateQueries({ queryKey: [...] })`. Import `queryClient` from `@/lib/queryClient`.
- **Serializer** — `superjson` handles Date, BigInt, Map, Set transparently in both directions.
- **Error model** — always throw `TRPCError`, never raw `Error`:
  ```ts
  if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
  if (letter.userId !== ctx.user.id && ctx.user.role !== "admin")
    throw new TRPCError({ code: "FORBIDDEN" });
  ```
- **Variable keys** — use array form: `queryKey: ['/api/recipes', id]` — never a template-string key.

---

## Rate limiting

Configured in [`server/rateLimiter.ts`](../../../server/rateLimiter.ts) using Upstash Redis (`@upstash/ratelimit`):

| Scope | Limit | Behaviour if Redis is down |
|---|---|---|
| `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password` | 10 req / 15 min | **Fail-closed** — denies request |
| `/api/trpc/*` (general) | 60 req / 1 min | Fail-open — allows |
| Sensitive mutations (`letters.submit`) | 5 / hour via `checkTrpcRateLimit` | Fail-open |

Express JSON body limit is **12 MB** (to accommodate large legal document uploads).

---

## CORS

Allowed origins (configured in `_core/index.ts`): production domains (`talk-to-my-lawyer.com`, `www.talk-to-my-lawyer.com`), `*.railway.app`, `*.replit.dev`, `localhost` (dev only), plus comma-separated `CORS_ALLOWED_ORIGINS` env var.

---

## Specialist-skill cross-references

- Backend patterns + intake schema: [`skills-audit/corrected/ttml-backend-patterns/SKILL.md`](../../../skills-audit/corrected/ttml-backend-patterns/SKILL.md)
- Data API expert (query patterns, common pitfalls): [`skills-audit/corrected/ttml-data-api-expert/SKILL.md`](../../../skills-audit/corrected/ttml-data-api-expert/SKILL.md)
- Routing detail for client + server: [`plugins/route-handle/skills/route-handle/references/ttml-routing.md`](../../../plugins/route-handle/skills/route-handle/references/ttml-routing.md)

---

**Sources read:** `server/routers/index.ts`, `server/routers/_shared.ts`, `server/_core/trpc.ts`, recursive glob of `server/routers/**/*.ts`, `AGENTS.md` §9, `CLAUDE.md` (REST list), `ARCHITECTURE.md` (router table — note: ARCHITECTURE.md lists `admin.updateRole, allLetters, users, payouts, forceStatusTransition` which is accurate).
