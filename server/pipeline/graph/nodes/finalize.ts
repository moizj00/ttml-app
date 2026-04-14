import { AIMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import { getDb, updateLetterStatus, updateLetterVersionPointers } from "../../../db";
import { letterRequests, letterVersions } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { PipelineStateType } from "../state";

const log = createLogger({ module: "LangGraph:FinalizeNode" });

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: finalize
// Saves the vetted letter as a letter_versions record,
// updates letter_requests with quality flags, and
// transitions status to 'generated_locked'.
// ═══════════════════════════════════════════════════════

export async function finalizeNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const {
    letterId,
    vettedLetter,
    assembledLetter,
    qualityDegraded,
    researchUnverified,
    vettingReport,
    qualityWarnings,
  } = state;

  const finalContent = vettedLetter || assembledLetter;
  log.info({ letterId, chars: finalContent.length, qualityDegraded }, "[FinalizeNode] Saving final letter version");

  const db = await getDb();
  if (!db) {
    throw new Error("[FinalizeNode] Database connection unavailable — cannot finalize letter");
  }

  // Insert letter version (immutable record)
  // actorTypeEnum does not have "ai" — use "system" for AI-generated content
  const [version] = await db
    .insert(letterVersions)
    .values({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: finalContent,
      createdByType: "system",
      metadataJson: {
        vettingReport,
        qualityWarnings,
        researchUnverified,
        qualityDegraded,
        generatedBy: "langgraph-pipeline",
        generatedAt: new Date().toISOString(),
      },
    })
    .returning({ id: letterVersions.id });

  const versionId = version?.id ?? null;

  // Update quality flags first (independent of status transition)
  await db
    .update(letterRequests)
    .set({
      researchUnverified,
      qualityDegraded,
      updatedAt: new Date(),
    })
    .where(eq(letterRequests.id, letterId));

  // Update the version pointer via the canonical helper
  if (versionId !== null) {
    await updateLetterVersionPointers(letterId, { currentAiDraftVersionId: versionId });
  }

  // Transition status via updateLetterStatus() — enforces ALLOWED_TRANSITIONS
  // (drafting → generated_locked is valid per shared/types/letter.ts)
  await updateLetterStatus(letterId, "generated_locked");

  log.info(
    { letterId, versionId, qualityDegraded, researchUnverified },
    "[FinalizeNode] Letter finalized → generated_locked",
  );

  return {
    currentStage: "done",
    messages: [
      new AIMessage(
        `[Finalize] Letter #${letterId} saved as version ${versionId} → generated_locked`,
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: fail
// Called when all retries are exhausted.
// ═══════════════════════════════════════════════════════

export async function failNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const { letterId } = state;
  log.error({ letterId }, "[FailNode] Pipeline exhausted all retries → pipeline_failed");

  await updateLetterStatus(letterId, "pipeline_failed");

  return {
    currentStage: "failed",
    messages: [new AIMessage(`[Fail] Letter #${letterId} → pipeline_failed`)],
  };
}
