# Talk-to-My-Lawyer — Remaining Features Prompt

> **HISTORICAL DOCUMENT — All 4 gaps completed.** This prompt was used to drive Phase 48 implementation. For the current feature inventory, see `docs/FEATURE_MAP.md`.
>
> **Status:** All 4 gaps COMPLETED as of Phase 48. Gap 1 was later simplified in Phase 69.  
> **Stack:** Vite · Wouter · tRPC · Drizzle ORM · Supabase (PostgreSQL) · Stripe · Resend  
> **All type names, route paths, tRPC procedure names, and DB column names below match the actual codebase exactly.**

---

## Context You Must Know Before Starting

### Status Machine (from `shared/types.ts` → `ALLOWED_TRANSITIONS`)

> **Note:** The status machine below reflects the current state as of Phase 86+. See `STRUCTURE.md` for the canonical reference.

```
submitted → researching | pipeline_failed
researching → drafting | submitted | pipeline_failed
drafting → generated_locked | submitted | pipeline_failed
generated_locked → pending_review (Stripe $200 payment or subscription)
pending_review → under_review
under_review → approved | rejected | needs_changes | pending_review (release claim)
needs_changes → submitted
approved → client_approval_pending
client_approval_pending → client_approved
client_approved → sent
sent → (terminal)
rejected → submitted (subscriber retry)
pipeline_failed → submitted (admin retry)
```

Note: `generated_unlocked` still exists in the DB enum for backward compatibility but is NOT part of the active status machine (removed in Phase 69).

### Roles (`drizzle/schema.ts` → `USER_ROLES`)
`subscriber` | `employee` | `attorney` | `admin`  
Guards: `subscriberProcedure` | `employeeProcedure` | `attorneyProcedure` | `adminProcedure`

### Key Types
- `LetterRequest` — `letterRequests` table
- `LetterVersion` — `letterVersions` table, `versionType: "ai_draft" | "attorney_edit" | "final_approved"`
- `IntakeJson` — stored in `letterRequests.intakeJson: jsonb`
- `ResearchPacket` — stored in `researchRuns.resultJson: jsonb`
- `DraftOutput` — `{ draftLetter, attorneyReviewSummary, openQuestions, riskFlags }`
- `CommissionLedgerEntry` — `commissionLedger` table
- `PayoutRequest` — `payoutRequests` table
- `DiscountCode` — `discountCodes` table
- `Subscription` — `subscriptions` table

### Route Paths (Wouter, from `client/src/App.tsx`)

> **Updated March 2026** — See `STRUCTURE.md` for the canonical route list.

```
/ | /pricing | /faq | /terms | /privacy | /login | /signup | /forgot-password
/verify-email | /reset-password | /onboarding
/analyze | /blog | /blog/:slug
/dashboard | /submit | /letters | /letters/:id | /my-letters | /subscriber/billing | /subscriber/receipts
/profile
/attorney | /attorney/queue | /attorney/:id | /attorney/review/:id
/review | /review/queue | /review/:id (backward-compatible aliases)
/employee | /employee/referrals | /employee/earnings | /employee/dashboard (redirects to /employee)
/admin | /admin/users | /admin/jobs | /admin/letters | /admin/letters/:id | /admin/affiliate
/admin/verify | /admin/learning | /admin/blog
/404
```

### tRPC Namespaces (from `server/routers.ts`)
`auth` | `letters` | `review` | `admin` | `notifications` | `versions` | `billing` | `affiliate` | `profile` | `blog`

---

## Gap 1 — Freemium Status: `generated_unlocked` (Phase 22) — ✅ COMPLETED (Phase 48, simplified in Phase 69)

> **Historical plan (completed).** The `generated_unlocked` status was implemented in Phase 48 and later removed from the active status machine in Phase 69. All letters now use the single `generated_locked` → `pending_review` path. The status still exists in the DB enum for backward compatibility. The implementation details below are preserved for historical reference only.

### Required Changes

**1. Schema (`drizzle/schema.ts`)**

Add `"generated_unlocked"` to the `letterStatusEnum` pgEnum and to the `LETTER_STATUSES` const array. Position it between `generated_locked` and `pending_review`.

**2. Status Machine (`shared/types.ts` → `ALLOWED_TRANSITIONS`)**

```ts
generated_locked: ["generated_unlocked", "pending_review"],  // free path or paid
generated_unlocked: ["pending_review"],                       // subscriber sends for attorney review
```

Add to `STATUS_CONFIG`:
```ts
generated_unlocked: { label: "AI Draft Ready", color: "text-green-700", bgColor: "bg-green-100" },
```

**3. Pipeline (`server/pipeline.ts`)**

In the assembly stage (`runAssemblyStage`), after saving the `ai_draft` version, check whether this is the subscriber's first ever letter (count rows in `letterRequests` for this `userId` where status is NOT in `["submitted","researching","drafting","generated_locked","generated_unlocked"]`). If `count === 0`, set status to `generated_unlocked`. Otherwise set to `generated_locked`.

