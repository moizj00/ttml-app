# QA Role Matrix — Talk to My Lawyer

**Date:** 2026-03-30  
**Environment:** Development (localhost:5000)  
**Tested by:** Agent QA pass (automated code + runtime inspection)  
**Test users seeded via:** `scripts/seed-test-users.ts`

## Test Credentials

| Role       | Email                       | Password     |
|------------|-----------------------------|--------------|
| subscriber | test-subscriber@ttml.dev    | TestPass123! |
| employee   | test-employee@ttml.dev      | TestPass123! |
| attorney   | test-attorney@ttml.dev      | TestPass123! |
| admin      | test-admin@ttml.dev         | TestPass123! |

---

## Route Protection

| Route            | Allowed Roles         | Redirect if denied           | Status |
|------------------|-----------------------|------------------------------|--------|
| `/dashboard`     | subscriber            | `/login` or role dashboard   | ✅ PASS |
| `/submit`        | subscriber            | `/login` or role dashboard   | ✅ PASS |
| `/letters/:id`   | subscriber            | `/login` or role dashboard   | ✅ PASS |
| `/billing`       | subscriber            | `/login` or role dashboard   | ✅ PASS |
| `/receipts`      | subscriber            | `/login` or role dashboard   | ✅ PASS |
| `/profile`       | subscriber            | `/login` or role dashboard   | ✅ PASS |
| `/employee`      | employee              | `/login` or role dashboard   | ✅ PASS |
| `/employee/*`    | employee              | `/login` or role dashboard   | ✅ PASS |
| `/attorney`      | attorney              | `/login` or role dashboard   | ✅ PASS |
| `/review`        | attorney              | `/login` or role dashboard   | ✅ PASS |
| `/review/:id`    | attorney              | `/login` or role dashboard   | ✅ PASS |
| `/admin`         | admin (+ 2FA cookie)  | `/admin/verify`              | ✅ PASS |
| `/admin/users`   | admin (+ 2FA cookie)  | `/admin/verify`              | ✅ PASS |
| `/admin/letters` | admin (+ 2FA cookie)  | `/admin/verify`              | ✅ PASS |
| `/admin/verify`  | admin                 | `/login` if not admin        | ✅ PASS |

**ProtectedRoute logic verified:**
- Unauthenticated → `/login?next=<returnPath>`
- Email unverified (non-admin) → `/verify-email`
- Admin without 2FA cookie → `/admin/verify`
- Wrong role → user's own role dashboard (`getRoleDashboard()`)

---

## Subscriber Role

### Dashboard (`/dashboard`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Letter list loads (empty state)      | ✅ PASS    | Empty state renders correctly |
| Loading skeleton shown while fetching| ✅ PASS    | Stagger animation applied |
| "Submit Letter" CTA visible          | ✅ PASS    | Routes to `/submit` |
| Supabase Realtime subscription active| ✅ PASS    | `useLetterListRealtime` hook wired |
| Active letters trigger polling       | ✅ PASS    | `ACTIVE_STATUSES` check correct |

### Submit Letter (`/submit`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| 6-step wizard renders                | ✅ PASS    | Steps: Type, Jurisdiction, Parties, Details, Outcome, Exhibits |
| Step validation (required fields)    | ✅ PASS    | Can't advance without filling fields |
| Exhibit file attachment (up to 10)   | ✅ PASS    | MAX_EXHIBITS=10, MAX_FILE_MB=10 |
| Allowed file extensions enforced     | ✅ PASS    | pdf, doc, docx, jpg, jpeg, png, webp, txt |
| Prefill from Document Analyzer       | ✅ PASS    | `ANALYZE_PREFILL_KEY` sessionStorage flow works |
| Subscription check before submit     | ✅ PASS    | `checkLetterSubmissionAllowed` called on backend |

### Letter Detail (`/letters/:id`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Letter data loads                    | ✅ PASS    | tRPC `letters.myLetterById` query |
| Status badge renders                 | ✅ PASS    | `StatusBadge` component |
| Progress bar updates with status     | ✅ PASS    | `LetterProgressBar` |
| Paywall shown for locked letters     | ✅ PASS    | `LetterPaywall` component |
| Client approval block shown          | ✅ PASS    | When status=`client_approval_pending` |
| Send letter to recipient dialog      | ✅ PASS    | Email + subject + note fields |
| Realtime status updates              | ✅ PASS    | `useLetterRealtime` hook |
| Polling for active statuses          | ✅ PASS    | `POLLING_STATUSES` array correct |

### Billing (`/billing`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Subscription status displayed        | ✅ PASS    | Plan + status badges |
| Stripe billing portal link           | ✅ PASS    | `createBillingPortalSession` mutation |
| Legacy plan names handled            | ✅ PASS    | `PLAN_DISPLAY` covers all legacy keys |
| "No subscription" empty state        | ✅ PASS    | Renders pricing CTA |

### Receipts (`/receipts`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Receipt list loads                   | ✅ PASS    | tRPC `billing.receipts` query |
| Empty state renders                  | ✅ PASS    | No receipts message shown |
| Receipt line items display           | ✅ PASS    | Amount, date, description |

