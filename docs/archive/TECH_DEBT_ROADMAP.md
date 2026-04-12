# Technical Debt Execution Roadmap: TTML

This roadmap outlines the prioritized sequence for addressing the technical debt identified in the April 8th audit. The focus is on **high-impact modularization** of the backend and **component extraction** for the frontend to improve maintainability and developer velocity.

## Phase 1: High-Impact Backend Modularization (Week 1)
*Priority: Critical | Goal: Complete the tRPC router decomposition pattern.*

| Task ID | Description | Target File | Strategy |
| :--- | :--- | :--- | :--- |
| **B1** | Decompose Attorney Review Router | `server/routers/review.ts` | Create `server/routers/review/` directory. Split into `queue.ts`, `actions.ts`, and `analytics.ts`. |
| **B2** | Decompose Stripe Webhook Handler | `server/stripeWebhook.ts` | Create `server/handlers/stripe/`. Split by event type: `subscriptions.ts`, `checkout.ts`, `identity.ts`. |
| **B3** | Decompose Affiliate & Billing Routers | `server/routers/affiliate.ts`, `billing.ts` | Convert to directory modules following the `admin` router pattern. |

## Phase 2: Frontend Component Extraction (Week 2)
*Priority: High | Goal: Reduce file size and complexity of key pages.*

| Task ID | Description | Target File | Strategy |
| :--- | :--- | :--- | :--- |
| **F1** | Refactor Document Analyzer | `DocumentAnalyzer.tsx` | Extract `FileUploader`, `AnalysisViewer`, and `ActionItems` into `client/src/components/document-analyzer/`. |
| **F2** | Modularize Review Modal | `ReviewModal.tsx` | Split into `ReviewHeader`, `ReviewEditor`, `ReviewHistory`, and `ReviewActions`. |
| **F3** | Extract Admin Learning Dashboard | `pages/admin/Learning.tsx` | Modularize into `LessonList`, `LessonEditor`, and `ConsolidationControls`. |

## Phase 3: System-Wide Quality Hardening (Week 3)
*Priority: Medium | Goal: Standardize logging and migrations.*

| Task ID | Description | Scope | Action |
| :--- | :--- | :--- | :--- |
| **Q1** | Complete Pino Logger Migration | `server/**/*.ts` | Replace all 443 `console.*` calls with `server/logger.ts` methods. |
| **Q2** | Formalize Startup Migrations | `server/db/core.ts` | Convert the 9 inline `try-catch` migrations into formal Drizzle SQL migration files. |
| **Q3** | Address TODO/FIXME Backlog | Project-wide | Audit and resolve the 15 identified `TODO` and `HACK` comments. |

## Phase 4: Revalidation & Documentation (Ongoing)
*   **Continuous Revalidation:** Run `pnpm revalidate` (TSC + Vitest + Vite Build) after every task completion.
*   **Skill Updates:** Update `ttml-data-api-expert` and `ttml-pattern-recognizer` as new directory structures are finalized.
*   **E2E Verification:** Run Playwright suite to ensure no regressions in critical user flows.
