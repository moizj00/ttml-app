# Talk to My Lawyer

## Overview
Talk to My Lawyer is a full-stack legal letter platform that provides AI-drafted, attorney-reviewed legal letters for common disputes. The platform aims to streamline legal correspondence, making legal assistance more accessible and efficient. It focuses on California jurisdiction, offering email-based delivery and simplified pricing. Key capabilities include a multi-stage AI pipeline for drafting and vetting, a recursive learning system for continuous improvement, and a document analyzer tool, all backed by human attorney oversight.

## User Preferences
I prefer iterative development, with a focus on delivering small, functional pieces of the project regularly.
I value clear and concise communication. Please avoid overly technical jargon where simpler explanations suffice.
When proposing changes or new features, please provide a brief overview of the impact and reasoning.
I prefer to be asked before major architectural changes or significant refactoring efforts are undertaken.
All UI/UX decisions should prioritize a clean, intuitive, and user-friendly experience.
Ensure that the `client/public/logo-full.png` file is always the latest brand asset.
The system should prioritize California-specific legal requirements and user experience.
The delivery method for legal letters should strictly be "Email Only."
The legal letter generation process should be a clear, multi-step flow for the user.
Pricing plans should be simple and easy for users to understand, with attorney review explicitly included.
All mentions of the "employee" role in the UI should be presented as "Affiliate."
The onboarding experience for new subscribers should be guided and informative.
PDF downloads of approved letters should maintain professional formatting and clear indicators of attorney approval.
The review process for attorneys should be efficient and provide all necessary information for approval.
Interactive elements, like the "How It Works" section, should be engaging with scroll-paced animations while respecting user accessibility preferences (`prefers-reduced-motion`).
The anti-hallucination pipeline should be robust, with clear flagging for unverified research and enforced attorney acknowledgment.

## System Architecture

### UI/UX Decisions
- **Frontend Framework**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing.
- **Branding**: Consistent use of `logo-full.png`.
- **Admin Notification System**: In-app and optional email alerts.
- **Homepage**: Features a "View Your First Letter For Free" badge and "Get Started" CTA, with a first-visit popup.
- **Pricing Section**: Custom headline and simplified plan names.
- **Role Terminology**: "Employee" displayed as "Affiliate".
- **Onboarding**: Multi-step modal for new subscribers.
- **PDF Download**: Professional PDF generation with rich text, attorney-approved badge, and certified footer.
- **Review Modal**: Designed for attorney efficiency.
- **Letter Display**: Dynamic rendering of HTML or plain text.
- **How It Works**: Scroll-paced animations, SVG gradients, and accessibility considerations respecting `prefers-reduced-motion`.
- **Platform Animation Foundation**: Reusable CSS keyframes and dashboard animation hooks respecting `prefers-reduced-motion`.
- **Testimonials Section**: 3-card grid between Features and Pricing on homepage (Sarah M./Austin TX/Contractor, Marcus T./LA/IP, Priya K./SF/Security Deposit).
- **Shared Footer**: `client/src/components/shared/Footer.tsx` — 4-column layout with brand info, Services links, Company links, and newsletter signup + social media icons (LinkedIn, X). Used on Home, BlogIndex, BlogPost, FAQ.
- **Blog Author Bylines**: BlogPost.tsx shows shield icon + "Reviewed by licensed attorneys" under author name.
- **Newsletter Signup**: Footer form posts to `POST /api/newsletter/subscribe` → `newsletter_subscribers` table (id, email unique, source, created_at).
- **Pipeline Analytics Dashboard**: Admin-only observability dashboard showing pipeline success rates, processing times, citation validation, attorney review turnaround, quality scores, and retry stats.

### Technical Implementations
- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter.
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20.
- **Database**: PostgreSQL via Supabase, accessed with Drizzle ORM + postgres-js driver.
- **Authentication**: Supabase Auth (cookie-first, Google OAuth PKCE), custom Resend verification emails. Admin 2FA enforced.
- **AI Pipeline**: A 4-stage pipeline: Perplexity Research, Claude Opus Drafting, Claude Opus Assembly, Claude Sonnet Vetting.
- **Pipeline Research Resilience (Stage 1)**: 5-tier failover chain ensures the pipeline **never stops** due to research provider failures:
  1. **Perplexity sonar-pro** (primary, web-grounded)
  2. **OpenAI stored prompt** (failover, web-grounded via `web_search_preview` tool, uses native OpenAI SDK with stored prompt ID `pmpt_69ce00ac398081948f6d0a08e4f3eae206666fe163342fa9`)
  3. **Groq Llama 3.3 70B** (OSS last-resort, NOT web-grounded)
  4. **Synthetic intake fallback** (synthesizes a research packet from client intake data — no external research, fully degraded, marked for heightened attorney review)
  5. **Best-effort fallback** (worker-level, after all pipeline retries exhausted — delivers whatever draft content was produced)
  - The `isFailoverCandidate()` function in `server/pipeline/shared.ts` determines which errors trigger failover (rate limits, quota, billing, invalid API keys, capacity, auth errors, HTTP 401/402/429/503/529).
  - Quality warnings are injected into `pipelineCtx.qualityWarnings` at each degradation level.
  - The `runOpenAIStoredPromptResearch()` function in `server/pipeline/providers.ts` calls the native OpenAI Responses API with the stored prompt + web search.
  - The `synthesizeResearchFromIntake()` function in `server/pipeline/research.ts` builds a minimal valid `ResearchPacket` from intake data when all providers fail.
