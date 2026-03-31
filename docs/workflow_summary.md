# TTML Letter Generation and Attorney Review Workflow: Complete Summary

## Executive Summary

The Talk-To-My-Lawyer (TTML) platform implements a sophisticated letter generation and attorney review pipeline. This document provides a comprehensive overview of the current workflow, the proposed enhancements, and how the new timed paywall email notification system integrates into the existing architecture.

## Current Workflow: Letter Generation Pipeline

### Stage 1: Intake and Submission

1.  **User Submits Letter Request**: A subscriber fills out a form with their legal matter details, jurisdiction, sender/recipient information, and desired outcome.
2.  **Letter Status**: `submitted`
3.  **Database Entry**: A new `letterRequests` record is created with the intake JSON data.

### Stage 2: Research Phase

1.  **Pipeline Trigger**: The system either routes the request to n8n (external workflow) or starts the in-app pipeline.
2.  **Letter Status**: `researching`
3.  **AI Research**: Perplexity API performs legal research based on the jurisdiction and matter type.
4.  **Output**: A `ResearchPacket` containing jurisdiction profile, applicable rules, risk flags, and statute of limitations information.

### Stage 3: Draft Generation

1.  **Letter Status**: `drafting`
2.  **AI Draft**: Anthropic Claude uses the research packet to generate an initial legal letter draft.
3.  **Output**: A `DraftOutput` containing the draft letter, attorney review summary, open questions, and risk flags.

### Stage 4: Assembly and Vetting

1.  **Assembly**: Claude assembles the final letter from the research and draft outputs.
2.  **Vetting**: Claude performs quality control, checking for:
     - Jurisdictional accuracy (correct statutes, citations)
     - Legal accuracy (statute of limitations, pre-suit requirements)
     - Anti-hallucination enforcement (no invented citations)
     - Anti-bloat enforcement (removal of filler phrases)
     - Factual consistency (names, addresses, amounts)
3.  **Output**: A vetted letter and vetting report with quality assessment.

### Stage 5: Paywall and Unlock

1.  **Letter Status**: `generated_locked`
2.  **Paywall Activation**: The letter is now behind a paywall. The subscriber cannot view the full draft without payment or a free unlock.
3.  **Subscriber Options**:
     - **Free Unlock**: If eligible (first letter or active subscription), the subscriber can unlock the letter for free.
     - **Paid Unlock**: The subscriber can pay $200 (one-time) or subscribe for unlimited letters.

### Stage 6: Attorney Review Queue

1.  **Payment Processing**: Upon successful payment (via Stripe webhook), the letter transitions to `pending_review`.
2.  **Letter Status**: `pending_review`
3.  **Attorney Assignment**: An attorney claims the letter for review.
4.  **Letter Status**: `under_review`
5.  **Attorney Actions**: The attorney can:
     - Approve the letter → `approved`
     - Request revisions → `needs_changes` → `pending_review`
     - Reject the letter → `rejected`

### Stage 7: Final Delivery

1.  **Letter Status**: `approved`
2.  **PDF Generation**: A professional PDF is generated.
3.  **Subscriber Access**: The subscriber can download and send the letter.

## Current Paywall Mechanism

### Components

| Component | Purpose |
|-----------|---------|
| `LetterPaywall.tsx` | React component displaying truncated preview and unlock options |
| `billing.ts` (tRPC router) | Backend procedures for `checkPaywallStatus`, `freeUnlock`, `payToUnlock` |
| `stripeWebhook.ts` | Handles Stripe payment confirmation and letter unlock |
| `hasLetterBeenPreviouslyUnlocked()` | Determines if a subscriber has already unlocked a letter |

### Current Email Behavior

- **Immediate Email** (upon `generated_locked`): `sendLetterReadyEmail` is sent immediately after the letter reaches `generated_locked` status, but only if the letter was not previously unlocked.
- **Delayed Reminder** (48 hours): `sendDraftReminderEmail` is sent via cron job if the letter remains in `generated_locked` after 48 hours.

