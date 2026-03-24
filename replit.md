# Talk to My Lawyer

## Overview
Talk to My Lawyer is a full-stack legal letter platform designed to provide users with AI-drafted, attorney-reviewed legal letters. The platform aims to streamline the process of generating legal correspondence for common disputes. The initial launch is focused exclusively on California jurisdiction, offering email-based delivery and simplified pricing plans. The project seeks to make legal assistance more accessible and efficient through a sophisticated AI pipeline that ensures accuracy, consistency, and compliance, backed by human attorney oversight.

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

- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20
- **Database**: PostgreSQL via Supabase (accessed via Drizzle ORM + postgres-js driver)
- **Auth**: Supabase Auth — cookie-first (`sb_session`), Google OAuth PKCE, custom Resend verification emails
- **Email**: Resend (custom transactional emails; Supabase built-in emails suppressed)
- **Payments**: Stripe (3 subscription plans: Single Letter $200, Monthly $200/month, Yearly $2000/year)
- **Rate Limiting**: Upstash Redis
- **AI Pipeline**: 4-stage pipeline — Perplexity (research + citation revalidation) → Claude Opus (drafting) → Claude Opus (assembly) → Claude Sonnet (vetting: jurisdiction accuracy, anti-hallucination, anti-bloat, geopolitical awareness). Includes intake validation, citation grounding, party/jurisdiction consistency checks, word count enforcement, retry-with-feedback, deterministic bloat phrase detection, enriched audit trail, and **recursive learning system** (prompt memory + quality scoring)
- **Recursive Learning**: `pipeline_lessons` table captures structured lessons from attorney approve/reject/changes actions; `letter_quality_scores` tracks per-letter quality metrics (first-pass rate, edit distance, revision count, computed score). Lessons are injected into drafting/assembly/vetting prompts via `buildLessonsPromptBlock()`. Admin Learning page at `/admin/learning` for manual lesson CRUD and quality trend visualization
- **Document Analyzer**: Public free tool at `/analyze` — users upload PDF/DOCX/TXT documents and receive AI-generated summary, action items, and flagged risks (with severity). Rate-limited to 3/hour for unauthenticated users. Uses `pdf-parse` for PDF extraction, `mammoth` for DOCX, plain text for TXT. Results stored in `document_analyses` table (best-effort). Includes copy-to-clipboard and download-as-text-file export functionality.
- **Monitoring**: Sentry (error tracking, alerting)
- **Deployment**: Railway (`www.talk-to-my-lawyer.com` + `talk-to-my-lawyer.com`)

## System Architecture

### UI/UX Decisions
- **Frontend Framework**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing.
- **Branding**: Uses `logo-full.png` for consistent branding across the application.
- **Admin Notification System**: In-app notifications and optional email alerts categorized by `users`, `letters`, `employee`, `general`, with distinct badges for each category.
- **Homepage Hero**: Features a badge "View Your First Letter For Free" and a "Get Started" CTA, complemented by a first-visit popup for new users.
- **Pricing Section**: Custom headline "Resolve your dispute faster with lawyer-drafted letters and negotiations" and simplified plan names.
- **Role Terminology**: "Employee" role is consistently displayed as "Affiliate" throughout the frontend UI.
- **Onboarding**: Multi-step modal guides new subscribers through the letter generation process.
- **PDF Download**: Generates professional PDF letters with rich text support, a distinct attorney-approved badge, and a certified footer.
- **Review Modal**: Designed for attorney efficiency, displaying key intake data and controlling UI elements for approval workflows.
- **Letter Display**: Dynamically renders HTML content or plain text with appropriate styling.
- **How It Works**: Features scroll-paced animations, SVG gradients, and accessibility considerations (`aria-live="polite"`, `prefers-reduced-motion`).
- **Platform Animation Foundation** (index.css): Reusable CSS keyframes and utility classes — `animate-page-enter` (fade + rise for page transitions), `card-hover-lift` (3px lift + shadow on hover), `sidebar-nav-item`/`sidebar-nav-icon` (sidebar hover pill + icon micro-interaction), `animate-sidebar-in`/`animate-backdrop-in` (mobile drawer slide-in), `bell-ping-indicator` (notification attention pulse), `notification-stagger-item` (staggered dropdown reveal), `badge-transition` (smooth color changes on status badges), `animate-tab-enter` (tab content fade). All animations respect `prefers-reduced-motion`. Button components have `active:scale-[0.98]` press feedback globally.

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
  routers.ts     # All tRPC procedures
  pipeline.ts    # AI letter generation pipeline
  learning.ts    # Recursive learning: lesson extraction + quality scoring
  email.ts       # Email sending (Resend)
  stripe.ts      # Stripe integration
  stripeWebhook.ts # Stripe webhook handler
