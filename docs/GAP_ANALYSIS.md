# Talk-to-My-Lawyer — Comprehensive Gap Analysis

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

## GAPS — Features Still Needed (Priority Order)

### GAP 1: Role Split — Attorney vs Employee (HIGH PRIORITY)
**Current:** 3 roles (subscriber, employee, admin). Employee role handles BOTH review center AND affiliate.
**Required:** 4 roles: subscriber, employee (affiliate only), attorney (review center), admin (ops).

- [ ] Add `attorney` to userRoleEnum in drizzle/schema.ts
- [ ] Create `attorneyProcedure` guard in routers.ts
- [ ] Move review center routes from `/employee/` to `/attorney/` path
- [ ] Create new employee pages focused on affiliate/discount only
- [ ] Update ProtectedRoute to handle attorney role
- [ ] Update AppLayout nav items for attorney vs employee

### GAP 2: Onboarding Role Selection (HIGH PRIORITY)
**Current:** Signup creates user with default role. No role selection screen.
**Required:** Post-signup screen with "I am a Client" / "I am an Employee (Affiliate)" / "I am an Attorney"

- [ ] Create `/onboarding` page with role selection + profile completion (name, jurisdiction)
- [ ] Auto-generate affiliate discount code for employee role
- [ ] Redirect new users to onboarding before dashboard

### GAP 3: Employee Affiliate System (MEDIUM PRIORITY)
**Current:** No affiliate/discount/commission system exists at all.
**Required:** Full affiliate portal with discount codes, referral stats, commission tracking, payout requests.

- [ ] Add discount_codes table (code, employeeId, usageCount, etc.)
- [ ] Add commission_ledger table (employeeId, transactionId, amount, status)
- [ ] Add payout_requests table (employeeId, amount, status)
- [ ] Backend: auto-generate discount code on employee signup
- [ ] Backend: commission calculation on Stripe payment with discount code
- [ ] Employee dashboard: earnings widgets, referral stats, copy code button
- [ ] Employee payout request workflow

### GAP 4: Subscriber Feature Completion (MEDIUM PRIORITY)
- [ ] Copy to clipboard button (when letter is unlocked/approved)
- [ ] Soft delete draft (add deletedAt column, filter in queries)
- [ ] Resume unfinished draft / "Finish Draft" button on dashboard
- [ ] Better processing progress modal with real step messages (researching → drafting → finalizing)
- [ ] In-app payment receipts page (or link to Stripe portal)

### GAP 5: Intake Form Missing Fields (MEDIUM PRIORITY)
- [ ] Language field (dropdown: English, Spanish, French, etc.)
- [ ] Deadlines field (structured date + description)
- [ ] Communications history field (textarea for prior correspondence)
- [ ] toneAndDelivery as proper object (not just tonePreference string)

### GAP 6: Homepage Enhancements (LOW PRIORITY)
- [ ] Hero section animated typing effect
- [ ] Trust signals: SSL badge, Stripe verified logo, testimonials
- [ ] "How it Works" timeline with icons (currently exists but could be enhanced)

### GAP 7: Admin Dashboard Enhancements (LOW PRIORITY)
- [ ] Financial charts (revenue, MRR, affiliate payouts)
- [ ] SLA countdown timers on review queue (letters pending > 24h)
- [ ] User management: ban/revoke access, adjust employee balance

### GAP 8: Email Completeness (LOW PRIORITY)
- [ ] Welcome email on signup
- [ ] Payment receipt email
- [ ] "Action Required" alert to attorney when $50 review is paid

### GAP 9: Pricing Consistency (LOW PRIORITY)
- [ ] Ensure $10 unlock fee + $50 attorney review fee are separate and consistent
- [ ] Pricing page feature comparison table
- [ ] "Contact Enterprise Sales" button

---

## Implementation Priority Order

1. **GAP 1 + GAP 2**: Role split + onboarding (foundation for everything else)
2. **GAP 4**: Subscriber feature completion (copy, soft delete, resume draft, progress modal)
3. **GAP 5**: Intake form missing fields
4. **GAP 3**: Employee affiliate system (largest new feature)
5. **GAP 6-9**: Polish items