- **Recursive Learning System**: Self-optimizing knowledge engine capturing structured lessons from attorney feedback, with AI-powered categorization, deduplication, consolidation, effectiveness tracking, and smart weight decay.
- **RAG Embedding + Training Pipeline**: Generates OpenAI embeddings for approved letters, captures training examples to GCS, injects similar approved letters as few-shot RAG context, and auto-triggers Vertex AI fine-tuning.
- **Pipeline Worker (BullMQ)**: Pipeline processing runs in a dedicated worker process, separate from the API server, using Upstash Redis for job queues.
- **Pipeline Error Codes**: Structured error codes with categories for transient vs. permanent errors.
- **Pipeline Resilience**: Automatic retry mechanism with exponential backoff. Best-effort fallback (`bestEffortFallback` in `server/pipeline/orchestrator.ts`) delivers degraded drafts after all retries are exhausted.
- **Rate Limiting**: Upstash Redis for fine-grained, per-user limits.
- **Database Security Hardening**: RLS enabled on all tables, `search_path = ''` on public helper functions.
- **Database Indexes**: Comprehensive btree indexes on frequently queried columns.
- **research_runs schema**: Includes `cache_hit` and `cache_key` for KV cache integration.
- **Health Check & Monitoring**: Public `/health` and admin `/health/details` endpoints checking database, Redis, Stripe, Resend, Anthropic, Perplexity, Cloudflare R2.
- **Error Tracking**: Sentry.
- **Deployment**: Railway.

### Feature Specifications
- **Demand Letter Template Library**: Database-driven template gallery (`letter_templates` table) with 8 seed scenarios across categories (Unpaid Money, Property Damage, Services Not Rendered). Subscribers browse templates at `/library`, click "Use This Template" to navigate to `/submit?templateId=<id>` which pre-fills the intake form via sessionStorage (no extra API round-trip). Admins manage templates via `/admin/templates` CRUD panel. `templateId` is saved on `letter_requests` for outcome tracking.
- **Multi-step Letter Generation Form**: Guides users through letter type, jurisdiction (California), parties, incident details, desired outcome, and exhibit uploads.
- **Pricing Plans**: Three tiers (Single Letter, Monthly, Yearly), all including attorney review.
- **Role-Specific IDs**: Sequential human-readable IDs (SUB-XXXX, EMP-XXXX, ATT-XXXX).
- **Letter Role Tracking**: Records submitter and reviewer IDs.
- **Attorney Invitation Flow**: Admin-initiated process for new attorneys.
- **Affiliate Program**: Single-use rotating discount codes with commission settlement.
- **Anti-Hallucination Pipeline**: Employs deterministic validation, token-level grounding, citation registry, word count enforcement, and jurisdiction consistency checks, flagging unverified research.

### Database Connection Architecture

The app uses a **primary + read replica** database topology:

- **Primary DB** (`getDb()` from `server/db/core.ts`): Used for all **write** operations (INSERT, UPDATE, DELETE). Connection URL resolved via fallback chain: `SUPABASE_DIRECT_URL → SUPABASE_DATABASE_URL → DATABASE_URL`.
- **Read Replica** (`getReadDb()` from `server/db/core.ts`): Used for all **read-only** queries (SELECT). Connects to `SUPABASE_READ_REPLICA_URL`. Falls back to primary if the replica is unavailable or connection fails. Pool size controlled by `DB_READ_POOL_MAX` (default 15).
- Both are exported from `server/db/index.ts`.

