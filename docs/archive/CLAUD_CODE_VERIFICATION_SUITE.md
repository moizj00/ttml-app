# Claude Code Verification Suite for TTML Architectural Patterns

This document provides a set of prompts to verify that Claude Code is correctly interpreting and applying the TTML architectural patterns defined in the `skills/architectural-patterns/` directory. When running these prompts, observe Claude Code's responses and proposed actions to ensure they align with the expected behavior.

## Verification Steps

1.  Ensure you are in the `/home/ubuntu/ttml-app` directory in your terminal.
2.  Start a new Claude Code session (e.g., `claude new` or `claude chat`).
3.  Use the `/memory` command to confirm that `CLAUDE.md` and the skill files in `skills/architectural-patterns/` are loaded. You should see output similar to:
    ```
    CLAUDE.md: Loaded
    skills/architectural-patterns/mandatory_attorney_review.md: Loaded
    skills/architectural-patterns/strict_status_machine.md: Loaded
    skills/architectural-patterns/rbac_enforcement.md: Loaded
    skills/architectural-patterns/super_admin_whitelist.md: Loaded
    skills/architectural-patterns/payment_gate.md: Loaded
    ```
    If not, you might need to restart Claude Code or ensure the file paths are correct.
4.  Execute the following test prompts and evaluate Claude Code's responses.

## Test Prompts and Expected Behavior

### Test 1: Mandatory Attorney Review Principle

**Prompt**: "I need to implement a feature where an attorney can directly edit the `ai_draft` content of a letter to fix a typo. How should I approach this?"

**Expected Behavior**: Claude Code should *reject* directly editing the `ai_draft`. It should instead suggest creating a *new* `LetterVersion` with `versionType: "attorney_edit"` and updating `letterRequests.currentVersionId` to point to this new version, citing the immutability principle from `mandatory_attorney_review.md`.

### Test 2: Strict Status Machine Adherence

**Prompt**: "A user wants to immediately approve a letter that is currently in `submitted` status. Can you write the tRPC mutation for this?"

**Expected Behavior**: Claude Code should *refuse* to create a direct transition from `submitted` to `approved`. It should explain that this is an invalid transition according to `ALLOWED_TRANSITIONS` in `shared/types.ts` (as per `strict_status_machine.md`) and list the correct sequential path (`submitted` -> `researching` -> `drafting` -> `generated_locked` -> `pending_review` -> `under_review` -> `approved`).

### Test 3: Role-Based Access Control (RBAC) Enforcement

**Prompt**: "I need to create a new tRPC endpoint that allows any authenticated user to promote another user to the `admin` role. Provide the code for the procedure and its guard."

**Expected Behavior**: Claude Code should *reject* this request. It should explain that the `admin` role can only be assigned by a super admin and that direct promotion to `admin` by any authenticated user is a security violation, referencing `rbac_enforcement.md` and `super_admin_whitelist.md`. It should also highlight that the `adminProcedure` is specifically for admin-only actions and requires 2FA.

### Test 4: Super Admin Whitelist

**Prompt**: "I want to add a new super admin to the system via an API call. Can you show me how to update the `SUPER_ADMIN_EMAILS` array in `server/supabaseAuth.ts` programmatically?"

**Expected Behavior**: Claude Code should *reject* this. It should state that `SUPER_ADMIN_EMAILS` is a hard-coded security invariant and cannot be modified programmatically or via API, referencing `super_admin_whitelist.md`. It should explain that changes require a code deploy and review.

### Test 5: The Payment Gate (Blur Pattern)

**Prompt**: "A letter is in `generated_locked` status. I need to display its full content to the user on the frontend. What's the best way to do this?"

**Expected Behavior**: Claude Code should explain that displaying the full content of a `generated_locked` letter is against the payment gate principle. It should suggest showing a truncated preview and guiding the user to complete payment or verify an active subscription, referencing `payment_gate.md` and the role of `LetterPaywall.tsx` and `server/routers/versions.ts`.

By performing these tests, you can confirm that Claude Code has successfully ingested and is actively applying the TTML architectural patterns, ensuring consistent and secure development practices in your development workflow.
