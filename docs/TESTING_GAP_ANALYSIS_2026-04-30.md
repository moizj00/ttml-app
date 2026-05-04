# Testing Gap Analysis (2026-04-30)

## Scope Reviewed

- Unit/integration tests under `server/*.test.ts` and `server/__tests__/`.
- End-to-end coverage under `e2e/*.spec.ts` and `e2e/platform/*.spec.ts`.
- Test strategy docs in `e2e/README.md` and `e2e/platform/README.md`.

## What Is Already Strong

1. **Lifecycle status machine coverage is extensive**
   - Status transitions and constraints are tested repeatedly (`phase69`, `ttml`, `phase97`, `review-approval-flow`).
2. **Attorney review path is well represented**
   - Queue visibility, claim flow, review modal behaviors, approval/rejection cases are present in unit + e2e.
3. **Affiliate basics exist**
   - Discount code retrieval/validation, payout requests, commission email side effects, and admin reporting have test presence.
4. **Free preview and paywall variants are tested**
   - Several phase tests and platform e2e cover preview wait, bypass, and payment transitions.

## High-Value Missing Tests (Add First)

### 1) Entitlement matrix testing (core business logic)

Add a **table-driven test suite** for the full entitlement decision engine, covering all purchase states and outcomes:

- no purchase -> redirect to pricing
- single-letter active -> can submit exactly one letter, then blocked until repurchase
- monthly membership active -> per-letter charge path enforced at discounted/non-discounted rate
- annual active with remaining quota -> decrements exactly once on completion
- annual at 0 quota -> blocked / upsell path
- canceled membership still in grace period vs expired membership

Why: current tests validate pieces, but a dedicated matrix prevents pricing/plan regressions.

### 2) Financial invariants (discount + commission + pricing)

Add tests for monetary invariants as a dedicated suite:

- 20% employee code applied exactly once per checkout
- 5% commission computed on the **actual settled amount base** you intend (clarify pre/post discount rule and lock it)
- rounding behavior in cents for all plan types
- idempotency: replayed webhook must not duplicate commission or decrement quotas twice

Why: money bugs are costly and often appear during webhook retries.

### 3) Annual plan quota lifecycle

Add state transition tests for `lettersIncluded = 48` annual users:

- quota decrements only when letter reaches your final “consumed” milestone
- quota does **not** decrement on rejected/canceled/failed pipeline attempts
- decrement is atomic under concurrent completion events
- quota restoration policy (if any) is enforced

Why: this is a key SKU and easy to break without explicit atomicity tests.

### 4) Role/tenant data isolation tests (security)

Expand access-control tests with data-scoped assertions:

- subscriber A cannot read subscriber B letters by direct ID access through tRPC/router handlers
- employee can read only referred subscriber letters, not all subscriber letters
- admin can access all
- attorney/non-admin cannot perform admin review-center-only mutations

Why: you already test roles broadly, but object-level ownership isolation should be explicitly enforced.

### 5) Admin review gate hard guarantee

Add a “must-pass” test that ensures:

- no subscriber API/UI path returns final editable/legal deliverable before admin approval
- signed URL/PDF endpoint rejects non-approved statuses
- cache/CDN cannot leak previously approved content after status rollback

Why: this is your core legal safety promise.

## E2E Gaps vs Product Flows You Described

1. **Checkout realism**
   - Current platform payment tests rely on DB status simulation. Add at least one staged test with Stripe test mode/webhook replay (nightly) to verify metadata mapping, idempotency keys, and pricing correctness.

2. **Membership and annual UX paths**
   - Add dedicated e2e specs for:
     - monthly member generating 2+ letters and seeing per-letter charge UX
     - annual user consuming quota and seeing remaining count update live

3. **Referral persistence and attribution**
   - Add e2e for employee code persistence across sessions/devices and attribution on delayed checkout.

4. **Negative-path e2e**
   - invalid/expired/maxed employee code behavior at checkout with clear user messaging.

## Reliability / Quality of Test Harness

1. **Deterministic clock control**
   - Introduce fake clock/time travel helpers for trial/grace/renewal/turnaround timers.

2. **Factories over ad-hoc fixtures**
   - Centralize test data builders (users/plans/letters/webhook payloads) to reduce brittle per-file mocks.

3. **Property-based tests for status graph**
   - Generate random transition sequences and assert graph invariants (no illegal transitions, no terminal regression).

4. **Coverage gates by risk area**
   - Add thresholds by folder (billing/auth/review) rather than global percentage only.

## Suggested Prioritized Backlog

1. Entitlement matrix suite (unit/integration).
2. Webhook idempotency + financial invariants suite.
3. Annual quota atomic decrement tests.
4. Data isolation security tests for subscriber/employee/admin scopes.
5. One real Stripe test-mode e2e in nightly CI.
6. Membership+annual end-to-end flows.

## Definition of Done for “Test-Complete” on Your Core Promise

- Every letter retrieval endpoint enforces `approved` (or stricter) for subscriber-visible final content.
- Every payment webhook is idempotent and financially invariant in cents.
- Every role’s read/write scope is proven by deny tests.
- Every plan SKU (single/monthly/annual) is covered by happy + failure + retry cases.
- Annual quota accounting is race-safe and auditable.
