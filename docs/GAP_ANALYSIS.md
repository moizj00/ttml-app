# Talk-to-My-Lawyer — Comprehensive Gap Analysis

> **HISTORICAL DOCUMENT — Point-in-time gap analysis from February 2026.** All 9 gaps listed below have been resolved in subsequent phases. For the current state of the platform, refer to `STRUCTURE.md` and `docs/FEATURE_MAP.md` as the living sources of truth.

**Audited: 2026-02-25** | Based on: Google Doc Feature Map + Pasted Feature Prompt + Codebase Audit

---

## DONE — Working Features (DO NOT BREAK)

### Subscriber Journey
- [x] Multi-step intake form (6 steps: type, jurisdiction, parties, story, outcome, evidence)
- [x] Attachment upload in submit flow (S3 via storagePut)
- [x] AI pipeline: Perplexity research → Anthropic draft → Anthropic assembly
- [x] Status transitions: submitted → researching → drafting → generated_locked → pending_review → under_review → approved
- [x] Letter Detail page with status timeline and intake summary
- [x] LetterPaywall: blur + overlay for locked letters, first-letter-free check
- [x] My Letters list with status badges and filters
- [x] PDF download (server-generated via PDFKit + S3)
- [x] Onboarding welcome modal for new subscribers
- [x] FAQ page + inline FAQ on homepage
- [x] Role-based routing via ProtectedRoute component
- [x] Toast notifications on all key actions

### Attorney/Employee Review Center
- [x] Review queue (pending_review / under_review / needs_changes)
- [x] Review detail with intake panel, attachments, AI draft, research panel
- [x] All 5 review actions: claim, save edit, request changes, approve, reject
- [x] Claim → subscriber notification (email + in-app)
- [x] Approve → PDF generation → S3 upload → pdfUrl stored → email with link

### Admin Portal
- [x] Admin dashboard with system overview
- [x] All Letters view with search
- [x] Failed jobs monitor + retry
- [x] Force status transition
- [x] User role management

### Backend
- [x] Stripe webhook handler (checkout.session.completed → letter unlock)
- [x] Email notifications via Resend (letter ready, under review, approved, needs changes, rejected)
- [x] tRPC procedure guards (subscriberProcedure, employeeProcedure, adminProcedure)
- [x] All 7 database indexes
- [x] Pipeline retry logic with error handling

---

## GAPS — All Resolved

All 9 gaps identified in this audit have been resolved in subsequent phases.

### GAP 1: Role Split — Attorney vs Employee — ✅ COMPLETED (Phase 57)

- [x] Add `attorney` to userRoleEnum in drizzle/schema.ts
- [x] Create `attorneyProcedure` guard in routers.ts
- [x] Move review center routes from `/employee/` to `/attorney/` path
- [x] Create new employee pages focused on affiliate/discount only
- [x] Update ProtectedRoute to handle attorney role
- [x] Update AppLayout nav items for attorney vs employee

### GAP 2: Onboarding Role Selection — ✅ COMPLETED (Phase 41)

- [x] Create `/onboarding` page with role selection + profile completion (name, jurisdiction)
- [x] Auto-generate affiliate discount code for employee role
- [x] Redirect new users to onboarding before dashboard

### GAP 3: Employee Affiliate System — ✅ COMPLETED (Phase 40 + Phase 68)

- [x] Add discount_codes table (code, employeeId, usageCount, etc.)
- [x] Add commission_ledger table (employeeId, transactionId, amount, status)
- [x] Add payout_requests table (employeeId, amount, status)
- [x] Backend: auto-generate discount code on employee signup
- [x] Backend: commission calculation on Stripe payment with discount code
- [x] Employee dashboard: earnings widgets, referral stats, copy code button
- [x] Employee payout request workflow

### GAP 4: Subscriber Feature Completion — ✅ COMPLETED (Phase 41 + Phase 48)

- [x] Copy to clipboard button (when letter is unlocked/approved)
- [x] Soft delete draft (add deletedAt column, filter in queries)
- [x] Resume unfinished draft / "Finish Draft" button on dashboard
- [x] Better processing progress modal with real step messages (researching → drafting → finalizing)
- [x] In-app payment receipts page (or link to Stripe portal)

### GAP 5: Intake Form Missing Fields — ✅ COMPLETED (Phase 48)

- [x] Language field (dropdown: English, Spanish, French, etc.)
- [x] Deadlines field (structured date + description)
- [x] Communications history field (textarea for prior correspondence)
- [x] toneAndDelivery as proper object (not just tonePreference string)

### GAP 6: Homepage Enhancements — ✅ COMPLETED (Phase 27 + Phase 49)

- [x] Hero section animated typing effect
- [x] Trust signals: SSL badge, Stripe verified logo, testimonials
- [x] "How it Works" timeline with icons (currently exists but could be enhanced)

### GAP 7: Admin Dashboard Enhancements — ✅ COMPLETED (Phase 86)

- [x] Financial charts (revenue, MRR, affiliate payouts)
- [x] SLA countdown timers on review queue (letters pending > 24h)
- [x] User management: ban/revoke access, adjust employee balance

### GAP 8: Email Completeness — ✅ COMPLETED (Phase 44 + Phase 76)

- [x] Welcome email on signup
- [x] Payment receipt email
- [x] "Action Required" alert to attorney when review is paid

### GAP 9: Pricing Consistency — ✅ COMPLETED (Phase 67 + Phase 69)

- [x] Pricing simplified: $200 per-letter unlock. Monthly plans available.
- [x] Pricing page feature comparison table
- [x] FAQ updated with current pricing

---

## Implementation Priority Order (Historical — All Completed)

1. **GAP 1 + GAP 2**: Role split + onboarding → DONE Phase 41, 57
2. **GAP 4**: Subscriber feature completion → DONE Phase 41, 48
3. **GAP 5**: Intake form missing fields → DONE Phase 48
4. **GAP 3**: Employee affiliate system → DONE Phase 40, 68
5. **GAP 6-9**: Polish items → DONE Phase 27, 44, 49, 67, 69, 76, 86
