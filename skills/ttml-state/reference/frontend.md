# Frontend — Current State

> **Last verified:** 2026-05-14 against glob of `client/src/pages/**/*.tsx`, `client/src/App.tsx` (referenced), `client/src/index.css` (referenced), `package.json`, `vite.config.ts` (referenced).

React 19 + Vite 8 SPA. wouter routing. Tailwind CSS v4 with OKLCH theme. shadcn/ui on Radix. tRPC + TanStack Query v5. No SSR — Vite static build → Express serves `dist/public`.

---

## 1. Entry + routing

- **Entry point**: [`client/src/main.tsx`](../../../client/src/main.tsx) — initializes Sentry, mounts `<App />`, wires the tRPC + TanStack Query providers, applies `ThemeContext`.
- **Routes**: defined in [`client/src/App.tsx`](../../../client/src/App.tsx) via wouter `<Route>` / `<Switch>`. **Every new page must be registered here.** wouter does not auto-discover routes.
- **Lazy loading**: pages use `React.lazy` wrapped in `lazyRetry` — a chunk-reload-recovery helper. Use the wrapper, not raw `lazy`, so chunk-load failures after a deploy don't permanently break the browser cache.

---

## 2. Pages by role

Live as of glob 2026-05-14.

### Top-level / public

```
Home.tsx
Login.tsx, Signup.tsx, AcceptInvitation.tsx, ForgotPassword.tsx, ResetPassword.tsx, VerifyEmail.tsx
Pricing.tsx, FAQ.tsx, Terms.tsx, Privacy.tsx
BlogIndex.tsx, BlogPost.tsx
ContentCalendar.tsx, NewsletterTemplate.tsx
Onboarding.tsx
NotFound.tsx
ClientPortal.tsx
services/
  ServicesIndex.tsx
  ServicePage.tsx
  ServiceRoute.tsx
DocumentAnalyzer/
  index.tsx
  FileUploadZone.tsx
  AnalysisResults.tsx
```

### Subscriber (`/dashboard` and sub-routes)

```
subscriber/
  Dashboard.tsx                  # composition shell — feature UI in components/subscriber/dashboard/
  LetterDetail.tsx               # composition shell — status-specific UI in components/subscriber/letter-detail/
  MyLetters.tsx
  SubmitLetter.tsx               # multi-step intake entry
  intake-steps/
    Step1LetterType.tsx
    Step2Jurisdiction.tsx
    Step3Parties.tsx
    Step4Details.tsx
    Step5Outcome.tsx
    Step6Exhibits.tsx
  IntakeFormTemplates.tsx        # user-defined custom intake form templates
  TemplateGallery.tsx
  Billing.tsx
  Receipts.tsx
  Profile.tsx
```

### Attorney (`/attorney`)

```
attorney/
  Dashboard.tsx
  ReviewQueue.tsx
  ReviewCentre.tsx
  ReviewDetail/index.tsx         # composed from review/* sub-panels
  review/
    ApproveDialog.tsx
    ChangesDialog.tsx
    RejectDialog.tsx
    EditorToolbar.tsx
    DiffPanel.tsx
    HistoryPanel.tsx
    IntakePanel.tsx
    ResearchPanel.tsx
    CitationAuditPanel.tsx
    CounterArgumentPanel.tsx
```

### Employee / Affiliate (`/employee`)

```
employee/
  AffiliateDashboard/
    index.tsx
    AffiliateStatsCards.tsx
    AffiliateEarningsSection.tsx
    AffiliateReferralTools.tsx
    AffiliateClickAnalytics.tsx
```

### Admin (`/admin`)

```
admin/
  Dashboard.tsx
  Verify2FA.tsx
  AllLetters.tsx
  LetterDetail.tsx
  AdminSubmitLetter.tsx
  Users.tsx
  Templates.tsx
  Jobs.tsx
  PipelineAnalytics.tsx
  QualityDashboard.tsx
  BlogEditor.tsx
  Affiliate/
    index.tsx
    AffiliateCodesTab.tsx
    AffiliateCommissionsTab.tsx
    AffiliatePayoutsTab.tsx
    AffiliatePerformanceTab.tsx
    AffiliateDialogs.tsx
    EmployeeReferralDetails.tsx
  Learning/
    index.tsx
    LessonsTab.tsx
    QualityTab.tsx
    EffectivenessBadge.tsx
```

---

## 3. Refactor landmarks (do not regress)

From `CLAUDE.md`, verified against current code:

- **`client/src/pages/subscriber/Dashboard.tsx`** is a composition shell. Feature UI lives in `client/src/components/subscriber/dashboard/`. Do not re-monolithize.
- **`client/src/pages/subscriber/LetterDetail.tsx`** is a composition shell. Status-specific UI lives in `client/src/components/subscriber/letter-detail/`. This is the canonical subtree — do NOT recreate `pages/subscriber/letter-detail/`.
- Several pages already use the modular `<name>/{index.tsx, sub-component.tsx}` pattern: `DocumentAnalyzer/`, `ReviewDetail/`, `AffiliateDashboard/`, `Learning/`, `Affiliate/`, `SubscriberLetterPreviewModal/`, `ReviewModal/`. Continue this pattern for new compound pages.
- **Before splitting** a `*.ts` file into a `*/index.ts` subdirectory, read the Module Move Checklist in [`docs/AGENT_GUIDE.md`](../../../docs/AGENT_GUIDE.md) §1.14 — every relative import shifts one level deeper, and tests that grep on the old path break silently.

