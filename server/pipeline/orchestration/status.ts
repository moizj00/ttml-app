import { updateWorkflowJob } from "../../db";
import { calculateCost } from "../providers";
import type { PipelineContext, VettingResult } from "../../../shared/types";

export async function updatePipelineJobStatus(
  pipelineJobId: number,
  pipelineCtx: PipelineContext,
  vettingResult: VettingResult,
  assemblyRetries: number
) {
  const citationRevalidationTokens = pipelineCtx.citationRevalidationTokens;
  const isDegraded = (pipelineCtx.qualityWarnings?.length ?? 0) > 0;

  await updateWorkflowJob(pipelineJobId, {
    status: "completed",
    completedAt: new Date(),
    promptTokens: citationRevalidationTokens?.promptTokens ?? 0,
    completionTokens: citationRevalidationTokens?.completionTokens ?? 0,
    estimatedCostUsd: citationRevalidationTokens
      ? calculateCost(
          pipelineCtx.citationRevalidationModelKey ??
            "llama-3.3-70b-versatile",
          citationRevalidationTokens
        )
      : "0",
    responsePayloadJson: {
      validationResults: pipelineCtx.validationResults,
      webGrounded: pipelineCtx.webGrounded,
      groundingReport: pipelineCtx.groundingReport,
      consistencyReport: pipelineCtx.consistencyReport,
      vettingReport: vettingResult.vettingReport,
      counterArguments: pipelineCtx.counterArguments,
      assemblyRetries,
      ragExampleCount: pipelineCtx.ragExampleCount ?? 0,
      ragSimilarityScores: pipelineCtx.ragSimilarityScores ?? [],
      ragAbGroup: pipelineCtx.ragAbGroup ?? "test",
      ragInjected: (pipelineCtx.ragExampleCount ?? 0) > 0,
      lessonCount: pipelineCtx.lessonCount ?? 0,
      ...(isDegraded && {
        qualityDegraded: true,
        degradationReasons: pipelineCtx.qualityWarnings,
      }),
    },
  });
}
