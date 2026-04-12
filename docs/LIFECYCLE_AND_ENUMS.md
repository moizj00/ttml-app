# Lifecycle & Enum Canonical Reference

This document is the single canonical reference for every enum in the system.
The source of truth for runtime values is `drizzle/schema/constants.ts`.
This document describes the values, their relationships, and the policy for keeping them in sync.

---

## Letter Status State Machine

### ASCII State-Machine Diagram (matches `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`)

```
                        ┌──────────────────────────────────────┐
                        │           pipeline_failed            │
                        │         (any stage failure)          │
                        └──────────────┬───────────────────────┘
                                       │ admin retry
                                       ▼
┌───────────┐    ┌─────────────┐    ┌───────────────┐    ┌──────────────────┐
│ submitted │───▶│ researching │───▶│   drafting     │───▶│ generated_locked │
└───────────┘    └─────────────┘    └───────────────┘    └──────────────────┘
   ▲  │              │                   │                        │
   │  │              │ reset             │ reset                  │ paywall / subscription
   │  │              └──▶ submitted      └──▶ submitted           ▼
   │  │                                                  ┌────────────────┐
   │  └─────────────────────────────────────────────────▶│ pipeline_failed│
   │                                                     └────────────────┘
   │
   │         ┌────────────────┐        ┌──────────────────┐
   │         │ pending_review │◀───────│ generated_locked │
   │         └───────┬────────┘        └──────────────────┘
   │                 │
   │                 ▼
   │         ┌──────────────┐
   │         │ under_review  │
   │         └──┬──┬──┬──┬──┘
   │            │  │  │  └──▶ pending_review (release claim)
   │            │  │  └─────▶ needs_changes ──▶ submitted | pending_review
   │            │  └────────▶ rejected ───────▶ submitted
   │            ▼
   │         ┌──────────┐
   │         │ approved  │──────────────────────────────────┐
   │         └──┬──┬─────┘                                  │
   │            │  │                                        ▼
   │            │  │    ┌──────────────────────────┐    ┌──────┐
   │            │  └───▶│ client_approval_pending  │    │ sent │
   │            │       └──┬──────────┬────────────┘    └──────┘
   │            │          │          │                   ▲
   │            │          │          ▼                   │
   │            │          │  ┌─────────────────┐        │
   │            │          │  │ client_approved  │────────┘
   │            │          │  └─────────────────┘
   │            │          │
   │            │          ▼
   │            │  ┌──────────────────────────────┐
   │            └─▶│ client_revision_requested    │──▶ pending_review | under_review
   │               └──────────────────────────────┘
   │
   │         ┌─────────────────┐
   └─────────│ client_declined │ (terminal)
             └─────────────────┘

Legacy (pgEnum only, not in active state machine):
  generated_unlocked → pending_review
  upsell_dismissed   → (no transitions)
```

### Status Table

| Status | User-Facing Label | Stage Grouping | Terminal? | Legacy? |
|---|---|---|---|---|
| `submitted` | Submitted | submitted | No | No |
| `researching` | Researching | research_draft | No | No |
| `drafting` | Drafting | research_draft | No | No |
| `generated_locked` | Draft Ready | draft_ready | No | No |
| `generated_unlocked` | Draft Ready | draft_ready | No | **Yes** (pgEnum only) |
| `pending_review` | Awaiting Review | attorney_review | No | No |
| `under_review` | Under Review | attorney_review | No | No |
| `needs_changes` | Changes Requested | attorney_review | No | No |
| `approved` | Approved | complete | No | No |
| `client_approval_pending` | Awaiting Client Approval | attorney_review | No | No |
| `client_revision_requested` | Revision Requested | attorney_review | No | No |
| `client_declined` | Client Declined | (terminal error) | **Yes** | No |
| `client_approved` | Client Approved | attorney_review | No | No |
| `sent` | Sent to Recipient | complete | **Yes** | No |
| `rejected` | Rejected | (terminal error) | Retryable | No |
| `pipeline_failed` | Pipeline Failed | (terminal error) | Retryable | No |
| `upsell_dismissed` | — | — | — | **Yes** (pgEnum only) |

### Terminal States

- `sent` — letter delivered, no further transitions
- `client_declined` — client rejected the letter, no further transitions
- `rejected` — attorney rejected; can transition back to `submitted` for retry
- `pipeline_failed` — pipeline failure; can transition back to `submitted` for admin retry

---

## Non-Letter Enums

### User Roles
**TS const:** `USER_ROLES` — `["subscriber", "employee", "attorney", "admin"]`
**pgEnum:** `userRoleEnum` (`user_role`)
**Used in:** user table, auth middleware, role-based access control

### Job Statuses
**TS const:** `JOB_STATUSES` — `["queued", "running", "completed", "failed"]`
**pgEnum:** `jobStatusEnum` (`job_status`)
**Used in:** pipeline jobs table, job queue processing

### Job Types
**TS const:** `JOB_TYPES` — `["research", "draft_generation", "generation_pipeline", "retry", "vetting", "assembly"]`
**pgEnum:** `jobTypeEnum` (`job_type`)
**Used in:** pipeline jobs table, job dispatch

### Version Types
**TS const:** `VERSION_TYPES` — `["ai_draft", "attorney_edit", "final_approved"]`
**pgEnum:** `versionTypeEnum` (`version_type`)
**Used in:** letter version tracking

