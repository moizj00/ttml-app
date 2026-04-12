# Paywall and Timed Email Notification Architecture Design

## 1. Introduction

This document outlines the design for enhancing the Talk-To-My-Lawyer (TTML) platform's letter generation and attorney review pipeline. The primary objective is to introduce a timed email notification system that, after a draft letter is generated, informs the subscriber that their letter is ready for review behind a locked paywall. This system aims to guide users towards payment or subscription to unlock the full letter and proceed with attorney review.

## 2. Current Workflow Overview

The existing TTML letter generation and attorney review pipeline operates through a well-defined state machine and a multi-stage AI process. The key stages and components are as follows:

### 2.1. Letter Status State Machine

The `shared/types.ts` file defines the canonical transitions for letter statuses [1]. The relevant sequence for this enhancement is:

`submitted` → `researching` → `drafting` → `generated_locked`

*   **`submitted`**: Initial state after a user submits a letter request.
*   **`researching`**: The AI pipeline is performing legal research.
*   **`drafting`**: The AI is generating the initial draft.
*   **`generated_locked`**: The AI draft is complete but is not fully visible to the subscriber; it is behind a paywall. This is the critical state for the proposed changes.
*   **`generated_unlocked`**: A special state for a user's first letter, allowing free access to the draft.
*   **`pending_review`**: The letter is in the attorney review queue, typically reached after payment or a free unlock.
*   **`under_review`**: An attorney has claimed the letter for review.

### 2.2. AI Pipeline Orchestration

The AI pipeline, managed by `server/pipeline/orchestrator.ts` and `server/n8nCallback.ts`, is responsible for generating the letter draft. Upon successful completion, the letter's status is updated to `generated_locked` [2]. If the letter was not previously unlocked (i.e., not a free first letter or existing subscription), the `sendLetterReadyEmail` is dispatched to the subscriber, directing them to the letter's detail page where the `LetterPaywall` component is displayed [3].

### 2.3. Paywall Implementation

The paywall mechanism is handled by several components:

*   **`client/src/components/LetterPaywall.tsx`**: This React component is rendered when a letter is in the `generated_locked` status. It displays a truncated preview of the draft and presents options for unlocking: a 
free unlock for the first letter or a paid unlock via Stripe checkout [4].
*   **`server/routers/billing.ts`**: This tRPC router exposes `checkPaywallStatus`, `freeUnlock`, and `payToUnlock` procedures. `checkPaywallStatus` determines if a user is eligible for a free letter or has an active subscription. `freeUnlock` transitions a `generated_locked` letter to `pending_review` for eligible users, marking their free trial as used. `payToUnlock` initiates a Stripe checkout session for one-time letter unlocking [5].
*   **`server/stripeWebhook.ts`**: This webhook handler processes Stripe events. Upon successful payment for a letter unlock, it transitions the letter from `generated_locked` to `pending_review`, sends a `sendLetterUnlockedEmail` to the subscriber, and notifies attorneys [6].

### 2.4. Existing Timed Email Mechanism

The platform currently has a draft reminder system implemented in `server/draftReminders.ts`. This system sends a `sendDraftReminderEmail` to subscribers whose letters have been in the `generated_locked` status for `REMINDER_THRESHOLD_HOURS` (currently 48 hours) and have not yet received a reminder [7]. This cron-job-triggered mechanism updates the `draftReminderSentAt` field in the `letterRequests` table to prevent duplicate reminders.

## 3. Proposed Changes: Timed Email Notification and Paywall Logic

The user's request is to implement a more immediate timed email notification (10-15 minutes after generation) that directs subscribers to a locked preview modal, requiring payment or subscription to unlock. This will involve modifications to the existing pipeline, email sending, and paywall logic.

### 3.1. New Workflow Sequence

1.  **Letter Generation Completion**: The AI pipeline (either n8n or in-app) completes the letter generation, and the letter status is set to `generated_locked`.
2.  **Immediate Timed Email Trigger**: Approximately 10-15 minutes after the letter enters the `generated_locked` state, a new email notification (`sendLetterReadyForReviewEmail`) will be sent to the subscriber.
3.  **Email Content**: The email will inform the user that their letter is ready for review and provide a direct link to the letter's detail page. It will emphasize that the draft is behind a paywall and requires payment or an active subscription for full access and attorney review.
4.  **Locked Preview Modal**: Upon clicking the link, the user will be redirected to the `LetterDetail` page, which will display the `LetterPaywall` component. This component will show a truncated, blurred preview of the letter.
5.  **Paywall Interaction**: The `LetterPaywall` will present options to unlock the letter: either by using a free first letter (if eligible) or by processing payment (one-time or subscription).
6.  **Unlock and Attorney Review**: Once payment is confirmed (via Stripe webhook) or the free unlock is used, the letter status will transition from `generated_locked` to `pending_review`, making the full letter visible and placing it in the attorney review queue.

