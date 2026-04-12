# Presentation Script: The "Source of Truth" Architecture for AI Agents

## Slide 1: Title Slide

**Title**: The "Source of Truth" Architecture: Harmonizing AI Agents with Project Invariants
**Subtitle**: Ensuring Consistent Development Across Claude Code, Cursor, and Windsurf
**Presenter**: Manus AI

--- 

## Slide 2: The Challenge: AI Agents Gone Rogue?

**Headline**: Inconsistent AI Behavior: A Growing Problem in Modern Development

**Content**: 

*(Image: A chaotic diagram with multiple AI logos pointing in different directions, some with red X marks)*

In today's AI-augmented development landscape, we leverage powerful tools like Claude Code, Cursor, and Windsurf to accelerate our workflows. However, a critical challenge emerges: **how do we ensure these diverse AI agents consistently adhere to our project's core architectural patterns, security invariants, and best practices?**

Without a unified approach, we face:

*   **Context Drift**: Each AI tool might interpret project guidelines differently.
*   **Inconsistent Code**: Leading to technical debt and potential bugs.
*   **Security Vulnerabilities**: If critical invariants are overlooked.
*   **Maintenance Headaches**: As developers struggle to align AI outputs.

--- 

## Slide 3: Introducing the "Source of Truth" Architecture

**Headline**: Centralizing Project Invariants for Autonomous AI Development

**Content**: 

*(Image: A diagram showing a central `skills/` folder with arrows pointing outwards to Claude Code, Cursor, and Windsurf logos)*

Our solution is the **"Source of Truth" Architecture**. This approach establishes a single, authoritative repository for all project-specific architectural patterns, security rules, and development guidelines. By centralizing these instructions, we ensure that every AI agent, regardless of its platform, operates from the same foundational understanding.

This architecture is built around a dedicated `skills/` directory within your project repository. This directory houses modular markdown files, each defining a specific architectural pattern or best practice.

--- 

## Slide 4: How It Works: The Centralized Skills Vault

**Headline**: Modular, Markdown-Based Skills for Universal AI Understanding

**Content**: 

*(Image: Screenshot of the `skills/architectural-patterns/` directory structure in a file explorer)*

At the heart of our system is the `skills/architectural-patterns/` directory. This folder contains individual markdown files, each dedicated to a specific invariant or pattern. For instance, in the Talk-To-My-Lawyer (TTML) project, we have files like:

*   `mandatory_attorney_review.md`
*   `strict_status_machine.md`
*   `rbac_enforcement.md`
*   `super_admin_whitelist.md`
*   `payment_gate.md`

Each of these files provides detailed explanations, code references, and explicit instructions for AI agents on how to interpret and enforce the pattern. This modularity makes them easy to create, update, and maintain.

--- 

## Slide 5: Agent-Specific Configuration: Connecting the Dots

**Headline**: Tailored Instructions for Each AI Tool, Referencing the Core

**Content**: 

*(Image: A diagram showing `CLAUDE.md`, `.cursorrules`, and `.windsurfrules` files, each with an arrow pointing to the `skills/` directory)*

While the `skills/` directory is our central vault, each AI agent needs a specific entry point to ingest these rules. We achieve this by creating agent-specific configuration files that *reference* the central skills:

| File Name | Target AI Agent | Purpose |
| :--- | :--- | :--- |
| `CLAUDE.md` | **Claude Code** | The primary memory file for Claude Code, which now includes directives to load and prioritize the markdown files within `skills/architectural-patterns/`. |
| `.cursorrules` | **Cursor** | Configures Cursor Composer and Chat to understand and apply the guidelines defined in our central skills. |
| `.windsurfrules` | **Windsurf** | Provides behavioral constraints for the Cascade AI agent, ensuring its autonomous actions comply with the project invariants. |

This setup ensures that when you update a rule in `skills/architectural-patterns/`, all connected AI agents automatically inherit that change.

--- 

## Slide 6: Benefits: Consistency, Maintainability, and Scalability

**Headline**: Empowering Developers with Predictable AI Assistance

**Content**: 

*(Image: A graphic illustrating increased efficiency, reduced errors, and faster onboarding)*

Adopting the "Source of Truth" architecture brings significant advantages:

*   **Unwavering Consistency**: All AI-generated code and suggestions align with established project patterns, reducing architectural drift.
*   **Simplified Maintenance**: Update a rule once in the `skills/` directory, and it propagates across all AI tools.
*   **Enhanced Security**: Critical security invariants, like the Super Admin Whitelist, are consistently enforced.
*   **Faster Onboarding**: New developers and AI agents quickly grasp project nuances through explicit, centralized documentation.
*   **Reduced Cognitive Load**: Developers spend less time correcting AI mistakes and more time innovating.

--- 

## Slide 7: TTML Case Study: Architectural Patterns in Action

**Headline**: Real-World Enforcement in the Talk-To-My-Lawyer Platform

**Content**: 

*(Image: A simplified flowchart of the TTML letter lifecycle, highlighting key decision points)*

Let's look at how this architecture enforces critical patterns in the TTML project:

*   **Mandatory Attorney Review**: AI agents are instructed to *never* modify `ai_draft` versions, always creating new `attorney_edit` versions, ensuring human oversight.
*   **Strict Status Machine**: Any proposed status change for a legal letter is validated against `ALLOWED_TRANSITIONS` in `shared/types.ts`, preventing invalid workflow jumps.
*   **RBAC Enforcement**: AI agents are guided to use the correct tRPC procedure guards (`adminProcedure`, `attorneyProcedure`, etc.), ensuring proper access control.
*   **Super Admin Whitelist**: The hard-coded `SUPER_ADMIN_EMAILS` in `server/supabaseAuth.ts` is recognized as immutable by AI, preventing programmatic bypasses.
*   **The Payment Gate**: AI understands that full letter content is locked (`generated_locked`) until payment, ensuring monetization logic is respected.

--- 

## Slide 8: Verification: Trust, But Verify

**Headline**: Ensuring AI Agents Truly Understand Your Rules

**Content**: 

*(Image: A terminal screenshot showing the `/memory` command output in Claude Code)*

It's not enough to just place the files; we must verify that AI agents are actively loading and interpreting them. For Claude Code, the `/memory` command is your best friend. It allows you to confirm that `CLAUDE.md` and all skill files are loaded.

Furthermore, we've developed a **"Claude Code Verification Suite"** – a set of targeted prompts designed to test the AI's understanding. These prompts intentionally try to trick the AI into violating a rule. If Claude Code correctly flags the violation and explains *why* it's a problem (referencing the skill file), then you know your architecture is robust.

--- 

## Slide 9: Conclusion: Building Smarter, Safer AI-Assisted Workflows

**Headline**: Empowering Your Team with Intelligent, Compliant AI

**Content**: 

*(Image: A team of developers collaborating with AI agents, all working harmoniously)*

By implementing the "Source of Truth" architecture, we transform our AI agents from mere code generators into intelligent, compliant team members. This approach ensures:

*   **Predictable AI Behavior**
*   **Architectural Integrity**
*   **Enhanced Security Posture**
*   **Streamlined Development**

Embrace this architecture to build smarter, safer, and more efficient AI-assisted development workflows. Thank you.

--- 

## Slide 10: Q&A

**Headline**: Questions & Discussion

**Content**: 

*(Image: A microphone icon or a thought bubble)*

I am ready to answer any questions you may have.
