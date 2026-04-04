# Talk to My Lawyer

## Overview
Talk to My Lawyer is a full-stack legal letter platform designed to provide AI-drafted, attorney-reviewed legal letters for common disputes, specifically focusing on California jurisdiction. The platform aims to enhance accessibility and efficiency in legal correspondence through an email-based delivery system and simplified pricing. Its core capabilities include a multi-stage AI pipeline for drafting and vetting, a recursive learning system for continuous improvement, and a document analyzer, all supported by human attorney oversight. The project's vision is to make legal assistance more streamlined and widely available.

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
- **Homepage**: Features a "View Your First Letter For Free" badge and "Get Started" CTA, with a first-visit popup.
- **Role Terminology**: "Employee" displayed as "Affiliate".
- **Onboarding**: Multi-step modal for new subscribers.
- **PDF Download**: Professional PDF generation with rich text, attorney-approved badge, and certified footer.
- **How It Works**: Scroll-paced animations with SVG gradients, respecting `prefers-reduced-motion`.
- **Shared Footer**: 4-column layout (`client/src/components/shared/Footer.tsx`) with brand info, services, company links, newsletter signup, and social media.
- **Blog Author Bylines**: `BlogPost.tsx` shows "Reviewed by licensed attorneys" under author name.
- **Newsletter Signup**: Footer form posts to `POST /api/newsletter/subscribe` storing in `newsletter_subscribers` table.
- **Pipeline Analytics Dashboard**: Admin-only observability dashboard for pipeline performance metrics.
- **Competitive Positioning**: Homepage hero, pricing page, and homepage pricing section all use the unified positioning: "AI drafting + attorney review, delivered in hours, starting at $200."
- **Trust Section**: Homepage "By the Numbers" section with 4 stat-driven trust badges (60% settlement rate, 24hr attorney review, $200 starting price, 10+ letter types).
- **Competitive FAQ**: FAQ page has a "Why Talk to My Lawyer" category with 5 competitive comparison entries.
- **Content Calendar**: Internal `/content-calendar` page (noindex) with 12 blog topic briefs across 3 months, including keyword targets, outlines, internal links, CTAs, and social media repurposing waterfall.
- **Newsletter Template**: Internal `/newsletter-template` page (noindex) with reusable newsletter structure (hook headline, key insight, stat of the week, service spotlight, CTA) and sample preview.

### Technical Implementations
- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter.
- **Backend**: Express.js + tRPC (type-safe API), Node.js 20.
- **Database**: PostgreSQL via Supabase, accessed with Drizzle ORM + `postgres-js`.
- **Authentication**: Supabase Auth (cookie-first, Google OAuth PKCE), custom Resend verification emails. Admin 2FA enforced.
- **AI Pipeline**: A 4-stage pipeline: Perplexity Research, Claude Opus Drafting, Claude Opus Assembly, Claude Sonnet Vetting.
- **Pipeline Research Resilience**: 5-tier failover chain (Perplexity sonar-pro, OpenAI stored prompt, Groq Llama 3.3 70B, synthetic intake fallback, best-effort fallback) to ensure continuous operation. Failover is triggered by errors like rate limits, quota issues, or API key problems.
- **Recursive Learning System**: Self-optimizing knowledge engine that captures structured lessons from attorney feedback, including AI-powered categorization, deduplication, and effectiveness tracking.
- **RAG Embedding + Training Pipeline**: Generates OpenAI embeddings for approved letters, captures training examples, injects similar approved letters as few-shot RAG context, and auto-triggers Vertex AI fine-tuning.
- **Pipeline Worker**: Uses BullMQ with Upstash Redis for job queues, running pipeline processing in a dedicated worker.
- **Pipeline Resilience**: Automatic retry with exponential backoff and a best-effort fallback to deliver degraded drafts.
- **Rate Limiting**: Fine-grained, per-user limits using Upstash Redis.
- **Database Security Hardening**: RLS enabled on all tables, `search_path = ''` on public helper functions.
- **Database Architecture**: Uses a primary + read replica topology. `getDb()` for writes, `getReadDb()` for reads, with transparent fallback to primary if replica is unavailable.
- **Health Check & Monitoring**: Public `/health` and admin `/health/details` endpoints check database, Redis, Stripe, Resend, Anthropic, Perplexity, Cloudflare R2.
- **Error Tracking**: Sentry.
- **Deployment**: Railway.

### Feature Specifications
- **Demand Letter Template Library**: Database-driven template gallery (`letter_templates` table) with seed scenarios. Users can browse templates, pre-fill intake forms, and admins manage templates via CRUD panel.
- **Multi-step Letter Generation Form**: Guides users through letter type, jurisdiction, parties, incident details, desired outcome, and exhibit uploads.
- **Pricing Plans**: Three tiers (Single Letter, Monthly, Yearly), all including attorney review.
- **Role-Specific IDs**: Sequential human-readable IDs (SUB-XXXX, EMP-XXXX, ATT-XXXX).
- **Affiliate Program**: Single-use rotating discount codes with commission settlement.
- **Anti-Hallucination Pipeline**: Employs deterministic validation, token-level grounding, citation registry, word count enforcement, and jurisdiction consistency checks, flagging unverified research.

