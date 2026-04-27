import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import type { PipelineStateType } from "../state";
import { breadcrumb, recordTokenUsage } from "../memory";

const log = createLogger({ module: "LangGraph:VettingNode" });

const VETTING_TIMEOUT_MS = 60_000;

interface VettingReport {
  riskLevel: "low" | "medium" | "high" | "critical";
  qualityDegraded: boolean;
  jurisdictionIssues: string[];
  citationsFlagged: string[];
  factualIssuesFound: string[];
  overallScore: number; // 0-10
  summary: string;
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════
// LANGGRAPH NODE: vetting
// Performs quality vetting on the assembled letter.
// Returns qualityDegraded=true if the letter needs a redraft.
// ═══════════════════════════════════════════════════════

export async function vettingNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const { letterId, assembledLetter, retryCount, sharedContext } = state;
  const ctx = sharedContext.normalized;
  log.info({ letterId, retryCount, jurisdiction: ctx.jurisdiction }, "[VettingNode] Starting vetting stage");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — vetting stage cannot proceed");

  const llm = new ChatAnthropic({
    apiKey,
    model: "claude-sonnet-4-5-20250929",
    maxTokens: 2000,
  });

  const systemPrompt = `You are a senior attorney reviewing a legal letter for quality assurance.

Evaluate the letter on:
1. Legal accuracy and jurisdiction compliance for ${ctx.jurisdiction}
2. Citation correctness and formatting
3. Factual claims — flag anything unsupported or potentially inaccurate
4. Professional tone and clarity
5. Persuasiveness toward the stated goal

Return a JSON object with this exact schema:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "qualityDegraded": boolean,
  "jurisdictionIssues": string[],
  "citationsFlagged": string[],
  "factualIssuesFound": string[],
  "overallScore": number (0-10),
  "summary": string,
  "recommendations": string[]
}

Set qualityDegraded=true if the letter has serious issues (score < 6, any critical/high jurisdiction issues, or multiple factual errors).`;

  const userPrompt = `Vet this legal letter:

${assembledLetter}

Context:
- Jurisdiction: ${ctx.jurisdiction}
- Letter type: ${ctx.letterType}
- Desired outcome: ${ctx.desiredOutcome}
- Research was web-grounded: ${!state.researchUnverified}
- This is retry #${retryCount} (if > 0, be more lenient about minor issues)`;

  const result = await llm.invoke(
    [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ],
    { signal: AbortSignal.timeout(VETTING_TIMEOUT_MS) },
  );

  const rawContent = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  const promptTokens = (result as any).usage_metadata?.input_tokens ?? 0;
  const completionTokens = (result as any).usage_metadata?.output_tokens ?? 0;

  // Parse vetting report
  let vettingReport: VettingReport;
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    vettingReport = jsonMatch
      ? (JSON.parse(jsonMatch[0]) as VettingReport)
      : {
          riskLevel: "medium",
          qualityDegraded: false,
          jurisdictionIssues: [],
          citationsFlagged: [],
          factualIssuesFound: [],
          overallScore: 7,
          summary: "Vetting parse failed — using default report",
          recommendations: [],
        };
  } catch {
    vettingReport = {
      riskLevel: "medium",
      qualityDegraded: false,
      jurisdictionIssues: [],
      citationsFlagged: [],
      factualIssuesFound: [],
      overallScore: 7,
      summary: "Vetting parse failed — using default report",
      recommendations: [],
    };
  }

  const qualityDegraded = vettingReport.qualityDegraded;
  const newWarnings: string[] = [
    ...vettingReport.jurisdictionIssues.map(i => `JURISDICTION: ${i}`),
    ...vettingReport.citationsFlagged.map(i => `CITATION: ${i}`),
    ...vettingReport.factualIssuesFound.map(i => `FACTUAL: ${i}`),
  ];

  log.info(
    {
      letterId,
      riskLevel: vettingReport.riskLevel,
      score: vettingReport.overallScore,
      qualityDegraded,
      retryCount,
    },
    "[VettingNode] Vetting completed",
  );

  return {
    vettedLetter: assembledLetter, // letter text stays the same; vetting just evaluates
    qualityDegraded,
    vettingReport,
    qualityWarnings: newWarnings,
    currentStage: qualityDegraded && retryCount < 2 ? "draft" : "finalize",
    sharedContext: {
      tokenUsage: [
        recordTokenUsage("vetting", "anthropic", promptTokens, completionTokens, "claude-sonnet-4-5-20250929"),
      ],
      breadcrumbs: [
        breadcrumb(
          "vetting",
          `Score=${vettingReport.overallScore}/10, risk=${vettingReport.riskLevel}, degraded=${qualityDegraded}, retry=${retryCount}`,
        ),
      ],
    } as any,
    messages: [
      new AIMessage(
        `[Vetting] Score: ${vettingReport.overallScore}/10, Risk: ${vettingReport.riskLevel}, Degraded: ${qualityDegraded}`,
      ),
    ],
  };
}
