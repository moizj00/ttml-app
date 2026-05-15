# Strict Status Machine Adherence

**Principle**: Letter requests follow a strict sequential path. Deviations are not allowed.

**Guidelines for Claude Code**:

*   **Validation**: Any proposed change to a letter's `status` MUST be validated against the `ALLOWED_TRANSITIONS` map defined in `shared/types/letter.ts`.
*   **No Skipping**: Claude Code must never suggest transitions that skip intermediate statuses (e.g., `submitted` directly to `approved`).
*   **Force Transitions**: Only super admin actions (which explicitly bypass the transition map) are allowed to force status changes. AI should not generate code that bypasses this validation without explicit super admin context.
*   **Display Logic**: The `STATUS_CONFIG` in `shared/types/letter.ts` should be used for all status display logic in the frontend.

**Relevant Code References**:
*   `shared/types/letter.ts` — `ALLOWED_TRANSITIONS`, `STATUS_CONFIG`, `isValidTransition()`
*   `server/db/` data-access layer — where `isValidTransition` is imported and used
*   `client/src/components/StatusTimeline.tsx` — frontend display logic
