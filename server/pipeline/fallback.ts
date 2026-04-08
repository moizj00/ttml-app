/**
 * Pipeline fallback and auto-advance helpers.
 *
 * Responsibilities:
 *  - bestEffortFallback   — deliver a degraded draft after all retries are exhausted
 *  - autoAdvanceIfPreviouslyUnlocked — skip the paywall for letters already paid/unlocked
 *  - FALLBACK_EXCLUDED_CODES — error codes that must never produce a degraded draft
 *
 * These functions were extracted from pipeline/orchestrator.ts to keep the
 * orchestrator focused on the main pipeline execution flow.
 *
 * Callers:
 *  - server/worker.ts calls bestEffortFallback after retry exhaustion
 *  - orchestrator.ts (main pipeline) and worker.ts call autoAdvanceIfPreviouslyUnlocked
 *    after the generated_locked milestone
 */

import {
  updateLetterStatus,
  hasLetterBeenPreviouslyUnlocked,
  isUserFirstLetterEligible,
  getLetterRequestById as getLetterById,
  getAllUsers,
  getUserById,
  logReviewAction,
  setLetterQualityDegraded,
  getLatestResearchRun,
  createLetterVersion,
  updateLetterVersionPointers,
  createNotification,
  notifyAllAttorneys,
} from "../db";
import type { IntakeJson } from "../../shared/types";
import { PIPELINE_ERROR_CODES } from "../../shared/types";
import { sendLetterReadyEmail, sendStatusUpdateEmail, sendAdminAlertEmail } from "../email";
import { captureServerException } from "../sentry";

// ═══════════════════════════════════════════════════════
// FALLBACK EXCLUDED ERROR CODES
// ═══════════════════════════════════════════════════════

/**
 * Codes that should stop delivery entirely — never produce a degraded draft.
 * Per product spec:
 *   - CONTENT_POLICY_VIOLATION / API_KEY_MISSING — permanent blockers
 *   - INTAKE_INCOMPLETE — cannot generate without data
 *
 * NOTE: RATE_LIMITED is intentionally excluded from this set. With the model
 * failover system in place, a RATE_LIMITED error means BOTH the primary and
 * backup models were exhausted. In this case we still deliver a degraded draft
 * (best-effort fallback) rather than treating it as completely fatal.
 */
export const FALLBACK_EXCLUDED_CODES: ReadonlySet<string> = new Set([
  PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION,
  PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
  PIPELINE_ERROR_CODES.API_KEY_MISSING,
]);

// ═══════════════════════════════════════════════════════
// BEST-EFFORT FALLBACK
// ═══════════════════════════════════════════════════════

/**
 * Attempt to deliver a degraded draft after all pipeline retries are exhausted.
 * Returns true if a degraded draft was saved and status set to generated_locked,
 * false if no usable content was found.
 *
 * MUST only be called by the worker after retry exhaustion, never on the first attempt.
 */
