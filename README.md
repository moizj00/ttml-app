# Talk-to-My-Lawyer

AI-powered legal letter drafting with mandatory attorney review.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the definitive architecture reference — tech stack, module map, status machine, database schema, and documentation ownership index.

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Architecture, tech stack, module map, roles, status machine, doc ownership |
| [`CLAUDE.md`](CLAUDE.md) | Agent behavioral rules and architectural invariant pointers |
| [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) | Developer workflow, gotchas, conventions, common pitfalls |
| [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md) | AI pipeline deep-dive (4-stage: Perplexity → Opus × 2 → Sonnet vetting) |
| [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) | Comprehensive feature inventory (all phases) |
| [`CONTENT-STRATEGY.md`](CONTENT-STRATEGY.md) | SEO content strategy, blog calendar, keyword map |
| [`todo.md`](todo.md) | Full feature and bug tracking (all phases) |
| [`docs/workflow_summary.md`](docs/workflow_summary.md) | Letter lifecycle end-to-end walkthrough |
| [`docs/QA_ROLE_MATRIX.md`](docs/QA_ROLE_MATRIX.md) | QA test matrix and test credentials |
| [`docs/INTELLIGENCE_ROADMAP.md`](docs/INTELLIGENCE_ROADMAP.md) | Product strategy and competitive analysis |
| [`skills/architectural-patterns/`](skills/architectural-patterns/) | Enforcement rules for core invariants |

Historical audit reports and point-in-time snapshots are archived in `docs/archive/`.

## Tech Stack

- **Frontend:** Vite · React 19 · Wouter · Tailwind CSS v4 · shadcn/ui
- **Backend:** Express · tRPC · Drizzle ORM
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth (JWT)
- **Payments:** Stripe (subscriptions + per-letter checkout)
- **Email:** Resend (transactional, 17 templates)
- **AI Pipeline:** Perplexity `sonar-pro` (primary research; Claude fallback if key missing) → Anthropic Claude Opus (draft + assembly) → Anthropic Claude Sonnet (vetting); local 4-stage pipeline is primary, n8n is dormant alternative

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server (port 5000)
pnpm test           # run Vitest suite
pnpm tsc --noEmit   # TypeScript check
```

## Validation Gate

After every implementation:
1. `pnpm test` — all tests must pass
2. `pnpm tsc --noEmit` — 0 TypeScript errors
3. `pnpm build` — production build must succeed
4. Verify no `ALLOWED_TRANSITIONS` regression in `shared/types/letter.ts`
