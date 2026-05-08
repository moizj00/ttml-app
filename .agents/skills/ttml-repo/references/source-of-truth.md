# Source of Truth Map

## Canonical Orientation

- `AGENTS.md`: required first read for agents. Owns project conventions, gotchas, commands, architecture summary, and source-of-truth pointers.
- `README.md`: human onboarding and quick-start.
- `ARCHITECTURE.md`: deeper app architecture, routes, schema, status machine, and module map.
- `docs/AGENT_GUIDE.md`: developer workflow and common pitfalls.
- `docs/PIPELINE_ARCHITECTURE.md`: AI pipeline stages, RAG, LangGraph, n8n status, resilience.
- `docs/PRODUCTION_RUNBOOK.md`: deployment checklist, environment matrix, Railway services.
- `docs/FEATURE_MAP.md`: feature inventory and phase history.
- `docs/ROLE_AREA_MATRIX.md`: role and route access matrix.

## Hard Source Files

- `package.json`: package manager, scripts, build graph, Node/pnpm engine expectations.
- `client/src/App.tsx`: frontend route registry. Add new wouter routes here.
- `client/src/_core/hooks/useAuth.ts`: frontend auth hook. Use this path, not `client/src/hooks/useAuth.ts`.
- `client/src/lib/queryClient.ts`: TanStack Query/tRPC client integration and cache client.
- `client/src/lib/supabase.ts`: frontend Supabase client.
- `client/src/index.css`: Tailwind v4 theme and tokens. There is no `tailwind.config.js`.
- `server/_core/index.ts`: Express app entrypoint, middleware order, REST route registration, tRPC mount, static/Vite serving.
- `server/_core/trpc.ts`: tRPC procedures and role middleware.
- `server/_core/context.ts`: request context creation.
- `server/_core/env.ts`: canonical server env object and production validation.
- `server/routers/index.ts`: tRPC router composition.
- `server/db/`: data access boundary. Routers should call functions here.
- `drizzle/schema.ts` and `drizzle/schema/`: database schema.
- `drizzle/relations.ts`: Drizzle relations.
- `server/migrate.ts`: migration runtime.
- `server/queue.ts`: pg-boss setup and job enqueueing.
- `server/worker.ts`: job consumer and pipeline execution path.
- `server/pipeline/orchestrator.ts`: standard pipeline orchestration.
- `server/pipeline/graph/`: LangGraph alternative path.
- `server/intake-normalizer.ts`: normalizes intake data before pipeline use.
- `shared/pricing.ts`: all pricing and billing constants.
- `shared/types/letter.ts`: letter status machine and allowed transitions.
- `docker-entrypoint.sh`: Docker/Railway process dispatch.
- `Dockerfile`, `Dockerfile.dev`, `docker-compose.yml`, `docker-compose.prod.yml`: container build and local/prod compose.
- `railway.toml`: Railway-level deployment settings.

## When To Trust Docs vs Code

Use docs for intended architecture and historical rationale. Use source files for exact current implementation, names, route paths, env handling, status strings, and test commands.

If implementing a feature:

1. Read `AGENTS.md`.
2. Read the relevant reference in this skill.
3. Inspect live source files listed above.
4. Search with `rg` for existing patterns.
5. Make the smallest change consistent with local patterns.
