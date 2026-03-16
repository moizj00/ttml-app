# Talk to My Lawyer

A full-stack legal letter platform where users can get AI-drafted, attorney-reviewed legal letters.

## Architecture

- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20
- **Database**: PostgreSQL via Supabase (accessed via Drizzle ORM + postgres-js driver)
- **Auth**: Supabase Auth (JWT-based, verified server-side)
- **Email**: Resend
- **Payments**: Stripe
- **Rate Limiting**: Upstash Redis
- **AI Pipeline**: Perplexity (research) + Anthropic Claude (drafting & assembly)
- **Monitoring**: Sentry (error tracking, alerting)

## Project Structure

```
client/          # React frontend (Vite root)
  src/
    components/  # UI components
    pages/       # Route pages
    lib/         # Client utilities
server/          # Express backend
  _core/         # Server setup (index.ts, env.ts, vite.ts, trpc.ts, cookies.ts)
  db.ts          # Drizzle DB connection + all DB helper functions
  supabaseAuth.ts # Supabase Auth integration (JWT verification, user sync)
  routers.ts     # tRPC router aggregation
  pipeline.ts    # AI letter generation pipeline
  email.ts       # Email sending (Resend)
  stripe.ts      # Stripe integration
  stripeWebhook.ts # Stripe webhook handler
shared/          # Shared types (const.ts, pricing.ts, types.ts)
drizzle/         # Drizzle ORM schema and migrations
  schema.ts      # Database schema definitions
supabase/        # Supabase migrations (for reference)
```

## Key Environment Variables

### Required for full functionality
- `DATABASE_URL` - PostgreSQL connection string (Replit provides this automatically)
- `SUPABASE_URL` / `VITE_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side)
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (client-side)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `VITE_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (client-side)
- `RESEND_API_KEY` - Resend email API key
- `JWT_SECRET` - Cookie signing secret
- `ANTHROPIC_API_KEY` - Anthropic API key (for AI drafting & assembly)
- `PERPLEXITY_API_KEY` - Perplexity API key (for legal research)

### Optional
- `N8N_WEBHOOK_URL` - n8n webhook for pipeline orchestration
- `N8N_CALLBACK_SECRET` - n8n callback verification
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Rate limiting
- `SENTRY_DSN` - Sentry error monitoring

## Running

```bash
pnpm run dev    # Development server on port 5000
pnpm run build  # Production build
pnpm run start  # Production server
```

## Replit-Specific Notes

- Port 5000 is used (set via `PORT` env var in Replit config)
- CORS allows `*.replit.dev` domains for preview
- CSP is disabled in development mode to allow Vite HMR
- Supabase auth allowed hosts include `*.replit.dev` and `*.janeway.replit.dev`
- Database connected via Replit's built-in PostgreSQL (`DATABASE_URL` auto-provided)
