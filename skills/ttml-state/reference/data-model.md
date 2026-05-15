# Data Model — Current State

> **Last verified:** 2026-05-14 against `drizzle/schema.ts`, `drizzle/schema/{index,constants,users,letters,billing,notifications,pipeline,content}.ts`, `drizzle/relations.ts`.

Drizzle ORM on Supabase PostgreSQL. Schema is split into 7 domain modules; `drizzle/schema.ts` is a barrel that re-exports them.

---

## Module layout

```
drizzle/
├── schema.ts                   # barrel: `export * from "./schema/index"`
├── schema/
│   ├── index.ts                # re-exports all 7 modules below
│   ├── constants.ts            # pgEnums, TS const arrays, vector customType
│   ├── users.ts                # users
│   ├── letters.ts              # letterRequests, letterVersions, reviewActions, workflowJobs,
│   │                           # researchRuns, attachments, letterTemplates, intakeFormTemplates
│   ├── billing.ts              # subscriptions, discountCodes, commissionLedger,
│   │                           # payoutRequests, processedStripeEvents
│   ├── notifications.ts        # notifications, emailVerificationTokens,
│   │                           # adminVerificationCodes, newsletterSubscribers
│   ├── pipeline.ts             # pipelineLessons, letterQualityScores,
│   │                           # trainingLog, fineTuneRuns
│   └── content.ts              # blogPosts, documentAnalyses
└── relations.ts                # Drizzle relation definitions
```

Imports work from either the barrel (`drizzle/schema.ts`) or the sub-modules directly — both forms are identical.

---

## Enums (`drizzle/schema/constants.ts`)

| pgEnum / TS array | Members |
|---|---|
| `USER_ROLES` / `userRoleEnum` | `subscriber`, `employee`, `attorney`, `admin` (flat — no `admin_sub_role`) |
| `LETTER_STATUSES` / `letterStatusEnum` | 20 values — see [pipeline.md](pipeline.md) §5 for the canonical set. Note: TS `LETTER_STATUS` in `shared/types/letter.ts` has 21 (includes `generated_unlocked` for legacy lookups; the pgEnum does not). |
| `LETTER_TYPES` / `letterTypeEnum` | 16 categories — see `LEGAL_SUBJECTS` in `shared/types/letter.ts`: `demand-letter`, `cease-and-desist`, `contract-breach`, `eviction-notice`, `employment-dispute`, `consumer-complaint`, `pre-litigation-settlement`, `debt-collection`, `estate-probate`, `landlord-tenant`, `insurance-dispute`, `personal-injury-demand`, `intellectual-property`, `family-law`, `neighbor-hoa`, `general-legal` |
| `versionTypeEnum` | `ai_draft`, `attorney_edit`, `final_approved` |
| `actorTypeEnum` | `system`, `subscriber`, `employee`, `attorney`, `admin` |
| `jobTypeEnum` | `research`, `draft_generation`, `generation_pipeline`, `retry`, `vetting`, `assembly` |
| `jobStatusEnum` | running / succeeded / failed (verify in `constants.ts` for exact tuple) |
| `researchStatusEnum` | pending / running / succeeded / failed / cache_hit |
| `priorityEnum` | letter priority tiers |
| `noteVisibilityEnum` | `internal`, `user_visible` |

### Custom `vector(1536)` type

Defined at the top of `drizzle/schema/constants.ts` via Drizzle's `customType`. Drives `letter_versions.embedding` for OpenAI `text-embedding-3-small` similarity search (1536 dimensions). Serializes to `[1.23,4.56,…]` Postgres-pgvector format on the way in; parses JSON on the way out.

---

## Key tables (canonical, by module)

### users (`drizzle/schema/users.ts`)

| Column | Notes |
|---|---|
| `id` | serial PK |
| `openId` | Supabase auth user UUID (synced) |
| `name`, `email`, `emailVerified` | from Supabase |
| `role` | `userRoleEnum` |
| `isActive` | soft-disable flag |
| `createdAt` | timestamp |

The `email` column is the join key for both super-admin whitelists (`SUPER_ADMIN_EMAILS` in `server/supabaseAuth.ts` + `HARDCODED_OWNER_EMAILS` in `server/_core/trpc.ts`).

### letters (`drizzle/schema/letters.ts`)

| Table | Purpose |
|---|---|
| `letter_templates` | Pre-canned scenario descriptions an attorney can clone when seeding a template gallery |
| `letter_requests` | Core entity — full lifecycle. Key cols: `userId`, `letterType`, `subject`, `issueSummary`, `jurisdictionState`, `intakeJson`, `status`, `assignedReviewerId`, `currentAiDraftVersionId`, `currentFinalVersionId`, `pdfUrl`, `priority`, `archivedAt`, `pipelineLockedAt`, `researchUnverified`, `qualityDegraded`, `qualityWarnings`, `isFreePreview`, `freePreviewUnlockAt`, `freePreviewEmailSentAt` |
| `letter_versions` | Immutable history. `versionType` ∈ `ai_draft` / `attorney_edit` / `final_approved`. Includes `embedding vector(1536)` for RAG. `ai_draft` is immutable — never UPDATE; INSERT a new `attorney_edit` row |
| `review_actions` | Audit trail for every status change + review note. `actorType`, `action`, `noteText`, `noteVisibility`, `fromStatus`, `toStatus` |
| `workflow_jobs` | Pipeline stage execution log: `jobType`, `provider`, `status`, `attemptCount`, `errorMessage`, `requestPayloadJson`, `responsePayloadJson`, `promptTokens`, `completionTokens`, `estimatedCostUsd` |
| `research_runs` | Stage 1 cached research: `cacheHit`, `cacheKey`, `queryPlanJson`, `resultJson` |
| `attachments` | Subscriber exhibits uploaded via Cloudflare R2 |
| `intake_form_templates` | Per-user custom intake form definitions |