**4. tRPC mutation: `billing.sendForReview`** (new procedure in `server/routers.ts`)

- Guard: `subscriberProcedure`
- Input: `{ letterId: z.number() }`
- Verify `letter.userId === ctx.user.id` and `letter.status === "generated_unlocked"`
- Transition to `pending_review` via `updateLetterStatus`
- Log `reviewAction` with `action: "subscriber_sent_for_review"`, `actorType: "subscriber"`
- Trigger `sendLetterUnlockedEmail` and `sendNewReviewNeededEmail` (already exist in `server/email.ts`)
- Return `{ success: true }`

**5. tRPC mutation: `billing.freeUnlock`** (already exists — update it)

Remove the first-letter eligibility check from `billing.freeUnlock`. That logic now lives in the pipeline stage. Keep the mutation as a fallback emergency override for admin use only.

**6. Frontend: `client/src/pages/subscriber/LetterDetail.tsx`**

When `letter.status === "generated_unlocked"`:
- Show the full `ai_draft` version content (already accessible via `versions.get` because the procedure allows `ai_draft` when status is `generated_locked` — extend this to `generated_unlocked` too)
- Show a green banner: "Your AI draft is ready. Send it for attorney review to get a final, stamped letter."
- Show a prominent `[Send for Attorney Review — $200]` button that calls `billing.payToUnlock` (Stripe $200 checkout) OR if you want truly free attorney review, calls `billing.sendForReview`
- Do NOT show the `LetterPaywall` blur

When `letter.status === "generated_locked"` (returning users):
- Keep existing `LetterPaywall` blur behavior

**7. Frontend: `client/src/components/shared/StatusBadge.tsx`**

Add `generated_unlocked` entry matching the `STATUS_CONFIG` above.

**8. Frontend: `client/src/components/shared/StatusTimeline.tsx`**

Insert `generated_unlocked` step between `generated_locked` and `pending_review` in the pipeline stages array. Show a green checkmark icon.

**9. Frontend: `client/src/pages/subscriber/MyLetters.tsx`**

For `generated_unlocked` rows, show a green "AI Draft Ready — Review for $200" badge with direct link to `/letters/:id`.

**10. Database migration**

Generate via `pnpm drizzle-kit generate` and apply to Supabase via MCP `apply_migration`.

---

## Gap 2 — Payment Receipts Page (`/subscriber/receipts`) — ✅ COMPLETED (Phase 48)

> **Historical plan (completed).** The Receipts page is live at `/subscriber/receipts` with `billing.receipts` tRPC query, Stripe invoice history, and sidebar nav link. The implementation details below are preserved for historical reference only.

### Required Changes

**1. tRPC query: `billing.receipts`** (new, in `server/routers.ts`)

- Guard: `subscriberProcedure`
- No input
- Get the user's `stripeCustomerId` from the `subscriptions` table via `getUserSubscription(ctx.user.id)`
- If no `stripeCustomerId`, return `{ invoices: [] }`
- Call `stripe.invoices.list({ customer: stripeCustomerId, limit: 50 })` using the existing Stripe client from `server/stripe.ts`
- Map each invoice to: `{ id, date: created, amount: amount_paid, currency, status, pdfUrl: invoice_pdf, receiptUrl: hosted_invoice_url, description: lines.data[0]?.description }`
- Return `{ invoices }`

**2. New page: `client/src/pages/subscriber/Receipts.tsx`**

```
Route: /subscriber/receipts
Role guard: subscriber
```

UI requirements:
- Page title "Payment History"
- Call `trpc.billing.receipts.useQuery()`
- Table columns: Date | Description | Amount | Status | Download
- Format amounts from cents: `(amount / 100).toFixed(2)`
- Format date: `new Date(date * 1000).toLocaleDateString()`
- Status badge: `paid` = green, `open` = yellow, `void` = gray
- "Download Receipt" links open `pdfUrl` in a new tab
- Empty state: "No payments yet. Subscribe to get started." with link to `/pricing`
- Loading skeleton using existing `Skeleton` component from `@/components/ui/skeleton`

**3. Register route (`client/src/App.tsx`)**

```tsx
<Route path="/subscriber/receipts">
  <ProtectedRoute allowedRoles={["subscriber"]}>
    <Receipts />
  </ProtectedRoute>
</Route>
```

**4. Add link from `Billing.tsx`**

Replace the "View your complete payment history... in the Stripe Billing Portal" section with a `<Link href="/subscriber/receipts">` button labelled "View Payment History" that routes to the new page. Keep the Stripe portal link as a secondary option for managing payment methods.

**5. Add sidebar link**

In `client/src/components/shared/AppLayout.tsx`, add a "Receipts" nav item for subscriber role pointing to `/subscriber/receipts`.

---

## Gap 3 — Intake Form: Missing Fields (`language`, `communications`) — ✅ COMPLETED (Phase 48)

> **Historical plan (completed).** All three fields (`language`, `communications`, `toneAndDelivery`) are now present in `IntakeJson` (shared/types.ts), handled in `intake-normalizer.ts`, validated in the `letters.submit` Zod schema, and exposed in the `SubmitLetter.tsx` form. The implementation details below are preserved for historical reference only.

