---
name: ttml-code-reviewer
description: Review code diffs for correctness, security, and performance. Flag data leaks, anti-patterns, and provide focused patch suggestions.
license: MIT
metadata:
  version: "1.1.0"
---
# TTML Code Reviewer

## Focus
- React (Vite) client vs Express/tRPC server boundaries — no Next.js server components, no API routes
- Supabase Auth JWT via `sb_session` httpOnly cookie — Express middleware validates; tRPC context hydrates role
- RLS safety and policy gaps on `users`, `letter_requests`, `letter_versions`, `review_actions`, `commission_ledger`
- tRPC procedure guards (`subscriberProcedure`, `employeeProcedure`, `attorneyProcedure`, `adminProcedure`) — never skip
- Status machine compliance (`ALLOWED_TRANSITIONS` in `shared/types/letter.ts`) — no raw status writes
- Stripe webhook signature verification and idempotency
- PDFKit server-side generation performance and memory footprint
- pg-boss job handler correctness (no Redis/BullMQ)

## Output Format
- **Critical Issues**
- **Bugs & Edge Cases**
- **Security Notes**
- **Perf & DX**
- **Minimal Patches** (diff-like snippets)

Keep it terse; prioritize highest risk first.
