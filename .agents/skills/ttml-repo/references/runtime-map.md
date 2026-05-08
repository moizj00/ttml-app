# Runtime Map

## Package Scripts

`package.json` owns commands:

- `pnpm dev`: `tsx watch server/_core/index.ts`; Express and Vite middleware run together for local development.
- `pnpm check` / `pnpm lint`: `tsc --noEmit`.
- `pnpm test`: Vitest.
- `pnpm build`: Vite client build, then esbuild server bundles for web, worker, migrate, and Sentry instrumentation.
- `pnpm start`: production Express server from `dist/index.js` with `dist/instrument.js`.
- `pnpm db:migrate`: run built migration script.
- `pnpm test:e2e`: Playwright.

## Local Development

Entry: `server/_core/index.ts`.

Important local behavior:

- Forces IPv4 DNS before DB connections.
- Initializes Sentry early.
- Builds an Express app and HTTP server.
- Registers middleware, health routes, Stripe webhook before JSON body parsing, then JSON/urlencoded parsers.
- Registers auth/REST routes, then mounts tRPC at `/api/trpc`.
- Uses Vite middleware in development and static files from `dist/public` in production.
- Falls back to nearby ports in development if the preferred port is busy.

## Docker and Railway

`docker-entrypoint.sh` dispatches by `PROCESS_TYPE`:

- `web`: `node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js`
- `worker`: `node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js`
- `migrate`: `node --dns-result-order=ipv4first dist/migrate.js`
- `all`: legacy mode; migrate, worker in background, then web.

Production shape:

- One Docker image.
- Railway has separate services for web, worker, and migrate.
- Migrate should run before web/worker when schema changes are involved.

## Worker

Entry: `server/worker.ts`.

Responsibilities:

- Consumes pg-boss jobs from `server/queue.ts`.
- Runs standard pipeline via `runFullPipeline` and retry helpers.
- Optionally routes to LangGraph using `LANGGRAPH_PIPELINE`.
- Updates `pipeline_records`, letter statuses, notifications, and emails.
- Manages locks to avoid duplicate pipeline runs.

Important: API routes should enqueue work; do not call pipeline stages directly from routers.

## Migrations

Entry: `server/migrate.ts`.

Schema source:

- `drizzle/schema.ts` re-exports modular schema files under `drizzle/schema/`.
- `drizzle.config.ts` controls Drizzle Kit behavior; do not modify without explicit user approval.

## HTTP Surface

Main REST registrations live in `server/_core/index.ts`. tRPC lives under `/api/trpc`.

Existing REST areas include:

- Auth routes from `server/supabaseAuth`.
- Stripe webhook from `server/stripeWebhook.ts` at `/api/stripe/webhook`.
- n8n callback from `server/n8nCallback.ts`.
- Draft PDF from `server/draftPdfRoute.ts`.
- Cron-style endpoints for draft reminders, paywall emails, free preview emails.
- Blog internal routes, sitemap, newsletter, config, client portal.
- Health: `/health`, `/api/health`, detailed health variants.

Use `scripts/refresh-index.sh` to list current route registrations.