## Proposed Enhancement: Timed Paywall Email Notification

### Objective

Introduce a more strategic timed email notification (10-15 minutes post-generation) that:

1.  Allows the subscriber time to receive and read the email.
2.  Creates a natural call-to-action without being too aggressive.
3.  Emphasizes the value of attorney review and the payment process.
4.  Guides the subscriber to a locked preview modal.

### New Workflow Sequence

```
Letter Generation Complete
    ↓
Letter Status: generated_locked
    ↓
[10-15 minutes pass]
    ↓
Cron Job Triggers
    ↓
Send Paywall Notification Email
    ↓
Subscriber Receives Email
    ↓
Subscriber Clicks Email Link
    ↓
Redirected to LetterDetail Page
    ↓
LetterPaywall Component Displayed (Locked Preview)
    ↓
Subscriber Chooses:
    ├─ Free Unlock (if eligible)
    │   ↓
    │   Letter Status: pending_review
    │   ↓
    │   Attorney Review Queue
    │
    └─ Paid Unlock
        ↓
        Stripe Checkout
        ↓
        Payment Confirmation
        ↓
        Letter Status: pending_review
        ↓
        Attorney Review Queue
```

### Key Differences from Current Approach

| Aspect | Current | Proposed |
|--------|---------|----------|
| Initial Email Timing | Immediate (upon generation) | 10-15 minutes post-generation |
| Email Trigger | Sent directly by pipeline | Sent by cron job |
| Email Purpose | Generic "draft ready" | Specific "paywall notification" |
| User Experience | Immediate notification | Delayed but strategic notification |
| Idempotency | Relies on `hasLetterBeenPreviouslyUnlocked()` | Uses `initialPaywallEmailSentAt` column |

## Implementation Architecture

### New Components

1. **`server/paywall-email-cron.ts`**: Cron handler that processes eligible letters and sends paywall notification emails.
2. **`sendPaywallNotificationEmail()` in `server/email.ts`**: New email template and sending function.
3. **`initialPaywallEmailSentAt` column in `letterRequests` table**: Tracks when the paywall email was sent.

### Modified Components

1. **`server/n8nCallback.ts`**: Removed immediate email sending; relies on cron job.
2. **`server/pipeline/vetting.ts`**: Removed immediate email sending; relies on cron job.
3. **`server/cronScheduler.ts`**: Added new cron job running every 15 minutes.

### Unchanged Components

- **`LetterPaywall.tsx`**: No changes needed; component already handles locked preview.
- **`billing.ts`**: No changes needed; unlock logic remains the same.
- **`stripeWebhook.ts`**: No changes needed; payment processing remains the same.

## Database Schema Changes

### New Column

```sql
ALTER TABLE letter_requests ADD COLUMN initial_paywall_email_sent_at TIMESTAMP;
```

### Purpose

Tracks when the initial paywall notification email was sent, ensuring idempotency and preventing duplicate emails.

## Cron Job Configuration

### Frequency

Every 15 minutes (cron expression: `*/15 * * * *`)

### Eligibility Criteria

A letter is eligible for a paywall notification email if:

1.  Status is `generated_locked`
2.  `initialPaywallEmailSentAt` is NULL (email not yet sent)
3.  `lastStatusChangedAt` is between 10-15 minutes ago

### Actions

For each eligible letter:

1.  Load the subscriber user record.
2.  Send `sendPaywallNotificationEmail` to the subscriber's email.
3.  Update `initialPaywallEmailSentAt` to the current timestamp.
4.  Log the result (sent, skipped, or error).

## Email Content Strategy

### Email Template: Paywall Notification

**Subject**: `[TTML] Your letter is ready — view and unlock for attorney review`

**Key Sections**:

