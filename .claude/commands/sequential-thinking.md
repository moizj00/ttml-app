---
name: sequential-thinking
description: "Dynamic and reflective problem-solving through structured sequential thoughts. Use this skill whenever the user presents a complex, multi-step, or ambiguous problem that benefits from breaking down into evolving thinking steps. Trigger for: planning tasks with room for revision, analysis that might need course correction, problems where the full scope is unclear initially, multi-step solutions, tasks requiring sustained context, filtering irrelevant information, or any situation where the answer isn't immediately obvious. Use this aggressively — if a problem feels hard, sequential thinking will help. Also use when debugging, architectural decisions, strategy planning, or whenever you'd benefit from thinking out loud in a structured way. TTML-aware: for Talk-to-My-Lawyer tasks, apply TTML pattern recognition (state machines, RBAC, attorney flows, super admin security) as part of the sequential reasoning process."
---

# Sequential Thinking

A structured approach for dynamic, reflective problem-solving through evolving thoughts. Each thought can build on, question, or revise previous insights as understanding deepens.

For TTML (Talk-to-My-Lawyer) tasks, this skill is extended with pattern recognition — architectural invariants that must be verified as part of the thought chain. See TTML Mode below.

## When to Use This Skill

* Breaking down complex problems into steps
* Planning and design with room for revision
* Analysis that might need course correction
* Problems where the full scope might not be clear initially
* Multi-step solutions requiring sustained context
* Filtering irrelevant information from the important
* Debugging, architecture decisions, strategy planning
* Any time the answer isn't immediately obvious — if a problem feels hard, use this
* TTML tasks: state transitions, RBAC enforcement, AI pipeline consistency, attorney promotion flows, super admin security audits

## How It Works

The thinking process:

1. Generate a solution hypothesis
2. Verify hypothesis through Chain of Thought steps
3. Revise, branch, or extend as needed
4. Repeat until satisfied
5. Deliver a single, clear final answer

## Thought Parameters

Each thought has these properties (tracked mentally, expressed in output):

| Parameter | Description |
|-----------|-------------|
| thought | Current thinking step (see types below) |
| thoughtNumber | Current number in sequence |
| totalThoughts | Estimated thoughts needed — adjust freely up or down |
| nextThoughtNeeded | True if more thinking needed; only false when truly done |
| isRevision | True if this thought revises a previous one |
| revisesThought | Which thought number is being reconsidered |
| branchFromThought | Branching point thought number (if branching) |
| branchId | Branch label/identifier |
| needsMoreThoughts | Flag if you reach the end but realize more is needed |

## Thought Types

* Regular analytical steps
* Revisions of prior thoughts
* Questions about previous decisions
* Realizations requiring more analysis
* Changes in approach or framing
* Hypothesis generation
* Hypothesis verification
* [TTML] Pattern match checks (state machine, RBAC gate, whitelist, etc.)

## Execution Rules

1. Start with an initial estimate of needed thoughts — adjust freely
2. Question or revise previous thoughts at any time
3. Add more thoughts even after reaching what seemed like the end
4. Express uncertainty when present — don't fake confidence
5. Mark revision thoughts and branches explicitly
6. Ignore information irrelevant to the current step
7. Generate a hypothesis when you have enough to work with
8. Verify the hypothesis via your Chain of Thought
9. Repeat until you reach a satisfying, well-reasoned conclusion
10. Provide a single, ideally correct answer as final output
11. Only set nextThoughtNeeded = false when truly done

## Output Format

```
**Thought 1 / ~N**
[Current analytical step, hypothesis, or question]

**Thought 2 / ~N**
[Builds on or revises Thought 1. Note if revision.]

...

**Thought N / N** ✓
[Final verified conclusion]

---
**Final Answer:** [Single, clear, correct output]
```

### Format Conventions

* Use `~N` to signal the total is an estimate
* Mark revisions: `[REVISION of Thought X]`
* Mark branches: `[BRANCH from Thought X — Branch: label]`
* Mark the final thought with ✓ and set nextThoughtNeeded = false
* [TTML] Mark pattern checks: `[PATTERN CHECK: Pattern Name]`

