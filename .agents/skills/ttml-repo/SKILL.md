---
name: ttml-repo
description: Navigate, understand, and safely modify the Talk to My Lawyer (TTML) monorepo. Use when working in /home/tesla_laptops/ttml-app or when a user asks what runs where, where source of truth lives, how frontend/backend/worker/migrations connect, which files own a feature, how to change TTML routes, auth, tRPC, Drizzle database code, the AI pipeline, Stripe billing, email, Docker/Railway deployment, or tests. This skill provides a curated repo operating manual with source-file references and live discovery scripts rather than ingesting every file verbatim.
---

# TTML Repo

## Prime Directive

Treat the repository as the source of truth. Use this skill to find the right files and rules quickly, then inspect the live source before editing. Do not rely on this skill as a frozen copy of implementation details.

Canonical repo root:

```bash
/home/tesla_laptops/ttml-app
```

## First Steps

1. Read `AGENTS.md` first for current agent rules and gotchas.
2. Run the live map when orientation is needed:

```bash
bash <path-to-this-skill>/scripts/refresh-index.sh /home/tesla_laptops/ttml-app
```

3. Load only the reference file relevant to the task:

- `references/source-of-truth.md`: canonical docs/files and what each one owns.
- `references/runtime-map.md`: what runs where locally, in Docker, Railway, worker, and migrate.
- `references/feature-area-map.md`: frontend, routers, DB modules, schema, auth, pipeline, Stripe, email, storage, SEO.
- `references/implementation-rules.md`: TTML-specific coding constraints and gotchas.
- `references/task-playbooks.md`: common change workflows and test selection.

## Operating Model

This is a TypeScript monorepo:

- Frontend: React/Vite in `client/src`.
- API: Express + tRPC in `server`.
- Database: Drizzle schema in `drizzle`, data access in `server/db`.
- Queue/worker: pg-boss in `server/queue.ts` and `server/worker.ts`.
- AI pipeline: `server/pipeline`.
- Shared contracts: `shared`.
- Deployment: one Docker image, process selected by `PROCESS_TYPE`.

## Editing Rules

- Never hardcode pricing. Read `shared/pricing.ts`.
- Never hardcode letter statuses or transitions. Read `shared/types/letter.ts`.
- Never put raw Drizzle queries in routers. Add/read DB functions in `server/db`.
- Never add a Vite proxy.
- Never expose server-only env vars in frontend. Frontend env vars must start with `VITE_`.
- Register new pages in `client/src/App.tsx`; wouter does not auto-discover pages.
- Invalidate TanStack Query cache after mutations by query key.
- Use tRPC for app API work unless an existing REST route pattern is explicitly the right fit.
- Run `pnpm check` before tests when imports, shared types, or moved files are involved.

## Source Before Summary

When this skill and source disagree, source wins. If a reference is stale, update the reference or use `scripts/refresh-index.sh` to recover the live map before making claims.