### 3.2. Architectural Modifications

To achieve this, the following architectural modifications are proposed:

#### 3.2.1. Timed Email Trigger Mechanism

Instead of modifying the existing `draftReminders.ts` (which is set for 48 hours), a new, more immediate timed email trigger will be implemented. This can be achieved by:

*   **Leveraging `cronScheduler.ts`**: The existing `cronScheduler.ts` can be extended to include a new cron job that runs more frequently (e.g., every 15 minutes). This new job will query for `generated_locked` letters that have not yet triggered the initial 
timed email and whose `updatedAt` timestamp falls within the 10-15 minute window.
*   **New `sendLetterReadyForReviewEmail` function**: A new email template and sending function will be created in `server/email.ts` to specifically address the 
purpose of this immediate notification. This email will contain a clear call-to-action (CTA) button linking directly to the letter's detail page.

#### 3.2.2. Paywall Logic Adjustments

The core paywall logic in `server/routers/billing.ts` and `client/src/components/LetterPaywall.tsx` is largely suitable. However, minor adjustments may be needed:

*   **`LetterPaywall.tsx`**: Ensure the component clearly communicates the timed aspect of the email and the value proposition of unlocking the letter. The copy for the free unlock and paid unlock CTAs should be reviewed to align with the new workflow.
*   **`server/stripeWebhook.ts`**: This file already handles the transition from `generated_locked` to `pending_review` upon successful payment. No significant changes are anticipated here, as the core unlock mechanism remains the same.

#### 3.2.3. Frontend (UI) Considerations

*   **`LetterDetail.tsx`**: The subscriber's letter detail page will be the landing page from the email. It should gracefully handle the `generated_locked` status by rendering the `LetterPaywall` component prominently.
*   **User Experience**: The user flow should be seamless. After receiving the email, clicking the link should take them directly to the locked preview, where they can easily understand how to unlock the letter. Clear messaging about the benefits of attorney review and the payment process is crucial.

## 4. Implementation Plan

1.  **Create New Email Template**: Develop a new email template and corresponding `sendLetterReadyForReviewEmail` function in `server/email.ts`. This email will be distinct from `sendDraftReminderEmail` and will be triggered much earlier.
2.  **Modify `cronScheduler.ts`**: Add a new cron job that runs every 15 minutes. This job will query the `letterRequests` table for letters in `generated_locked` status where `lastStatusChangedAt` is between 10 and 15 minutes ago, and a new `initialPaywallEmailSentAt` field is null. This new field will be added to the `letterRequests` table in `drizzle/schema.ts`.
3.  **Update `n8nCallback.ts` and `server/pipeline/vetting.ts`**: After a letter transitions to `generated_locked`, instead of immediately sending `sendLetterReadyEmail`, it will set the `initialPaywallEmailSentAt` to null and rely on the new cron job to trigger the email after the specified delay.
4.  **Adjust `LetterPaywall.tsx`**: Review and update the copy within the `LetterPaywall` component to reflect the new timed email notification and emphasize the urgency of attorney review.
5.  **Database Schema Update**: Add a new column `initialPaywallEmailSentAt` (timestamp) to the `letterRequests` table in `drizzle/schema.ts` to track when the initial paywall email has been sent.

## 5. References

[1] `shared/types.ts` - Defines `ALLOWED_TRANSITIONS` for letter status state machine.
[2] `server/pipeline/orchestrator.ts` - AI pipeline orchestration logic.
[3] `server/n8nCallback.ts` - n8n pipeline callback handler, including `sendLetterReadyEmail` dispatch.
[4] `client/src/components/LetterPaywall.tsx` - Frontend component for displaying the paywall.
[5] `server/routers/billing.ts` - Backend tRPC router for paywall status and unlock procedures.
[6] `server/stripeWebhook.ts` - Stripe webhook handler for processing payments and unlocking letters.
[7] `server/draftReminders.ts` - Existing cron-job-based draft reminder system.