1. **Greeting**: Personalized with subscriber name.
2. **Main Message**: "Your legal letter draft is ready for review."
3. **Letter Details**: Subject, type, jurisdiction, and letter ID.
4. **What Happens Next**: 3-step process (paywall, attorney review, PDF download).
5. **Pricing Information**: $200 one-time or subscription option.
6. **Call-to-Action Button**: "View & Unlock Your Letter" linking to `/letters/:id`.
7. **Footer**: Standard footer with unsubscribe link and company info.

### Design Principles

- **Clear Value Proposition**: Emphasize the benefits of attorney review.
- **Urgency Without Pressure**: Suggest timely action without aggressive tactics.
- **Transparency**: Clearly state the paywall and pricing.
- **Mobile-Friendly**: Responsive design for all devices.
- **Accessibility**: Proper contrast, readable fonts, alt text for images.

## Testing Strategy

### Unit Tests

- Verify cron job correctly identifies eligible letters.
- Verify email is sent only once per letter.
- Verify `initialPaywallEmailSentAt` is correctly set.
- Verify error handling and logging.

### Integration Tests

- Submit a letter and verify it reaches `generated_locked`.
- Manually trigger the cron job and verify email is sent.
- Verify email content and links are correct.
- Verify subscriber can click email link and reach the paywall.

### End-to-End Tests

- Complete letter submission through attorney review.
- Test both free and paid unlock paths.
- Verify email delivery and engagement metrics.

## Monitoring and Observability

### Key Metrics

- **Email Sent**: Number of paywall notification emails sent per day.
- **Email Delivery Rate**: Percentage of emails successfully delivered.
- **Email Open Rate**: Percentage of emails opened by subscribers.
- **Click-Through Rate**: Percentage of emails with clicks to the paywall.
- **Unlock Rate**: Percentage of locked letters that are unlocked (free or paid).
- **Conversion Rate**: Percentage of paywall visits that result in payment.

### Logging

- Log each cron job execution with summary statistics.
- Log individual email sends with subscriber email and letter ID.
- Log errors with detailed error messages for debugging.

### Alerts

- Alert if cron job fails to execute.
- Alert if email delivery rate drops below threshold.
- Alert if unlock rate drops significantly.

## Rollout Plan

### Phase 1: Development and Testing

1.  Implement all components locally.
2.  Run unit and integration tests.
3.  Verify email content and design.

### Phase 2: Staging Deployment

1.  Deploy to staging environment.
2.  Run end-to-end tests with real Stripe and email services.
3.  Monitor cron job execution and email delivery.

### Phase 3: Production Deployment

1.  Run database migration to add new column.
2.  Deploy updated code to production.
3.  Monitor cron job execution and email metrics.
4.  Gather user feedback and engagement data.

### Phase 4: Optimization

1.  Analyze email metrics and user behavior.
2.  Adjust email content based on open and click rates.
3.  Optimize timing if needed (adjust 10-15 minute window).
4.  Implement additional features based on user feedback.

## Backward Compatibility

- **Existing Letters**: Letters already in `generated_locked` status will not receive the paywall email unless they are re-triggered.
- **Previously Unlocked Letters**: The `hasLetterBeenPreviouslyUnlocked()` check ensures previously unlocked letters are not sent the paywall email.
- **Free Trial Users**: The existing free trial logic remains unchanged; eligible users can still unlock their first letter for free.

## Conclusion

The proposed timed paywall email notification system enhances the TTML platform's user experience by:

1.  **Strategic Timing**: Allows subscribers time to receive and read the email before taking action.
2.  **Clear Value Proposition**: Emphasizes the benefits of attorney review.
3.  **Seamless Integration**: Leverages existing paywall and payment mechanisms.
4.  **Minimal Disruption**: Requires minimal changes to existing code.
5.  **Scalability**: Cron-based approach scales well with growing user base.

This enhancement is expected to improve unlock rates, increase attorney review submissions, and ultimately increase revenue through both free trial conversions and paid subscriptions.
