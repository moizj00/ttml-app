---
name: ttml-pipeline-expert
description: "Expert in the Talk-To-My-Lawyer (TTML) legal letter generation pipeline, attorney review workflow, and status machine. Use for: managing the 4-stage AI pipeline (Perplexity → Claude Opus → Claude Opus → Claude Sonnet), handling letter status transitions, auditing review actions, and troubleshooting generation failures."
---

# TTML Pipeline & Status Expert

This skill provides the procedural knowledge and business logic required to manage the lifecycle of a legal letter request within the Talk-To-My-Lawyer (TTML) platform.

## 1. The 4-Stage AI Pipeline

The pipeline is a sequential, multi-model process orchestrated in `server/pipeline/orchestrator.ts`. It can optionally route through n8n (dormant path, only active when `N8N_PRIMARY=true`), but the canonical in-app path is as follows:

| Stage | Model (brand) | Purpose | Key Output |
| :--- | :--- | :--- | :--- |
| **1. Research** | Perplexity (`sonar-pro`) | Grounded legal research with citations | `ResearchPacket` |
| **2. Drafting** | **Claude Opus** | Initial legal draft from research | `DraftOutput` |
| **3. Assembly** | **Claude Opus** | Professional formatting and styling | `finalLetter` (v1) |
| **4. Vetting** | **Claude Sonnet** | Legal audit, citation check, anti-bloat | `finalLetter` (vetted) |

> **Model IDs:** Exact dated model pins (e.g., `claude-opus-4-5-*`, `claude-sonnet-4-5-*`) live in `server/pipeline/orchestrator.ts` / `server/pipeline/providers.ts`. Refer to brands in documentation so skill files don't rot on each model release.

### Pipeline Logic & Invariants
- **N8N Routing (dormant)**: When `N8N_PRIMARY=true` and an MCP/webhook URL is configured, the pipeline attempts to offload execution to n8n first, falling back to the in-app 4-stage pipeline on failure or timeout. By default (env unset), the in-app pipeline is primary.
- **Research Grounding**: Perplexity `sonar-pro` is the primary research provider. If it fails, the system falls back to Claude Opus without web grounding; the letter is marked `researchUnverified` (`webGrounded: false`).
- **Intermediate Content Registry**: The pipeline maintains an in-memory `_intermediateContentRegistry` to save the best draft produced so far. If a later stage fails, the worker can consume this registry to perform a best-effort fallback.
- **Vetting Loop**: Stage 4 (Vetting) triggers a re-assembly loop if critical issues (jurisdiction mismatch, hallucinated citations, factual errors) are found. If it still fails after maximum retries, the system flags the letter as `qualityDegraded` and appends `qualityWarnings`, but proceeds to `generated_locked` to allow attorney correction.
- **Workflow Logging**: Every execution step MUST be logged to the `workflow_jobs` table via `server/db/pipeline-records.ts`, including token usage and estimated cost (`pipelineCostSummary`).
- **Error Handling**: Failures are captured via Sentry. Retries should be initiated from the failed stage using `retryPipelineFromStage`. The job queue is managed by **pg-boss** (PostgreSQL-native — no Redis/BullMQ).

## 2. The Status Machine

Letter requests follow a strict state machine. Transitions are governed by `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`.

### Canonical Workflow
1. `submitted` → `researching` (Pipeline Start)
2. `researching` → `drafting`
3. `drafting` → `generated_locked` (Draft is blurred/locked behind paywall)
4. `generated_locked` → `pending_review` (After Payment/Unlock or Active Subscription Submission)
5. `pending_review` → `under_review` (Attorney claims letter)
6. `under_review` → `approved` (Attorney finalizes edit)
7. `approved` → `client_approval_pending` (Optional: Attorney requests client review)
8. `client_approval_pending` → `client_approved` \| `client_revision_requested` \| `client_declined`
9. `client_approved` → `sent` (Final delivery to recipient via `sendToRecipient`)

### Loopbacks & Recovery
- **`needs_changes`**: Attorney flags for correction; transitions back to `submitted` for a full pipeline re-run when the user provides additional context.
- **`pipeline_failed`**: Terminal failure in AI stages; can be reset to `submitted` for retry.
- **`rejected`**: Attorney rejects the letter entirely; transitions back to `submitted` if the user wants to try again.
- **Admin Override**: Admins can use `forceStatusTransition` in `server/routers/admin/letters.ts` to bypass the state machine for recovery, provided the target state is valid for the letter's current content versions.

## 3. Attorney Review Workflow

Located in the `review` router in `server/routers/review/`.

### Core Procedures
- **`queue`**: Lists letters available for review (status `pending_review`).
- **`claim`**: Assigns a letter to the current attorney and moves it to `under_review`.
- **`unclaim`**: Releases a letter back to `pending_review` and clears the assignment.
- **`saveEdit`**: Allows attorneys to save progress without finalizing, creating an `attorney_edit` version.
- **`approve`**: Finalizes the letter, creates a `final_approved` version, generates a PDF (server-side via PDFKit), triggers RAG embedding, captures training data, and notifies the user. Requires explicit acknowledgment if `researchUnverified` is true.
- **`requestChanges`**: Moves the letter to `needs_changes` and prompts the user for more info.
- **`reject`**: Moves the letter to `rejected` with a reason.
- **`requestClientApproval`**: Moves an `approved` letter to `client_approval_pending`.

### Review Invariants
- **Version Immutability**: Never overwrite an existing version. Always create a new `LetterVersion` in `server/db/letter-versions.ts` (e.g., `ai_draft`, `attorney_edit`, `final_approved`).
- **Audit Trail**: Every transition and review action MUST be logged in the `review_actions` table via `logReviewAction` in `server/db/review-actions.ts`, specifying `internal` or `user_visible` visibility.
- **Role gating**: Attorney actions are gated by `attorneyProcedure` tRPC middleware — flat `user_role = 'attorney'`, not a sub-role.

## 4. Troubleshooting & Maintenance

### Common Issues
- **Stuck Processing**: A letter is in `submitted`, `researching`, or `drafting` with a failed `workflow_job` and no content version. Use the admin `repairLetterState` procedure in `server/routers/admin/letters.ts` to reset it to `submitted`.
- **Quota Exhaustion**: API limits for Perplexity or Anthropic. Check `workflow_jobs` for error messages.
- **PDF Generation Failure**: Approval succeeds but PDF is missing. PDFKit runs server-side; check `pdfGenerator.ts` and Sentry logs. The approval process is non-blocking and will succeed even if PDF generation fails.

### Recovery Procedures
1. Identify the failed stage in `workflow_jobs`.
2. Use `retryJob` (admin) or `enqueueRetryFromStageJob` to resume from the specific failed stage via **pg-boss**.
3. If the state machine is stuck, use `repairLetterState` or `forceStatusTransition` (Admin) to reset the letter.
4. Monitor the **pipeline-worker** logs in Railway for pg-boss job processing activity.
