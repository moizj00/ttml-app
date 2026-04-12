# Talk-To-My-Lawyer (TTML) — Agent Guidelines

> **For architecture, tech stack, module map, and status machine details, see [`ARCHITECTURE.md`](ARCHITECTURE.md).**

## Core Architectural Invariants

All modifications must respect these fundamental patterns. For detailed enforcement rules and examples, refer to the markdown files in `skills/architectural-patterns/`.

1. **Mandatory Attorney Review**: Every AI-generated letter must be reviewed by an attorney. The `ai_draft` version is immutable — always create a new `attorney_edit` version. (`skills/architectural-patterns/mandatory_attorney_review.md`)
2. **Strict Status Machine**: All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. No skipping states. (`skills/architectural-patterns/strict_status_machine.md`)
3. **RBAC Enforcement**: Access gated by tRPC middleware. Always verify `userRole` before allowing actions. (`skills/architectural-patterns/rbac_enforcement.md`)
4. **Super Admin Whitelist**: Hard-coded in `server/supabaseAuth.ts`, cannot be modified via UI or API. (`skills/architectural-patterns/super_admin_whitelist.md`)
5. **Attorney Promotion Flow**: Only super admins can promote to attorney; active subscribers cannot be promoted.
6. **Session Refresh**: Role changes take effect immediately via `invalidateUserCache()` and frontend `refetchOnWindowFocus`.
7. **Payment Gate**: Full letter content locked at `generated_locked` until payment, with server-side truncation and frontend blurring. (`skills/architectural-patterns/payment_gate.md`)

## Pre-Change Checklist

Before making any changes, consult:

- **Schema**: `drizzle/schema.ts`
- **State Transitions**: `shared/types/letter.ts` (`ALLOWED_TRANSITIONS`)
- **Role Verification**: `server/routers/` (tRPC procedure guards)
- **AI Pipeline**: `server/pipeline/orchestrator.ts`
- **Auditability**: `logReviewAction` for `review_actions` table
- **Side Effects**: Emails, payments, RAG, training data
- **Super Admin Whitelist**: `server/supabaseAuth.ts`
- **Entitlements**: Atomic usage claim for letter creation

**Note to agent**: Prioritize adherence to these guidelines. If a task conflicts with these principles, flag it for review and explain the conflict.
