import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import type { PipelineStateType } from "../state";
import { breadcrumb, buildLessonsBlock, recordTokenUsage } from "../memory";

const log = createLogger({ module: "LangGraph:AssemblyNode" });

const ASSEMBLY_TIMEOUT_MS = 90_000;

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: assembly
// Polishes the initial draft — checks citations, tightens
// language, ensures jurisdiction compliance.
//
// Reads derived values from `sharedContext.normalized` (single
// source of truth) and appends its own token-usage entry to the
// shared memory so finalize can report aggregated costs.
// ═══════════════════════════════════════════════════════

export async function assemblyNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const { letterId, assembledLetter, researchPacket, sharedContext } = state;
  const ctx = sharedContext.normalized;
  const lessons = sharedContext.lessons ?? [];
  log.info({ letterId, jurisdiction: ctx.jurisdiction }, "[AssemblyNode] Starting assembly stage");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — assembly stage cannot proceed");

  const llm = new ChatAnthropic({
    apiKey,
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 4000,
  });

  const researchSummary = researchPacket
    ? `Laws & statutes: ${JSON.stringify(researchPacket.laws ?? researchPacket.statutes ?? "N/A")}`
    : "No research packet available.";
  const lessonsBlock = buildLessonsBlock(lessons);

  const systemPrompt = `You are an expert legal editor. Your task is to refine and polish a legal letter draft.

Quality standards:
1. Verify all legal citations are properly formatted for ${ctx.jurisdiction}
2. Ensure factual accuracy — flag any unsupported claims
3. Improve clarity, flow, and professional tone
4. Verify that the letter is persuasive and achieves the stated outcome
5. Fix any grammatical or formatting issues

Return ONLY the improved letter text. Do not include commentary or explanations.${lessonsBlock}`;

  const userPrompt = `Please refine this legal letter draft.

Research context:
${researchSummary}

Draft to refine:
${assembledLetter}

Jurisdiction: ${ctx.jurisdiction}
Letter type: ${ctx.letterType}
Desired outcome: ${ctx.desiredOutcome}`;

  const result = await llm.invoke(
    [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ],
    { signal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS) },
  );

  const refinedContent = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  const promptTokens = (result as any).usage_metadata?.input_tokens ?? 0;
  const completionTokens = (result as any).usage_metadata?.output_tokens ?? 0;

  log.info({ letterId, chars: refinedContent.length, promptTokens, completionTokens }, "[AssemblyNode] Assembly completed");

  return {
    assembledLetter: refinedContent,
    currentStage: "vetting",
    sharedContext: {
      tokenUsage: [
        recordTokenUsage("assembly", "anthropic", promptTokens, completionTokens, "claude-3-5-sonnet-20241022"),
      ],
      breadcrumbs: [
        breadcrumb(
          "assembly",
          `Refined letter (${refinedContent.length} chars, tokens=${promptTokens + completionTokens})`,
        ),
      ],
    } as any,
    messages: [new AIMessage(`[Assembly] Refined letter (${refinedContent.length} chars)`)],
  };
}
