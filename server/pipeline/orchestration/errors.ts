import { 
  updateWorkflowJob,
  updateLetterStatus,
} from "../../db";
import { captureServerException } from "../../sentry";
import { 
  formatStructuredError, 
  classifyErrorCode 
} from "../shared";
import { PipelineError } from "../../../shared/types";
import { createLogger } from "../../logger";

const logger = createLogger({ module: "PipelineErrorHandler" });

export async function handlePipelineError(
  letterId: number,
  pipelineJobId: number,
  err: unknown
) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ letterId, err: msg }, "[Pipeline] Full pipeline failed");
  
  captureServerException(err, {
    tags: { pipeline_stage: "full_pipeline", letter_id: String(letterId) },
    extra: { pipelineJobId, errorMessage: msg },
  });

  const pipelineErrCode =
    err instanceof PipelineError ? err.code : classifyErrorCode(err);

  await Promise.all([
    updateWorkflowJob(pipelineJobId, {
      status: "failed",
      errorMessage: formatStructuredError(pipelineErrCode, msg, "pipeline"),
      completedAt: new Date(),
    }),
    updateLetterStatus(letterId, "submitted"),
  ]);

  if (err instanceof PipelineError) {
    throw err;
  }
  throw new PipelineError(pipelineErrCode, msg, "pipeline");
}
