import { createLogger } from "../../logger";

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
