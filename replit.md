# Talk to My Lawyer

A full-stack legal letter platform where users can get AI-drafted, attorney-reviewed legal letters. **California-only launch with single state jurisdiction, email-based delivery, and streamlined pricing.**

## Architecture

- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20
- **Database**: PostgreSQL via Supabase (accessed via Drizzle ORM + postgres-js driver)
- **Auth**: Supabase Auth — cookie-first (`sb_session`), Google OAuth PKCE, custom Resend verification emails
- **Email**: Resend (custom transactional emails; Supabase built-in emails suppressed)
- **Payments**: Stripe (3 subscription plans: Single Letter $200, Monthly $200/month, Yearly $2000/year)
- **Rate Limiting**: Upstash Redis
- **AI Pipeline**: 4-stage pipeline — Perplexity (research + citation revalidation) → Claude Opus (drafting) → Claude Opus (assembly) → Claude Sonnet (vetting: jurisdiction accuracy, anti-hallucination, anti-bloat, geopolitical awareness). Includes intake validation, citation grounding, party/jurisdiction consistency checks, word count enforcement, retry-with-feedback, deterministic bloat phrase detection, and enriched audit trail
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
  public/        # Static assets (logo-full.png, logo-icon-badge.png)
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
- For Affiliate signups (role=employee): conditional opt-in checkbox for referral program; affiliate code generated only if explicitly opted in

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

## Letter Generation Form (SubmitLetter.tsx)

### Multi-Step Process (7 Steps)
1. **Letter Type & Subject** — Demand letter, cease-and-desist, etc.
2. **Jurisdiction** — State selection (California only), optional city
3. **Parties** — Sender name/address/email/phone, recipient name/address/email
4. **Details** — Incident date, matter description, amount owed, desired outcome, deadline
5. **Outcome** — Desired outcome, response deadline, **language preference**, **prior communication**, **delivery method (Email Only)**
6. **Exhibits** — Merged Evidence + Communications section with labeled rows (A–J), each row has text description + file attachment, "+" button to add (max 10 exhibits)

### Delivery Method
- **Restricted to "Email Only"** — Certified Mail, Hand Delivery, and Both options removed from dropdown (legacy code paths preserved for backward compatibility)

### Exhibits Section (Task #26 merge)
- Replaces separate "Evidence" (Step 7) and "Communications" (Step 6) steps
- Each exhibit row: auto-incrementing letter label (A, B, C…) + text description box + file attachment input
- "+" button adds new row (up to max 10)
- Supports PDF, DOCX, JPG, PNG, TXT (max 10MB per file)
- Automatically indexed and labeled in the generated letter

### Jurisdiction Restriction
- **State dropdown restricted to California only** — No multi-state support in this launch
- Impacts legal research and applicable statutes/case law cited in generated letters

## Pricing Plans (Task #27 merge)

Changed from 4-plan structure to 3 simplified plans:

| Plan | Price | Letters | Best For |
|------|-------|---------|----------|
| **Single Letter** | $200 one-time | 1 letter | First-time users |
| **Monthly** | $200/month | 4 letters/month + $50 per additional | Individuals with regular needs |
| **Yearly** | $2000/year | 4 letters/month (48/year) | High-volume users, businesses |

**Note**: All plans include attorney review. "Attorney Review Included" text appears on pricing cards. Yearly plan = ~2 months free vs Monthly.

### Stripe Integration
- Plan IDs: `single_letter`, `monthly`, `yearly`
- Legacy plan aliases for backward compatibility: maps old IDs to new structure
- Single Letter checkout: $200 base price via `createLetterUnlockCheckout`

## Branding & UI

### Logo
- **File**: `client/public/logo-full.png` (replaced March 2026)
- **Format**: Full wordmark with icon + text on transparent background
- Used in navbar, login page, signup, and all public pages via `BrandLogo.tsx`

