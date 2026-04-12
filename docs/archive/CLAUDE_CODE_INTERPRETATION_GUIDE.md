# How Claude Code Interprets the "Source of Truth" Skills Directory

This document provides a detailed technical explanation of how Claude Code's internal memory ingestion logic processes the `CLAUDE.md` file and the associated `skills/` directory. 

**Crucially, all necessary files are contained entirely within this repository.** You do not need to configure external files, global environment variables, or complex `.claude/` system directories outside of this project.

## The Memory Ingestion Hierarchy

When you launch Claude Code (e.g., by typing `claude` in your terminal) within the `ttml-app` root directory, it performs a specific sequence of operations to build its "Project Memory." This memory dictates how the AI agent will behave, what architectural patterns it must respect, and what context it brings to your prompts.

### 1. The Entry Point: `CLAUDE.md`

Claude Code always looks for a `CLAUDE.md` file in the root of the directory from which it was launched. This file acts as the "Constitution" for the project [1]. 

*   **Discovery**: The CLI scans the current working directory for `CLAUDE.md`.
*   **Priority**: Instructions within `CLAUDE.md` are treated with the highest priority. It is the first thing Claude reads and forms the base context layer.
*   **Routing**: Instead of cramming every single rule into this one file (which can overwhelm the context window and dilute focus), our `CLAUDE.md` acts as a router. It establishes high-level principles (like "Strict Status Machine") and then explicitly tells Claude Code: *"For detailed rules and examples, refer to the markdown files within the `skills/architectural-patterns/` directory."*

### 2. Resolving the `skills/` Directory

Claude Code is designed to follow references to other markdown files, particularly when they are structured as "skills" or detailed rules. 

*   **Relative Path Resolution**: When `CLAUDE.md` references `skills/architectural-patterns/`, Claude Code resolves this path *relative to the location of the `CLAUDE.md` file* [2]. Because `CLAUDE.md` is in the repository root, it correctly finds the `skills/` folder right next to it.
*   **No External Dependencies**: This relative resolution is why **no external files are needed**. The entire instruction set is self-contained within the Git repository. Anyone who clones `ttml-app` gets the exact same AI configuration.

### 3. Ingesting the Skill Files

Once directed to the `skills/architectural-patterns/` directory, Claude Code processes the individual markdown files (e.g., `mandatory_attorney_review.md`, `rbac_enforcement.md`).

*   **Contextual Loading**: Claude Code reads these files and adds them to its active memory. You can verify this by running the `/memory` command in the Claude CLI, which will list all loaded files.
*   **Pattern Matching**: When you issue a prompt (e.g., "Write a new endpoint to change user roles"), Claude Code cross-references your request against the loaded skills. It recognizes the "roles" keyword, pulls up the `rbac_enforcement.md` skill, and uses that specific logic to generate the correct tRPC procedure guard.

## Why This Structure Works Best

1.  **Portability**: Because everything is in the repo, the AI rules are version-controlled alongside the code. If a rule changes in a PR, the AI's behavior changes simultaneously for everyone reviewing that PR.
2.  **Context Window Optimization**: By breaking rules into modular files in the `skills/` directory, Claude Code can selectively focus on the rules most relevant to the current task, rather than parsing a massive, monolithic rulebook for every prompt.
3.  **Cross-Agent Compatibility**: While Claude Code uses `CLAUDE.md` as its entry point, we use `.cursorrules` and `.windsurfrules` as entry points for other agents. All of these entry points point to the *same* `skills/` directory. This ensures that no matter which tool a developer uses, the "Source of Truth" remains identical.

## References

[1] Anthropic. "How Claude remembers your project." Claude Code Docs. https://code.claude.com/docs/en/memory
[2] GitHub Issue #17741. "Bug: Paths in SKILL.md files should be resolved relative to the skill file location." https://github.com/anthropics/claude-code/issues/17741