### billing (`drizzle/schema/billing.ts`)

| Table | Purpose |
|---|---|
| `subscriptions` | Stripe state per user. Columns: `stripeCustomerId`, `stripeSubscriptionId`, `plan` (`monthly` / `yearly`), `status` (`active` / `past_due` / `canceled`), `lettersAllowed`, `lettersUsed`. **Never use `remaining_letters`** — that column doesn't exist; compute as `lettersAllowed - lettersUsed`. |
| `discount_codes` | Employee-issued affiliate codes. `code`, `discountPercent` (default 20), `isActive`, `usageCount`, `maxUses`, `expiresAt` |
| `commission_ledger` | Employee earnings on referred sales. `employeeId`, `letterRequestId`, `subscriberId`, `discountCodeId`, `saleAmount` (cents), `commissionRate` (basis points, 500 = 5%), `commissionAmount` (cents), `status` (`pending` / `paid` / `void`), `stripePaymentIntentId` (unique index) |
| `payout_requests` | Employee cash-out requests. `amount`, `paymentMethod`, `paymentDetails`, `status` (`pending` / `approved` / `paid` / `rejected`), `processedAt`, `rejectionReason` |
| `processed_stripe_events` | Stripe webhook idempotency. Insert with `.onConflictDoNothing()` against Stripe event `id` |

### notifications (`drizzle/schema/notifications.ts`)

| Table | Purpose |
|---|---|
| `notifications` | In-app notifications. `userId`, `type`, `title`, `body`, `link`, `readAt` |
| `email_verification_tokens` | Sign-up email verification flow |
| `admin_verification_codes` | Admin 2FA — code sent to admin email, validates `admin_2fa` cookie |
| `newsletter_subscribers` | Blog newsletter signups |

### pipeline (`drizzle/schema/pipeline.ts`)

| Table | Purpose |
|---|---|
| `pipeline_lessons` | Recursive learning. Lessons extracted from attorney edits, injected into future prompts. `category`, `lesson`, `createdAt`, plus quality scoring fields |
| `letter_quality_scores` | Per-letter quality assessments fed by attorney actions |
| `training_log` | Training pair captures for fine-tuning |
| `fine_tune_runs` | Vertex AI fine-tune job tracking — `status`, `runId`, `modelEndpoint`, polled every 30min by worker when GCP is configured |

### content (`drizzle/schema/content.ts`)

| Table | Purpose |
|---|---|
| `blog_posts` | CMS blog posts. Public-readable by slug; admin-only CRUD via `blogRouter` |
| `document_analyses` | Free GPT-4o document analyzer results. `userId`, `filename`, `analysisJson` |

---

## Drizzle conventions

- **Arrays** — use `text().array()` and `integer().array()`. **Never** `array(text())` — wrong call shape, won't compile.
- **Data access** — all DB I/O goes through [`server/db/`](../../../server/db/). Never write raw Drizzle queries in routers. Patterns to know:
  - `getDb()` — singleton connection (lazy, 10 max, 20s idle). Reads `SUPABASE_DATABASE_URL` then `DATABASE_URL`.
  - `getLetterRequestById(id)` — fetch single
  - `getLetterRequestSafeForSubscriber(id, userId)` — ownership-checked fetch
  - `updateLetterStatus(id, status, extra?)` — **enforces `isValidTransition`** and inserts a `review_actions` row
  - `logReviewAction({ letterRequestId, actorType, action, noteText, noteVisibility, fromStatus, toStatus })` — audit log
- **Insert validation** — use `createInsertSchema` from `drizzle-zod`, with `.omit({ id: true, createdAt: true })` etc.
- **Connection config** — `drizzle.config.ts` reads `SUPABASE_DATABASE_URL` (preferred) or `DATABASE_URL`; converts pooler port `6543` → direct `5432` for migrations. Forces `dns.setDefaultResultOrder("ipv4first")` at process start (Railway IPv6 fails against Supabase pooler).

---

## RLS

Supabase Row-Level Security protects database-level access in addition to application-level checks. The `SUPABASE_SERVICE_ROLE_KEY` (server-only) bypasses RLS — never expose it to the client.

---

**Sources read:** `drizzle/schema.ts`, `drizzle/schema/index.ts`, `drizzle/schema/constants.ts`, `drizzle/schema/letters.ts`, `shared/types/letter.ts` (for `LEGAL_SUBJECTS` and `LETTER_STATUS`), `AGENTS.md` §8 (Drizzle conventions), `ARCHITECTURE.md` (Database Schema table).
