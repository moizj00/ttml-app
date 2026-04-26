import { createLogger } from "../../logger";
import { 
  validateIntakeCompleteness,
} from "../validators";
import { PipelineError, PIPELINE_ERROR_CODES } from "../../../shared/types";
import { buildNormalizedPromptInput } from "../../intake-normalizer";
import type { IntakeJson } from "../../../shared/types";

const logger = createLogger({ module: "PipelinePreflight" });

/**
 * Pre-flight check for API keys needed by the pipeline.
 */
export function preflightApiKeyCheck(stage: "research" | "drafting" | "full"): {
  ok: boolean;
  missing: string[];
  canResearch: boolean;
  canDraft: boolean;
} {
  const missing: string[] = [];
  const hasPerplexity = !!(process.env.PERPLEXITY_API_KEY?.trim());
  const hasOpenAI = !!(process.env.OPENAI_API_KEY?.trim());
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY?.trim());
  const hasGroq = !!(process.env.GROQ_API_KEY?.trim());

  const canResearch = hasPerplexity || hasOpenAI || hasAnthropic || hasGroq;
  const canDraft = hasAnthropic || hasOpenAI || hasGroq;

  if (!canResearch) {
    missing.push("No research provider available (need PERPLEXITY_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY)");
  }
  if ((stage === "drafting" || stage === "full") && !canDraft) {
    missing.push("No drafting provider available (need ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY)");
  }

  const ok = stage === "research" ? canResearch : stage === "drafting" ? canDraft : (canResearch && canDraft);
  return { ok, missing, canResearch, canDraft };
}

/**
 * Validates the intake data and builds the normalized input for the pipeline.
 */
export async function validatePipelinePreflight(
  letterId: number,
  intake: IntakeJson,
  dbFields?: {
    subject: string;
    issueSummary?: string | null;
    jurisdictionCountry?: string | null;
    jurisdictionState?: string | null;
    jurisdictionCity?: string | null;
    letterType: string;
  }
) {
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    logger.error(
      { letterId, errors: intakeCheck.errors },
      "[Pipeline] Intake pre-flight failed"
    );
    throw new PipelineError(
      PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE,
      `Intake validation failed: ${intakeCheck.errors.join("; ")}`,
      "pipeline",
      intakeCheck.errors.join("; ")
    );
  }

  const normalizedInput = buildNormalizedPromptInput(
    dbFields ?? {
      subject: intake.matter?.subject ?? "Legal Matter",
      issueSummary: intake.matter?.description,
      jurisdictionCountry: intake.jurisdiction?.country,
      jurisdictionState: intake.jurisdiction?.state,
      jurisdictionCity: intake.jurisdiction?.city,
      letterType: intake.letterType,
    },
    intake
  );

  logger.info(
    {
      letterId,
      letterType: normalizedInput.letterType,
      jurisdictionState: normalizedInput.jurisdiction.state,
    },
    "[Pipeline] Normalized intake"
  );

  return normalizedInput;
}

