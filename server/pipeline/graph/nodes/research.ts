import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import { updateLetterStatus } from "../../../db";
import type { PipelineStateType } from "../state";
import {
  breadcrumb,
  buildLessonsBlock,
  recordTokenUsage,
  type NormalizedIntake,
} from "../memory";

const log = createLogger({ module: "LangGraph:ResearchNode" });

const RESEARCH_TIMEOUT_MS = 90_000;
const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
const PERPLEXITY_MODEL = "sonar";

// ─── Perplexity fetch (direct REST, same pattern as existing research.ts) ───

async function fetchPerplexityResearch(
  ctx: NormalizedIntake,
  letterId: number,
): Promise<{ content: string; provider: string; usage: { promptTokens: number; completionTokens: number } }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const { jurisdiction, letterType, subject, description, desiredOutcome } = ctx;

  const prompt = `Research the following legal matter in ${jurisdiction}:
Letter type: ${letterType}
Subject: ${subject}
Issue: ${description || "See intake data"}
Desired outcome: ${desiredOutcome}

Provide:
1. Relevant laws and statutes for ${jurisdiction}
2. Applicable federal regulations
3. Case law precedents
4. Proper legal citation format
5. Recommended legal approach

Return structured JSON with keys: laws, statutes, precedents, jurisdiction_notes, recommended_approach`;

  const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [
        { role: "system", content: "You are a legal research assistant. Return structured JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      return_citations: true,
    }),
    signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown");
    throw new Error(`Perplexity returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const usage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
  return { content, provider: "perplexity", usage };
}

// ─── Claude fallback for research ───

async function fetchClaudeResearch(
  ctx: NormalizedIntake,
): Promise<{ content: string; provider: string; usage: { promptTokens: number; completionTokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const llm = new ChatAnthropic({
    apiKey,
    model: "claude-3-5-haiku-20241022",
    maxTokens: 2000,
  });

  const { jurisdiction, letterType, subject, description, desiredOutcome } = ctx;

  const result = await llm.invoke(
    [
      new SystemMessage("You are a legal research assistant. Return structured JSON with keys: laws, statutes, precedents, jurisdiction_notes, recommended_approach."),
      new HumanMessage(`Research this ${letterType} letter matter in ${jurisdiction}: ${subject}. Issue: ${description}. Desired outcome: ${desiredOutcome}.`),
    ],
    { signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS) },
  );

  const content = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  // LangChain Anthropic returns usage_metadata on the AIMessage
  const usage = {
    promptTokens: (result as any).usage_metadata?.input_tokens ?? 0,
    completionTokens: (result as any).usage_metadata?.output_tokens ?? 0,
  };
  return { content, provider: "anthropic-fallback", usage };
}

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: research
// ═══════════════════════════════════════════════════════

export async function researchNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const { letterId, sharedContext } = state;
  const ctx = sharedContext.normalized;
  log.info({ letterId, jurisdiction: ctx.jurisdiction, letterType: ctx.letterType }, "[ResearchNode] Starting research stage");

  // Update letter status to 'researching'
  await updateLetterStatus(letterId, "researching");

  let researchContent: string;
  let researchProvider: string;
  let researchUnverified = false;
  let usage = { promptTokens: 0, completionTokens: 0 };

  try {
    // Primary: Perplexity sonar with AbortSignal.timeout
    const result = await fetchPerplexityResearch(ctx, letterId);
    researchContent = result.content;
    researchProvider = result.provider;
    usage = result.usage;
    log.info({ letterId, provider: researchProvider }, "[ResearchNode] Perplexity research succeeded");
  } catch (perplexityErr) {
    const errMsg = perplexityErr instanceof Error ? perplexityErr.message : String(perplexityErr);
    log.warn({ letterId, err: errMsg }, "[ResearchNode] Perplexity failed — falling back to Claude");

    try {
      // Fallback: Claude Haiku (no web grounding)
      const result = await fetchClaudeResearch(ctx);
      researchContent = result.content;
      researchProvider = result.provider;
      researchUnverified = true; // No web grounding
      usage = result.usage;
      log.info({ letterId }, "[ResearchNode] Claude fallback research succeeded (researchUnverified=true)");
    } catch (claudeErr) {
      const claudeMsg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
      log.error({ letterId, err: claudeMsg }, "[ResearchNode] Both Perplexity and Claude failed");
      throw new Error(`Research stage failed: Perplexity: ${errMsg}; Claude: ${claudeMsg}`);
    }
  }

  // Parse research packet
  let researchPacket: Record<string, any>;
  try {
    // Try to extract JSON from the response
    const jsonMatch = researchContent.match(/\{[\s\S]*\}/);
    researchPacket = jsonMatch ? JSON.parse(jsonMatch[0]) : { rawContent: researchContent };
  } catch {
    researchPacket = { rawContent: researchContent };
  }

  return {
    researchPacket,
    researchProvider,
    researchUnverified,
    currentStage: "draft",
    sharedContext: {
      tokenUsage: [
        recordTokenUsage("research", researchProvider, usage.promptTokens, usage.completionTokens),
      ],
      breadcrumbs: [
        breadcrumb(
          "research",
          `Research completed by ${researchProvider} (unverified=${researchUnverified}, tokens=${usage.promptTokens + usage.completionTokens})`,
        ),
      ],
    } as any,
    messages: [
      new HumanMessage(`Research completed by ${researchProvider}. Unverified: ${researchUnverified}`),
    ],
  };
}