## Tips for Good Sequential Thinking

* Start broad, narrow down — early thoughts set framing; later thoughts verify
* Revise freely — a revision thought is a sign of quality, not weakness
* Branch when two paths are genuinely different — don't force a single track
* Keep thoughts atomic — one idea per thought, clearly stated
* Name your assumptions — then test them
* The final answer should feel inevitable from the chain, not tacked on

---

## TTML Mode: Pattern Recognition

When working on any Talk-to-My-Lawyer task, layer the following patterns into your sequential thoughts. These are architectural invariants — violating them is a bug.

### Systematic Analysis Checklist (run as thought steps)

1. **Repo context** — Is this a `www` (Next.js) or `app` (Vite/tRPC) task?
2. **Schema** — Check `drizzle/schema.ts` or Supabase migrations for data structures.
3. **State trace** — Current → target `letterStatus`. Verify against `ALLOWED_TRANSITIONS` in `shared/types.ts`.
4. **Role gate** — Which role acts? Which tRPC procedure guard applies?
5. **Pipeline impact** — Does this touch `IntakeJson`, `ResearchPacket`, or `DraftOutput`?
6. **Audit requirement** — Does this need a `reviewAction` log entry?
7. **Side effects** — Email (Resend)? Payment event (Stripe)? Credit deduction?
8. **Whitelist check** — If role-related, are all 4 super admin enforcement points consistent?
9. **Subscription conflict** — If promoting to attorney, does the user have an active subscription?

### Core Architectural Patterns

**Pattern 1 — Mandatory Attorney Review**

Every letter MUST be attorney-reviewed before finalization.

* `ai_draft` → `attorney_edit` → `final_approved`
* Display label: "Initial Draft" (never "AI Draft")
* `ai_draft` version is immutable — never overwrite it
* Every action logged in `reviewActions` table

**Pattern 2 — Letter Status Machine**

Strict sequential path, no skipping:

```
submitted → researching → drafting → generated_locked | generated_unlocked
  → pending_review → under_review → approved | rejected | needs_changes
  → (needs_changes loops back to: researching | drafting)
```

**Pattern 3 — RBAC Matrix**

| Role | Capabilities | Assignment |
|------|-------------|------------|
| Subscriber | Create requests, view own letters, pay | Self-signup |
| Employee | Manage coupons/commissions (no legal approval) | Self-signup |
| Attorney | Review, edit, approve in Review Center | Super admin only |
| Super Admin | Full access, user management, global audits | Hard-coded whitelist |

**Pattern 4 — Super Admin Whitelist (Hard-Coded Security)**

Only two emails: `ravivo@homes.land` and `moizj00@gmail.com`.

All 4 enforcement points must be present in `server/supabaseAuth.ts`:

1. `syncGoogleUser()` — Google OAuth
2. `verifyToken()` — Every authenticated request (reads role from DB, NOT JWT)
3. `POST /api/auth/signup` — Email signup
4. `POST /api/auth/verify-email` — Email verification

Invariants:

* Non-whitelisted users who acquire admin are silently demoted to subscriber on next auth
* `admin.updateRole` Zod enum: `["subscriber", "employee", "attorney"]` only — "admin" is a validation error

**Pattern 5 — Attorney Promotion Flow**

```
Super Admin → admin/Users.tsx → Select "Attorney" → Confirm Dialog
  → updateRole mutation → DB role updated
  → In-app notification ("role_updated") sent
  → User tab switch → useAuth refetchOnWindowFocus → auth.me re-fetches
  → ProtectedRoute → /attorney → sees pending_review queue
  → Claims letter → under_review → Edit → Approve
  → final_approved + PDF → Subscriber notified
```

Guard: Active subscribers CANNOT be promoted to attorney. `updateRole` calls `hasActiveRecurringSubscription()` — throws `BAD_REQUEST` if true. Admin must cancel subscription first.

**Pattern 6 — Session Refresh (Role changes without logout)**