---

## 4. Routing rules (wouter, not React Router)

```ts
import { Route, Switch, Link, useLocation } from "wouter";
```

- Use `<Link href="/dashboard">` for navigation, not `<a>`.
- `useLocation()` returns `[location, setLocation]` — note the destructure.
- For programmatic navigation: `const [, navigate] = useLocation(); navigate("/dashboard")`.
- wouter is patched — see `patches/wouter@3.7.1.patch` for the modifications.

---

## 5. Tailwind CSS v4 (NOT v3)

- **No `tailwind.config.js`.** All theme config lives in [`client/src/index.css`](../../../client/src/index.css) under `@theme inline` blocks.
- **Colours use OKLCH format**, not hex or HSL. When defining CSS custom properties for colour values, use the space-separated `H S% L%` form **without** wrapping in `hsl(...)`.
- **Dark mode** — `darkMode: ["class"]` semantics applied via `ThemeContext.tsx` toggling a class on `<html>`. Use the `dark:` variant for dark-specific overrides.
- **Animations** — custom keyframes live in `index.css`: `animate-page-enter`, `hero-card-float`, `skeleton-crossfade`, etc.
- Plugins: `@tailwindcss/typography` (for `.prose`), `tw-animate-css`.

---

## 6. Component patterns

### shadcn/ui

UI primitives in [`client/src/components/ui/`](../../../client/src/components/ui/) — accordion, alert-dialog, avatar, button, card, dialog, dropdown-menu, input, label, progress, select, separator, sheet, switch, tabs, textarea, toast, tooltip, etc. Variants use `class-variance-authority` (CVA).

### Icons

- `lucide-react` for action / UI icons.
- `react-icons/si` for company / brand logos.

### `<SelectItem>` gotcha

Radix `<SelectItem>` throws if `value` is missing or empty. Always provide a non-empty `value` prop.

### Form pitfall

If a form fails to submit silently, log `form.formState.errors` — most often it's a validation rule that wasn't surfaced.

### Test IDs

Every interactive element needs `data-testid` following the pattern `{action}-{target}` (e.g. `data-testid="submit-letter-form"`, `data-testid="approve-letter-button"`) or `{type}-{content}-{id}` for list items.

---

## 7. tRPC client

[`client/src/lib/trpc.ts`](../../../client/src/lib/trpc.ts) sets up the client + TanStack Query integration. Patterns:

```tsx
// Query
const { data, isLoading } = trpc.letters.myLetters.useQuery();

// Query with input
const { data } = trpc.letters.detail.useQuery({ id: letterId });

// Mutation
const submit = trpc.letters.submit.useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [["letters", "myLetters"]] });
  },
});
submit.mutate({ /* input */ });
```

**No `import React`** — the Vite JSX transform handles it automatically. Adding `import React` is harmless but unnecessary.

---

## 8. Realtime + streaming

- [`useLetterRealtime`](../../../client/src/hooks/useLetterRealtime.ts) — Supabase Realtime subscription to letter status changes. Powers the subscriber dashboard live updates.
- [`useLetterStream`](../../../client/src/hooks/useLetterStream.ts) — streams `pipeline_stream_chunks` rows via Supabase Realtime for the LangGraph path. Surfaces tokens live in the UI.

---

## 9. Vite manual chunks

Configured in `vite.config.ts` — DO NOT duplicate or override:

```
vendor-tiptap, vendor-stripe, vendor-supabase, vendor-radix,
vendor-pdf, vendor-ai, vendor-icons, vendor-react
```

Adding a heavy lib? Either group it into an existing vendor chunk or add a new named chunk for it.

---

## 10. Common pitfalls

- **`useAuth` path** — lives at `client/src/_core/hooks/useAuth.ts` (note the `_core` segment). Not `client/src/hooks/useAuth.ts`.
- **No Vite proxy** — Express + Vite are already integrated via [`server/_core/vite.ts`](../../../server/_core/vite.ts). Adding a proxy breaks the dev server.
- **Env vars** — frontend must use `import.meta.env.VITE_*`, never `process.env`. `process` is undefined in browser context.
- **Sentry init** — must be the first import in `main.tsx`. Don't reorder.
- **PDF generation** — triggered on `clientApprove` (subscriber action), not when the attorney submits. The attorney `approve` mutation finalizes the version; the PDF render fires later when the subscriber confirms.
- **Page registration** — every new page must be added to `App.tsx`. wouter doesn't auto-route.

---

## 11. Specialist-skill cross-references

- UI design: [`skills-audit/corrected/ttml-ui-design-expert/SKILL.md`](../../../skills-audit/corrected/ttml-ui-design-expert/SKILL.md)
- Routing: [`plugins/route-handle/skills/route-handle/SKILL.md`](../../../plugins/route-handle/skills/route-handle/SKILL.md) + `references/ttml-routing.md`

---

**Sources read:** glob of `client/src/pages/**/*.tsx`, `AGENTS.md` §10, `CLAUDE.md` (Refactor Landmarks, Critical Gotchas frontend section).
