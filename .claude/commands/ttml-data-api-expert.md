---
name: ttml-data-api-expert
description: "Expert in data flow and API development for the Talk To My Lawyer (TTML) application. Use for: creating/modifying tRPC procedures, implementing Drizzle ORM queries with Supabase, handling authentication, enforcing RBAC (super admin whitelist, attorney promotion, subscription guards), and ensuring consistent error handling/rate limiting in the TTML project."
---

# TTML Data Flow and API Expert

Specialized knowledge and patterns for the Talk To My Lawyer (TTML) backend: Express.js + tRPC + Supabase via Drizzle ORM.

## Core Principles

1. **Standardized Responses:** Use TRPCError for all custom errors. Never return raw error strings.
2. **Security First:** All procedures use tRPC middleware (protectedProcedure, adminProcedure, attorneyProcedure). Rate limiting at Express.js level or within procedures.
3. **Type Safety:** Drizzle ORM for DB interactions, Zod schemas for input validation.
4. **Auditability:** Log all letter state changes via logReviewAction. Every attorney action creates an audit trail.

---

## Procedure Guard Hierarchy

| Guard | Defined In | Behaviour |
|-------|-----------|-----------|
| publicProcedure | _core/trpc.ts | No auth required |
| protectedProcedure | _core/trpc.ts | Requires authenticated user; throws UNAUTHORIZED |
| adminProcedure | _core/trpc.ts | Requires role === "admin"; throws FORBIDDEN |
| attorneyProcedure | server/routers.ts | Extends protectedProcedure; requires role === "attorney" \|\| role === "admin"; throws FORBIDDEN |

---

## Super Admin Whitelist (Hard-Coded)

Only `ravivo@homes.land` and `moizj00@gmail.com` can hold admin role. Enforced at 4 points in `server/supabaseAuth.ts`:

1. `syncGoogleUser()` — Google OAuth
2. `verifyToken()` — Every authenticated request (reads role from DB, not JWT)
3. `POST /api/auth/signup` — Email signup
4. `POST /api/auth/verify-email` — Email verification

Non-whitelisted users who acquire admin are silently stripped to subscriber on next auth.

---

## Attorney Promotion Flow (Data Layer)

Attorneys cannot self-register. The only path is super admin promotion via `admin.updateRole`.

### updateRole Mutation Structure

```ts
adminProcedure
  → z.enum(["subscriber", "employee", "attorney"])
  → if (attorney)
    → hasActiveRecurringSubscription(userId)
    → BAD_REQUEST if true
    → updateUserRole(userId, role)
    → if (attorney)
      → createNotification({ type: "role_updated", link: "/attorney" })
    → return { success: true }
```

**Guards:**
* Zod enum excludes "admin" — sending it returns validation error.
* `hasActiveRecurringSubscription()` prevents promoting active subscribers (billing conflict).
* Notification failure is non-blocking (try/catch with console.error).

### Session Refresh After Promotion

* `verifyToken()` reads role from DB on every request — server always has correct role.
* Client `useAuth` has `refetchOnWindowFocus: true` with `staleTime: 30_000ms`.
* Tab switch triggers `auth.me` re-fetch → React Query cache updates → ProtectedRoute redirects to `/attorney`.

---

## Attorney Review Pipeline (Data Layer)

### letterDetail — canView Guard

```ts
const canView = ctx.user.role === "admin" ||
  letter.assignedReviewerId === ctx.user.id ||
  letter.status === "pending_review";
```

Attorneys can view (not edit) any `pending_review` letter. Edit/approve/reject require `under_review` + assignment.

### claim Mutation

```ts
attorneyProcedure
  → getLetterRequestById
  → claimLetterForReview(letterId, userId)
  → logReviewAction("claimed_for_review")
  → sendStatusUpdateEmail
  → return { success: true }
```

`claimLetterForReview` is atomic: uses `WHERE isNull(assignedReviewerId) OR assignedReviewerId = reviewerId` to prevent race conditions.

### approve Mutation

```ts
attorneyProcedure
  → assignment guard
  → status === "under_review" guard
  → createLetterVersion("final_approved")
  → updateLetterStatus("approved")
  → logReviewAction("approved")
  → generatePdf (non-blocking)
  → sendApprovalEmail
  → return { success: true }
```

Admin bypasses assignment check (`ctx.user.role !== "admin" && ...`).

### reject / requestChanges Mutations

Same guard pattern: assignment + `under_review` status. `requestChanges` requires `userVisibleNote.min(10)` and optionally retriggers the pipeline.

---

## Workflow: Creating a New tRPC Procedure

1. Choose the guard: `publicProcedure`, `protectedProcedure`, `adminProcedure`, or `attorneyProcedure`.
2. Define Zod input schema: Restrict enums to valid values. Never include "admin" in role enums.
3. Add business guards: Subscription checks, status checks, assignment checks as needed.
4. Execute DB logic: Use Drizzle ORM functions from `server/db.ts`.
5. Log audit trail: Call `logReviewAction` for any letter state change.
6. Handle side effects: Notifications (`createNotification`), emails (`sendStatusUpdateEmail`), PDF generation.
7. Wrap non-critical side effects in try/catch: Notification and email failures must not block the mutation.

---

## Key DB Functions

| Function | File | Purpose |
|----------|------|---------|
| updateUserRole(userId, role) | db.ts | Persists role change |
| hasActiveRecurringSubscription(userId) | db.ts | Checks Stripe subscription status |
| claimLetterForReview(letterId, reviewerId) | db.ts | Atomic claim with race condition guard |
| updateLetterStatus(id, status) | db.ts | Validates against ALLOWED_TRANSITIONS |
| createLetterVersion(data) | db.ts | Creates new version (ai_draft, attorney_edit, final_approved) |
| logReviewAction(data) | db.ts | Audit trail for all review actions |
| createNotification(data) | db.ts | In-app notification with type, title, body, link |
| getLetterVersionsByRequestId(id, includeInternal) | db.ts | false = subscriber-safe (excludes internal versions) |

---

## Reference Guides

* `API Patterns: references/api-patterns.md` — Route structure, Auth, Error handling
* `Supabase Patterns: references/supabase-patterns.md` — Client init, Data fetching, RLS

---

## Common Utilities

* `server/_core/trpc.ts` — router, publicProcedure, protectedProcedure, adminProcedure
* `server/_core/context.ts` — createContext for tRPC context with user authentication
* `server/db.ts` — getDb for Drizzle ORM client + all DB functions above
* `server/supabaseAuth.ts` — authenticateRequest, verifyToken, SUPER_ADMIN_EMAILS
* `server/routers.ts` — All tRPC procedures including attorneyProcedure, review and admin routers