export async function bestEffortFallback(opts: {
  letterId: number;
  intake: IntakeJson;
  intermediateDraftContent?: string;
  qualityWarnings?: string[];
  pipelineErrorCode: string;
  errorMessage: string;
  dbFields?: { subject?: string; jurisdictionState?: string | null };
}): Promise<boolean> {
  const { letterId, intake, intermediateDraftContent, qualityWarnings, pipelineErrorCode, errorMessage, dbFields } = opts;

  if (FALLBACK_EXCLUDED_CODES.has(pipelineErrorCode)) {
    console.warn(
      `[Pipeline] Fallback excluded for letter #${letterId}: error code ${pipelineErrorCode} is fail-stop`
    );
    return false;
  }

  // Guard: skip fallback entirely if the letter has already progressed past generated_locked
  const postGeneratedStatuses = new Set([
    "generated_unlocked",
    "pending_review", "under_review", "approved", "needs_changes",
    "client_approval_pending", "client_approved",
    "client_revision_requested", "client_declined", "sent", "rejected",
  ]);
  try {
    const currentLetter = await getLetterById(letterId);
    if (currentLetter?.status && postGeneratedStatuses.has(currentLetter.status)) {
      console.warn(
        `[Pipeline] bestEffortFallback: letter #${letterId} is already at status "${currentLetter.status}" — skipping fallback entirely`
      );
      return true;
    }
  } catch (statusCheckErr) {
    console.warn(`[Pipeline] bestEffortFallback: failed to check current status for letter #${letterId}, proceeding with fallback:`, statusCheckErr);
  }

  console.warn(`[Pipeline] Attempting best-effort draft fallback for letter #${letterId} (error: ${pipelineErrorCode})`);

  try {
    let fallbackContent: string | null = null;
    let fallbackSource = "unknown";

    // 1. In-memory content captured progressively as stages completed
    if (intermediateDraftContent) {
      fallbackContent = intermediateDraftContent;
      fallbackSource = "in_memory_intermediate";
    }

    // 2. Previously-persisted ai_draft version via currentAiDraftVersionId pointer
    if (!fallbackContent) {
      const { getLetterVersionById, getLetterVersionsByRequestId } = await import("../db");
      const letterRecord = await getLetterById(letterId);
      if (letterRecord?.currentAiDraftVersionId) {
        try {
          const existingVersion = await getLetterVersionById(letterRecord.currentAiDraftVersionId);
          if (existingVersion?.content) {
            fallbackContent = existingVersion.content;
            fallbackSource = "db_ai_draft_pointer";
          }
        } catch {
          // ignore
        }
      }

      // 3. Scan all versions for any usable content
      if (!fallbackContent) {
        try {
          const allVersions = await getLetterVersionsByRequestId(letterId, true);
          const candidate = allVersions.find(v => v.content && v.content.length > 50);
          if (candidate?.content) {
            fallbackContent = candidate.content;
            fallbackSource = `db_version_${candidate.versionType}`;
          }
        } catch {
          // ignore
        }
      }

      // 4. Last resort: synthesize a skeleton from the research packet
      // Ensures delivery even when drafting never produced text
      if (!fallbackContent) {
        try {
          const researchRun = await getLatestResearchRun(letterId);
          const researchResult = researchRun?.resultJson as Record<string, unknown> | null;
          if (researchResult?.researchSummary) {
            const subject = dbFields?.subject ?? intake.matter?.subject ?? "Legal Matter";
            const jurisdiction = dbFields?.jurisdictionState ?? intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "Your Jurisdiction";
            const issues = (researchResult.issuesIdentified as string[] | undefined)?.slice(0, 5) ?? [];
            const rules = (researchResult.applicableRules as Array<{ ruleTitle?: string; citationText?: string }> | undefined)?.slice(0, 3) ?? [];
            const skeleton = [
              `RE: ${subject}`,
              "",
              `Dear [Recipient],`,
              "",
              `I am writing regarding the matter described above. This draft was generated by our system based on legal research for ${jurisdiction} jurisdiction and requires thorough attorney review before use.`,
              "",
              `LEGAL RESEARCH SUMMARY`,
              "─".repeat(40),
              String(researchResult.researchSummary),
              "",
              issues.length > 0 ? `KEY ISSUES IDENTIFIED\n${"─".repeat(40)}\n${issues.map((i, n) => `${n + 1}. ${i}`).join("\n")}` : "",
              "",
              rules.length > 0 ? `APPLICABLE LEGAL STANDARDS\n${"─".repeat(40)}\n${rules.map(r => `• ${r.ruleTitle ?? ""}: ${r.citationText ?? ""}`).join("\n")}` : "",
              "",
              `[ATTORNEY NOTE: This is a research-based skeleton draft produced via best-effort fallback. Full drafting did not complete. The research above is accurate, but the letter body must be written by the reviewing attorney.]`,
              "",
              `Sincerely,`,
              `[Sender Name]`,
            ].filter(line => line !== "").join("\n");
            fallbackContent = skeleton;
            fallbackSource = "research_skeleton";
          }
        } catch {
          // ignore — no research fallback available
        }
      }
    }

    if (!fallbackContent) {
      console.warn(`[Pipeline] No fallback content found for letter #${letterId} — cannot produce degraded draft`);
      return false;
    }

    const degradationReasons = [
      `Pipeline failed after all retries with error: ${pipelineErrorCode} — ${errorMessage}`,
      ...(qualityWarnings ?? []),
    ];
    console.warn(
      `[Pipeline] Saving degraded draft for letter #${letterId} (source: ${fallbackSource}, ${degradationReasons.length} reason(s))`
    );

    await setLetterQualityDegraded(letterId, true);

    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: fallbackContent,
      createdByType: "system",
      metadataJson: {
        provider: "anthropic",
        stage: "best_effort_fallback",
        fallbackSource,
        qualityDegraded: true,
        degradationReasons,
        pipelineErrorCode,
        wordCount: fallbackContent.split(/\s+/).filter(w => w.length > 0).length,
      },
    });
    const versionId = (version as any)?.insertId ?? 0;
    await updateLetterVersionPointers(letterId, { currentAiDraftVersionId: versionId });

    await updateLetterStatus(letterId, "generated_locked", { force: true });
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "ai_pipeline_completed",
      noteText: `Draft produced via best-effort fallback after all retries exhausted (${pipelineErrorCode}). Quality flags raised — attorney scrutiny required. Degradation reasons: ${degradationReasons.join("; ")}`,
      noteVisibility: "internal",
      fromStatus: "drafting",
      toStatus: "generated_locked",
    });

    // Notify admins
    try {
      const admins = await getAllUsers("admin");
      const appBaseUrl = process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
      for (const admin of admins) {
        if (admin.email) {
          sendAdminAlertEmail({
            to: admin.email,
            name: admin.name ?? "Admin",
            subject: `Degraded draft produced for letter #${letterId}`,
            preheader: `Quality fallback triggered after retry exhaustion — attorney review required`,
            bodyHtml: `<p>Letter #${letterId} was produced via best-effort fallback after all pipeline retries were exhausted (error: <strong>${pipelineErrorCode}</strong>).</p><p>Degradation reasons:</p><ul>${degradationReasons.map(r => `<li>${r}</li>`).join("")}</ul><p>The draft is now in <strong>generated_locked</strong> status awaiting subscriber unlock and attorney review.</p>`,
            ctaText: "View Letter",
            ctaUrl: `${appBaseUrl}/admin/letters/${letterId}`,
          }).catch(e => console.error(`[Pipeline] Failed to send degraded-draft admin email for #${letterId}:`, e));
        }
        createNotification({
          userId: admin.id,
          type: "quality_alert",
          category: "letters",
          title: `Degraded draft: letter #${letterId}`,
          body: `Pipeline error (${pipelineErrorCode}) after retries exhausted — best-effort fallback used. Attorney scrutiny needed.`,
          link: `/admin/letters/${letterId}`,
        }).catch(e => console.error(`[Pipeline] Failed to create degraded-draft notification for #${letterId}:`, e));
      }
    } catch (notifyErr) {
      console.error(`[Pipeline] Failed to notify admins of degraded draft for #${letterId}:`, notifyErr);
    }

    // Send subscriber "letter ready" email
    try {
      const letterRecord = await getLetterById(letterId);
      const wasAlreadyUnlocked = letterRecord ? await hasLetterBeenPreviouslyUnlocked(letterId) : false;
      if (letterRecord && !wasAlreadyUnlocked && letterRecord.userId != null) {
        const subscriber = await getUserById(letterRecord.userId);
        if (subscriber?.email) {
          const isFirstLetter = !wasAlreadyUnlocked && await isUserFirstLetterEligible(letterRecord.userId!);
          sendLetterReadyEmail({
            to: subscriber.email,
            name: subscriber.name ?? "Subscriber",
            subject: letterRecord.subject,
            letterId,
            appUrl: process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com",
            letterType: letterRecord.letterType ?? undefined,
            jurisdictionState: letterRecord.jurisdictionState ?? undefined,
            isFirstLetter,
          }).catch(e => console.error(`[Pipeline] Failed to send letter-ready email for fallback #${letterId}:`, e));
        }
      }
    } catch (emailErr) {
      console.error(`[Pipeline] Failed to send subscriber email for fallback draft #${letterId}:`, emailErr);
    }

    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch {
      // non-fatal
    }

    return true;
  } catch (fallbackErr) {
    console.error(`[Pipeline] Best-effort fallback failed for letter #${letterId}:`, fallbackErr);
    captureServerException(fallbackErr, {
      tags: { pipeline_stage: "best_effort_fallback", letter_id: String(letterId) },
    });
    return false;
  }
}