* `verifyToken()` reads role from DB on every request (not JWT)
* `useAuth` has `refetchOnWindowFocus: true`, `staleTime: 30_000ms`
* Tab switch triggers `auth.me` re-fetch → React Query cache → ProtectedRoute redirect

### Named Patterns (Quick Reference)

| Pattern | Trigger | Key Logic |
|---------|---------|-----------|
| Payment Gate | User views draft | `generated_locked` → show blur/paywall; `generated_unlocked` → show full. Transition only after Stripe webhook |
| Version Chain | Attorney edits letter | New `LetterVersion` with `attorney_edit`. Update `currentVersionId`. Never overwrite `ai_draft` |
| Attorney Visibility Gate | Attorney opens Review Center | `canView = admin OR assignedReviewerId === user.id OR status === "pending_review"`. Edit/approve requires `under_review` + assignment |
| Role Promotion Gate | Admin promotes to attorney | Guard 1: no active subscription. Guard 2: target role in `["subscriber","employee","attorney"]`. Side effect: in-app notification |
| Intake Normalization | Pipeline starts | `intake-normalizer.ts` maps `IntakeJson` → structured prompt |

### TTML Reference Files

* `shared/types.ts` — Source of truth for statuses and types
* `drizzle/schema.ts` — Database structure
* `server/pipeline.ts` — Pipeline logic
* `server/supabaseAuth.ts` — Auth layer + super admin whitelist
* `server/routers.ts` — All tRPC procedures (review + admin routers)
* `server/_core/trpc.ts` — Procedure definitions (`adminProcedure`, `attorneyProcedure`, `protectedProcedure`)

---

## Example (Generic)

**Problem:** "Should I use tRPC or REST for my Next.js + Supabase app?"

**Thought 1 / ~5**
Identify constraints: Next.js App Router, Supabase data layer, team size unknown. Need to know: internal tooling or public API?

**Thought 2 / ~5**
Assumption: internal app, solo developer. tRPC gives end-to-end type safety with zero schema drift. REST requires manual type sync between client/server.

**Thought 3 / ~5**
Counter-check: does the app need to expose APIs to third parties (mobile, external services)? If yes → REST or hybrid. If no → tRPC wins on DX.

**Thought 4 / ~5** [REVISION of Thought 2]
Actually, Supabase already handles most data fetching via its SDK. Question becomes: is tRPC even needed, or can Supabase client + Server Actions suffice?

**Thought 5 / 5** ✓
For solo Next.js + Supabase: Server Actions + Supabase SDK > tRPC > REST. Server Actions give native type safety in App Router without an extra layer. Use tRPC only if building a standalone API or need RPC across services.

---
**Final Answer:** Use Server Actions + Supabase SDK. Skip tRPC unless you need a standalone API layer.

---

## Example (TTML Mode)

**Problem:** "Can I let an attorney approve a letter that's still in 'drafting' status?"

**Thought 1 / ~4** [PATTERN CHECK: Letter Status Machine]
Check `ALLOWED_TRANSITIONS`. Attorney approval action requires status = `"under_review"`. `"drafting"` is a pipeline-internal state — attorney has no visibility here.

**Thought 2 / ~4** [PATTERN CHECK: Mandatory Attorney Review]
Approval requires: `under_review` → attorney claims → edits (`attorney_edit` version) → explicit approve action → `final_approved`. Can't shortcut.

**Thought 3 / ~4** [PATTERN CHECK: Attorney Visibility Gate]
`canView` check: status must be `"pending_review"` or `"under_review"`. `"drafting"` fails this gate — the letter won't even appear in the Review Center queue.

**Thought 4 / 4** ✓
No — the state machine strictly prevents this. Letter must complete the pipeline (`drafting` → `generated_locked/unlocked` → `pending_review` → `under_review`) before any attorney action is possible. This is by design for audit integrity.

---
**Final Answer:** No. Attorney approval is only possible at `under_review` status. The pipeline must complete first. Do not add shortcuts — it violates the audit trail.
