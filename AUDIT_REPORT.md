# Phase 0: Audit Report

> **HISTORICAL DOCUMENT — Phase 0 audit only.** All gaps listed below have been resolved in subsequent phases. The current codebase has 19 tables, a 4-stage pipeline (Perplexity → Anthropic Claude Opus × 2 → Anthropic Claude Sonnet), and a fully implemented status machine including `pipeline_failed`, `client_approval_pending`, `client_approved`, and `sent`. For the current state of the platform, refer to `STRUCTURE.md` and `docs/FEATURE_MAP.md`.

## What's Already Implemented Correctly (at Phase 0)
1. **Schema**: 8 tables (users, letter_requests, letter_versions, review_actions, workflow_jobs, research_runs, attachments, notifications) — matches spec
2. **Status machine**: submitted → researching → drafting → pending_review → under_review → approved/rejected/needs_changes — correct
3. **3-stage pipeline (Phase 0)**: Perplexity (sonar-pro) → Anthropic Claude Opus (drafting) → Anthropic Claude Opus (assembly). Note: pipeline was subsequently upgraded to 4 stages in Phase 86+ (added Anthropic Claude Sonnet vetting stage).
4. **Deterministic validators**: validateResearchPacket, parseAndValidateDraftLlmOutput, validateFinalLetter — all present
5. **RBAC guards**: subscriberProcedure, employeeProcedure, adminProcedure — correct
6. **Subscriber-safe detail**: getLetterRequestSafeForSubscriber never returns AI draft or internal research — correct
7. **Version tracking**: ai_draft, attorney_edit, final_approved — correct
8. **Audit trail**: review_actions with internal/user_visible visibility — correct
9. **Email notifications**: Resend integration for all status changes — correct
10. **S3 file uploads**: storagePut for attachments — correct
11. **Job logging**: workflow_jobs + research_runs with full audit — correct
12. **Retry logic**: retryPipelineFromStage with research/drafting stage options — correct
13. **Claim/assign**: claimLetterForReview with idempotency check — correct

## Gaps Found (spec says "two-stage" but we have 3-stage — this is BETTER, keep it)
1. **Spec says 2-stage but we have 3-stage** — Our 3-stage is superior. Keep it.
2. **No `updateLetterRequestForChanges` subscriber endpoint** — Subscriber can't update their letter when needs_changes
3. **Subscriber cannot re-submit after needs_changes** — Missing flow
4. **Research provider default is "openai" in createResearchRun** — Should be "perplexity"
5. **Pipeline failure reverts to "submitted"** — Spec doesn't specify this, but it's reasonable for retry
6. **No research_sources normalization table** — Spec says "optionally normalize" — skip for now
7. **No adminForceStatusTransition** — Spec wants this for super_admin
8. **Polling/revalidation on frontend** — Need to add refetchInterval for in-progress statuses
9. **No subscriber update form for needs_changes** — Need to add

## Action Plan
1. Add subscriber `updateForChanges` mutation
2. Fix research provider default
3. Add admin `forceStatusTransition` mutation
4. Add polling/revalidation on frontend for researching/drafting/pending_review
5. Verify all frontend pages work with real data
