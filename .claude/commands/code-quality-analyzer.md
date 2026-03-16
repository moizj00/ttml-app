---
name: code-quality-analyzer
description: "Programmatically perfect code analysis at atomic and macro levels. Use for evaluating function-level logic, weighing architectural alternatives (especially Express.js, tRPC, and Drizzle ORM conventions), auditing RBAC promotion flows, and ensuring perfect code quality through deep experience-based trade-off analysis for the TTML project."
---

# Code Quality & Decision Architect

Designed for achieving programmatic perfection at two levels: **Atomic** (functions, logic, types) and **Macro** (architecture, conventions, security).

---

## The Pursuit of Programmatic Perfection

### 1. Atomic-Level Precision

Every line must justify its existence.

* **Function Purity:** Minimize side effects; prefer deterministic logic.
* **Type Integrity:** Avoid `any`, prefer exhaustive unions, ensure types reflect runtime reality.
* **Complexity Analysis:** Eliminate O(n²) where O(n) or O(log n) is possible.
* **Error Resilience:** Every function handles its own failure modes gracefully.

### 2. Macro-Level Architectural Design

Weigh competing conventions with experience.

#### TTML Stack Trade-offs

| Decision Point | Option A | Option B | Perfect Choice for TTML |
|----------------|----------|----------|------------------------|
| API Layer | RESTful (Express) | tRPC Procedures | tRPC — end-to-end type safety, less boilerplate |
| Database Access | Raw SQL | Drizzle ORM | Drizzle — type-safe queries, migrations, raw SQL escape hatch |
| State (Client) | React Context | TanStack Query + Zustand | TanStack Query for server state, Zustand for UI state |
| Authentication | Custom Middleware | Supabase Auth | Supabase Auth integrated with tRPC context |

---

## RBAC Promotion Quality Checklist

When reviewing or implementing role changes in TTML, verify every item:

### Super Admin Security (4-Point Enforcement)

* [ ] `syncGoogleUser()` checks `SUPER_ADMIN_EMAILS` whitelist
* [ ] `verifyToken()` checks whitelist and strips admin from non-whitelisted users
* [ ] `POST /api/auth/signup` checks whitelist for email signup
* [ ] `POST /api/auth/verify-email` checks whitelist for email verification
* [ ] All 4 points use the identical `SUPER_ADMIN_EMAILS` array
* [ ] Non-whitelisted users with admin role are silently downgraded to subscriber

### Attorney Promotion Guard

* [ ] `admin.updateRole` Zod enum restricted to `["subscriber", "employee", "attorney"]`
* [ ] `admin.updateRole` calls `hasActiveRecurringSubscription()` before promoting to attorney
* [ ] Active subscribers are blocked with descriptive error message
* [ ] In-app notification sent to promoted user with link to `/attorney`
* [ ] Admin Users page dropdown only shows "Attorney" as assignable role
* [ ] Dropdown hidden for admin users, disabled for existing attorneys

### Self-Signup Lockdown

* [ ] Signup page `ROLE_OPTIONS` contains only `subscriber` and `employee`
* [ ] Onboarding page `ROLE_OPTIONS` contains only `subscriber` and `employee`
* [ ] `completeOnboarding` Zod enum restricted to `["subscriber", "employee"]`
* [ ] `ALLOWED_SIGNUP_ROLES` in email signup restricted to `["subscriber", "employee"]`
* [ ] Google OAuth `safeRole` restricted to `["subscriber", "employee"]`
* [ ] Google OAuth `requestedRole` restricted to `["subscriber", "employee"]` (all 3 routes)

### Session Refresh Integrity

* [ ] `verifyToken()` reads role from database (not JWT) on every request
* [ ] `useAuth` has `refetchOnWindowFocus: true` with appropriate `staleTime`
* [ ] `ProtectedRoute` redirects based on `user.role` from React Query cache
* [ ] Attorney routes `allowedRoles` includes both `["attorney", "admin"]`

### Attorney Review Pipeline

* [ ] `letterDetail` `canView` guard: `admin OR assignedReviewerId === user.id OR status === "pending_review"`
* [ ] `claim` mutation transitions `pending_review` → `under_review` and sets `assignedReviewerId`
* [ ] `approve` mutation creates `final_approved` version, generates PDF, notifies subscriber
* [ ] `reject` and `requestChanges` mutations log review actions and notify subscriber
* [ ] All review mutations are behind `attorneyProcedure` guard

---

## Decision Framework: Weighing Alternatives

1. **Identify the Core Constraint:** Bundle size? Security? Developer velocity?
2. **Analyze Hidden Costs:** Maintenance burden of Option A vs B in 12 months?
3. **The Experience Factor:** Apply known pitfalls (e.g., "Don't use `useEffect` for data fetching").
4. **Final Recommendation:** Definitive choice with Pros/Cons/Mitigation table.

---

## Workflow for Code Review

1. **Atomic Scan:** Logic errors, type weaknesses, performance bottlenecks.
2. **Macro Alignment:** Follows project conventions (tRPC procedures, Drizzle patterns).
3. **RBAC Audit:** Run the RBAC Promotion Quality Checklist above for any role-related changes.
4. **Trade-off Evaluation:** If a convention is challenged, perform weighted analysis.
5. **Refactoring Plan:** Step-by-step guide to reach perfection.

---

## Reference Files

* `drizzle/schema.ts` — Database structure and type definitions
* `server/supabaseAuth.ts` — Auth layer + super admin whitelist (4-point enforcement)
* `server/routers.ts` — All tRPC procedures (review + admin routers)
* `server/_core/trpc.ts` — Procedure definitions (`adminProcedure`, `attorneyProcedure`, `protectedProcedure`)
* `shared/types.ts` — Source of truth for statuses and types
