# The Payment Gate (Blur Pattern)

**Principle**: Access to generated letter content (beyond a truncated preview) is conditional on payment or an active subscription.

**Guidelines for AI Agents**:

*   **Trigger**: Access control is triggered when a letter's status is `generated_locked`.
*   **Server-Side Enforcement**: The `versions` router in `server/routers/versions.ts` must truncate the `content` field to approximately 100 characters when the letter is locked.
*   **Frontend-Side Enforcement**: The `LetterPaywall.tsx` component must be used to apply a visual blur to the UI and display the payment prompt.
*   **Unlock Logic**: The transition from `generated_locked` to `pending_review` (unlocked) must only occur after a successful Stripe payment or verification of an active subscription.

**Relevant Code References**:
*   `server/routers/versions.ts` (for server-side content truncation)
*   `client/src/components/LetterPaywall.tsx` (for frontend visual enforcement)
*   `server/stripe.ts` (for payment processing and status updates)
