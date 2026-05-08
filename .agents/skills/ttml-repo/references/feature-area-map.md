# Feature Area Map

## Frontend

- Route registry: `client/src/App.tsx`.
- Public pages: `client/src/pages`.
- Subscriber pages: `client/src/pages/subscriber`.
- Attorney pages: `client/src/pages/attorney`.
- Employee pages: `client/src/pages/employee`.
- Admin pages: `client/src/pages/admin`.
- Shared layouts/components: `client/src/components/shared`.
- shadcn/ui primitives: `client/src/components/ui`.
- Auth hook: `client/src/_core/hooks/useAuth.ts`.
- Toast hook: `@/hooks/use-toast`.
- Query client: `client/src/lib/queryClient.ts`.

Route protection is centralized in `client/src/components/ProtectedRoute.tsx`.

## tRPC

- Composition: `server/routers/index.ts`.
- Procedures and role middleware: `server/_core/trpc.ts`.
- Shared router helpers: `server/routers/_shared.ts`.

Current router groups:

- `system`
- `auth`
- `letters`
- `review`
- `admin`
- `notifications`
- `versions`
- `billing`
- `affiliate`
- `profile`
- `documents`
- `blog`
- `templates`
- `intakeFormTemplates`

Search inside a router with:

```bash
rg -n "publicProcedure|protectedProcedure|adminProcedure|attorneyProcedure|mutation|query" server/routers
```

## Database

Schema:

- `drizzle/schema/billing.ts`
- `drizzle/schema/content.ts`
- `drizzle/schema/letters.ts`
- `drizzle/schema/notifications.ts`
- `drizzle/schema/pipeline.ts`
- `drizzle/schema/users.ts`

Data access:

- `server/db/letters/`: letter query/mutation utilities.
- `server/db/users.ts`: user access.
- `server/db/admin.ts`: admin data operations.
- `server/db/affiliates.ts`: affiliate data.
- `server/db/analytics.ts`: analytics.
- `server/db/pipeline-records.ts`: pipeline record updates.
- `server/db/letter-versions.ts`: versions and embeddings-related storage.
- `server/db/templates.ts`, `server/db/intake-form-templates.ts`: template areas.

Rule: routers call `server/db` functions; DB modules own Drizzle queries.

## Auth and RBAC

- Server auth routes/JWT integration: `server/supabaseAuth`.
- tRPC context: `server/_core/context.ts`.
- tRPC role procedures: `server/_core/trpc.ts`.
- Admin 2FA cookie: `server/_core/admin2fa.ts`.
- Frontend gating: `client/src/components/ProtectedRoute.tsx`.
- Role matrix docs: `docs/ROLE_AREA_MATRIX.md`.

## Letter Lifecycle

- Status source: `shared/types/letter.ts`.
- Submission router: `server/routers/letters/submit.ts`.
- Subscriber letter router: `server/routers/letters/subscriber.ts`.
- Client approval: `server/routers/letters/client-approval.ts`.
- Attorney review: `server/routers/review`.
- PDF generation: `server/pdfGenerator.ts` and `server/draftPdfRoute.ts`.

Important: PDF generation happens on subscriber approval, not when the attorney submits.

## AI Pipeline

Primary standard path:

- `server/pipeline/orchestrator.ts`
- `server/pipeline/orchestration/`
- `server/pipeline/research/`
- `server/pipeline/drafting.ts`
- `server/pipeline/assembly.ts`
- `server/pipeline/vetting/`
- `server/pipeline/providers.ts`
- `server/pipeline/prompts.ts`
- `server/pipeline/shared.ts`

Alternative LangGraph path:

- `server/pipeline/graph/index.ts`
- `server/pipeline/graph/mode.ts`
- `server/pipeline/graph/state.ts`
- `server/pipeline/graph/nodes/`

Queue/worker:

- `server/queue.ts`
- `server/worker.ts`

Intake normalization:

- `server/intake-normalizer.ts`

## Billing and Stripe

- Pricing source: `shared/pricing.ts`.
- tRPC billing routers: `server/routers/billing`.
- Stripe helpers/webhook: `server/stripe`, `server/stripeWebhook.ts`, and related webhook modules if present.
- Tests: search `phase67-pricing`, `financial-invariants`, and Stripe webhook tests.

## Email

- Email entry: `server/email.ts`.
- Mailer/core: `server/email/core.ts`, `server/email/mailer.ts`.
- Templates: `server/email/templates`.
- Preview route: `server/emailPreview`.
- Reminder/cron routes: `server/draftReminders.ts`, `server/paywallEmailCron.ts`, `server/freePreviewEmailCron.ts`.

## Storage and Documents

- R2/storage: search `server/storage`.
- Document analysis: `server/routers/documents.ts`, `server/db/document-analyses.ts`, `client/src/pages/DocumentAnalyzer`.
- Letter templates loaded at runtime: `attached_assets`.

## SEO and Public Content

- Blog routes: `server/routers/blog.ts`, `server/blogInternalRoutes.ts`, `client/src/pages/BlogIndex.tsx`, `client/src/pages/BlogPost.tsx`.
- Sitemap: `server/sitemapRoute.ts`.
- Services pages: `client/src/pages/services`.
- Content strategy docs: `CONTENT-STRATEGY.md` if present.