shared/          # Shared types (const.ts, pricing.ts, types.ts, schema.ts)
drizzle/         # Drizzle ORM schema and migrations
  schema.ts      # Database schema definitions
scripts/         # Post-merge setup, DB helpers
```

### Technical Implementations
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20.
- **Database**: PostgreSQL via Supabase, accessed with Drizzle ORM + postgres-js driver.
- **Authentication**: Supabase Auth (cookie-first, Google OAuth PKCE), custom Resend verification emails, `supabase.auth.admin.createUser()` to suppress default Supabase emails.
- **AI Pipeline**: A 4-stage pipeline for legal letter generation:
    1.  **Perplexity Research**: Web-grounded legal research with citation revalidation.
    2.  **Claude Opus Drafting**: Consolidated validation for JSON parse, grounding, and consistency.
    3.  **Claude Opus Assembly**: Consolidated validation for structure, word count, and consistency.
    4.  **Claude Sonnet Vetting**: Jurisdiction accuracy, anti-hallucination, anti-bloat, geopolitical awareness.
    5.  **Recursive Learning System**: Captures structured lessons from attorney feedback (approvals/rejections/changes) and computes 0-100 quality scores. Lessons are automatically injected into future AI drafting, assembly, and vetting stages to ensure continuous quality improvement.
- **Pipeline Resilience**: Automatic retry (up to 3 attempts with 10s/20s exponential backoff) via `runPipelineWithRetry()` before marking as `pipeline_failed`. All pipeline catch handlers consolidated into single reusable function.
- **Rate Limiting**: Implemented using Upstash Redis. Pipeline-triggering endpoints (submit, updateForChanges, retryFromRejected) use fail-closed mode — requests are denied when Redis is unavailable.
- **Database Indexes**: Comprehensive btree indexes on frequently queried columns: `letter_requests` (userId, status, assignedReviewerId, createdAt), `workflow_jobs` (letterRequestId, status), `review_actions` (letterRequestId), `letter_versions` (letterRequestId), `notifications` (userId), `attachments` (letterRequestId), `research_runs` (letterRequestId).
- **Error Tracking**: Sentry for error tracking and alerting.
- **Deployment**: Railway.

### Feature Specifications
- **Multi-step Letter Generation Form**:
    1.  Letter Type & Subject
    2.  Jurisdiction (California only)
    3.  Parties (Sender, Recipient)
    4.  Details (Incident, Matter, Outcome, Deadline)
    5.  Outcome (Desired outcome, response deadline, language preference, prior communication, delivery method: Email Only)
    6.  Exhibits (Merged Evidence + Communications, max 10, supports PDF, DOCX, JPG, PNG, TXT up to 10MB each).
- **Pricing Plans**: Three tiers – Single Letter ($200), Monthly ($200/month for 4 letters), Yearly ($2000/year for 48 letters). All plans include attorney review.
- **Affiliate Program**: Single-use discount codes that rotate upon copy, with a robust commission settlement algorithm.
- **Anti-Hallucination Pipeline**: Employs deterministic validation at each AI stage, including token-level grounding, citation registry, word count enforcement, and jurisdiction consistency checks. It flags unverified research, requiring attorney acknowledgment.

## External Dependencies
- **Supabase**: PostgreSQL database, authentication services.
- **Drizzle ORM**: Object-relational mapping for database interaction.
- **postgres-js**: PostgreSQL client for Node.js.
- **Resend**: Transactional email sending.
- **Stripe**: Payment processing for subscriptions and single letter purchases.
- **Perplexity API**: Legal research for the AI pipeline.
- **Anthropic API (Claude Opus/Sonnet)**: AI model for drafting, assembly, and vetting of legal letters.
- **Upstash Redis**: Rate limiting.
- **Sentry**: Error tracking and monitoring.
- **Railway**: Hosting and deployment platform.