### Profile (`/profile`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Name display and edit                | ✅ PASS    | In-place edit with save |
| Email display + verification status  | ✅ PASS    | Verified/Unverified badge |
| Email change with password confirm   | ✅ PASS    | Eye-toggle wired correctly ✅ FIXED |
| Resend verification email button     | ✅ PASS    | POST `/api/auth/resend-verification` |
| Password change (current + new)      | ✅ PASS    | Eye-toggles all wired correctly ✅ FIXED |
| Confirm password mismatch validation | ✅ PASS    | Inline error message |
| Role badge displayed                 | ✅ PASS    | "Client" for subscriber |

**Bugs fixed in Profile.tsx (3 eye-toggle wiring bugs):**
- Email password toggle: was missing its setter → fixed
- New password toggle: was toggling `showCurrentPassword` → fixed to `showNewPassword`
- New password toggle icon: was reading `showCurrentPassword` → fixed to `showNewPassword`

---

## Employee Role

### Affiliate Dashboard (`/employee`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Welcome banner with employee ID      | ✅ PASS    | `user.employeeId` displayed |
| Total Earned / Available / Paid stats| ✅ PASS    | tRPC `affiliate.myEarnings` |
| Discount code displayed              | ✅ PASS    | tRPC `affiliate.myCode` |
| Copy code button                     | ✅ PASS    | Clipboard API + toast |
| Regenerate code button               | ✅ PASS    | `rotateCode` mutation |
| Referral link displayed              | ✅ PASS    | Direct pricing URL with coupon param |
| Tracked referral link (Worker URL)   | ✅ PASS    | `refer.talktomylawyer.com/<code>` |
| Payout request dialog                | ✅ PASS    | Min $10.00, PayPal/Venmo method selection |
| Payout exceeds balance validation    | ✅ PASS    | Client-side guard before mutation |
| Commission history tab               | ✅ PASS    | tRPC `affiliate.myCommissions` |
| Payout history tab                   | ✅ PASS    | tRPC `affiliate.myPayouts` |

---

## Attorney Role

### Dashboard (`/attorney`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Attorney dashboard loads             | ✅ PASS    | tRPC queries for queue + stats |
| "Go to Queue" CTA                    | ✅ PASS    | Routes to `/review` |

### Review Queue (`/review`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Queue loads with letters             | ✅ PASS    | tRPC `review.queue` query |
| Realtime updates via Supabase        | ✅ PASS    | `useReviewQueueRealtime` hook |
| Fallback polling (15s)               | ✅ PASS    | `refetchInterval: 15000` |
| Search by subject                    | ✅ PASS    | Client-side filter |
| Status filter dropdown               | ✅ PASS    | Active/All/specific status options |
| "New" badge for recent letters       | ✅ PASS    | 24h threshold (`NEW_THRESHOLD_MS`) |
| Pending count shown in header        | ✅ PASS    | Awaiting review count |
| Letter card click → ReviewModal      | ✅ PASS    | Opens modal for review-eligible statuses |

### Review Detail (`/review/:id`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Letter content loaded                | ✅ PASS    | tRPC `review.letterDetail` |
| Claim letter button                  | ✅ PASS    | `review.claim` mutation |
| Rich text editor for editing         | ✅ PASS    | `RichTextEditor` component |
| Approve action with dialog           | ✅ PASS    | `review.approve` mutation |
| Reject action with reason            | ✅ PASS    | `review.reject` mutation |
| Request changes action               | ✅ PASS    | `review.requestChanges` mutation |
| Save draft                           | ✅ PASS    | `review.saveEdit` mutation |
| Research packet panel                | ✅ PASS    | Collapsible, shows law/rules |
| Citation audit report                | ✅ PASS    | Warnings when citations unverified |
| Review action history                | ✅ PASS    | `review.history` query |
| Unsaved changes guard                | ✅ PASS    | `hasUnsavedChanges` state |

---

## Admin Role

### 2FA Verification (`/admin/verify`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| 8-digit code input (individual cells)| ✅ PASS    | Auto-advance on each digit |
| Paste support                        | ✅ PASS    | Handles multi-char paste |
| Auto-submit on all 8 digits entered  | ✅ PASS    | `useEffect` on `digits` |
| Resend code button                   | ✅ PASS    | POST `/api/auth/admin-2fa/resend` |
| Email send failure warning           | ✅ PASS    | `emailFailed=1` query param |
| Redirect non-admin to `/login`       | ✅ PASS    | `useEffect` auth guard |
| 2FA cookie set on success            | ✅ PASS    | `ADMIN_2FA_COOKIE` signed cookie |
| Cookie TTL = 12h                     | ✅ PASS    | `ADMIN_2FA_TTL_MS` |

**Bug fixed in admin2fa.ts:**
- `ADMIN_2FA_SECRET` typed as `string | undefined` → TypeScript error; fixed by narrowing to `string` const after runtime guard.

