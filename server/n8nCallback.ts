/**
 * n8n Pipeline Callback Handler (Aligned 4-Stage)
 *
 * When the aligned n8n workflow completes, it POSTs structured results to
 * /api/pipeline/n8n-callback. The payload mirrors the in-app 4-stage pipeline:
 *
 *   - researchPacket:  Full ResearchPacket JSON from Stage 1
 *   - draftOutput:     Structured DraftOutput JSON from Stage 2
 *   - assembledLetter: Final polished letter text from Stage 3
 *   - vettedLetter:    Vetted letter text from Stage 4 (anti-hallucination, anti-bloat, jurisdiction accuracy)
 *   - vettingReport:   Structured vetting report from Stage 4
 *
 * STATUS FLOW (must match pipeline.ts exactly):
 *   submitted → researching → drafting → generated_locked
 *
 * The n8n webhook trigger in pipeline.ts sets the letter to "researching".
 * This callback must transition through "drafting" before landing at
 * "generated_locked" to keep both pipelines in sync.
 *
 * If the n8n workflow already ran all 4 stages successfully, we skip the
 * local assembly/vetting stages and store the results directly. If the n8n
 * workflow only produced a flat draftContent (legacy format), we fall back
 * to running the local Claude assembly stage.
 */

import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import {
  createLetterVersion,
  updateLetterStatus,
  updateLetterVersionPointers,
  logReviewAction,
  getLetterRequestById,
  hasLetterBeenPreviouslyUnlocked,
} from "./db";
import { runAssemblyStage, autoAdvanceIfPreviouslyUnlocked } from "./pipeline";
import type { IntakeJson, ResearchPacket, DraftOutput } from "../shared/types";
import { captureServerException } from "./sentry";

interface N8nVettingReport {
  citationsVerified: number;
  citationsRemoved: number;
  citationsFlagged: string[];
  bloatPhrasesRemoved: string[];
  jurisdictionIssues: string[];
  factualIssuesFound: string[];
  changesApplied: string[];
  overallAssessment: string;
  riskLevel: "low" | "medium" | "high";
}

interface N8nCallbackPayload {
  letterId: number;
  success: boolean;
  researchPacket?: ResearchPacket;
  draftOutput?: DraftOutput;
  assembledLetter?: string;
  vettedLetter?: string;
  vettingReport?: N8nVettingReport;
  researchOutput?: string;
  draftContent?: string;
  provider?: string;
  stages?: string[];
  bloatDetected?: number;
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
        vettedLetter,
        vettingReport,
        researchOutput,
        draftContent,
        provider,
        stages,
        bloatDetected,
        error,
      } = payload;

      if (!letterId) {
        res.status(400).json({ error: "letterId is required" });
        return;
      }

      const hasVetting = !!(vettedLetter && vettingReport);
      const isAligned = !!(researchPacket && draftOutput && assembledLetter);
      const providerTag = provider ?? (hasVetting ? "n8n-4stage" : isAligned ? "n8n-3stage" : "n8n-legacy");
      console.log(
        `[n8n Callback] Received for letter #${letterId}, success=${success}, ` +
          `provider=${providerTag}, aligned=${isAligned}, vetted=${hasVetting}, stages=${(stages ?? []).join(",")}`
      );

      res.json({ received: true, letterId, provider: providerTag });

      try {
        const effectiveFinalLetter = vettedLetter || assembledLetter;
        const effectiveDraft =
          effectiveFinalLetter || draftOutput?.draftLetter || draftContent;

        if (!success || !effectiveDraft) {
          const errMsg = error ?? "n8n pipeline returned no content";
          console.error(
            `[n8n Callback] Pipeline failed for letter #${letterId}: ${errMsg}`
          );
          await updateLetterStatus(letterId, "submitted");
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

        await updateLetterStatus(letterId, "drafting");
        await logReviewAction({
          letterRequestId: letterId,
          actorType: "system",
          action: "status_transition",
          noteText: `n8n research complete (${providerTag}). Transitioning to drafting stage.`,
          fromStatus: "researching",
          toStatus: "drafting",
        });

        const draftVersion = await createLetterVersion({
          letterRequestId: letterId,
          versionType: "ai_draft",
          content: effectiveDraft,
          createdByType: "system",
          metadataJson: {
            provider: providerTag,
            stage: hasVetting ? "vetted_final" : isAligned ? "n8n-assembly" : "n8n-pipeline",
            researchSummary:
              researchPacket?.researchSummary ??
              researchOutput?.substring(0, 2000) ??
              undefined,
            attorneyReviewSummary:
              draftOutput?.attorneyReviewSummary ?? undefined,
            openQuestions: draftOutput?.openQuestions ?? undefined,
            riskFlags: draftOutput?.riskFlags ?? undefined,
            stages: stages ?? undefined,
            ...(hasVetting
              ? {
                  vettingReport: vettingReport,
                  bloatDetected: bloatDetected ?? 0,
                }
              : {}),
          },
        });
        const draftVersionId = (draftVersion as any)?.insertId ?? 0;
        await updateLetterVersionPointers(letterId, {
          currentAiDraftVersionId: draftVersionId,
        });

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

        if (hasVetting && vettingReport) {
          console.log(
            `[n8n Callback] Vetted letter stored for letter #${letterId} (risk: ${vettingReport.riskLevel}, changes: ${vettingReport.changesApplied?.length ?? 0}, bloat_removed: ${vettingReport.bloatPhrasesRemoved?.length ?? 0})`
          );
        }

        let assemblyHandledEmails = false;

        if (isAligned || hasVetting) {
          const stageLabel = hasVetting ? "4-stage" : "3-stage";
          console.log(
            `[n8n Callback] Aligned ${stageLabel} complete for letter #${letterId}. Skipping local assembly.`
          );
          await updateLetterStatus(letterId, "generated_locked");
          await logReviewAction({
            letterRequestId: letterId,
            actorType: "system",
            action: "ai_pipeline_completed",
            noteText: `n8n aligned ${stageLabel} pipeline complete (${(stages ?? []).join(" → ")}). ${hasVetting ? `Vetting: risk=${vettingReport!.riskLevel}, bloat_removed=${vettingReport!.bloatPhrasesRemoved?.length ?? 0}, citations_flagged=${vettingReport!.citationsFlagged?.length ?? 0}. ` : ""}Draft ready — awaiting subscriber payment for attorney review.`,
            fromStatus: "drafting",
            toStatus: "generated_locked",
          });
        } else {
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

        if (!assemblyHandledEmails) {
          const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
          if (!wasAlreadyUnlocked) {
            // The initial paywall notification email (10–15 min delay) is handled by
            // the paywallEmailCron job (POST /api/cron/paywall-emails).
            // We do NOT send an immediate email here — the cron picks up the letter
            // once lastStatusChangedAt falls in the 10–15 minute window.
            console.log(
              `[n8n Callback] Letter #${letterId} is generated_locked — paywall email will fire via cron in ~10–15 min`
            );
          } else {
            console.log(
              `[n8n Callback] Skipping paywall email for #${letterId} — previously unlocked`
            );
          }

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
        captureServerException(err instanceof Error ? err : new Error(msg), {
          tags: { component: "n8n_callback", error_type: "post_response_processing_failed" },
          extra: { letterId },
        });
      }
    }
  );
}
