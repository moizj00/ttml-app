# Implementation Rules

## Repository Rules

- Package manager is `pnpm`.
- Do not edit `package.json`, `vite.config.ts`, `tsconfig.json`, or `drizzle.config.ts` without explicit user approval.
- Prefer `rg` and existing local patterns.
- Do not create REST endpoints when tRPC covers the use case.
- Do not add a Vite proxy.
- Do not move files without repathing all relative imports and running `pnpm check`.

## TypeScript and Formatting

- Strict TypeScript.
- Prettier is the formatter.
- Double quotes, semicolons, trailing comma `es5`, width 80.
- Pino logger merge object comes first: `logger.error({ err }, "message")`.

## Frontend Rules

- Routes are wouter routes in `client/src/App.tsx`.
- No `import React` needed.
- Use `@/` alias for `client/src`.
- TanStack Query v5 object form only.
- Do not define custom query functions for tRPC queries unless there is a very specific local pattern requiring it.
- Invalidate cache after mutations using `queryClient`.
- Interactive elements need `data-testid`.
- Tailwind v4 theme lives in `client/src/index.css`.
- Use OKLCH and explicit `dark:` variants when appropriate.
- `<SelectItem>` must have a `value`.

## Backend Rules

- All DB operations go through `server/db`.
- Use `server/_core/env.ts` for server env access.
- Raw Stripe webhook must stay before JSON body parsing.
- Body size is intentionally 12 MB.
- Auth endpoints are rate-limited fail-closed; general tRPC is fail-open.
- CORS and security headers live in `server/_core/index.ts`.

## Database Rules

- Drizzle schema is modular under `drizzle/schema`.
- Use `text().array()`, not `array(text())`.
- Infer Drizzle types with `$inferSelect` and `$inferInsert`.
- Use `createInsertSchema` with omitted generated fields when adding insert schemas.
- Migrations run from built `dist/migrate.js`.

## Pipeline Rules

- API routes enqueue pipeline work.
- Worker consumes jobs and runs the pipeline.
- Standard pipeline is primary production path unless env routes otherwise.
- n8n is dormant. Do not set `N8N_PRIMARY=true` casually.
- `PIPELINE_MODE=simple` runs inline and is for local/debug only.
- LangGraph behavior is controlled by `LANGGRAPH_PIPELINE`.
- All intake data passes through `server/intake-normalizer.ts`.

## Status and Pricing Rules

- `shared/types/letter.ts` owns status strings and transitions.
- `shared/pricing.ts` owns pricing.
- Never duplicate either in frontend, router, tests, or docs without importing from the source where possible.

## Security Rules

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Frontend env vars must be `VITE_*`.
- Admin role is sensitive and tied to server-side checks and admin 2FA.
- Do not weaken RLS, role procedures, or admin 2FA without explicit scope.
