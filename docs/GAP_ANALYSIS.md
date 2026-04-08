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
- [x] **Subscriber Preview Modal** for `client_approval_pending` status (Phase 109)

### Attorney/Employee Review Center
- [x] Review queue (pending_review / under_review / needs_changes)
- [x] Review detail with intake panel, attachments, AI draft, research panel
- [x] All 5 review actions: claim, save edit, request changes, approve, reject
- [x] Claim → subscriber notification (email + in-app)
- [x] Approve → PDF generation → S3 upload → pdfUrl stored → email with link
- [x] **Modular ReviewModal** directory module (Phase 108)

### Admin Portal
- [x] Admin dashboard with system overview
- [x] All Letters view with search
- [x] Failed jobs monitor + retry
- [x] Force status transition
- [x] User role management
- [x] **Modular Learning/Affiliate** directory modules (Phase 108)

### Backend
- [x] Stripe webhook handler (checkout.session.completed → letter unlock)
- [x] Email notifications via Resend (letter ready, under review, approved, needs changes, rejected)
- [x] tRPC procedure guards (subscriberProcedure, employeeProcedure, adminProcedure)
- [x] All 7 database indexes
- [x] Pipeline retry logic with error handling
- [x] **Decomposed server modules** (Stripe, Learning, EmailPreview) — Phase 108
- [x] **Pino Logging** with zero TS errors (Phase 110)
- [x] **Stale Lock Recovery Cron** (Phase 108)

---

## GAPS — All Resolved

All 9 gaps identified in this audit have been resolved in subsequent phases.

### GAP 1: Role Split — Attorney vs Employee — ✅ COMPLETED (Phase 57)
### GAP 2: Onboarding Role Selection — ✅ COMPLETED (Phase 41)
### GAP 3: Employee Affiliate System — ✅ COMPLETED (Phase 40 + Phase 68)
### GAP 4: Subscriber Feature Completion — ✅ COMPLETED (Phase 41 + Phase 48)
### GAP 5: Intake Form Missing Fields — ✅ COMPLETED (Phase 48)
### GAP 6: Homepage Enhancements — ✅ COMPLETED (Phase 27 + Phase 49)
### GAP 7: Admin Dashboard Enhancements — ✅ COMPLETED (Phase 86)
### GAP 8: Email Completeness — ✅ COMPLETED (Phase 44 + Phase 76)
### GAP 9: Pricing Consistency — ✅ COMPLETED (Phase 67 + Phase 69)

---

## Implementation Priority Order (Historical — All Completed)

1. **GAP 1 + GAP 2**: Role split + onboarding → DONE Phase 41, 57
2. **GAP 4**: Subscriber feature completion → DONE Phase 41, 48
3. **GAP 5**: Intake form missing fields → DONE Phase 48
4. **GAP 3**: Employee affiliate system → DONE Phase 40, 68
5. **GAP 6-9**: Polish items → DONE Phase 27, 44, 49, 67, 69, 76, 86
6. **Technical Debt Remediation**: Modularization + Zero TS Errors → DONE Phase 108-110
