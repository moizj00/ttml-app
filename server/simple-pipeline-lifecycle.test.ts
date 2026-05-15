/**
 * Simple Pipeline — End-to-End Lifecycle Integration Test
 *
 * Drives the full submitted → researching → drafting → generated_locked →
 * pending_review → under_review → approved → client_approval_pending →
 * client_approved lifecycle through the real DB, with the LLM SDK clients
 * mocked so the test is deterministic and free of API cost.
 *
 * The test is gated on a real Postgres connection string (SUPABASE_DIRECT_URL,
 * SUPABASE_DATABASE_URL, or DATABASE_URL — anything other than the
 * vitest.setup.ts stub URL counts). Without one, the suite skips so CI / dev
 * environments without DB access don't see a misleading failure. Run it
 * manually with any of:
 *
 *   SUPABASE_DATABASE_URL=postgresql://... pnpm test -- server/simple-pipeline-lifecycle.test.ts
 *   DATABASE_URL=postgresql://...          pnpm test -- server/simple-pipeline-lifecycle.test.ts
 *
 * Covered behaviours (assertions in order):
 *   1. createLetterRequest places the letter in `submitted`.
 *   2. runSimplePipeline advances through researching → drafting →
 *      generated_locked, writes an `ai_draft` version, and sets
 *      currentAiDraftVersionId. Workflow job row is `completed`.
 *   3. Paywall: getLetterVersionsByRequestId returns the ai_draft
 *      `truncated: true` for subscriber view at `generated_locked`,
 *      and full content for admin (`includeInternal=true`) view.
 *   4. Payment unlock: status transition to `pending_review` removes
 *      the paywall — ai_draft now full and `truncated: false`.
 *   5. claimLetterForReview assigns the reviewer and moves to
 *      `under_review`.
 *   6. Attorney approval path: a `final_approved` version is created
 *      (ai_draft remains immutable), pointers are updated, status
 *      advances to `approved` and then auto-advances to
 *      `client_approval_pending`.
 *   7. Client approval transitions to `client_approved`; both versions
 *      remain readable and the original ai_draft is byte-equal to the
 *      pipeline output (immutability invariant from CLAUDE.md).
 *
 * What's intentionally NOT covered here:
 *   - tRPC layer auth / role checks — covered by router unit tests.
 *   - PDF generation — non-blocking in production; the attorney `approve`
 *     procedure does call generateAndUploadApprovedPdf, but the DB-layer
 *     path used here matches what the production flow ultimately persists.
 *   - Real LLM output quality — mocked here; the Playwright lifecycle test
 *     (e2e/platform/07-full-lifecycle.spec.ts) covers real-AI smoke runs.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { nanoid } from "nanoid";

// vi.hoisted runs before any vi.mock factory or import, so MOCK_LETTER is
// available inside the SDK mocks below. A plain `const` here would be
// initialised AFTER the hoisted mock factories run → ReferenceError at load.
const { MOCK_LETTER } = vi.hoisted(() => ({
  MOCK_LETTER: `Dear Acme Corp,

This is a formal demand letter regarding the breach of contract dated January 15, 2026. Despite multiple written requests, payment of $5,000 remains outstanding for services we delivered as agreed.

We hereby demand full payment of $5,000 within thirty (30) days of receipt of this letter. Failure to comply may result in legal action including, but not limited to, the filing of a small claims case in the Superior Court of California pursuant to California Code of Civil Procedure section 116.221.

Please remit payment to the address listed below within the stated timeframe. We hope to resolve this matter amicably without resorting to litigation.

Sincerely,
Jane Doe
100 Main St
Los Angeles, CA 90001`,
}));

// ── Mock LLM SDKs (must be hoisted ABOVE imports that use them) ────────────
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: MOCK_LETTER }],
        usage: { input_tokens: 120, output_tokens: 480 },
      }),
    };
    constructor(_opts?: unknown) {}
  }
  return { Anthropic, default: Anthropic };
});

vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: MOCK_LETTER } }],
          usage: { prompt_tokens: 120, completion_tokens: 480 },
        }),
      },
    };
    constructor(_opts?: unknown) {}
  }
  return { OpenAI, default: OpenAI };
});

// ── Real imports AFTER mocks are registered ────────────────────────────────
import { runSimplePipeline } from "./pipeline/simple";
import {
  createLetterRequest,
  claimLetterForReview,
  createLetterVersion,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  updateLetterStatus,
  updateLetterVersionPointers,
  logReviewAction,
} from "./db";
import { getDb } from "./db/core";
import {
  users,
  letterRequests,
  letterVersions,
  workflowJobs,
  reviewActions,
  notifications,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Gate the suite on a real DB connection ─────────────────────────────────
// vitest.setup.ts injects a fake DATABASE_URL ("postgresql://test:test@localhost:5432/test")
// when none is set, so we can't just check truthiness on DATABASE_URL. Accept
// any of SUPABASE_DATABASE_URL / SUPABASE_DIRECT_URL / DATABASE_URL, but exclude
// the vitest.setup.ts stub so the suite isn't run against a fake URL.
const VITEST_STUB_DATABASE_URL =
  "postgresql://test:test@localhost:5432/test";
const databaseUrl =
  process.env.SUPABASE_DIRECT_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;
const HAS_REAL_DB = !!(
  databaseUrl && databaseUrl !== VITEST_STUB_DATABASE_URL
);

describe.skipIf(!HAS_REAL_DB)(
  "simple pipeline lifecycle — pipeline → paywall → attorney → client",
  () => {
    let subscriberId = 0;
    let attorneyId = 0;
    let letterId: number | undefined;
    const createdUserIds: number[] = [];
    let originalGeminiKey: string | undefined;

    beforeAll(async () => {
      // Force the Gemini → OpenAI two-stage path off so the simple pipeline
      // takes the Claude → OpenAI path, both of which are mocked above. Without
      // this, an env-configured GEMINI_API_KEY makes a real network call (and
      // can fail on quotas) before falling through to the mocked Anthropic.
      originalGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const db = await getDb();
      expect(db, "DB connection must succeed").toBeTruthy();
      if (!db) return;

      // Fresh users per run — keeps the test hermetic and avoids interfering
      // with seeded accounts. nanoid(8) gives 8 chars of base64 entropy.
      const runId = nanoid(8);

      const [sub] = await db
        .insert(users)
        .values({
          openId: `e2e-simple-sub-${runId}`,
          email: `e2e-simple-sub-${runId}@e2e.test`,
          name: "E2E Simple Pipeline Subscriber",
          role: "subscriber",
          isActive: true,
          emailVerified: true,
          loginMethod: "test",
        })
        .returning({ id: users.id });
      subscriberId = sub.id;
      createdUserIds.push(sub.id);

      const [att] = await db
        .insert(users)
        .values({
          openId: `e2e-simple-att-${runId}`,
          email: `e2e-simple-att-${runId}@e2e.test`,
          name: "E2E Simple Pipeline Attorney",
          role: "attorney",
          isActive: true,
          emailVerified: true,
          loginMethod: "test",
        })
        .returning({ id: users.id });
      attorneyId = att.id;
      createdUserIds.push(att.id);
    }, 30_000);

    afterAll(async () => {
      if (originalGeminiKey !== undefined) {
        process.env.GEMINI_API_KEY = originalGeminiKey;
      }
      const db = await getDb();
      if (!db) return;

      // Order matters: child rows first, then parent.
      if (letterId) {
        await db
          .delete(reviewActions)
          .where(eq(reviewActions.letterRequestId, letterId));
        await db
          .delete(workflowJobs)
          .where(eq(workflowJobs.letterRequestId, letterId));
        await db
          .delete(letterVersions)
          .where(eq(letterVersions.letterRequestId, letterId));
        await db
          .delete(letterRequests)
          .where(eq(letterRequests.id, letterId));
      }
      for (const uid of createdUserIds) {
        await db.delete(notifications).where(eq(notifications.userId, uid));
        await db.delete(users).where(eq(users.id, uid));
      }
    }, 30_000);

    it(
      "runs the complete lifecycle and preserves the ai_draft immutability invariant",
      async () => {
        const db = await getDb();
        expect(db).toBeTruthy();
        if (!db) return;

        // ── 1. SUBMISSION ───────────────────────────────────────────────────
        const intake = {
          letterType: "demand-letter",
          matter: {
            category: "demand-letter",
            subject: "Unpaid invoice — Acme Corp",
          },
          jurisdiction: { state: "California", country: "US" },
          sender: {
            name: "Jane Doe",
            address: "100 Main St, Los Angeles, CA 90001",
          },
          recipient: {
            name: "Acme Corp",
            address: "200 Business Ave, San Francisco, CA 94102",
          },
          desiredOutcome:
            "Full refund of $5,000 plus reasonable attorney fees within 30 days.",
          additionalContext:
            "Defendant failed to deliver contracted services worth $5,000.",
          tonePreference: "firm",
        };

        const created = await createLetterRequest({
          userId: subscriberId,
          letterType: "demand-letter",
          subject: "Unpaid invoice — Acme Corp",
          issueSummary: "Unpaid invoice for $5,000",
          jurisdictionCountry: "US",
          jurisdictionState: "California",
          intakeJson: intake,
          priority: "normal",
        });
        letterId = created.insertId;
        expect(letterId).toBeGreaterThan(0);

        const initial = await getLetterRequestById(letterId);
        expect(initial?.status).toBe("submitted");
        expect(initial?.userId).toBe(subscriberId);

        // ── 2. PIPELINE EXECUTION ───────────────────────────────────────────
        const result = await runSimplePipeline(
          letterId,
          intake as any,
          subscriberId
        );
        expect(result.success).toBe(true);
        expect(result.letter).toContain("Acme Corp");
        expect(result.letter).toContain("$5,000");

        const afterPipeline = await getLetterRequestById(letterId);
        // Non-gated letters (no freePreviewUnlockAt) land in generated_locked.
        expect(afterPipeline?.status).toBe("generated_locked");
        expect(afterPipeline?.currentAiDraftVersionId).toBeTruthy();

        // workflow_jobs row exists and is marked completed
        const jobs = await db
          .select()
          .from(workflowJobs)
          .where(eq(workflowJobs.letterRequestId, letterId));
        expect(jobs.length).toBe(1);
        expect(jobs[0].status).toBe("completed");
        expect(jobs[0].provider).toBe("simple");

        // ── 3. PAYWALL — subscriber view returns truncated ai_draft ─────────
        const subscriberView = await getLetterVersionsByRequestId(
          letterId,
          false,
          afterPipeline?.status,
          afterPipeline
        );
        const aiDraftSub = subscriberView.find(
          (v: any) => v.versionType === "ai_draft"
        );
        expect(aiDraftSub, "subscriber should see the ai_draft row").toBeDefined();
        expect((aiDraftSub as any)?.truncated).toBe(true);
        expect(
          ((aiDraftSub as any)?.content as string).length,
          "truncated content should be shorter than the full mock letter"
        ).toBeLessThan(MOCK_LETTER.length);

        // Admin / internal view returns full content
        const adminView = await getLetterVersionsByRequestId(letterId, true);
        const aiDraftAdmin = adminView.find(
          (v: any) => v.versionType === "ai_draft"
        );
        expect(aiDraftAdmin).toBeDefined();
        expect((aiDraftAdmin as any)?.content).toBe(MOCK_LETTER);

        // ── 4. PAYMENT UNLOCK — generated_locked → pending_review ───────────
        await updateLetterStatus(letterId, "pending_review");
        const afterPay = await getLetterRequestById(letterId);
        expect(afterPay?.status).toBe("pending_review");

        const subscriberViewPaid = await getLetterVersionsByRequestId(
          letterId,
          false,
          afterPay?.status,
          afterPay
        );
        const aiDraftPaid = subscriberViewPaid.find(
          (v: any) => v.versionType === "ai_draft"
        );
        expect((aiDraftPaid as any)?.truncated).toBe(false);
        expect((aiDraftPaid as any)?.content).toBe(MOCK_LETTER);

        // ── 5. ATTORNEY CLAIM ───────────────────────────────────────────────
        await claimLetterForReview(letterId, attorneyId);
        const afterClaim = await getLetterRequestById(letterId);
        expect(afterClaim?.status).toBe("under_review");
        expect(afterClaim?.assignedReviewerId).toBe(attorneyId);

        // ── 6. ATTORNEY APPROVES (creates final_approved, NOT mutating ai_draft) ──
        const FINAL_LETTER =
          MOCK_LETTER.replace("$5,000", "$5,000 (USD)") +
          "\n\nReviewed and approved by counsel.";
        const finalVersion = await createLetterVersion({
          letterRequestId: letterId,
          versionType: "final_approved",
          content: FINAL_LETTER,
          createdByType: "attorney",
          createdByUserId: attorneyId,
          metadataJson: {
            approvedBy: "E2E Simple Pipeline Attorney",
            approvedAt: new Date().toISOString(),
          },
        });
        expect(finalVersion.insertId).toBeGreaterThan(0);
        await updateLetterVersionPointers(letterId, {
          currentFinalVersionId: finalVersion.insertId,
        });
        await updateLetterStatus(letterId, "approved", {
          approvedByRole: "attorney",
        });
        await logReviewAction({
          letterRequestId: letterId,
          reviewerId: attorneyId,
          actorType: "attorney",
          action: "approved",
          fromStatus: "under_review",
          toStatus: "approved",
        });
        // Production auto-advance: approved → client_approval_pending
        await updateLetterStatus(letterId, "client_approval_pending");

        const afterApprove = await getLetterRequestById(letterId);
        expect(afterApprove?.status).toBe("client_approval_pending");
        expect(afterApprove?.currentFinalVersionId).toBe(finalVersion.insertId);
        // ai_draft pointer was NOT clobbered by attorney edit
        expect(afterApprove?.currentAiDraftVersionId).toBe(
          afterPipeline?.currentAiDraftVersionId
        );

        // ── 7. CLIENT APPROVAL ──────────────────────────────────────────────
        await updateLetterStatus(letterId, "client_approved");
        await logReviewAction({
          letterRequestId: letterId,
          reviewerId: subscriberId,
          actorType: "subscriber",
          action: "client_approved",
          fromStatus: "client_approval_pending",
          toStatus: "client_approved",
        });
        const final = await getLetterRequestById(letterId);
        expect(final?.status).toBe("client_approved");

        // ── 8. IMMUTABILITY INVARIANT (CLAUDE.md §1) ────────────────────────
        // The ai_draft version's content must be byte-equal to what the
        // pipeline originally wrote. Attorney edits go to a NEW
        // final_approved version; they must never mutate the ai_draft.
        const finalVersions = await getLetterVersionsByRequestId(
          letterId,
          true
        );
        const finalAiDraft = finalVersions.find(
          (v: any) => v.versionType === "ai_draft"
        );
        const finalFinalApproved = finalVersions.find(
          (v: any) => v.versionType === "final_approved"
        );
        expect(finalAiDraft).toBeDefined();
        expect(finalFinalApproved).toBeDefined();
        expect((finalAiDraft as any)?.content).toBe(MOCK_LETTER);
        expect((finalFinalApproved as any)?.content).toBe(FINAL_LETTER);

        // Both versions show up in subscriber view now that status is past paywall
        const subscriberFinalView = await getLetterVersionsByRequestId(
          letterId,
          false,
          final?.status,
          final
        );
        expect(
          subscriberFinalView.some((v: any) => v.versionType === "final_approved")
        ).toBe(true);
        expect(
          subscriberFinalView.some((v: any) => v.versionType === "ai_draft")
        ).toBe(true);
      },
      60_000
    );
  }
);
