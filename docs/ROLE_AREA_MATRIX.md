# Role & Area Access Matrix

Which role can reach which area — at a glance.

> **For auth system details:** See [`AGENTS.md`](../AGENTS.md) §7  
> **For deployment & env vars:** See [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md)

| Role | DB enum | Dashboard |
|------|---------|-----------|
| **Subscriber** | `subscriber` | `/dashboard` |
| **Employee** | `employee` | `/employee` |
| **Attorney** | `attorney` | `/attorney` |
| **Admin** | `admin` | `/admin` |

## Frontend Routes

| Route group | subscriber | employee | attorney | admin |
|-------------|:----------:|:--------:|:--------:|:-----:|
| Public (`/`, `/pricing`, `/blog`, `/services`, …) | ✓ | ✓ | ✓ | ✓ |
| Auth (`/login`, `/signup`, `/verify-email`, …) | ✓ | ✓ | ✓ | ✓ |
| `/onboarding` | ✓ | ✓ | ✓ | ✓ |
| `/profile` | ✓ | ✓ | ✓ | ✓ |
| `/dashboard`, `/submit`, `/letters`, `/library` | ✓ | — | — | — |
| `/subscriber/billing`, `/subscriber/receipts`, `/subscriber/intake-templates` | ✓ | — | — | — |
| `/attorney/*`, `/review/*` | — | — | ✓ | ✓ |
| `/employee`, `/employee/referrals`, `/employee/earnings` | — | ✓ | — | ✓ |
| `/admin/verify` | — | — | — | ✓ |
| `/admin`, `/admin/users`, `/admin/letters`, `/admin/jobs`, … | — | — | — | ✓+2FA |

## Backend tRPC Procedure Guards

| Router namespace | Guard | subscriber | employee | attorney | admin |
|-----------------|-------|:----------:|:--------:|:--------:|:-----:|
| `letters` (submit) | verifiedSubscriber | ✓ | — | — | — |
| `letters` (subscriber) | subscriber | ✓ | — | — | — |
| `letters` (client-approval.subscriber) | subscriber | ✓ | — | — | — |
| `letters` (client-approval.attorney) | attorney | — | — | ✓ | ✓ |
| `letters` (adminSubmit) | admin+2FA | — | — | — | ✓+2FA |
| `review` | attorney | — | — | ✓ | ✓ |
| `affiliate` (employee) | employee | — | ✓ | — | ✓ |
| `affiliate` (admin) | admin+2FA | — | — | — | ✓+2FA |
| `affiliate` (validateCode) | public | ✓ | ✓ | ✓ | ✓ |
| `admin` | admin+2FA | — | — | — | ✓+2FA |
| `billing` (subscriptions) | protected / subscriber | ✓ | — | — | — |
| `billing` (letters) | verifiedSubscriber | ✓ | — | — | — |
| `blog` (public) | public | ✓ | ✓ | ✓ | ✓ |
| `blog` (admin*) | admin+2FA | — | — | — | ✓+2FA |
| `templates` (listActive, getById) | subscriber\|admin | ✓ | — | — | ✓ |
| `templates` (admin CRUD) | admin+2FA | — | — | — | ✓+2FA |
| `documents` (analyze) | emailVerified | ✓ | ✓ | ✓ | ✓ |
| `documents` (getMyAnalyses) | protected | ✓ | ✓ | ✓ | ✓ |
| `versions` | protected | ✓ | ✓ | ✓ | ✓ |
| `notifications` | protected | ✓ | ✓ | ✓ | ✓ |
| `profile` | protected | ✓ | ✓ | ✓ | ✓ |
| `intakeFormTemplates` | subscriber | ✓ | — | — | — |

## Redirect Rules

- **Unauthenticated** → `/login?next=<current path>`
- **Wrong role** → own dashboard (`getRoleDashboard(role)`)
- **Email not verified** (non-admin) → `/verify-email`
- **Admin without 2FA** on admin-only routes → `/admin/verify`

## Explore Further

- Route definitions → `client/src/App.tsx`
- Route guard component → `client/src/components/ProtectedRoute.tsx`
- tRPC procedure guards → `server/routers/_shared.ts`, `server/_core/trpc.ts`
- Role enum & schema → `drizzle/schema/users.ts`, `drizzle/schema/constants.ts`
- Status machine (letter lifecycle) → `shared/types/letter.ts`
- Admin 2FA enforcement → `server/_core/admin2fa.ts`
- Super admin whitelist → `server/supabaseAuth/helpers.ts`
- Architectural pattern docs → `skills/architectural-patterns/rbac_enforcement.md`, `skills/architectural-patterns/super_admin_whitelist.md`
