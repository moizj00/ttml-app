/**
 * n8n Pipeline Callback Handler (Aligned 3-Stage)
 *
 * When the aligned n8n workflow completes, it POSTs structured results to
 * /api/pipeline/n8n-callback. The payload now mirrors the in-app pipeline:
 *
 *   - researchPacket: Full ResearchPacket JSON from Stage 1
 *   - draftOutput:    Structured DraftOutput JSON from Stage 2
 *   - assembledLetter: Final polished letter text from Stage 3
 *
 * STATUS FLOW (must match pipeline.ts exactly):
 *   submitted → researching → drafting → generated_locked
 *
 * The n8n webhook trigger in pipeline.ts sets the letter to "researching".
 * This callback must transition through "drafting" before landing at
 * "generated_locked" to keep both pipelines in sync.
 *
 * If the n8n workflow already ran all 3 stages successfully, we skip the
 * local assembly stage and store the results directly. If the n8n workflow
 * only produced a flat draftContent (legacy format), we fall back to running
 * the local Claude assembly stage.
 */

import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import {
  createLetterVersion,
  updateLetterStatus,
  updateLetterVersionPointers,
  logReviewAction,
  getLetterRequestById,
  getUserById,
  hasLetterBeenPreviouslyUnlocked,
} from "./db";
import { runAssemblyStage, autoAdvanceIfPreviouslyUnlocked } from "./pipeline";
import type { IntakeJson, ResearchPacket, DraftOutput } from "../shared/types";
import { sendLetterReadyEmail } from "./email";

interface N8nCallbackPayload {
  letterId: number;
  success: boolean;
  // ── Aligned 3-stage structured data ──
  researchPacket?: ResearchPacket;
  draftOutput?: DraftOutput;
  assembledLetter?: string;
  // ── Legacy flat fields (backward compat) ──
  researchOutput?: string;
  draftContent?: string;
  // ── Metadata ──
  provider?: string;
  stages?: string[];
  error?: string;
}

/** App base URL — canonical production domain */
function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
}

