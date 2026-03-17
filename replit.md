# Talk to My Lawyer

A full-stack legal letter platform where users can get AI-drafted, attorney-reviewed legal letters.

## Architecture

- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20
- **Database**: PostgreSQL via Supabase (accessed via Drizzle ORM + postgres-js driver)
- **Auth**: Supabase Auth — cookie-first (`sb_session`), Google OAuth PKCE, custom Resend verification emails
- **Email**: Resend (custom transactional emails; Supabase built-in emails suppressed)
- **Payments**: Stripe
- **Rate Limiting**: Upstash Redis
- **AI Pipeline**: Perplexity (research) + Anthropic Claude (drafting & assembly)
- **Monitoring**: Sentry (error tracking, alerting)
- **Deployment**: Railway (`www.talk-to-my-lawyer.com` + `talk-to-my-lawyer.com`)

## Project Structure

```
client/          # React frontend (Vite root)
  src/
    components/  # UI components (shared/, ui/)
    pages/       # Route pages (subscriber/, attorney/, admin/)
    lib/         # Client utilities (trpc.ts, queryClient.ts)
    _core/       # Auth hooks, providers
server/          # Express backend
  _core/         # Server setup (index.ts, env.ts, vite.ts, trpc.ts, cookies.ts)
  db.ts          # Drizzle DB connection + all DB helper functions
  supabaseAuth.ts # All auth endpoints (signup, login, verify-email, Google OAuth, session)
  routers.ts     # All 42 tRPC procedures
  pipeline.ts    # AI letter generation pipeline
  email.ts       # Email sending (Resend)
  stripe.ts      # Stripe integration
  stripeWebhook.ts # Stripe webhook handler
shared/          # Shared types (const.ts, pricing.ts, types.ts, schema.ts)
drizzle/         # Drizzle ORM schema and migrations
  schema.ts      # Database schema definitions
scripts/         # Post-merge setup, DB helpers
```

## Auth Flow

### Email/Password Signup
- Uses `supabase.auth.admin.createUser()` (not `signUp()`) to **suppress Supabase's built-in confirmation email**
- A single custom verification email is sent via Resend immediately after account creation
- `POST /api/auth/verify-email` confirms the token, calls `supabase.auth.admin.updateUserById({ email_confirm: true })` **awaited** (no race condition), then sets the `sb_session` cookie and returns a redirect
- Non-critical side-effects (discount code, welcome email) are backgrounded after the response

### Google OAuth (PKCE)
- `GET /api/auth/google` generates a PKCE code verifier, stores it in a `pkce_verifier` cookie (`sameSite: lax`, `secure: true`), and redirects to Supabase's OAuth URL
- `GET /api/auth/callback` exchanges the code for a session using the stored verifier
- Falls back to implicit hash token for clients that can't follow redirects

### Session
- Session cookie: `sb_session` (`sameSite: none`, `secure: true`, `httpOnly: true`)
- tRPC client sends `credentials: "include"` + `Authorization: Bearer <token>` fallback
- `upsertUser` only upgrades `emailVerified: false → true`, never downgrades

### Allowed OAuth Redirect URLs (Supabase dashboard)
- `https://www.talk-to-my-lawyer.com/api/auth/callback`
- `https://talk-to-my-lawyer.com/api/auth/callback`

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
pnpm run start  # Production server (port 3000 on Railway)
```

## Replit-Specific Notes

- Port 5000 in development, 3000 in production (Railway)
- CORS allows `*.replit.dev` domains for preview
- CSP is disabled in development mode to allow Vite HMR
- Supabase auth allowed hosts include `*.replit.dev` and `*.janeway.replit.dev`
- Database connected via Replit's built-in PostgreSQL (`DATABASE_URL` auto-provided)

## Notable UI Decisions

### PDF Download (Attorney-Approved Letter)
- `handleDownloadFallback` in `LetterDetail.tsx` detects if `final_approved` content is HTML (regex test) and inserts it directly — no HTML escaping — so rich text renders correctly
- Plain-text fallback: split on double newlines → `<p>` blocks
- Template: professional letterhead (navy brand bar, scales icon), green "Attorney Reviewed & Approved" badge, Georgia serif letter body, certification footer

### ReviewModal (`components/shared/ReviewModal.tsx`)
- Uses `showCloseButton={false}` on `DialogContent` to suppress the shadcn built-in close button (modal has its own `<X>` in the header)
- Action buttons ("Claim for Review", "Confirm Approval") have `min-w` + `justify-center` to prevent width-shift during loading state
- Loading state uses `Loader2` spinner with stable button dimensions

### Final Approved Letter Display (`pages/subscriber/LetterDetail.tsx`)
- Detects HTML content via regex; renders via `dangerouslySetInnerHTML` with Tailwind prose styles if HTML, otherwise `<pre>` with `font-sans`

### HowItWorks Section (`components/HowItWorks.tsx`)
- Scroll-paced animations: card-lift entrance, orbit rings (per-step SVG gradient with unique IDs), icon-settle, badge-pop, subtle-float loop, dot-ping on progress line
- Burst labels styled as pill badges with checkmark icon
- `aria-live="polite"` region announces step completions to screen readers
- All animations respect `prefers-reduced-motion`