### Actor Types
**TS const:** `ACTOR_TYPES` — `["system", "subscriber", "employee", "attorney", "admin"]`
**pgEnum:** `actorTypeEnum` (`actor_type`)
**Used in:** audit log, status change history

### Research Statuses
**TS const:** `RESEARCH_STATUSES` — `["queued", "running", "completed", "failed", "invalid"]`
**pgEnum:** `researchStatusEnum` (`research_status`)
**Used in:** research task tracking

### Priority Levels
**TS const:** `PRIORITIES` — `["low", "normal", "high", "urgent"]`
**pgEnum:** `priorityEnum` (`priority_level`)
**Used in:** letter priority assignment

### Note Visibility
**pgEnum only:** `noteVisibilityEnum` (`note_visibility`) — `["internal", "user_visible"]`
**Used in:** letter notes / comments

### Subscription Plans
**pgEnum only:** `subscriptionPlanEnum` (`subscription_plan`) — `["per_letter", "monthly", "monthly_basic", "annual", "free_trial_review", "starter", "professional", "single_letter", "yearly"]`
**Used in:** user subscriptions, billing

### Subscription Statuses
**pgEnum only:** `subscriptionStatusEnum` (`subscription_status`) — `["active", "canceled", "past_due", "trialing", "incomplete", "none"]`
**Used in:** subscription state tracking

### Commission Statuses
**pgEnum only:** `commissionStatusEnum` (`commission_status`) — `["pending", "paid", "voided"]`
**Used in:** referral/affiliate commissions

### Payout Statuses
**pgEnum only:** `payoutStatusEnum` (`payout_status`) — `["pending", "processing", "completed", "rejected"]`
**Used in:** payout processing

### Pipeline Stages
**TS const:** `PIPELINE_STAGES` — `["research", "drafting", "assembly", "vetting"]`
**pgEnum:** `pipelineStageEnum` (`pipeline_stage`)
**Used in:** pipeline learning, lesson storage

### Lesson Categories
**TS const:** `LESSON_CATEGORIES` — `["citation_error", "jurisdiction_error", "tone_issue", "structure_issue", "factual_error", "bloat_detected", "missing_section", "style_preference", "legal_accuracy", "general"]`
**pgEnum:** `lessonCategoryEnum` (`lesson_category`)
**Used in:** pipeline learning lessons

### Lesson Sources
**TS const:** `LESSON_SOURCES` — `["attorney_approval", "attorney_rejection", "attorney_changes", "attorney_edit", "manual", "subscriber_update", "subscriber_retry", "consolidation"]`
**pgEnum:** `lessonSourceEnum` (`lesson_source`)
**Used in:** pipeline learning lesson origin tracking

### Blog Categories
**TS const:** `BLOG_CATEGORIES` — `["demand-letters", "cease-and-desist", "contract-disputes", "eviction-notices", "employment-disputes", "consumer-complaints", "pre-litigation-settlement", "debt-collection", "estate-probate", "landlord-tenant", "insurance-disputes", "personal-injury", "intellectual-property", "family-law", "neighbor-hoa", "document-analysis", "pricing-and-roi", "general"]`
**Used in:** blog post categorization

### Blog Statuses
**TS const:** `BLOG_STATUSES` — `["draft", "published"]`
**Used in:** blog post publishing workflow

---

## Enum Drift Policy

### Source of Truth

The canonical runtime source of truth for all enum values is **`drizzle/schema/constants.ts`**.

For the letter lifecycle specifically, these files must stay in sync:
1. `drizzle/schema/constants.ts` — `LETTER_STATUSES` (TS const) and `letterStatusEnum` (pgEnum)
2. `shared/types/letter.ts` — `ALLOWED_TRANSITIONS` (transition map) and `STATUS_CONFIG` (UI labels/colors)
3. `client/src/lib/letterStages.ts` — `LETTER_STAGES` (UI stage groupings) and `TERMINAL_ERROR_STATUSES`

### Rules

1. **Adding a new enum value:**
   - Add it to both the TS const array and the pgEnum array in `constants.ts`
   - Create a Drizzle migration for the pgEnum change
   - For letter statuses: also add to `ALLOWED_TRANSITIONS`, `STATUS_CONFIG`, and the appropriate `LETTER_STAGES` entry (or `TERMINAL_ERROR_STATUSES`)
   - Update this document

2. **Deprecating a value:**
   - Do NOT remove the value from the pgEnum (requires a destructive migration)
   - Remove it from the TS const array if no new records should use it
   - Add a `// legacy:` comment on the pgEnum line
   - Document it as legacy in this file
   - Keep it in `STATUS_CONFIG` if old records may still display with that status

3. **CI enforcement:**
   - `server/__tests__/statusMachine.test.ts` contains drift-detection assertions that verify:
     - Every `LETTER_STATUSES` value has an `ALLOWED_TRANSITIONS` entry
     - Every `ALLOWED_TRANSITIONS` key is in `LETTER_STATUSES` or explicitly listed as legacy
     - Every `LETTER_STATUSES` value has a `STATUS_CONFIG` entry
     - `jobTypeEnum` values match `JOB_TYPES`
     - `lessonSourceEnum` values match `LESSON_SOURCES`
     - `LETTER_STAGES` + `TERMINAL_ERROR_STATUSES` cover every `LETTER_STATUSES` value
   - These tests **must pass** before merge. If you add/remove an enum value and tests fail, update all synchronized locations.
