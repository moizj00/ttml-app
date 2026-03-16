# Talk-to-My-Lawyer

AI-powered legal letter drafting with mandatory attorney review.

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`docs/TTML_REMAINING_FEATURES_PROMPT.md`](docs/TTML_REMAINING_FEATURES_PROMPT.md) | Historical feature gap reference (all 4 gaps now completed as of Phase 48) |
| [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md) | AI pipeline routing decision (Perplexity → Anthropic × 2 active, n8n dormant) |
| [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) | Comprehensive feature inventory (Phases 1–86) |
| [`docs/GAP_ANALYSIS.md`](docs/GAP_ANALYSIS.md) | Historical gap analysis from spec audit |
| [`docs/SUPABASE_MCP_CAPABILITIES.md`](docs/SUPABASE_MCP_CAPABILITIES.md) | Supabase MCP connector usage guide |
| [`SPEC_COMPLIANCE.md`](SPEC_COMPLIANCE.md) | Spec compliance tracking |
| [`AUDIT_REPORT.md`](AUDIT_REPORT.md) | Architecture audit report |
| [`todo.md`](todo.md) | Full feature and bug tracking (all phases) |

## Feature Gaps Status (from TTML_REMAINING_FEATURES_PROMPT.md)

| Gap | Description | Status |
|-----|-------------|--------|
| Gap 1 | Freemium `generated_unlocked` status | ✅ Completed (Phase 48, later simplified in Phase 69 — all letters now use `generated_locked` path) |
| Gap 2 | Payment Receipts page at `/subscriber/receipts` | ✅ Completed (Phase 48) |
| Gap 3 | Intake form missing fields: `language`, `communications`, `toneAndDelivery` | ✅ Completed (Phase 48) |
| Gap 4 | Mobile responsiveness fixes | ✅ Completed (Phase 48) |

## Tech Stack

- **Frontend:** Vite · React 19 · Wouter · Tailwind CSS · shadcn/ui
- **Backend:** Express · tRPC · Drizzle ORM
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth (JWT)
- **Payments:** Stripe (subscriptions + per-letter checkout)
- **Email:** Resend (transactional, 13 templates)
- **AI Pipeline:** Perplexity API (research) → Anthropic Claude (draft + assembly)

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server (port 5000)
pnpm test           # run Vitest suite
pnpm tsc --noEmit   # TypeScript check
```

## Validation Gate

After every implementation:
1. `pnpm test` — all ~617 tests must pass (38 test files)
2. `pnpm tsc --noEmit` — 0 TypeScript errors
3. `pnpm build` — production build must succeed
4. Verify no `ALLOWED_TRANSITIONS` regression in `shared/types.ts`