// ═══════════════════════════════════════════════════════
// AUTO-ADVANCE (previously unlocked letters skip paywall)
// ═══════════════════════════════════════════════════════

/**
 * If a letter has been previously unlocked (paid or free-trial), automatically
 * advance it from generated_locked → pending_review so it goes straight to
 * attorney review without requiring the subscriber to pay again.
 *
 * Admin-submitted letters bypass billing entirely and are always advanced.
 *
 * Returns true if the status was advanced, false if it was left at generated_locked.
 */
export async function autoAdvanceIfPreviouslyUnlocked(
  letterId: number
): Promise<boolean> {
  const letterRecord = await getLetterById(letterId);
  if (letterRecord?.submittedByAdmin) {
    console.log(
      `[Pipeline] Letter #${letterId} generated_locked → pending_review (admin-submitted, billing bypassed)`
    );
    try {
      await updateLetterStatus(letterId, "pending_review");
    } catch (statusErr) {
      const errMsg = statusErr instanceof Error ? statusErr.message : String(statusErr);
      console.warn(`[Pipeline] autoAdvanceIfPreviouslyUnlocked: status update race for admin-submitted letter #${letterId} — ${errMsg}. Skipping.`);
      return false;
    }
    await logReviewAction({
      letterRequestId: letterId,
      actorType: "system",
      action: "auto_unlock",
      noteText:
        "Admin-submitted letter — automatically advanced to pending_review (billing bypassed).",
      noteVisibility: "internal",
      fromStatus: "generated_locked",
      toStatus: "pending_review",
    });
    const appBaseUrl = process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
    notifyAllAttorneys({
      letterId,
      letterSubject: letterRecord.subject,
      letterType: letterRecord.letterType,
      jurisdiction: letterRecord.jurisdictionState ?? "Unknown",
      appUrl: appBaseUrl,
    }).catch(err => console.error(`[Pipeline] Failed to notify attorneys for admin-submitted letter #${letterId}:`, err));
    return true;
  }

  const wasUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
  if (!wasUnlocked) {
    console.log(
      `[Pipeline] Letter #${letterId} has not been previously unlocked — staying at generated_locked`
    );
    return false;
  }

  console.log(
    `[Pipeline] Letter #${letterId} generated_locked → pending_review (previously unlocked, auto-advance after re-pipeline)`
  );
  try {
    await updateLetterStatus(letterId, "pending_review");
  } catch (statusErr) {
    const errMsg = statusErr instanceof Error ? statusErr.message : String(statusErr);
    console.warn(`[Pipeline] autoAdvanceIfPreviouslyUnlocked: status update race for letter #${letterId} — ${errMsg}. Skipping.`);
    return false;
  }
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "auto_unlock",
    noteText:
      "Letter was previously unlocked (paid/free). Automatically advanced to pending_review after re-pipeline.",
    noteVisibility: "user_visible",
    fromStatus: "generated_locked",
    toStatus: "pending_review",
  });

  if (letterRecord) {
    const appBaseUrl =
      process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
    const subscriber = letterRecord.userId != null ? await getUserById(letterRecord.userId) : null;
    if (subscriber?.email) {
      sendStatusUpdateEmail({
        to: subscriber.email,
        name: subscriber.name ?? "Subscriber",
        subject: letterRecord.subject,
        letterId,
        newStatus: "pending_review",
        appUrl: appBaseUrl,
      }).catch(err =>
        console.error(
          `[Pipeline] Failed to send pending_review email for #${letterId}:`,
          err
        )
      );
    }
    // Notify all attorneys (email + in-app) via centralized helper
    notifyAllAttorneys({
      letterId,
      letterSubject: letterRecord.subject,
      letterType: letterRecord.letterType,
      jurisdiction: letterRecord.jurisdictionState ?? "Unknown",
      appUrl: appBaseUrl,
    }).catch(err =>
      console.error(`[Pipeline] Failed to notify attorneys for #${letterId}:`, err)
    );
  }

  return true;
}