### Homepage Hero Section
- **Badge text**: "View Your First Letter For Free" (previously "Your First Letter Is Free — Attorney Review Included")
- **Primary CTA button**: "Get Started" (previously "Start Your Free Letter")
- **First-Visit Popup** (Task #26 merge):
  - Triggers 3 seconds after first-time visitor lands
  - Message: "Congratulations as a first time client. View your first letter for free"
  - Includes 5-minute countdown timer
  - Dismissible via close button
  - "Get Started" button redirects to `/login` (Task #28 merge)
  - Tracked via localStorage (`ttml_first_visit_popup_dismissed`)

### Pricing Section
- **Section headline**: "Resolve your dispute faster with lawyer-drafted letters and negotiations" (custom copy, no generic "Plans" or "Pricing")
- **Plan tier names**: "Single Letter", "Monthly", "Yearly" (no "Monthly Basic" / "Monthly Pro")
- **Removed**: Promo bar claiming first letter is complimentary (now handled via Single Letter plan)
- **Kept**: Attorney review mentioned on pricing cards

### Role Terminology
- **Frontend**: "Affiliate" (user-facing, everywhere UI displays the role)
- **Backend**: `employee` role unchanged in database, schema, and API
- **Mapping**: All frontend role-display code maps `role === "employee"` → "Affiliate"
- **Pages affected**:
  - Signup.tsx: "Create Affiliate Account" button, "Affiliate accounts require admin approval" message
  - Profile.tsx: "Affiliate" badge instead of "Employee"
  - AffiliateDashboard.tsx: Dashboard title and layout
  - Admin pages: "Affiliate Performance" tab in admin dashboard
  - Breadcrumbs: `/employee` route labeled as "Affiliate Dashboard"
  - Onboarding: "Affiliate Profile" section for new employees

### OnboardingModal
- Multi-step modal explaining the letter generation process: Submit → Research → Attorney Review → Download
- Tracked via localStorage (`ttml_onboarding_seen`)
- Shown only on first subscriber dashboard visit

## Notable UI Decisions

### PDF Download (Attorney-Approved Letter)
- `handleDownloadFallback` in `LetterDetail.tsx` detects if `final_approved` content is HTML (regex test) and inserts it directly — no HTML escaping — so rich text renders correctly
- Plain-text fallback: split on double newlines → `<p>` blocks
- Template: professional letterhead (navy brand bar, scales icon), green "Attorney Reviewed & Approved" badge, Georgia serif letter body, certification footer

### ReviewModal (`components/shared/ReviewModal.tsx`)
- Uses `showCloseButton={false}` on `DialogContent` to suppress the shadcn built-in close button (modal has its own `<X>` in the header)
- Action buttons ("Claim for Review", "Confirm Approval") have `min-w` + `justify-center` to prevent width-shift during loading state
- Loading state uses `Loader2` spinner with stable button dimensions
- Displays sender/recipient names, jurisdiction, matter description, desired outcome, and financials from stored `intakeJson`

### Final Approved Letter Display (`pages/subscriber/LetterDetail.tsx`)
- Detects HTML content via regex; renders via `dangerouslySetInnerHTML` with Tailwind prose styles if HTML, otherwise `<pre>` with `font-sans`
- Intake data (sender, recipient, jurisdiction) NOT displayed in subscriber view — only in attorney ReviewModal
- PDF download button uses pdfGenerator for final approved content or fallback HTML generator for drafts

### HowItWorks Section (`components/HowItWorks.tsx`)
- Scroll-paced animations: card-lift entrance, orbit rings (per-step SVG gradient with unique IDs), icon-settle, badge-pop, subtle-float loop, dot-ping on progress line
- Burst labels styled as pill badges with checkmark icon
- `aria-live="polite"` region announces step completions to screen readers
- All animations respect `prefers-reduced-motion`

## Affiliate Program (Task #22 merge)

### Discount Code Management
- **Single-use codes**: Each code can only be used once (maxUses: 1)
- **Code rotation**: When affiliate copies their code, the server rotates to a new code automatically
- **UI label**: "Single-use · rotates on copy"
- **API**: `affiliate.rotateCode` mutation; `affiliate.validateCode` checks both validity and usage
- **Database**: discount_codes table with max_uses enforcement; affil code only generated if employee explicitly opts in at signup

### Commission Settlement
- **Payout algorithm**: Cumulative oldest-first — marks oldest pending commissions until running total meets or exceeds payout amount
- **Audit trail**: Server logs mark IDs, total amount marked, and payout request ID
- **Verification**: DB-level testing confirmed correct settlement of partial payouts (e.g., $70 payout marking $30 + $50, leaving $40 pending)

## Anti-Hallucination Pipeline (Tasks #23, #25 merge)

Three-stage AI pipeline with deterministic validation at each stage:

### Stage 1: Perplexity Research
- Web-grounded legal research with citation revalidation
- If fallback to Anthropic (no Perplexity key), flagged with `webGrounded: false`
- Research packet includes applicable rules, case law, remedies, defenses, enforcement climate

### Stage 2: Drafting (Claude)
- Consolidated single-retry validation: JSON parse + grounding + consistency checked together
- Jurisdiction mismatch fatal after retry
- Ungrounded citations stored with warnings if non-fatal
- Token-level grounding matching (70% threshold)
- Citation registry built from research; injected with hard constraints forbidding uncited references

### Stage 3: Assembly (Claude)
- Consolidated single-retry validation: structure + word count + consistency
- Word count enforcement per LETTER_TYPE_CONFIG target (±15%)
- Jurisdiction consistency check (sender/recipient state must match letter jurisdiction)
- No placeholders allowed (final letter must be complete)
- Verifies all required sections (header, salutation, facts, legal basis, damages, demands, consequences, closing)

### Cross-Cutting
- Intake pre-flight validator blocks pipeline for placeholder data
- Swapped-party detection in consistency checker
- Retry utility with 2s backoff delay
- All workflow/research updates use structured ValidationResult objects
- First-attempt failures persisted before retry for full audit trail

### Unverified Research Flagging
- Attorney approval gating: server enforces `acknowledgedUnverifiedResearch` boolean when `letter.researchUnverified=true`
- UI shows mandatory checkbox in read-only letter view
- Citation Confidence Report panel with verified/unverified entries and risk score
- Unverified citations appear in red highlighting; low-confidence in amber
- RESEARCH_UNVERIFIED banner when Anthropic fallback was used

## Important Known Issues

### Post-Merge Setup Script
- Currently fails with exit code 1 on `drizzle migrate` despite no actual schema drift
- No operational impact — migrations apply correctly via Drizzle push
- Workaround: None needed; script failure is informational only

## Recent Changes (Session Summary)

### Logo & Jurisdiction (Latest)
- Replaced `client/public/logo-full.png` with new brand asset
- Restricted state dropdown to California only in letter form

### Task #26: Frontend UI Overhaul (California Launch)
- Email-only delivery method
- Merged Evidence + Communications into Exhibits section
- Employee → Affiliate renaming throughout UI
- Hero badge: "View Your First Letter For Free"
- Removed "Attorney Review Included" from hero badge
- First-visit popup with 5-min countdown timer

### Task #27: Pricing Restructure
- Changed from 4 plans to 3: Single Letter, Monthly, Yearly
- New plan IDs and Stripe product mapping
- Schema updates to support new plans

### Task #28: Popup CTA Updates
- FirstVisitPopup now redirects to /login on "Get Started" click
- Hero button text changed from "Start Your Free Letter" to "Get Started"