**Modules using `getReadDb()` for reads:**
| Module | Read functions (use replica) | Write functions (stay on primary `getDb()`) |
|---|---|---|
| `server/db/analytics.ts` | `getCostAnalyticsData` | — |
| `server/db/blog.ts` | `getPublishedBlogPosts`, `getBlogPostBySlug`, `getBlogPostBySlugAnyStatus`, `getBlogPostSlugById`, `getAllBlogPosts` | `createBlogPost`, `updateBlogPost`, `deleteBlogPost` |
| `server/db/quality.ts` | `getQualityScoreByLetterId`, `getQualityScoreStats`, `getQualityScoresByLetterType`, `getQualityScoreTrend`, `getEditDistanceTrend`, `getRAGAnalytics`, `getFineTuneRuns` | `createLetterQualityScore` |
| `server/db/admin.ts` | `getSystemStats`, `getCostAnalytics` | `assignRoleId` |
| `server/db/lessons.ts` | `getActiveLessons`, `getActiveLessonsForScope`, `getAverageQualityScoreForScope`, `getLessonImpactSummary`, `getAllLessons`, `getLessonById` | `createPipelineLesson`, `boostExistingLesson`, `incrementLessonInjectionStats`, `updateLessonEffectivenessScores`, `updatePipelineLesson`, `deletePipelineLesson` |

**Important notes for future agents:**
- When adding new DB query functions, use `getReadDb()` for pure reads and `getDb()` for any writes.
- The read replica has slight replication lag (typically <1 second). Avoid using it for reads that immediately follow a write in the same request (read-after-write consistency). For such cases, use `getDb()` instead.
- If `SUPABASE_READ_REPLICA_URL` is not set, all reads transparently fall back to the primary — no code changes needed.
- The `_readDbFailed` flag in `core.ts` prevents repeated connection attempts if the replica is down. The app must be restarted to retry the replica connection after it recovers.

### Deployment (Railway)

- **Dockerfile**: `HEALTHCHECK` uses `${PORT:-3000}` dynamically (Railway injects `PORT=8080`).
- **railway.toml**: `preDeployCommand = "node dist/migrate.js"`, HTTP health check at `/health`.
- **Port**: Railway expects port `8080`. The Replit dev server runs on port `5000`.
- **Git push**: Use `git push https://moibftj:${GITHUB_TOKEN}@github.com/moibftj/ttml-app.git main`. The `GITHUB_TOKEN` secret is set in Replit.
- **Health status "degraded"**: Currently caused solely by Perplexity API quota exhaustion (401). All other services are healthy.

### Known Issues & Gotchas

- **drizzle-kit migration 0016**: `ELIFECYCLE exit code 1` from `CREATE INDEX CONCURRENTLY` — this is a known Drizzle issue; migrations still apply correctly.
- **TypeScript errors**: Pre-existing TS errors in `admin2fa.ts` and blog files — non-blocking, do not fix unless specifically asked.
- **Perplexity API**: Quota exceeded (401) — causes "degraded" health status. Non-critical; only affects legal research stage of the pipeline.
- **Vertex AI Vector Search**: Disabled — missing `VERTEX_SEARCH_INDEX_ID`, `VERTEX_SEARCH_INDEX_ENDPOINT_ID`, `VERTEX_SEARCH_DEPLOYED_INDEX_ID` env vars. Falls back to pgvector.
- **Secrets rotation**: API keys (OpenAI, Anthropic, Perplexity, Stripe) were previously exposed in git history (since purged via `git filter-branch`). Consider rotating as a precaution.

## External Dependencies
- **Supabase**: PostgreSQL database (primary + read replica), authentication services.
- **Drizzle ORM**: Object-relational mapping.
- **postgres-js**: PostgreSQL client.
- **Resend**: Transactional email sending.
- **Stripe**: Payment processing.
- **Perplexity API**: Legal research for AI pipeline.
- **Anthropic API (Claude Opus/Sonnet)**: AI model for drafting, assembly, and vetting.
- **Upstash Redis**: Rate limiting and BullMQ job queue.
- **BullMQ + ioredis**: Job queue for pipeline worker process.
- **Sentry**: Error tracking and monitoring.
- **Cloudflare R2**: S3-compatible object storage for PDFs and attachments.
- **Google Cloud Platform**: Vertex AI for fine-tuning, Cloud Storage for training data.
- **OpenAI**: Embeddings for RAG pipeline; GPT-4o as failover provider.
- **Railway**: Hosting and deployment.

## Required Environment Secrets

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Replit-managed PostgreSQL (fallback) |
| `SUPABASE_DATABASE_URL` | Supabase pooler connection string (primary) |
| `SUPABASE_READ_REPLICA_URL` | Supabase read replica connection string |
| `SUPABASE_ANON_KEY` | Supabase auth anon key |
| `GITHUB_TOKEN` | GitHub push authentication |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `SENTRY_DSN` | Sentry server-side DSN |
| `VITE_SENTRY_DSN` | Sentry client-side DSN |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |