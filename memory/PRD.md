# Talk-to-My-Lawyer - PRD & Implementation Status

## Original Problem Statement
Express.js + Vite + Wouter + tRPC + Supabase via Drizzle ORM application. Ensure all areas, workflows, pipelines, and status machine with all 4 user types (subscriber, employee, attorney, admin) are functional.

## Tech Stack (items missing from README.md)
- **Upstash Redis** — rate limiting (10 auth requests / 15 min)
- **Sentry** — error tracking (client + server, pipeline/webhook tags)
- Full stack in `README.md`: React 19, Tailwind CSS 4, shadcn/ui, Wouter, Express 4, tRPC 11, Supabase/Drizzle, Supabase Auth, Stripe, Resend, Perplexity API, Anthropic Claude

## Security Architecture - VERIFIED ✅

### Backend API Security (tRPC Guards)

| Guard | Allowed Roles | Used For |
|-------|---------------|----------|
| `adminProcedure` | admin only | Role changes, user management, system settings |
| `attorneyProcedure` | attorney, admin | Review queue, claim/approve/reject letters |
| `employeeProcedure` | employee, admin | Affiliate dashboard, discount codes |
| `subscriberProcedure` | subscriber only* | Submit letters, view own letters |

\* `subscriberProcedure` does **not** allow admin — it strictly checks `role === "subscriber"`. This asymmetry is intentional: admins manage the system but do not act as subscribers.

### Frontend Routing Security (ProtectedRoute)

| Route | Allowed Roles | Notes |
|-------|---------------|-------|
| `/dashboard` | subscriber | Subscriber home |
| `/submit` | subscriber | Letter intake form |
| `/letters` | subscriber | My Letters list |
| `/letters/:id` | subscriber | Letter detail |
| `/subscriber/billing` | subscriber | Billing/plans |
| `/subscriber/receipts` | subscriber | Payment receipts |
| `/attorney`, `/attorney/queue`, `/attorney/:id` | attorney, admin | Review center |
| `/review`, `/review/queue`, `/review/:id` | attorney, admin | Aliases for /attorney/* (backward compat) |
| `/employee`, `/employee/referrals`, `/employee/earnings` | employee, admin | Affiliate dashboard |
| `/admin`, `/admin/users`, `/admin/jobs`, `/admin/letters`, `/admin/letters/:id`, `/admin/affiliate` | admin only | Admin panel |
| `/profile` | subscriber, employee, attorney, admin | All authenticated roles |
| `/onboarding` | any authenticated user | No role restriction |

Unauthorized access redirects to the user's role-default dashboard (not always `/dashboard`).

### Role Change Security

- **Only Admin can change roles** via `admin.updateRole` endpoint
- Subscribers CANNOT self-promote to attorney
- Attorneys CANNOT promote others
- Employees CANNOT promote others

### Manually Verified Scenarios

| Scenario | Result |
|----------|--------|
| Subscriber calls `review.queue` | ❌ BLOCKED: "Attorney or Admin access required" |
| Subscriber calls `review.claim` | ❌ BLOCKED: "Attorney or Admin access required" |
| Subscriber calls `review.approve` | ❌ BLOCKED: "Attorney or Admin access required" |
| Subscriber calls `admin.updateRole` | ❌ BLOCKED: "You do not have the required permission" |
| Attorney calls `admin.updateRole` | ❌ BLOCKED: "You do not have the required permission" |
| Subscriber navigates to `/attorney` | ✅ Redirected away |
| Admin promotes user to attorney | ✅ Role updated, user sees Attorney Dashboard |

## Current State (Phase 86, March 16, 2026)

**Tests:** ~617 passing across 38 test files | **TypeScript:** 0 errors | **Build:** Clean (41 chunks)

## Complete Feature Verification

### ✅ AI Pipeline - FULLY FUNCTIONAL

Status machine flow (Stripe payment gates access to review):

```
submitted → researching → drafting → generated_locked
                                           │
                                   [Stripe payment / free unlock]
                                           │
                                           ▼
                               pending_review → under_review → approved
                                                            → rejected
                                                            → needs_changes
                                                                  │
                                                            [re-submit]
                                                                  │
                                                           researching (retry)
```

- Stage 1: Perplexity API (sonar-pro) — legal research
- Stage 2: Anthropic Claude — letter drafting
- Stage 3: Anthropic Claude — final assembly

### ✅ Attorney Review Center - SECURED & FUNCTIONAL
- Review Queue only visible to attorneys/admins
- Claim, approve, reject, request changes all working
- Inline editing via Tiptap rich text editor
- Status machine transitions logged

### ✅ Notification System - WORKING
- Subscribers notified on: claim (`letter_under_review`), approve (`letter_approved`), reject (`letter_rejected`), changes requested (`needs_changes`)
- Attorneys notified on: new letter ready for review (`pending_review`)
- Email notifications via Resend; in-app notifications with bell icon

### ✅ Role-Based Access Control - ENFORCED
- Backend: tRPC middleware guards (see Security Architecture above)
- Frontend: ProtectedRoute component with `allowedRoles` prop
- Database: Role stored in `users` table

## Active Integrations

| Integration | Status | Notes |
|------------|--------|-------|
| Anthropic Claude | ✅ Live | Letter drafting + assembly |
| Perplexity API | ✅ Live | Legal research (sonar-pro) |
| Stripe | ✅ Live keys | Payment processing (not test mode) |
| Resend | ✅ Live | Email notifications |
| Upstash Redis | ✅ Live | Rate limiting |
| Sentry | ✅ Live | Error tracking |
| n8n | ⛔ Disabled | Optional workflow automation — do not attempt to activate |

## User Flows

### Subscriber Flow
1. Sign up → Email verification → `/dashboard`
2. Submit letter → AI processes → See status timeline
3. Pay (Stripe) or free unlock → Letter goes to review queue
4. Receive notifications on status changes
5. Download approved PDF

### Attorney Flow (AFTER Admin Promotion)
1. Admin toggles role at `/admin/users`
2. User logs in → Sees Attorney Dashboard at `/attorney`
3. View Review Queue → Claim letters
4. See FULL AI draft (unlocked)
5. Edit inline → Approve/Reject/Request Changes

### Admin Flow
1. Access `/admin` dashboard
2. Manage users at `/admin/users`
3. Toggle roles with dropdown (Subscriber ↔ Attorney ↔ Employee ↔ Admin)
4. View all letters, failed jobs, affiliate program

## Test Credentials (test environment only — do not use in production)

| Role | Email |
|------|-------|
| Subscriber | subscriber@test.com |
| Attorney | attorney@test.com |
| Employee | employee@test.com |
| Admin | admin@test.com |
| New Attorney | testuser123@example.com |

## Remaining Items

### Completed (formerly P1/P2)
- [x] Stripe payment → pending_review transition (Phase 14 + webhook)
- [x] PDF generation on letter approval (Phase 38 + Phase 66)
- [x] Email delivery — 13 branded email templates via Resend (Phase 45 + Phase 76)
- [x] Mobile responsive fixes (Phase 48 Gap 4 + Phase 82)
- [x] Real-time status updates via Supabase Realtime (Phase 34)

### Open Items
- [ ] Logo replacement across all pages (Phase 42 — not yet completed)
- [ ] Remove AI references from user-visible copy (Phase 55 — partial, SEO title done)
- [ ] Letter History page redesign (Phase 72 — not yet started)

### Recently Completed
- [x] Upgrade banner for Basic → Pro subscribers (Phase 77 — UpgradeBanner.tsx wired in Dashboard.tsx)
