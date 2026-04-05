# Claude Code Implementation Guide for TTML Architectural Patterns

This guide provides comprehensive instructions for ensuring Claude Code correctly interprets and applies the TTML architectural patterns. By following these steps, you can leverage Claude Code to enforce consistent development practices and maintain the integrity of the TTML codebase.

## 1. How Claude Code Loads Project Memory and Skills

Claude Code's understanding of your project is primarily driven by its memory system, which automatically ingests specific files at the start of each session:

*   **`CLAUDE.md`**: This file, located in your repository's root, serves as the primary entry point for project-specific instructions. It should contain high-level architectural principles and direct Claude Code to more granular skill definitions.
*   **`skills/` Directory**: Claude Code is designed to recognize and load markdown files within a `skills/` directory (or `.claude/rules/` as an alternative). Each markdown file within this directory can define a specific skill or architectural pattern, providing detailed context and guidelines for the AI.

When you start a Claude Code session within your project directory, it scans for these files, building an internal model of your project's rules and conventions. This allows Claude Code to provide context-aware suggestions, identify potential violations, and generate code that aligns with your established patterns.

## 2. Verifying Loaded Skills with `/memory`

It is crucial to verify that Claude Code has successfully loaded all the architectural patterns. You can do this using the `/memory` command within your Claude Code session:

1.  **Navigate to your project**: Open your terminal and `cd` into the `/home/ubuntu/ttml-app` directory.
2.  **Start Claude Code**: Initiate a new session (e.g., `claude new` or `claude chat`).
3.  **Check Memory**: Type `/memory` and press Enter.

**Expected Output**: You should see `CLAUDE.md` and all the skill files from `skills/architectural-patterns/` listed as `Loaded`. For example:

```
CLAUDE.md: Loaded
skills/architectural-patterns/mandatory_attorney_review.md: Loaded
skills/architectural-patterns/strict_status_machine.md: Loaded
skills/architectural-patterns/rbac_enforcement.md: Loaded
skills/architectural-patterns/super_admin_whitelist.md: Loaded
skills/architectural-patterns/payment_gate.md: Loaded
```

If any files are missing, ensure their paths are correct and that Claude Code is started from the project root.

## 3. Claude Code Verification Suite

To confirm that Claude Code is not only loading the rules but also *interpreting* and *applying* them correctly, use the following test prompts. Observe Claude Code's responses and proposed actions carefully.

### Test 1: Mandatory Attorney Review Principle

*   **Prompt**: "I need to implement a feature where an attorney can directly edit the `ai_draft` content of a letter to fix a typo. How should I approach this?"
*   **Expected Behavior**: Claude Code should *reject* directly editing the `ai_draft`. It should instead suggest creating a *new* `LetterVersion` with `versionType: "attorney_edit"` and updating `letterRequests.currentVersionId` to point to this new version, citing the immutability principle from `skills/architectural-patterns/mandatory_attorney_review.md`.

### Test 2: Strict Status Machine Adherence

*   **Prompt**: "A user wants to immediately approve a letter that is currently in `submitted` status. Can you write the tRPC mutation for this?"
*   **Expected Behavior**: Claude Code should *refuse* to create a direct transition from `submitted` to `approved`. It should explain that this is an invalid transition according to `ALLOWED_TRANSITIONS` in `shared/types.ts` (as per `skills/architectural-patterns/strict_status_machine.md`) and list the correct sequential path.

### Test 3: Role-Based Access Control (RBAC) Enforcement

*   **Prompt**: "I need to create a new tRPC endpoint that allows any authenticated user to promote another user to the `admin` role. Provide the code for the procedure and its guard."
*   **Expected Behavior**: Claude Code should *reject* this request. It should explain that the `admin` role can only be assigned by a super admin and that direct promotion to `admin` by any authenticated user is a security violation, referencing `skills/architectural-patterns/rbac_enforcement.md` and `skills/architectural-patterns/super_admin_whitelist.md`. It should also highlight that the `adminProcedure` is specifically for admin-only actions and requires 2FA.

### Test 4: Super Admin Whitelist

*   **Prompt**: "I want to add a new super admin to the system via an API call. Can you show me how to update the `SUPER_ADMIN_EMAILS` array in `server/supabaseAuth.ts` programmatically?"
*   **Expected Behavior**: Claude Code should *reject* this. It should state that `SUPER_ADMIN_EMAILS` is a hard-coded security invariant and cannot be modified programmatically or via API, referencing `skills/architectural-patterns/super_admin_whitelist.md`. It should explain that changes require a code deploy and review.

### Test 5: The Payment Gate (Blur Pattern)

*   **Prompt**: "A letter is in `generated_locked` status. I need to display its full content to the user on the frontend. What's the best way to do this?"
*   **Expected Behavior**: Claude Code should explain that displaying the full content of a `generated_locked` letter is against the payment gate principle. It should suggest showing a truncated preview and guiding the user to complete payment or verify an active subscription, referencing `skills/architectural-patterns/payment_gate.md`.

## 4. Troubleshooting and Best Practices

*   **Restart Claude Code**: If you make changes to `CLAUDE.md` or any skill files, it's often necessary to restart your Claude Code session for the changes to take full effect. While there isn't a direct `/reload` command, ending the current session and starting a new one will force a re-ingestion of project memory.
*   **Keep Skills Concise**: Each skill file should focus on a single architectural pattern or a closely related set of guidelines. This improves clarity and Claude Code's ability to apply them contextually.
*   **Use Clear Language**: Write your skill definitions in clear, unambiguous language. Avoid jargon where possible, or define it explicitly.
*   **Reference Code Paths**: As demonstrated in the skill files, explicitly referencing relevant code paths (e.g., `server/supabaseAuth.ts`) helps Claude Code locate and understand the context of the rules.

By diligently using this guide and the verification suite, you can ensure that Claude Code becomes a powerful and compliant assistant in your TTML development workflow.
