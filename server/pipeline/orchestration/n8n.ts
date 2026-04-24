import { createLogger } from "../../logger";
import { 
  createWorkflowJob, 
  updateWorkflowJob, 
  updateLetterStatus,
  markPriorPipelineRunsSuperseded
} from "../../db";
import { PIPELINE_ERROR_CODES } from "../../../shared/types";
import { formatStructuredError } from "../shared";

const logger = createLogger({ module: "N8nService" });

/**
 * Handles triggering the n8n primary workflow.
 */
export async function triggerN8nWorkflow(params: {
  letterId: number;
  intake: any;
  normalizedInput: any;
  n8nWebhookUrl: string;
  n8nCallbackSecret: string;
}): Promise<{ success: boolean; jobId?: number; message?: string }> {
  const { letterId, intake, normalizedInput, n8nWebhookUrl, n8nCallbackSecret } = params;

  const pipelineJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "generation_pipeline",
    provider: "n8n",
    requestPayloadJson: {
      letterId,
      stages: ["n8n-sonar-research", "n8n-gpt4o-mini-draft", "n8n-gpt4o-mini-assembly", "n8n-sonnet-vetting"],
      normalizedInput,
    },
  });
  
  const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;
  await updateWorkflowJob(pipelineJobId, {
    status: "running",
    startedAt: new Date(),
  });
  await updateLetterStatus(letterId, "researching");

  try {
    logger.info({ letterId, url: n8nWebhookUrl }, "[Pipeline] Triggering n8n workflow");
    const appBaseUrl = process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
    const callbackUrl = `${appBaseUrl}/api/pipeline/n8n-callback`;
    
    const payload = {
      letterId,
      letterType: intake.letterType,
      userId: intake.sender?.name ?? "unknown",
      callbackUrl,
      callbackSecret: n8nCallbackSecret,
      intakeData: {
        sender: intake.sender,
        recipient: intake.recipient,
        jurisdictionState: intake.jurisdiction?.state ?? "",
        jurisdictionCountry: intake.jurisdiction?.country ?? "US",
        matter: intake.matter,
        desiredOutcome: intake.desiredOutcome,
        letterType: intake.letterType,
        tonePreference: intake.tonePreference,
        financials: intake.financials,
        additionalContext: intake.additionalContext,
      },
    };

    // Correct stale webhook URL path if needed
    const resolvedWebhookUrl = n8nWebhookUrl.includes("ttml-legal-pipeline")
      ? n8nWebhookUrl.replace("ttml-legal-pipeline", "legal-letter-submission")
      : n8nWebhookUrl;

    const response = await fetch(resolvedWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": n8nCallbackSecret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s to get acknowledgment
    });

    if (response.ok) {
      const ack = await response.json().catch(() => ({}));
      logger.info({ letterId, ack }, "[Pipeline] n8n acknowledged");
      await updateWorkflowJob(pipelineJobId, {
        status: "running",
        responsePayloadJson: { ack, mode: "n8n-async" },
      });
      return { success: true, jobId: pipelineJobId };
    } else {
      const errText = await response.text().catch(() => "unknown");
      logger.warn({ letterId, status: response.status, errText }, "[Pipeline] n8n returned error — falling back to in-app pipeline");
      await updateWorkflowJob(pipelineJobId, {
        status: "failed",
        errorMessage: formatStructuredError(
          PIPELINE_ERROR_CODES.N8N_ERROR,
          `n8n returned ${response.status}`,
          "pipeline",
          errText
        ),
        completedAt: new Date(),
      });
      return { success: false, message: `n8n error: ${response.status}` };
    }
  } catch (n8nErr) {
    const n8nMsg = n8nErr instanceof Error ? n8nErr.message : String(n8nErr);
    logger.warn({ letterId, err: n8nMsg }, "[Pipeline] n8n call failed — falling back to in-app pipeline");
    return { success: false, message: n8nMsg };
  }
}
