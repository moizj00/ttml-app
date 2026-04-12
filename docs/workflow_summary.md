# TTML Letter Generation and Attorney Review Workflow: Complete Summary

> **Last updated:** April 12, 2026  
> **Status:** Canonical — complete workflow reference
> **Authoritative file for:** End-to-end letter lifecycle and business logic walkthrough.
> For architecture details, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Executive Summary

The Talk-To-My-Lawyer (TTML) platform implements a sophisticated letter generation and attorney review pipeline. This document provides a comprehensive overview of the current workflow, including the new modular architecture, the stale pipeline lock recovery system, and the subscriber preview modal.

## Current Workflow: Letter Generation Pipeline

### Stage 1: Intake and Submission
1.  **User Submits Letter Request**: A subscriber fills out a form with their legal matter details.
2.  **Letter Status**: `submitted`
3.  **Database Entry**: A new `letterRequests` record is created.

### Stage 2: Research Phase
1.  **Pipeline Trigger**: The system starts the in-app pipeline.
2.  **Letter Status**: `researching`
3.  **AI Research**: Perplexity API performs legal research.
4.  **Output**: A `ResearchPacket` with jurisdiction profile, rules, and risk flags.

### Stage 3: Draft Generation
1.  **Letter Status**: `drafting`
2.  **AI Draft**: Anthropic Claude Opus generates an initial legal letter draft.
3.  **Output**: A `DraftOutput` containing the draft, attorney review summary, and open questions.

### Stage 4: Assembly and Vetting
1.  **Assembly**: Claude assembles the final letter.
2.  **Vetting**: Claude Sonnet performs quality control for accuracy and hallucination.
3.  **Output**: A vetted letter and vetting report.

### Stage 5: Paywall and Unlock
1.  **Letter Status**: `generated_locked`
2.  **Paywall Activation**: The subscriber cannot view the full draft without payment.
3.  **Subscriber Options**: Paid unlock ($200) or subscription.

### Stage 6: Attorney Review Queue
1.  **Payment Processing**: Upon successful payment, the letter transitions to `pending_review`.
2.  **Attorney Assignment**: An attorney claims the letter (`under_review`).
3.  **Attorney Actions**: Approve (`approved`), Request revisions (`needs_changes`), or Reject (`rejected`).

### Stage 7: Subscriber Approval & Delivery (Phase 109+)
1.  **Letter Status**: `approved` → `client_approval_pending`
2.  **Subscriber Preview**: A full-screen read-only modal auto-opens for the subscriber.
3.  **Subscriber Actions**:
    - **Approve & Send**: Final approval, letter status → `client_approved` → `sent`.
    - **Request Changes**: Re-triggers the pipeline (limited to 5 revisions).
    - **Decline**: Letter status → `client_declined`.

---

## Resilience & Quality Hardening (Phase 108+)

### Stale Pipeline Lock Recovery
A new cron job (`server/stalePipelineLockRecovery.ts`) runs every 15 minutes. It automatically detects letters stuck in `researching` or `drafting` for more than 30 minutes, releases the lock, resets the status to `submitted`, and re-enqueues the letter for a fresh run.

### Modular Architecture
The codebase has been refactored into modular directory modules to improve maintainability:
- **Frontend**: God components like `DocumentAnalyzer`, `ReviewModal`, and `AffiliateDashboard` are now split into thin orchestrators with custom hooks and sub-components.
- **Backend**: Server monoliths like `stripe.ts`, `learning.ts`, and `emailPreview.ts` are decomposed into directory modules under `server/`.

### Zero-Error TypeScript Build
The project now maintains **0 TypeScript errors**. All pino logger overload mismatches have been refactored to the correct `{ obj }, msg` pattern.
