# How to Add a New AI Skill to the TTML Repository

This guide explains how to create and integrate a new architectural pattern or rule into the "Source of Truth" `skills/` directory. By following this process, you ensure that Claude Code, Cursor, and Windsurf all immediately recognize and enforce the new rule.

## The 3-Step Process

Adding a new skill involves three simple steps:

1.  **Create the Markdown File**: Write the rule in the `skills/architectural-patterns/` directory.
2.  **Update `CLAUDE.md`** (Optional but recommended): If the rule is a major architectural pillar, mention it in the main Claude memory file.
3.  **Update `.cursorrules` and `.windsurfrules`**: Add a brief reference so Cursor and Windsurf know to look for it.

---

## Worked Example: Adding a "Captcha Exclusion" Skill

Let's walk through an example. Suppose we want to enforce a new rule: **"Never include CAPTCHAs in any user-facing features or forms."**

### Step 1: Create the Skill File

Create a new file at `skills/architectural-patterns/captcha_exclusion.md`.

**Content of `captcha_exclusion.md`:**

```markdown
# Captcha Exclusion Principle

**Principle**: Do not include CAPTCHAs in any user-facing features or forms within the Talk-To-My-Lawyer application.

**Guidelines for AI Agents**:

*   **Form Generation**: When generating or modifying React components that include forms (e.g., signup, login, contact), explicitly omit any CAPTCHA integrations (like reCAPTCHA or hCaptcha).
*   **Authentication Flow**: Rely on the existing Supabase Auth and email verification flows instead of adding CAPTCHA friction.
*   **Rate Limiting**: If spam prevention is needed, utilize the existing Upstash Redis rate-limiting infrastructure on the backend (`server/routers/`) rather than frontend CAPTCHAs.

**Relevant Code References**:
*   `client/src/pages/` (Ensure no CAPTCHA components are imported here)
*   `server/_core/index.ts` (For existing rate-limiting middleware)
```

*Tip: Keep the format consistent with existing skills: Principle, Guidelines, and Relevant Code References.*

### Step 2: Update `CLAUDE.md` (If necessary)

If this is a major, overarching rule, you might add a brief bullet point to the `## Core Architectural Principles` section in `CLAUDE.md`.

*Example addition to `CLAUDE.md`:*
```markdown
8.  **Captcha Exclusion**: Do not use CAPTCHAs in frontend forms; rely on backend rate limiting instead.
```
*(Note: Because `CLAUDE.md` already tells Claude Code to read everything in the `skills/` folder, this step is technically optional, but it helps reinforce high-priority rules.)*

### Step 3: Update `.cursorrules` and `.windsurfrules`

To ensure Cursor and Windsurf pick up the new rule, add a reference to their respective configuration files.

**Update `.cursorrules`:**
Add to the `## Core Principles` section:
```markdown
8.  **Captcha Exclusion**: Do not include CAPTCHAs in any user-facing features or forms. (See `skills/architectural-patterns/captcha_exclusion.md`)
```

**Update `.windsurfrules`:**
Add to the `## Core Principles` section:
```markdown
8.  **Captcha Exclusion**: Do not include CAPTCHAs in any user-facing features or forms. (See `skills/architectural-patterns/captcha_exclusion.md`)
```

## Verification

Once you have created the file and updated the references, you can verify it works:

1.  Open Claude Code in your terminal.
2.  Run the `/memory` command.
3.  You should see `skills/architectural-patterns/captcha_exclusion.md: Loaded` in the output.
4.  Test it by prompting an AI agent: *"Generate a new signup form for the TTML app and make sure it's secure from bots."* The agent should suggest rate limiting instead of a CAPTCHA.

By following this structure, you keep the "Source of Truth" clean, modular, and universally understood by all your AI development tools.
