# The Payment Gate (Draft Preview Pattern)

**Principle**: Access to the full generated letter is gated behind one of two unlock paths — the 24-hour free-trial cooling window or a confirmed Stripe payment. The post-unlock UI is the same in both cases; only the CTA changes.

**Guidelines for AI Agents**:

*   **Locked state (pre-unlock)**: While the letter sits in any of the `LOCKED_PREVIEW_STATUSES` from `shared/types/letter.ts` (24-hour hold `ai_generation_completed_hidden` + the upsell statuses; legacy `generated_locked` retained for back-compat), `server/db/letter-versions.ts` (`applyDraftPreviewGate`) and `server/routers/versions.ts` truncate the `ai_draft` to ~100 chars on subscriber reads. The client renders `client/src/components/LetterPaywall.tsx` — a modal wrapping `LockedLetterDocument` with subscribe/checkout CTAs. Admin reads (`includeInternal=true`) bypass the truncation.

*   **Unlocked state (free-trial path)**: If `letter_requests.is_free_preview = TRUE` AND `free_preview_unlock_at <= NOW()`, the subscriber router (`server/routers/letters/subscriber.ts`) sets `freePreviewUnlocked = true` and `getLetterVersionsByRequestId` returns the FULL un-truncated `ai_draft` tagged `freePreview: true`. The client renders `client/src/components/DraftPreviewViewer.tsx` (currently re-exported from `FreePreviewViewer.tsx`) — a modal containing the full letter with a large diagonal "DRAFTED" watermark across the middle, copy-resistant (`user-select: none`, blocked `onCopy/onCut/onContextMenu`, keyboard-shortcut guards). The CTA is "Submit For Attorney Review" which routes to `/pricing` for the free-trial → subscription upgrade.

*   **Unlocked state (paid path)**: Active paid subscribers who advance through the upsell statuses see the **same** `DraftPreviewViewer` modal (full letter, "DRAFTED" watermark, copy-resistant). The only difference is the CTA — it submits the letter directly to attorney review with no `/pricing` detour. There is no separate "paid viewer"; `DraftPreviewViewer` is the single post-unlock UI surface.

*   **Transition out**: The unlock path moves the letter into `pending_review` once the subscriber confirms attorney review (subscription + submit for free-trial, or direct submit for paid). At that point the letter is no longer in any `LOCKED_PREVIEW_STATUSES`, so server-side truncation stops returning the redacted preview.

*   **Admin force-unlock**: `forceFreePreviewUnlock` in `server/routers/admin/letters.ts` collapses the 24h window by setting `free_preview_unlock_at = NOW()`, logging a `free_preview_force_unlock` review action, and invoking `dispatchFreePreviewIfReady` in `server/freePreviewEmailCron.ts`. The dispatcher uses an atomic `UPDATE ... RETURNING` claim on `free_preview_email_sent_at` so the cron, pipeline-finalize, and admin paths cannot double-send the "preview ready" email. Non-free-preview letters reject with `BAD_REQUEST`.

*   **Never trust the client**: The 24h cooling window is stamped at submit time and enforced server-side. Copy-resistance on `DraftPreviewViewer` is UX friction, not security — a determined user with devtools can still read the DOM.

**Relevant Code References**:
*   `shared/types/letter.ts` — `LOCKED_PREVIEW_STATUSES`, `ALLOWED_TRANSITIONS`
*   `server/db/letter-versions.ts` — `applyDraftPreviewGate`
*   `server/routers/versions.ts` — subscriber-facing version reads
*   `server/routers/letters/subscriber.ts` — free-preview unlock branch
*   `server/routers/admin/letters.ts` — `forceFreePreviewUnlock`
*   `server/freePreviewEmailCron.ts` — `dispatchFreePreviewIfReady` shared dispatcher
*   `client/src/components/LetterPaywall.tsx` — locked-state modal
*   `client/src/components/DraftPreviewViewer.tsx` (alias of `FreePreviewViewer.tsx`) — unlocked-state modal with "DRAFTED" watermark
*   `client/src/components/shared/LockedLetterDocument.tsx` — locked-document teaser shown inside `LetterPaywall`