### Required Changes

**1. Update `IntakeJson` in `shared/types.ts`**

```ts
export interface IntakeJson {
  // ... existing fields ...
  language?: string;                    // e.g. "en", "es", "fr"
  communications?: {                    // prior communications
    summary: string;                    // free text description
    lastContactDate?: string;           // ISO date string
    method?: "email" | "phone" | "letter" | "in-person" | "other";
  };
  toneAndDelivery?: {                  // replaces tonePreference
    tone: "firm" | "moderate" | "aggressive";
    deliveryMethod?: "email" | "certified-mail" | "hand-delivery";
  };
  tonePreference?: "firm" | "moderate" | "aggressive"; // keep for backwards compat
}
```

**2. Update `intake-normalizer.ts` (`server/intake-normalizer.ts`)**

In `buildNormalizedPromptInput`, add handling for the new fields:
- Map `intakeJson.toneAndDelivery?.tone ?? intakeJson.tonePreference` to the prompt's tone instruction
- Append `language` instruction: "Write this letter in [language]" if provided
- Append `communications.summary` to the matter context if provided

**3. Update tRPC `letters.submit` input schema (`server/routers.ts`)**

In the `intakeJson` Zod schema, add:
```ts
language: z.string().optional(),
communications: z.object({
  summary: z.string(),
  lastContactDate: z.string().optional(),
  method: z.enum(["email", "phone", "letter", "in-person", "other"]).optional(),
}).optional(),
toneAndDelivery: z.object({
  tone: z.enum(["firm", "moderate", "aggressive"]),
  deliveryMethod: z.enum(["email", "certified-mail", "hand-delivery"]).optional(),
}).optional(),
```

**4. Update `client/src/pages/subscriber/SubmitLetter.tsx`**

Add two new fields to the existing multi-step form:

**In Step 4 (Tone)** — extend the existing tone slider:
- Replace the plain `tonePreference` slider with `toneAndDelivery.tone` (same 3 options)
- Add a "Delivery Method" select below it: Email | Certified Mail | Hand Delivery (maps to `toneAndDelivery.deliveryMethod`)

**Add Step 5.5 (Prior Communications)** — between the current evidence step and the submit:
- Label: "Prior Communications (Optional)"
- Textarea: "Describe any emails, letters, or conversations you've already had with the other party" → maps to `communications.summary`
- Date picker: "Date of last contact" → maps to `communications.lastContactDate`
- Select: "How did you last communicate?" → maps to `communications.method`

**Add to Step 1 or Step 2:**
- Language select: "Letter Language" with options: English (en), Spanish (es), French (fr), German (de), Portuguese (pt) → maps to `language`

---

## Gap 4 — Mobile Responsiveness Fixes (Phase 37 Incomplete) — ✅ COMPLETED (Phase 48)

> **Historical plan (completed).** Mobile responsiveness was fixed across Dashboard, MyLetters, Login, Signup, and ReviewModal in Phase 48, with additional mobile fixes in Phase 82. The implementation details below are preserved for historical reference only.

**`client/src/pages/subscriber/Dashboard.tsx`**
- Summary stats cards: wrap to 2×2 grid on mobile (`grid-cols-2 sm:grid-cols-4`)
- Letter cards: full-width buttons on mobile (`w-full sm:w-auto`)
- Progress stepper: hide labels on small screens, show only icons

**`client/src/pages/subscriber/MyLetters.tsx`**
- Table → card list on mobile: use `hidden sm:table` on the `<table>` and show a stacked card list on `<div className="sm:hidden">` with truncated subject text (`truncate max-w-[200px]`)
- Status badges: `text-xs` on mobile

**`client/src/pages/Login.tsx` and `client/src/pages/Signup.tsx`**
- Form container: `w-full max-w-md mx-auto px-4` (full-width on small screens)
- Input fields: `w-full` already, verify no fixed widths are set

**`client/src/components/shared/ReviewModal.tsx`**
- On mobile (`max-sm`): make the modal full-screen (`h-screen w-screen rounded-none`)
- Collapse the intake summary panel into an `<Accordion>` on mobile so the editor gets full height
- Move action buttons to a sticky footer bar on mobile

---

## Implementation Order

Start with these in order — each is independent:

1. **Gap 3** (Intake form fields) — lowest risk, pure additive, no schema changes needed for `language`/`communications`
2. **Gap 2** (Payment Receipts page) — isolated new page + one tRPC query
3. **Gap 4** (Mobile fixes) — pure UI, no backend changes
4. **Gap 1** (Freemium `generated_unlocked` status) — most complex, requires schema migration, pipeline change, and multiple UI updates

---

## Testing Checklist

After each gap:
- Run `pnpm test` — all ~617 tests must stay passing (38 test files)
- Run `pnpm tsc --noEmit` — 0 TypeScript errors
- Run `pnpm build` — production build must succeed
- Verify status machine: no `ALLOWED_TRANSITIONS` regression
