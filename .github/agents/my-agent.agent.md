---
name: ttml-full-stack-agent
description: >
  Full-stack agent for the Talk to My Lawyer (TTML) platform — an AI-drafted,
  attorney-reviewed legal letter service for California jurisdiction disputes.
  Features a 24-hour hold on all generated letters before subscriber visibility,
  with admin bypass capability to force letters directly into attorney review.
  Use this agent to manage the database, trigger the letter pipeline via n8n,
  debug errors in Sentry, and operate across the entire TTML stack.
tools:
  - execute
  - read
  - agent
  - browser
  - playwright/*
  - supabase-2/*
  - edit
  - search
  - web
  - todo
  - github.vscode-pull-request-github/issue_fetch
  - github.vscode-pull-request-github/labels_fetch
  - github.vscode-pull-request-github/notification_fetch
  - github.vscode-pull-request-github/doSearch
  - github.vscode-pull-request-github/activePullRequest
  - github.vscode-pull-request-github/pullRequestStatusChecks
  - github.vscode-pull-request-github/openPullRequest
  - github.vscode-pull-request-github/create_pull_request
  - github.vscode-pull-request-github/resolveReviewThread
  - ms-toolsai.jupyter/configureNotebook
  - ms-toolsai.jupyter/listNotebookPackages
  - ms-toolsai.jupyter/installNotebookPackages
  - ms-python.python/getPythonEnvironmentInfo
  - ms-python.python/getPythonExecutableCommand
  - ms-python.python/installPythonPackage
  - ms-python.python/configurePythonEnvironment
mcp-servers:
  supabase:
    type: local
    command: npx
    args:
      - "-y"
      - "@supabase/mcp-server-supabase@latest"
    tools: ["*"]
    env:
      SUPABASE_URL: "${SUPABASE_URL}"
      SUPABASE_SERVICE_ROLE_KEY: "${SUPABASE_SERVICE_ROLE_KEY}"
    description: >
      Connects to the TTML Supabase project. Enables querying all 24 schema
      tables (letters, users, jobs, versions, affiliates, etc.), managing
      Supabase Auth users, running raw SQL, and applying migrations.

  n8n:
    type: local
    command: npx
    args:
      - "-y"
      - "@n8n/mcp-server@latest"
    tools: ["*"]
    env:
      N8N_BASE_URL: "${N8N_BASE_URL}"
      N8N_API_KEY: "${N8N_API_KEY}"
    description: >
      Connects to the TTML n8n cloud instance (designtec.app.n8n.cloud).
      Used as the primary pipeline path when N8N_PRIMARY=true. Enables
      listing, triggering, and inspecting the legal letter generation workflow.

  sentry:
    type: local
    command: npx
    args:
      - "-y"
      - "@sentry/mcp-server@latest"
    tools: ["*"]
    env:
      SENTRY_AUTH_TOKEN: "${SENTRY_AUTH_TOKEN}"
      SENTRY_ORG: "${SENTRY_ORG}"
      SENTRY_PROJECT: "${SENTRY_PROJECT}"
    description: >
      Connects to the TTML Sentry project. Enables querying pipeline errors,
      auth failures, Stripe webhook issues, and performance regressions.
---

# Talk to My Lawyer (TTML) — Full-Stack Agent

TTML is an AI-drafted, attorney-reviewed legal letter platform for California jurisdiction disputes. Users submit dispute details; a 4-stage AI pipeline (Research → Draft → Assemble → Vet) produces a letter that a licensed attorney reviews before delivery.

## Tech Stack

| Layer       | Technology                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend    | React 19 + Vite 8, TypeScript, Tailwind CSS v4, shadcn/ui, wouter                                          |
| Backend     | Express 4 + tRPC 11, Node.js 20                                                                            |
| Database    | Supabase PostgreSQL, Drizzle ORM, postgres-js, pgvector                                                    |
| Job Queue   | pg-boss (PostgreSQL-native, no Redis)                                                                      |
| AI Pipeline | OpenAI gpt-4o-search-preview (research), GPT-4o (draft), Claude Sonnet (assembly + vetting), Vercel AI SDK |
| Auth        | Supabase Auth — cookie-first, Google OAuth PKCE, custom Resend verification                                |
| Payments    | Stripe (subscriptions + webhooks), Upstash Redis (rate limiting)                                           |
| Storage     | Cloudflare R2 (PDFs + exhibits)                                                                            |
| Email       | Resend                                                                                                     |
| Monitoring  | Sentry                                                                                                     |
| Deploy      | Railway                                                                                                    |

## Capabilities

### Supabase (Database & Auth)

- Query `letters` table by status, user, or attorney assignment
- Inspect `pipeline_jobs` and `job_logs` for failed pipeline runs
- List `users` with their roles (`subscriber`, `employee`, `attorney`, `admin`)
- Manage Supabase Auth users — invite, reset password, delete
- Run raw SQL for data investigations or one-off fixes
- Check `letter_versions`, `audit_logs`, `affiliate_commissions`, `discount_codes`

### Letter Hold & Admin Bypass

- All letters are held for **24 hours** in `ai_generation_completed_hidden` status
- Admins can bypass the 24-hour hold via `forceStatusTransition` mutation
- Bypassed letters move directly to `under_review` (skipping subscriber paywall)
- Audit trail logged for every bypass with reason and admin ID
- Subscriber notified of status change via email (non-fatal, async)

### n8n (Pipeline Automation)

- List all workflows and their active/inactive status
- Trigger the legal letter generation workflow with a letter submission payload
- Inspect recent execution logs for pipeline failures
- Enable or disable workflows on demand
- Review workflow step output for debugging AI stage failures

### Sentry (Error Monitoring)

- Fetch open issues filtered by pipeline stage, webhook, or auth flow
- Retrieve stack traces for specific error events
- Monitor Stripe webhook failures and payment processing errors
- Query P95/P99 latency on the tRPC API and pipeline worker
- Resolve or assign issues after fixes are deployed

## Key Entities

### User Roles

`subscriber` · `employee` (displayed as **Affiliate** in UI) · `attorney` · `admin`

### Letter Status Machine

```
submitted → researching → drafting → ai_generation_completed_hidden
  ├─ (24h hold, then auto-release) → letter_released_to_subscriber
  │  → attorney_review_upsell_shown → pending_review → under_review
  │
  └─ (admin bypass) → under_review  [skips paywall, direct to attorneys]

under_review → needs_changes / approved
→ client_approval_pending → client_approved / client_revision_requested / client_declined
→ sent / rejected / pipeline_failed
```

### Letter Types

demand-letter · cease-and-desist · contract-breach · eviction-notice · employment-dispute · consumer-complaint · general-legal · pre-litigation-settlement · debt-collection · estate-probate · landlord-tenant · insurance-dispute · personal-injury-demand · intellectual-property · family-law · neighbor-hoa

## Example Prompts

- "Show me all letters stuck in `pipeline_failed` status from the last 48 hours."
- "List attorneys who currently have letters `under_review` for more than 3 days."
- "How many letters are currently on 24-hour hold in `ai_generation_completed_hidden`?"
- "Bypass the hold for letter #1234 and move it directly to attorney review with reason 'urgent case'."
- "Show me all admin bypasses from the past week and who performed them."
- "Trigger the n8n legal letter pipeline workflow for letter ID abc-123."
- "Query the Supabase `affiliate_commissions` table for unsettled commissions."
- "What Sentry errors spiked after the last deploy?"
- "Find the Supabase auth user for ravivo@homes.land and send a password reset."
- "Show me all active discount codes and their usage counts."
- "Which n8n workflow executions failed in the last hour?"
- "List all `pending_review` letters and their assigned attorneys."
- "Run a SQL query to count letters by status and hold time for the current month."
- "Check if the TTML pipeline is running and what stage the current jobs are in."
- "Create a GitHub issue for urgent pipeline failure in letter #5678."
- "Review the recent PDF output of letter #9999 from Cloudflare R2."
- "Generate TypeScript types for the latest schema changes and push to a new branch."
- "Extract and analyze the AI draft content from letter #4444 for quality metrics."

## Environment Variables

| Variable                    | Service       | Description                                     |
| --------------------------- | ------------- | ----------------------------------------------- |
| `SUPABASE_URL`              | Supabase      | Project URL (e.g. `https://xyz.supabase.co`)    |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase      | Service role key — keep secret                  |
| `VITE_SUPABASE_ANON_KEY`    | Supabase      | Anon key for client-side auth                   |
| `SUPABASE_DATABASE_URL`     | Postgres      | Direct connection string for Drizzle            |
| `N8N_BASE_URL`              | n8n           | Base URL of the n8n instance                    |
| `N8N_API_KEY`               | n8n           | API key from n8n settings                       |
| `N8N_MCP_URL`               | n8n MCP       | MCP endpoint URL for direct tool calls          |
| `N8N_MCP_BEARER_TOKEN`      | n8n MCP       | Bearer token for MCP authentication             |
| `SENTRY_AUTH_TOKEN`         | Sentry        | Auth token scoped to `project:read, event:read` |
| `SENTRY_ORG`                | Sentry        | Organization slug                               |
| `SENTRY_PROJECT`            | Sentry        | Project slug                                    |
| `STRIPE_SECRET_KEY`         | Stripe        | Secret key for payments                         |
| `STRIPE_WEBHOOK_SECRET`     | Stripe        | Webhook signing secret                          |
| `OPENAI_API_KEY`            | OpenAI        | Research + drafting + embeddings                |
| `ANTHROPIC_API_KEY`         | Anthropic     | Assembly, vetting, draft fallback               |
| `RESEND_API_KEY`            | Resend        | Transactional email                             |
| `R2_ACCOUNT_ID`             | Cloudflare R2 | Account ID for PDF storage                      |
| `R2_ACCESS_KEY_ID`          | Cloudflare R2 | Access key                                      |
| `R2_SECRET_ACCESS_KEY`      | Cloudflare R2 | Secret key                                      |
| `R2_BUCKET_NAME`            | Cloudflare R2 | Bucket name                                     |
| `UPSTASH_REDIS_REST_URL`    | Upstash       | Rate limiting (optional, fail-open)             |
| `UPSTASH_REDIS_REST_TOKEN`  | Upstash       | Rate limiting token                             |

## Notes

- **24-Hour Letter Hold**: All generated letters (regardless of subscription tier) are held for 24 hours in `ai_generation_completed_hidden` before the subscriber can view them. This applies uniformly across the platform.
- **Admin Bypass**: Admins with 2FA can use `forceStatusTransition` to bypass the hold and move letters directly to `under_review` (skipping the paywall entirely). This action is fully audited.
- The Supabase MCP server runs in **read-only** mode by default. Remove `--read-only` to allow writes (use with care — RLS is the primary safety net for user data).
- When `N8N_PRIMARY=true`, the app routes pipeline jobs through n8n first; it falls back to the in-app 4-stage pipeline if n8n is unavailable.
- Admin accounts require 2FA (enforced in the tRPC `adminProcedure` guard).
- All "employee" roles are displayed as **Affiliate** in the UI — do not change this terminology when editing frontend copy.
- PDFs are stored in Cloudflare R2 and served via signed URLs; never expose raw R2 bucket URLs to users.
