# Task Playbooks

## Add or Change a Frontend Page

1. Inspect nearby page patterns under `client/src/pages`.
2. Add/edit the page component.
3. Register route in `client/src/App.tsx`.
4. Add role protection with `ProtectedRoute` if private.
5. Use existing skeleton/loading patterns.
6. Add `data-testid` to interactive controls.
7. Run `pnpm check`.

## Add or Change a tRPC Procedure

1. Find the owning router under `server/routers`.
2. Use existing procedure type from `server/_core/trpc.ts`.
3. Put DB work in `server/db`.
4. Add Zod input validation.
5. Invalidate query keys on frontend mutation consumers.
6. Add/update focused Vitest tests.
7. Run `pnpm check` and relevant tests.

## Change Letter Status Behavior

1. Read `shared/types/letter.ts`.
2. Search current status usage with `rg "status_name|LETTER_STATUS|ALLOWED_TRANSITIONS"`.
3. Update transitions centrally.
4. Update pipeline/review/subscriber flows that consume the transition.
5. Update frontend status displays and tests.
6. Run status-machine and lifecycle tests.

## Change Pricing or Billing

1. Read `shared/pricing.ts`.
2. Inspect `server/routers/billing` and Stripe helpers/webhook.
3. Update tests around pricing, financial invariants, and checkout/unlock behavior.
4. Avoid hardcoding prices in UI copy or tests.

## Change Pipeline Behavior

1. Read `docs/PIPELINE_ARCHITECTURE.md`.
2. Inspect `server/worker.ts`, `server/pipeline/orchestrator.ts`, and target stage files.
3. Keep route/API code enqueue-oriented.
4. Update `pipeline_records` behavior if progress/state changes.
5. Add focused tests under `server/pipeline` or existing phase tests.
6. Run `pnpm check` and relevant pipeline tests.

## Change Database Schema

1. Inspect `drizzle/schema` and existing migrations.
2. Update schema module and exported schema index.
3. Update `server/db` accessors.
4. Generate/check migrations using repo scripts.
5. Run `pnpm check` and DB-related tests.
6. Do not edit `drizzle.config.ts` without explicit approval.

## Change Auth or RBAC

1. Read `docs/ROLE_AREA_MATRIX.md`.
2. Inspect `client/src/components/ProtectedRoute.tsx`.
3. Inspect `server/_core/trpc.ts` and `server/supabaseAuth`.
4. Update both frontend gates and backend authorization.
5. Add tests for wrong-role and unauthenticated behavior.

## Deployment or Runtime Change

1. Inspect `package.json`, `Dockerfile`, `docker-entrypoint.sh`, `railway.toml`, and `docs/PRODUCTION_RUNBOOK.md`.
2. Preserve three-service Railway model: web, worker, migrate.
3. Keep migration ordering explicit.
4. Run `pnpm check`, `pnpm test`, and `pnpm build` before deploy claims.

## Test Selection

Baseline pre-deploy gate:

```bash
pnpm check
pnpm test
pnpm build
```

Targeted examples:

- Status machine: `server/__tests__/statusMachine.test.ts`, lifecycle phase tests.
- Pipeline: `server/pipeline/*.test.ts`, `server/pipeline/graph/*.test.ts`, `server/worker.test.ts`.
- Pricing/billing: `server/phase67-pricing.test.ts`, `server/financial-invariants.test.ts`.
- Auth/RBAC: `server/auth-integration.test.ts`, role isolation tests, `ProtectedRoute` consumers.
- HTTP routes: `server/http-routes.test.ts`.
