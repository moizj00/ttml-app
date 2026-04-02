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
- **Pipeline Analytics Dashboard**: Admin-only observability dashboard showing pipeline success rates, processing times, citation validation, attorney review turnaround, quality scores, and retry stats.

### Technical Implementations
- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter.
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20.
- **Database**: PostgreSQL via Supabase, accessed with Drizzle ORM + postgres-js driver.
- **Authentication**: Supabase Auth (cookie-first, Google OAuth PKCE), custom Resend verification emails. Admin 2FA enforced.
- **AI Pipeline**: A 4-stage pipeline: Perplexity Research, Claude Opus Drafting, Claude Opus Assembly, Claude Sonnet Vetting.
- **Recursive Learning System**: Self-optimizing knowledge engine capturing structured lessons from attorney feedback, with AI-powered categorization, deduplication, consolidation, effectiveness tracking, and smart weight decay.
- **RAG Embedding + Training Pipeline**: Generates OpenAI embeddings for approved letters, captures training examples to GCS, injects similar approved letters as few-shot RAG context, and auto-triggers Vertex AI fine-tuning.
- **Pipeline Worker (BullMQ)**: Pipeline processing runs in a dedicated worker process, separate from the API server, using Upstash Redis for job queues.
- **Pipeline Error Codes**: Structured error codes with categories for transient vs. permanent errors.
- **Pipeline Resilience**: Automatic retry mechanism with exponential backoff.
- **Rate Limiting**: Upstash Redis for fine-grained, per-user limits.
- **Database Security Hardening**: RLS enabled on all tables, `search_path = ''` on public helper functions.
- **Database Indexes**: Comprehensive btree indexes on frequently queried columns.
- **research_runs schema**: Includes `cache_hit` and `cache_key` for KV cache integration.
- **Health Check & Monitoring**: Public `/health` and admin `/health/details` endpoints checking database, Redis, Stripe, Resend, Anthropic, Perplexity, Cloudflare R2.
- **Error Tracking**: Sentry.
- **Deployment**: Railway.

### Feature Specifications
- **Multi-step Letter Generation Form**: Guides users through letter type, jurisdiction (California), parties, incident details, desired outcome, and exhibit uploads.
- **Pricing Plans**: Three tiers (Single Letter, Monthly, Yearly), all including attorney review.
- **Role-Specific IDs**: Sequential human-readable IDs (SUB-XXXX, EMP-XXXX, ATT-XXXX).
- **Letter Role Tracking**: Records submitter and reviewer IDs.
- **Attorney Invitation Flow**: Admin-initiated process for new attorneys.
- **Affiliate Program**: Single-use rotating discount codes with commission settlement.
- **Anti-Hallucination Pipeline**: Employs deterministic validation, token-level grounding, citation registry, word count enforcement, and jurisdiction consistency checks, flagging unverified research.

## External Dependencies
- **Supabase**: PostgreSQL database, authentication services.
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