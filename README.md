# Talk-to-My-Lawyer

AI-powered legal letter drafting with mandatory attorney review.

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`STRUCTURE.md`](STRUCTURE.md) | Primary architecture reference — schema, routes, status machine, pipeline |
| [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) | Comprehensive feature inventory (Phases 1–86+) |
| [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md) | AI pipeline deep-dive (4-stage: Perplexity → Opus × 2 → Sonnet vetting) |
| [`SPEC_COMPLIANCE.md`](SPEC_COMPLIANCE.md) | Spec compliance tracking |
| [`docs/CODE_REVIEW_VERIFIED.md`](docs/CODE_REVIEW_VERIFIED.md) | Code review issue tracker |
| [`docs/AUDIT_REPORT_PHASE74.md`](docs/AUDIT_REPORT_PHASE74.md) | Phase 74 full platform audit |
| [`docs/SUPABASE_MCP_CAPABILITIES.md`](docs/SUPABASE_MCP_CAPABILITIES.md) | Supabase MCP connector reference |
| [`docs/GAP_ANALYSIS.md`](docs/GAP_ANALYSIS.md) | Historical gap analysis — all 9 gaps completed |
| [`docs/TTML_REMAINING_FEATURES_PROMPT.md`](docs/TTML_REMAINING_FEATURES_PROMPT.md) | Historical feature gap prompt (Phase 48) |
| [`docs/REVALIDATION_REPORT_PHASE62.md`](docs/REVALIDATION_REPORT_PHASE62.md) | Phase 62 validation snapshot (historical) |
| [`docs/VALIDATION_REPORT_PHASE73.md`](docs/VALIDATION_REPORT_PHASE73.md) | Phase 73 validation snapshot (historical) |
| [`AUDIT_REPORT.md`](AUDIT_REPORT.md) | Phase 0 audit (historical) |
| [`CONTENT-STRATEGY.md`](CONTENT-STRATEGY.md) | SEO content strategy, blog calendar, keyword map |
| [`todo.md`](todo.md) | Full feature and bug tracking (all phases) |

## Tech Stack

- **Frontend:** Vite · React 19 · Wouter · Tailwind CSS · shadcn/ui
- **Backend:** Express · tRPC · Drizzle ORM
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth (JWT)
- **Payments:** Stripe (subscriptions + per-letter checkout)
- **Email:** Resend (transactional, 17 templates)
- **AI Pipeline:** Perplexity API (research) → Anthropic Claude Opus (draft + assembly) → Anthropic Claude Sonnet (vetting)

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server (port 5000)
pnpm test           # run Vitest suite
pnpm tsc --noEmit   # TypeScript check
```

## Validation Gate

After every implementation:
1. `pnpm test` — all ~617 tests must pass (41 test files)
2. `pnpm tsc --noEmit` — 0 TypeScript errors
3. `pnpm build` — production build must succeed
4. Verify no `ALLOWED_TRANSITIONS` regression in `shared/types.ts`
