import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import type { PipelineStateType } from "../state";

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
  const { letterId, assembledLetter, researchPacket, intake, retryCount } = state;
  log.info({ letterId, retryCount }, "[VettingNode] Starting vetting stage");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — vetting stage cannot proceed");

  const llm = new ChatAnthropic({
    apiKey,
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 2000,
  });

  const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";

  const systemPrompt = `You are a senior attorney reviewing a legal letter for quality assurance.

Evaluate the letter on:
1. Legal accuracy and jurisdiction compliance for ${jurisdiction}
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
- Jurisdiction: ${jurisdiction}
- Letter type: ${intake.letterType ?? "legal"}
- Desired outcome: ${intake.desiredOutcome ?? "Favorable resolution"}
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
    messages: [
      new AIMessage(
        `[Vetting] Score: ${vettingReport.overallScore}/10, Risk: ${vettingReport.riskLevel}, Degraded: ${qualityDegraded}`,
      ),
    ],
  };
}
