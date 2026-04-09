# Talk-To-My-Lawyer (TTML) Architecture & Technical Debt Report

*Date: April 8, 2026*
*Author: Manus AI*

This report provides a comprehensive summary of the current architectural state of the Talk-To-My-Lawyer (TTML) application, highlighting recent refactoring efforts, identifying remaining monoliths, and detailing the technical debt that requires attention in upcoming phases.

## 1. Current Architectural State

The TTML application operates as a full-stack monorepo containing a React 19 frontend and an Express/tRPC Node 22 backend, backed by a Supabase-managed PostgreSQL database using Drizzle ORM.

### 1.1 Backend Architecture (Server)
Recent refactoring efforts have successfully begun decomposing massive backend files into logical directory modules:

*   **tRPC Routers:** The previously monolithic `server/routers.ts` (1900+ lines) has been split. Large routers like `admin` and `letters` are now directory modules (`server/routers/admin/`, `server/routers/letters/`) that re-export smaller, domain-specific files via an `index.ts`.
*   **Database Layer:** The monolithic `server/db.ts` (1300+ lines) has been decomposed into `server/db/`, with separate files for `users`, `letters`, `pipeline-records`, `quality`, etc.
*   **AI Pipeline:** The pipeline logic is well-encapsulated in `server/pipeline/`, structured into distinct stages (`research.ts`, `drafting.ts`, `assembly.ts`, `vetting.ts`), orchestrated by `orchestrator.ts`, and executed asynchronously via pg-boss (`server/worker.ts`).
*   **Authentication:** Supabase Auth is managed in `server/supabaseAuth/`, with strict JWT validation, role caching, and a hard-coded super-admin whitelist.
*   **Procedure Guards:** RBAC logic (`attorneyProcedure`, `subscriberProcedure`) has been cleanly centralized in `server/routers/_shared.ts`.

### 1.2 Frontend Architecture (Client)
*   **Framework:** React 19, Vite 7, and Wouter for routing.
*   **Styling:** Tailwind CSS 4.1 with shadcn/ui components.
*   **Structure:** Organized by user role (`pages/subscriber/`, `pages/attorney/`, `pages/admin/`, `pages/employee/`).
*   **State Management:** React Query (via tRPC) handles server state, with custom hooks (`useAuth`, `useMobile`) for local state.

### 1.3 Database & Infrastructure
*   **Schema:** 25 tables defined in `drizzle/schema.ts` with 53 indexes.
*   **Migrations:** Managed via Drizzle Kit (44 migration files in `drizzle/migrations/`).
*   **Queue & Caching:** pg-boss (PostgreSQL-native) handles the asynchronous job queue, eliminating the Redis dependency for the pipeline. Upstash Redis is retained solely for rate limiting.
*   **Deployment:** Railway (Docker multi-stage build) with GitHub Actions CI/CD.
*   **Testing:** 54 test files (Vitest) providing extensive backend coverage (1310 passing tests), plus a Playwright E2E suite (`tests/`).

## 2. Identified Technical Debt & Remaining Monoliths

While significant progress has been made in modularizing the codebase, several areas still require refactoring and cleanup.

### 2.1 Remaining Server Monoliths
The following files exceed 400 lines and should be prioritized for decomposition:

1.  **`server/routers/review.ts` (863 lines):** The attorney review router is too large. It should be converted into a directory module (`server/routers/review/`) splitting out logic for fetching queues, submitting edits, and handling approvals/rejections.
2.  **`server/stripeWebhook.ts` (846 lines):** Contains complex logic for handling various Stripe events. Should be split into handler functions (e.g., `handlers/subscription.ts`, `handlers/checkout.ts`).
3.  **`server/stripe.ts` (681 lines):** Core Stripe integration logic. Could be modularized to separate product management, checkout session creation, and customer management.
4.  **`server/routers/affiliate.ts` (648 lines) & `server/routers/billing.ts` (647 lines):** Both are prime candidates for the directory module pattern applied to `admin` and `letters`.
5.  **`server/learning.ts` (627 lines):** The recursive learning/RAG system contains extensive categorization and consolidation logic that should be broken down into smaller utility functions.
6.  **`server/services/letters.ts` (592 lines) & `server/services/admin.ts` (503 lines):** Service layer logic that handles complex orchestrations (like `submitLetter`).
7.  **`server/emailPreview.ts` (550 lines):** Email rendering logic that could be streamlined or split by template.

### 2.2 Client-Side Component Bloat
Several React components have grown excessively large, making them difficult to maintain and test:

1.  **`client/src/pages/DocumentAnalyzer.tsx` (1101 lines):** The largest file in the frontend. It desperately needs to be broken down into smaller components (e.g., FileUploader, AnalysisResults, ActionItemsPanel).
2.  **`client/src/components/shared/ReviewModal.tsx` (1056 lines):** A massive modal component handling complex state. It should be refactored to compose smaller, focused sub-components.
3.  **`client/src/pages/admin/Learning.tsx` (1046 lines):** The admin learning dashboard is too monolithic.
4.  **`client/src/pages/admin/Affiliate.tsx` (971 lines) & `client/src/pages/employee/AffiliateDashboard.tsx` (898 lines):** Both affiliate-related pages require component extraction.

### 2.3 Database Schema Size
*   **`drizzle/schema.ts` (762 lines):** While currently manageable, as the application grows, it may be beneficial to split the schema definition into multiple files within a `drizzle/schema/` directory (e.g., `users.ts`, `letters.ts`, `billing.ts`) and re-export them, similar to the router structure.

### 2.4 Code Quality and Logging Issues
*   **`console.log` Usage:** There are 443 instances of `console.log`, `console.error`, or `console.warn` in the non-test server code. The project recently adopted Pino structured logging (`server/logger.ts`), but the migration is incomplete. All `console.*` calls should be replaced with the appropriate Pino logger instance to ensure logs are properly formatted and captured in production.
*   **TODO/FIXME Comments:** There are 15 unresolved `TODO`, `FIXME`, or `HACK` comments scattered throughout the codebase (e.g., `client/src/components/shared/Footer.tsx:41`). These should be tracked in a project management tool and addressed.

### 2.5 Migration Strategy Consistency
*   **Startup Migrations vs. Drizzle Migrations:** `server/db/core.ts` contains 9 "startup migration blocks" (using `try { ... } catch`). While useful for quick fixes, this pattern circumvents the formal Drizzle migration system (`drizzle/migrations/*.sql`). The team should commit to using Drizzle Kit for all schema and data migrations to ensure consistency and prevent deployment issues.

## 3. Recommended Next Steps

1.  **Continue Router Decomposition:** Apply the directory module pattern to `review.ts`, `affiliate.ts`, and `billing.ts`.
2.  **Frontend Refactoring:** Break down `DocumentAnalyzer.tsx` and `ReviewModal.tsx` into smaller, reusable components.
3.  **Complete Logger Migration:** Replace all remaining `console.*` calls in the `server/` directory with Pino logger calls.
4.  **Audit Startup Migrations:** Review the inline migrations in `server/db/core.ts` and move them to formal Drizzle SQL migrations where appropriate.