export function registerN8nCallbackRoute(app: Express): void {
  app.post(
    "/api/pipeline/n8n-callback",
    async (req: Request, res: Response) => {
      const callbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";

      // Validate the callback secret using timing-safe comparison to prevent
      // timing side-channel attacks. Fail loudly if the secret is not configured.
      if (!callbackSecret) {
        console.error(
          "[n8n Callback] N8N_CALLBACK_SECRET is not configured — refusing all requests"
        );
        res.status(503).json({ error: "Service not configured" });
        return;
      }
      const incomingSecret =
        (req.headers["x-ttml-callback-secret"] as string) ?? "";
      if (!incomingSecret) {
        console.warn("[n8n Callback] Missing callback secret header");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const secretBuf = Buffer.from(callbackSecret);
      const incomingBuf = Buffer.from(incomingSecret);
      if (
        secretBuf.length !== incomingBuf.length ||
        !timingSafeEqual(secretBuf, incomingBuf)
      ) {
        console.warn("[n8n Callback] Invalid callback secret");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const payload = req.body as N8nCallbackPayload;
      const {
        letterId,
        success,
        researchPacket,
        draftOutput,
        assembledLetter,
        researchOutput,
        draftContent,
        provider,
        stages,
        error,
      } = payload;

      if (!letterId) {
        res.status(400).json({ error: "letterId is required" });
        return;
      }

      const isAligned = !!(researchPacket && draftOutput && assembledLetter);
      const providerTag = provider ?? (isAligned ? "n8n-3stage" : "n8n-legacy");
      console.log(
        `[n8n Callback] Received for letter #${letterId}, success=${success}, ` +
          `provider=${providerTag}, aligned=${isAligned}, stages=${(stages ?? []).join(",")}`
      );

      // Acknowledge immediately
      res.json({ received: true, letterId, provider: providerTag });

      // Process asynchronously
      try {
        // Determine the effective draft content
        const effectiveDraft =
          assembledLetter || draftOutput?.draftLetter || draftContent;

        if (!success || !effectiveDraft) {
          const errMsg = error ?? "n8n pipeline returned no content";
          console.error(
            `[n8n Callback] Pipeline failed for letter #${letterId}: ${errMsg}`
          );
          await updateLetterStatus(letterId, "submitted"); // revert to allow retry
          await logReviewAction({
            letterRequestId: letterId,
            actorType: "system",
            action: "pipeline_failed",
            noteText: `n8n pipeline failed (${providerTag}): ${errMsg}`,
            fromStatus: "researching",
            toStatus: "submitted",
          });
          return;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // STATUS SYNC: Transition through "drafting" before "generated_locked"
        //
        // pipeline.ts sets "researching" when it fires the n8n webhook.
        // Now we must go through "drafting" to match the direct pipeline flow:
        //   researching → drafting → generated_locked
        // ═══════════════════════════════════════════════════════════════════════
        await updateLetterStatus(letterId, "drafting");
        await logReviewAction({
          letterRequestId: letterId,
          actorType: "system",
          action: "status_transition",
          noteText: `n8n research complete (${providerTag}). Transitioning to drafting stage.`,
          fromStatus: "researching",
          toStatus: "drafting",
        });

        // ── Store the AI draft version ──────────────────────────────
        const draftVersion = await createLetterVersion({
          letterRequestId: letterId,
          versionType: "ai_draft",
          content: effectiveDraft,
          createdByType: "system",
          metadataJson: {
            provider: providerTag,
            stage: isAligned ? "n8n-assembly" : "n8n-pipeline",
            researchSummary:
              researchPacket?.researchSummary ??
              researchOutput?.substring(0, 2000) ??
              undefined,
            attorneyReviewSummary:
              draftOutput?.attorneyReviewSummary ?? undefined,
            openQuestions: draftOutput?.openQuestions ?? undefined,
            riskFlags: draftOutput?.riskFlags ?? undefined,
            stages: stages ?? undefined,
          },
        });
        const draftVersionId = (draftVersion as any)?.insertId ?? 0;
        await updateLetterVersionPointers(letterId, {
          currentAiDraftVersionId: draftVersionId,
        });

        // ── Store research version if we have structured research ──
        if (researchPacket?.researchSummary) {
          try {
            await createLetterVersion({
              letterRequestId: letterId,
              versionType: "ai_draft",
              content: researchPacket.researchSummary,
              createdByType: "system",
              metadataJson: {
                provider: providerTag,
                stage: "research",
                researchPacket: {
                  jurisdictionProfile: researchPacket.jurisdictionProfile,
                  issuesIdentified: researchPacket.issuesIdentified,
                  applicableRulesCount:
                    researchPacket.applicableRules?.length ?? 0,
                  riskFlags: researchPacket.riskFlags,
                  draftingConstraints: researchPacket.draftingConstraints,
                  // n8n may send extended fields not in the TS interface — store them as-is
                  ...((researchPacket as any).recentCasePrecedents
                    ? {
                        recentCasePrecedentsCount: (researchPacket as any)
                          .recentCasePrecedents.length,
                      }
                    : {}),
                  ...((researchPacket as any).statuteOfLimitations
                    ? {
                        statuteOfLimitations: (researchPacket as any)
                          .statuteOfLimitations,
                      }
                    : {}),
                  ...((researchPacket as any).preSuitRequirements
                    ? {
                        preSuitRequirements: (researchPacket as any)
                          .preSuitRequirements,
                      }
                    : {}),
                },
              },
            });
            console.log(
              `[n8n Callback] Research version stored for letter #${letterId}`
            );
          } catch (researchErr) {
            console.warn(
              `[n8n Callback] Failed to store research version for #${letterId}:`,
              researchErr
            );
          }
        }

        // ── Decide: skip local assembly or run it ─────────────────
        // Track whether runAssemblyStage was called (it handles its own
        // letter-ready email and status transition internally).
        let assemblyHandledEmails = false;

        if (isAligned) {
          // n8n already ran all 3 stages — skip local assembly, go straight to generated_locked
          console.log(
            `[n8n Callback] Aligned 3-stage complete for letter #${letterId}. Skipping local assembly.`
          );
          await updateLetterStatus(letterId, "generated_locked");
          await logReviewAction({
            letterRequestId: letterId,
            actorType: "system",
            action: "ai_pipeline_completed",
            noteText: `n8n aligned 3-stage pipeline complete (${(stages ?? []).join(" → ")}). Draft ready — awaiting subscriber payment for attorney review.`,
            fromStatus: "drafting",
            toStatus: "generated_locked",
          });
        } else {
          // Legacy n8n output — run local Claude assembly to polish
          console.log(
            `[n8n Callback] Legacy n8n output for letter #${letterId}. Running local assembly stage.`
          );
          const letter = await getLetterRequestById(letterId);
          if (letter?.intakeJson) {
            try {
              const intake = letter.intakeJson as IntakeJson;

              const research: ResearchPacket = researchPacket ?? {
                researchSummary:
                  researchOutput ??
                  "Research completed by n8n Perplexity agent.",
                jurisdictionProfile: {
                  country: intake.jurisdiction?.country ?? "US",
                  stateProvince: intake.jurisdiction?.state ?? "",
                  city: intake.jurisdiction?.city ?? "",
                  authorityHierarchy: ["Federal", "State", "Local"],
                },
                issuesIdentified: [
                  intake.matter?.description?.substring(0, 200) ??
                    "Legal matter",
                ],
                applicableRules: [
                  {
                    ruleTitle: "n8n Research Findings",
                    ruleType: "statute",
                    jurisdiction: intake.jurisdiction?.state ?? "",
                    citationText: "See research summary",
                    sectionOrRule: "N/A",
                    summary: (researchOutput ?? "").substring(0, 500),
                    sourceUrl: "",
                    sourceTitle: "n8n Perplexity Research",
                    relevance: "Primary research from n8n pipeline",
                    confidence: "medium" as const,
                  },
                ],
                localJurisdictionElements: [],
                factualDataNeeded: [],
                openQuestions: [],
                riskFlags: [],
                draftingConstraints: [],
              };

              const draft: DraftOutput = draftOutput ?? {
                draftLetter: draftContent ?? "",
                attorneyReviewSummary:
                  "Draft generated by n8n pipeline (Perplexity + GPT-4o). Please review carefully.",
                openQuestions: [],
                riskFlags: [],
              };

              // Stage 3: Claude polishes the n8n draft
              // NOTE: runAssemblyStage handles its own status transition to
              // generated_locked AND its own letter-ready email logic
              await runAssemblyStage(letterId, intake, research, draft);
              assemblyHandledEmails = true;
              console.log(
                `[n8n Callback] Local assembly complete for letter #${letterId}`
              );
            } catch (assemblyErr) {
              const assemblyMsg =
                assemblyErr instanceof Error
                  ? assemblyErr.message
                  : String(assemblyErr);
              console.warn(
                `[n8n Callback] Local assembly failed for letter #${letterId}: ${assemblyMsg}. Using n8n draft as final.`
              );

              await updateLetterStatus(letterId, "generated_locked");
              await logReviewAction({
                letterRequestId: letterId,
                actorType: "system",
                action: "ai_pipeline_completed",
                noteText: `n8n pipeline complete (${providerTag}). Local assembly skipped. Draft ready — awaiting subscriber payment for attorney review.`,
                fromStatus: "drafting",
                toStatus: "generated_locked",
              });
            }
          } else {
            await updateLetterStatus(letterId, "generated_locked");
            await logReviewAction({
              letterRequestId: letterId,
              actorType: "system",
              action: "ai_pipeline_completed",
              noteText: `n8n pipeline complete (${providerTag}). Draft ready — awaiting subscriber payment for attorney review.`,
              fromStatus: "drafting",
              toStatus: "generated_locked",
            });
          }
        }

        // ── Send "letter ready" email + auto-unlock (only if runAssemblyStage
        // did NOT already handle these — it has the same logic internally) ──
        if (!assemblyHandledEmails) {
          const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
          if (!wasAlreadyUnlocked) {
            try {
              const letterRecord = await getLetterRequestById(letterId);
              if (letterRecord) {
                const subscriber = await getUserById(letterRecord.userId);
                const appBaseUrl = getAppBaseUrl();
                if (subscriber?.email) {
                  await sendLetterReadyEmail({
                    to: subscriber.email,
                    name: subscriber.name ?? "Subscriber",
                    subject: letterRecord.subject,
                    letterId,
                    appUrl: appBaseUrl,
                    letterType: letterRecord.letterType ?? undefined,
                    jurisdictionState: letterRecord.jurisdictionState ?? undefined,
                  });
                  console.log(
                    `[n8n Callback] Letter-ready email sent to ${subscriber.email} for letter #${letterId}`
                  );
                }
              }
            } catch (emailErr) {
              console.error(
                `[n8n Callback] Failed to send letter-ready email for #${letterId}:`,
                emailErr
              );
            }
          } else {
            console.log(
              `[n8n Callback] Skipping letter-ready (paywall) email for #${letterId} — previously unlocked`
            );
          }

          // ── Auto-unlock: if the letter was previously unlocked (paid/free),
          // skip generated_locked and go straight to pending_review ──
          try {
            await autoAdvanceIfPreviouslyUnlocked(letterId);
          } catch (autoUnlockErr) {
            console.error(
              `[n8n Callback] Auto-unlock check failed for #${letterId}:`,
              autoUnlockErr
            );
          }
        }

        console.log(
          `[n8n Callback] Processing complete for letter #${letterId} (${providerTag})`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[n8n Callback] Error processing callback for letter #${letterId}:`,
          msg
        );
      }
    }
  );
}
