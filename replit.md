# Talk to My Lawyer

## Overview
Talk to My Lawyer is a full-stack legal letter platform that provides AI-drafted, attorney-reviewed legal letters for common disputes. The platform focuses on streamlining legal correspondence, initially targeting California jurisdiction with email-based delivery and simplified pricing. Its core purpose is to make legal assistance more accessible and efficient through a sophisticated AI pipeline backed by human attorney oversight, ensuring accuracy, consistency, and compliance. Key capabilities include a multi-stage AI pipeline for drafting and vetting, a recursive learning system for continuous improvement, and a document analyzer tool.

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
- **Admin Notification System**: In-app and optional email alerts, categorized by `users`, `letters`, `employee`, `general`.
- **Homepage**: Features a "View Your First Letter For Free" badge and "Get Started" CTA, with a first-visit popup.
- **Pricing Section**: Custom headline and simplified plan names.
- **Role Terminology**: "Employee" displayed as "Affiliate".
- **Onboarding**: Multi-step modal for new subscribers.
- **PDF Download**: Professional PDF generation with rich text, attorney-approved badge, and certified footer.
- **Review Modal**: Designed for attorney efficiency, displaying key intake data.
- **Letter Display**: Dynamic rendering of HTML or plain text.
- **How It Works**: Scroll-paced animations, SVG gradients, and accessibility considerations.
- **Platform Animation Foundation**: Reusable CSS keyframes for page transitions, card hovers, sidebar interactions, mobile drawers, notifications, badges, and tab content. All animations respect `prefers-reduced-motion`.
- **Dashboard Animations**: Reusable hooks for stagger-reveal, fade-up entrances, drag-glow, and multi-step form transitions, all respecting `prefers-reduced-motion` and using compositor-friendly transforms/opacity.

### Technical Implementations
- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter.
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20.
- **Database**: PostgreSQL via Supabase, accessed with Drizzle ORM + postgres-js driver.
- **Authentication**: Supabase Auth (cookie-first, Google OAuth PKCE), custom Resend verification emails, suppressed default Supabase emails. Admin 2FA enforced via email code and `admin_2fa` cookie for tRPC procedures.
- **AI Pipeline**: A 4-stage pipeline:
    1.  **Perplexity Research**: Web-grounded legal research with citation revalidation.
    2.  **Claude Opus Drafting**: Validation for JSON parse, grounding, and consistency.
    3.  **Claude Opus Assembly**: Validation for structure, word count, and consistency.
    4.  **Claude Sonnet Vetting**: Jurisdiction accuracy, anti-hallucination, anti-bloat, geopolitical awareness.
    5.  **Recursive Learning System**: Captures structured lessons from attorney feedback (approvals/rejections/changes) and computes quality scores, injecting lessons into future AI stages for continuous improvement.
- **Pipeline Resilience**: Automatic retry mechanism (up to 3 attempts with exponential backoff) before marking as `pipeline_failed`. DB-level lock uses `lt()` Drizzle operator for `pipeline_locked_at` comparison (fixed from broken `sql` template tag).
- **Rate Limiting**: Upstash Redis for fine-grained, per-user limits on sensitive endpoints, with a fail-closed mode for pipeline-triggering endpoints.
- **Database Indexes**: Comprehensive btree indexes on frequently queried columns in `letter_requests`, `workflow_jobs`, `review_actions`, `letter_versions`, `notifications`, `attachments`, `research_runs`.
- **research_runs schema**: Includes `cache_hit` (boolean, default false) and `cache_key` (varchar 256) columns for KV cache integration.
- **Error Tracking**: Sentry.
- **Deployment**: Railway.

### Feature Specifications
- **Multi-step Letter Generation Form**: Guides users through letter type, jurisdiction (California), parties, incident details, desired outcome, and exhibit uploads (PDF, DOCX, JPG, PNG, TXT up to 10MB each).
- **Pricing Plans**: Three tiers (Single Letter, Monthly, Yearly), all including attorney review.
- **Role-Specific IDs**: Sequential human-readable IDs (SUB-XXXX, EMP-XXXX, ATT-XXXX) for subscribers, employees, and attorneys.
- **Letter Role Tracking**: Records submitter and reviewer IDs for tracking attorney review counts.
- **Attorney Invitation Flow**: Admin-initiated invitation process for new attorneys, involving Supabase user creation, recovery links, and a branded invitation email.
- **Affiliate Program**: Single-use rotating discount codes with a commission settlement algorithm.
- **Anti-Hallucination Pipeline**: Employs deterministic validation, token-level grounding, citation registry, word count enforcement, and jurisdiction consistency checks. Flags unverified research for attorney acknowledgment.

## External Dependencies
- **Supabase**: PostgreSQL database, authentication services.
- **Drizzle ORM**: Object-relational mapping.
- **postgres-js**: PostgreSQL client.
- **Resend**: Transactional email sending.
- **Stripe**: Payment processing.
- **Perplexity API**: Legal research for AI pipeline.
- **Anthropic API (Claude Opus/Sonnet)**: AI model for drafting, assembly, and vetting.
- **Upstash Redis**: Rate limiting.
- **Sentry**: Error tracking and monitoring.
- **Cloudflare R2**: S3-compatible object storage for PDFs and attachments.
- **Railway**: Hosting and deployment.