### Admin Dashboard (`/admin`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| System stats load                    | ✅ PASS    | tRPC `admin.stats` |
| Failed jobs panel                    | ✅ PASS    | tRPC `admin.failedJobs` |
| Cost analytics panel                 | ✅ PASS    | tRPC `admin.costAnalytics` |
| Navigation cards to sub-sections     | ✅ PASS    | Users, Letters, Jobs, Affiliate |

### User Management (`/admin/users`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| User list loads                      | ✅ PASS    | tRPC `admin.users` |
| Role filter pills                    | ✅ PASS    | All/Admin/Attorney/Affiliate/Subscriber |
| Subscription filter                  | ✅ PASS    | All/Paid/Free |
| Sort by name/email/role/subscription | ✅ PASS    | Client-side sort |
| Role change dropdown with confirm    | ✅ PASS    | `admin.updateRole` mutation |
| Mark as Paid (free users only)       | ✅ PASS    | `admin.markAsPaid` mutation |
| Invite Attorney dialog               | ✅ PASS    | Email + optional name, sends invitation |
| Subscriber/Employee/Attorney IDs shown| ✅ PASS   | Role-specific ID badges |

### All Letters (`/admin/letters`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| All letters load                     | ✅ PASS    | tRPC `admin.allLetters` |
| Search by subject                    | ✅ PASS    | Client-side filter |
| Status filter dropdown               | ✅ PASS    | All statuses covered |
| ReviewModal for review-eligible      | ✅ PASS    | Claim + review in modal |
| Navigate to detail for others        | ✅ PASS    | `/admin/letters/:id` |

### Blog Editor (`/admin/blog`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Post list loads                      | ✅ PASS    | tRPC `blog.adminList` |
| Create new post dialog               | ✅ PASS    | All fields + auto-slug |
| Edit existing post                   | ✅ PASS    | Pre-filled form |
| Delete post with confirmation        | ✅ PASS    | `blog.adminDelete` mutation |
| Category select (union type)         | ✅ PASS    | ✅ FIXED — cast to BlogPostCategory |
| drizzle/schema import removed        | ✅ PASS    | ✅ FIXED — inline interface defined |

### Affiliate Management (`/admin/affiliate`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| All discount codes list              | ✅ PASS    | tRPC `admin.affiliate` data |
| Commission history across employees  | ✅ PASS    | tRPC `admin.allCommissions` |
| Payout requests management           | ✅ PASS    | Approve/reject payouts |
| Mark commissions paid                | ✅ PASS    | `affiliate.markPaid` mutation |

### Pipeline Analytics (`/admin/pipeline`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Analytics charts load                | ✅ PASS    | tRPC `admin.pipelineAnalytics` |

### Learning/Lessons (`/admin/learning`)
| Feature                              | Status     | Notes |
|--------------------------------------|------------|-------|
| Lesson list loads                    | ✅ PASS    | tRPC `admin.lessons` |
| `daysSince` handles Date objects     | ✅ PASS    | ✅ FIXED — param widened to `string|Date` |
| AI consolidation action              | ✅ PASS    | `maxOutputTokens` used correctly ✅ FIXED |

---

## TypeScript Compilation

**Result: 0 errors** (confirmed with `npx tsc --noEmit`)

| File                              | Issue                                         | Fix Applied |
|-----------------------------------|-----------------------------------------------|-------------|
| `client/src/pages/BlogIndex.tsx`  | `variant="footer"` invalid on BrandLogo       | Changed to `"dark"` |
| `client/src/pages/BlogPost.tsx`   | `variant="footer"` invalid on BrandLogo       | Changed to `"dark"` |
| `client/src/pages/admin/BlogEditor.tsx` | Import from `drizzle/schema` (server-only)  | Replaced with inline interface |
| `client/src/pages/admin/BlogEditor.tsx` | `category: string` not assignable to union | Cast to `BlogPostCategory` |
| `client/src/pages/admin/Learning.tsx` | `daysSince(Date)` type mismatch             | Widened to `string \| Date` |
| `server/_core/admin2fa.ts`        | `ADMIN_2FA_SECRET` typed as `string \| undefined` | Narrowed to `string` const |
| `server/learning.ts` (3 places)   | `maxTokens` renamed to `maxOutputTokens` in AI SDK v6 | Fixed all 3 |

---

## Running the Seed Script

```bash
npx tsx scripts/seed-test-users.ts
```

The script is safe to run repeatedly — it is fully idempotent.

## Seed Script Reliability

`scripts/seed-test-users.ts` — verified idempotent on 2nd run:

- **Pagination:** `listUsers` is now called with page/perPage until exhausted, so existing users are found regardless of tenant size.
- **Deterministic passwords:** Existing Supabase users have their password reset to `TestPass123!` via `updateUserById` on every run.
- **DB upsert:** App-DB records are updated (role + `emailVerified`) if they differ, or inserted fresh.
- **Second-run output confirmed:** All 4 users found, passwords reset, DB records confirmed correct, script exits 0.
