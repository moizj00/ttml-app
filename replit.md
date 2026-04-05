# Talk to My Lawyer

## Overview
Talk to My Lawyer is a full-stack legal letter platform that provides AI-drafted, attorney-reviewed legal letters for common disputes, specifically within California jurisdiction. The platform aims to improve accessibility and efficiency in legal correspondence through email-based delivery and simplified pricing. Key capabilities include a multi-stage AI pipeline for drafting and vetting, a recursive learning system, and a document analyzer, all supported by human attorney oversight. The project's vision is to streamline legal assistance and make it more widely available.

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
- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter for routing.
- **Branding**: Consistent use of `logo-full.png`.
- **Homepage**: Features a "View Your First Letter For Free" badge and "Get Started" CTA, with a first-visit popup.
- **Role Terminology**: "Employee" displayed as "Affiliate".
- **Onboarding**: Multi-step modal for new subscribers.
- **PDF Download**: Professional PDF generation with rich text, attorney-approved badge, and certified footer.
- **How It Works**: Scroll-paced animations with SVG gradients, respecting `prefers-reduced-motion`.
- **Shared Footer**: 4-column layout (`client/src/components/shared/Footer.tsx`) with brand info, services, company links, newsletter signup, and social media.
- **Competitive Positioning**: Homepage hero, pricing page, and homepage pricing section all use the unified positioning: "AI drafting + attorney review, delivered in hours, starting at $200."
- **Trust Section**: Homepage "By the Numbers" section with 4 stat-driven trust badges.
- **Competitive FAQ**: FAQ page has a "Why Talk to My Lawyer" category with 5 competitive comparison entries.

### Technical Implementations
- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter.
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20.
- **Database**: PostgreSQL via Supabase, accessed with Drizzle ORM + `postgres-js`.
- **Authentication**: Supabase Auth (cookie-first, Google OAuth PKCE), custom Resend verification emails. Admin 2FA enforced.
- **AI Pipeline**: A 4-stage pipeline: Perplexity Research, Claude Opus Drafting, Claude Opus Assembly, Claude Sonnet Vetting. Includes a 5-tier failover chain for research resilience and automatic retry with exponential backoff for overall pipeline resilience.
- **Recursive Learning System**: Self-optimizing knowledge engine that captures structured lessons from attorney feedback, including AI-powered categorization, deduplication, and effectiveness tracking.
- **RAG Embedding + Training Pipeline**: Generates OpenAI embeddings for approved letters, captures training examples, injects similar approved letters as few-shot RAG context, and auto-triggers Vertex AI fine-tuning.
- **Pipeline Worker**: Uses BullMQ with Upstash Redis for job queues.
- **Rate Limiting**: Fine-grained, per-user limits using Upstash Redis.
- **Database Security Hardening**: RLS enabled on all tables, `search_path = ''` on public helper functions.
- **Database Architecture**: Uses a primary + read replica topology with transparent fallback.
- **Health Check & Monitoring**: Public `/health` and admin `/health/details` endpoints check database, Redis, Stripe, Resend, Anthropic, Perplexity, Cloudflare R2.
- **Error Tracking**: Sentry.
- **Deployment**: Railway.

### Feature Specifications
- **Demand Letter Template Library**: Database-driven template gallery (`letter_templates` table) with seed scenarios and admin CRUD panel.
- **Dynamic Intake Forms**: `LETTER_TYPE_CONFIG` in `shared/types.ts` defines `situationFields` per letter type, rendering dynamically. Users can create custom intake templates.
- **Multi-step Letter Generation Form**: Guides users through letter type, jurisdiction, parties, incident details, desired outcome, and exhibit uploads. Address fields use Google Places Autocomplete for real-time suggestions.
- **Google Places Autocomplete**: `AddressAutocomplete` component (`client/src/components/shared/AddressAutocomplete.tsx`) provides address auto-suggestions on sender and recipient address fields. Requires `VITE_GOOGLE_MAPS_API_KEY` secret. Restricted to US addresses. Gracefully degrades to plain text input if API key is missing or API fails.
- **Pricing Plans**: Three tiers (Single Letter, Monthly, Yearly), all including attorney review.
- **Role-Specific IDs**: Sequential human-readable IDs (SUB-XXXX, EMP-XXXX, ATT-XXXX).
- **Affiliate Program**: Single-use rotating discount codes with commission settlement.
- **Anti-Hallucination Pipeline**: Employs deterministic validation, token-level grounding, citation registry, word count enforcement, and jurisdiction consistency checks, flagging unverified research.
- **Counter-Argument Anticipation**: Stage 2 drafting generates 3–5 likely opposing arguments with strength ratings; Stage 4 vetting validates coverage. Displayed in a dedicated "Counter" tab in attorney review.
- **Evidence Intelligence**: Document Analyzer extracts structured evidence items with confidence levels. Evidence is displayed in analysis results and carried through to the letter submission form via `AnalysisPrefill`.

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
- **Cloudflare R2**: S3-compatible object storage.
- **Google Cloud Platform**: Vertex AI for fine-tuning, Cloud Storage for training data.
- **OpenAI**: Embeddings for RAG pipeline; GPT-4o as failover provider.
- **Google Maps JavaScript API + Places API**: Address autocomplete in letter submission forms.
- **Railway**: Hosting and deployment.