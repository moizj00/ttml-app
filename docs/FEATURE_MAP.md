# Talk-to-My-Lawyer — Comprehensive Feature Map

**Version:** 3.0 — April 2026  
**Author:** Manus AI  
**Scope:** Complete inventory of all implemented features, including the new modular architecture and subscriber preview modal.

---

## 1. Platform Overview

Talk-to-My-Lawyer is an AI-powered legal letter platform with mandatory attorney review. It features a four-stage AI pipeline (Perplexity → Claude Drafting → Claude Assembly → Claude Sonnet Vetting). The platform enforces a strict paywall: subscribers see a blurred draft preview and must pay $200 for attorney review before any letter is finalized.

---

## 2. Role System

| Role | DB Enum Value | Access Scope | Dashboard Route |
| --- | --- | --- | --- |
| Subscriber | `subscriber` | Own letters, billing, profile | `/dashboard` |
| Employee | `employee` | Affiliate dashboard, discount codes, commissions, payouts | `/employee` |
| Attorney | `attorney` | Review Center (queue + detail), SLA dashboard | `/attorney` |
| Super Admin | `admin` | Full platform access, user management, jobs, letters, affiliate oversight | `/admin` |

---

## 3. Architecture Evolution (Phase 108+)

The platform underwent a major technical debt remediation to decompose monolithic files into maintainable directory modules.

### 3.1 Frontend Directory Modules
Each major feature is now a directory with a thin `index.tsx` orchestrator, a `hooks/` subfolder, and focused sub-components.

- **DocumentAnalyzer/**: `useDocumentAnalyzer`, `FileUploadZone`, `AnalysisResults`.
- **ReviewModal/**: `useReviewModal`, `ReviewSidePanel`, `ReviewActionDialogs`.
- **Learning/**: `useLessonsTab`, `QualityTab`, `LessonsTab`.
- **Affiliate/**: `useAffiliateAdmin`, `AffiliatePerformanceTab`, `AffiliateCodesTab`.
- **AffiliateDashboard/**: `useAffiliateDashboard`, `AffiliateStatsCards`, `AffiliateEarningsSection`.
- **ReviewDetail/**: `useReviewDetail`, orchestrates existing panels.
- **SubscriberLetterPreviewModal/**: New modal for `client_approval_pending` status.

### 3.2 Backend Decomposition
- **server/stripe/**: Split into `client`, `checkouts`, `subscriptions`, `coupons`.
- **server/learning/**: Split into `extraction`, `quality`, `categories`, `dedup`.
- **server/emailPreview/**: Split into `builder`, `templates`.
- **server/routers/**: tRPC routers organized into sub-directories (e.g., `routers/review/`, `routers/affiliate/`).

---

## 4. Subscriber Approval Workflow (Phase 109+)

A new **Subscriber Letter Preview Modal** was added to the `client_approval_pending` status.

| Feature | Implementation |
|---|---|
| **Read-Only Preview** | Full-screen modal showing the `final_approved` version content. |
| **Approve & Send** | Subscriber approves the letter and provides recipient email for delivery. |
| **Request Changes** | Subscriber can request revisions (limited to 5 per letter). |
| **Revision Paywall** | Re-triggers Stripe checkout if the free revision count is exceeded. |
| **Auto-Open** | Modal auto-opens when a letter transitions to `client_approval_pending`. |

---

## 5. Letter Pipeline & Resilience

### 5.1 Pipeline Stages
1. **Research** (Perplexity `sonar-pro`)
2. **Drafting** (Claude `claude-opus-4-5`)
3. **Assembly** (Claude `claude-opus-4-5`)
4. **Vetting** (Claude `claude-sonnet`)

### 5.2 Stale Lock Recovery (Phase 108+)
- **New Cron**: `server/stalePipelineLockRecovery.ts` runs every 15 minutes.
- **Function**: Automatically detects and resets letters stuck in `researching` or `drafting` for >30 minutes.
- **Recovery**: Releases the lock, resets status to `submitted`, and re-enqueues for a fresh run.

---

## 6. Code Quality & Logging

- **Pino Logger**: Replaced all 427 `console.log/warn/error` calls with structured `logger` calls.
- **TS Compliance**: Fixed all 176 `TS2769` pino overload errors. The project now has **0 TypeScript errors**.
- **Migrations**: Inline startup migrations (raw SQL) moved to `drizzle/0044_startup_migrations_extraction.sql`.
- **TODO Resolution**: All 4 remaining `TODO/FIXME` comments in the active codebase have been resolved.

---

## 7. Historical Changelog (Summary)

- **Phase 108:** Frontend God Component Extraction, Backend Monolith Decomposition, Pino Logging Hardening, Stale Lock Recovery Cron.
- **Phase 109:** Subscriber Letter Preview Modal for `client_approval_pending` status.
- **Phase 110:** Final TS Error Cleanup (176 errors resolved) + Production Build Verification.
