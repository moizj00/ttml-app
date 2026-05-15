# The Payment Gate (Blur Pattern)

**Principle**: Access to generated letter content (beyond a truncated preview) is conditional on payment or an active subscription.

**Guidelines for AI Agents**:

*   **Trigger**: Access control is triggered whenever a letter sits in any of the `LOCKED_PREVIEW_STATUSES` defined in `shared/types/letter.ts`. The primary path today is the 24-hour hold (`ai_generation_completed_hidden`) + the upsell statuses (`letter_released_to_subscriber`, `attorney_review_upsell_shown`, `attorney_review_checkout_started`, `attorney_review_payment_confirmed`). `generated_locked` is retained as a legacy compatibility status that can still appear in older flows — treat it identically.
*   **Server-Side Enforcement**: `server/db/letter-versions.ts` and `server/routers/versions.ts` truncate the `ai_draft` content to a short preview (~100 chars) for subscriber-facing reads while the letter is in a locked status. Admin reads (`includeInternal=true`) return full content.
*   **Frontend-Side Enforcement**: `client/src/components/LetterPaywall.tsx` applies the visual blur and surfaces the payment prompt.
*   **Unlock Logic**: The transition out of the locked states into `pending_review` only happens after a confirmed Stripe payment (`attorney_review_payment_confirmed` → `pending_review`). Admins can force-unlock via `forceStatusTransition` (audit-logged).
*   **Free-Preview Exception**: If `letter_requests.is_free_preview = TRUE` AND `free_preview_unlock_at <= NOW()`, the subscriber router (`server/routers/letters/subscriber.ts`) returns the full un-truncated `ai_draft` tagged `freePreview: true`. The client renders `FreePreviewViewer` (non-selectable + DRAFT watermark) instead of `LetterPaywall`. See CLAUDE.md §5 for the full exception path.

**Relevant Code References**:
*   `shared/types/letter.ts` — `LOCKED_PREVIEW_STATUSES`, `ALLOWED_TRANSITIONS`
*   `server/db/letter-versions.ts` — `applyDraftPreviewGate`
*   `server/routers/versions.ts` — subscriber-facing version reads
*   `server/routers/letters/subscriber.ts` — free-preview unlock branch
*   `client/src/components/LetterPaywall.tsx` — frontend blur overlay
*   `server/freePreviewEmailCron.ts` — `dispatchFreePreviewIfReady` shared dispatcher