## SEO Architecture & Conventions

Future agents working on SEO for this project should follow these established patterns:

### Content Structure
- **Service Pages**: Defined in `client/src/pages/services/serviceData.ts` as a `SERVICES` array. Each entry includes: slug, title, h1, keyword, metaTitle, metaDescription, heroDescription, useCases[], faqs[], relatedArticles[], and blogCategory.
- **Blog Posts**: Stored in the `blog_posts` PostgreSQL table. Seeded via `scripts/seed-blog-posts.ts`. Each post has: slug, title, excerpt, content (markdown), category, metaDescription, ogImageUrl, authorName, status, readingTimeMinutes, publishedAt, updatedAt.
- **Blog Categories**: Defined in `drizzle/schema.ts` as `BLOG_CATEGORIES`. Labels are mapped in `BlogIndex.tsx` and `BlogPost.tsx` via `CATEGORY_LABELS` and `CATEGORIES` constants. New categories must be added to both files.

### Content Cluster Strategy (Hub & Spoke)
- Each **service page** is a "hub" that links to 3–5 related blog posts via `relatedArticles[]`.
- Each **blog post** links back to related services via the `CATEGORY_TO_SERVICES` mapping (automatically shown as "Related Services" sidebar in `BlogPost.tsx`).
- Blog posts include inline links to other blog posts and service pages within their markdown content (e.g., `[link text](/blog/slug)` or `[link text](/services/slug)`).
- CTAs in blog posts are category-specific, defined in `CATEGORY_CTA` in `BlogPost.tsx`, linking to the most relevant service page.

### SEO Meta Tags Pattern
Every public page must include (via `react-helmet-async`):
- `<title>` — Unique, keyword-rich, format: "Topic — Talk to My Lawyer"
- `<meta name="description">` — Concise, compelling, 150-160 chars
- `<link rel="canonical">` — Full canonical URL
- `<meta property="og:title/description/type/url/image">` — Complete Open Graph tags
- `<meta name="twitter:card/title/description/image">` — Twitter Card tags

### Structured Data (JSON-LD)
- **Homepage** (`Home.tsx`): Organization, LocalBusiness, WebApplication, WebSite (with SearchAction), LegalService (with OfferCatalog), BreadcrumbList
- **Service Pages** (`ServicePage.tsx`): LegalService, FAQPage, BreadcrumbList
- **Blog Posts** (`BlogPost.tsx`): Article (with publisher, dates), BreadcrumbList
- **Blog Index** (`BlogIndex.tsx`): Blog schema
- **App-wide** (`App.tsx`): Organization (global)

### Local SEO
- Geo-meta tags in `client/index.html`: `geo.region=US-CA`, `geo.placename=California`, `ICBM` coordinates
- LocalBusiness JSON-LD on homepage with `areaServed: California`, `address: { addressRegion: "CA" }`
- All services reference "California" jurisdiction in their content and legal citations

### Sitemap
- Dynamic sitemap at `server/sitemapRoute.ts` — automatically includes all static pages, service slugs, and published blog posts from the database.
- New service slugs must be added to the `SERVICE_SLUGS` array in `sitemapRoute.ts` (and to `serviceData.ts`).
- Blog posts are automatically included when their status is "published".
- `robots.txt` at `client/public/robots.txt` references the sitemap.

### Adding New Content (Checklist)
When adding a **new service page**:
1. Add to `SERVICES` array in `client/src/pages/services/serviceData.ts`
2. Add icon mapping in `client/src/pages/services/ServicesIndex.tsx` (`SERVICE_ICONS`)
3. Add slug to `SERVICE_SLUGS` in `server/sitemapRoute.ts`
4. Add footer link in `client/src/components/shared/Footer.tsx`
5. Routing is automatic via `/services/:slug` in `App.tsx`

When adding a **new blog post**:
1. Add to `posts` array in `scripts/seed-blog-posts.ts` with all required fields
2. Run `npx tsx scripts/seed-blog-posts.ts` to seed
3. If new category: add to `CATEGORIES`, `CATEGORY_LABELS`, and `CATEGORY_CTA` in both `BlogIndex.tsx` and `BlogPost.tsx`
4. Include internal links to related service pages and blog posts in content
5. Blog post automatically appears in sitemap when status is "published"

When adding a **new blog category**:
1. Add to `BLOG_CATEGORIES` in `drizzle/schema.ts`
2. Add label in `BlogIndex.tsx` → `CATEGORIES` array and `CATEGORY_LABELS`
3. Add label in `BlogPost.tsx` → `CATEGORY_LABELS`
4. Add CTA in `BlogPost.tsx` → `CATEGORY_CTA` linking to the most relevant service page

### Performance & Technical SEO
- Preconnect hints for Google Fonts in `client/index.html`
- `font-display: swap` already applied via Google Fonts `display=swap` parameter
- DNS prefetch for external resources
- Images should use `loading="lazy"` for below-fold content and `alt` attributes
- All page components use lazy loading via `lazyRetry()` in `App.tsx`

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