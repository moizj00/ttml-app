/**
 * LangGraph Conditional Edges
 * 
 * Defines the routing logic between pipeline nodes based on state.
 * Handles retry decisions, failover, and fallback routing.
 */

import type { PipelineState } from "./state";
import { createLogger } from "../../logger";

const edgeLogger = createLogger({ module: "LangGraphEdges" });

// ═══════════════════════════════════════════════════════
// RETRY LIMITS
// ═══════════════════════════════════════════════════════

export const MAX_RESEARCH_RETRIES = 2;
export const MAX_DRAFTING_RETRIES = 2;
export const MAX_ASSEMBLY_RETRIES = 2;
export const MAX_VETTING_RETRIES = 1;

// ═══════════════════════════════════════════════════════
// ROUTE TYPES
// ═══════════════════════════════════════════════════════

export type ResearchRoute = "drafting" | "retry_research" | "fallback";
export type DraftingRoute = "assembly" | "retry_drafting" | "fallback";
export type AssemblyRoute = "vetting" | "retry_assembly" | "fallback";
export type VettingRoute = "complete" | "retry_assembly" | "fallback";

// ═══════════════════════════════════════════════════════
// CONDITIONAL EDGE FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Route after research stage.
 * 
 * - If research succeeded (packet exists): proceed to drafting
 * - If failed but retries remain: retry research
 * - If all retries exhausted: fallback
 */
export function routeAfterResearch(state: PipelineState): ResearchRoute {
  const { letterId, research, researchRetries, lastError } = state;

  if (research !== null) {
    edgeLogger.info({ letterId, provider: state.researchProvider }, "[Edge] Research succeeded → drafting");
    return "drafting";
  }

  if (researchRetries < MAX_RESEARCH_RETRIES) {
    edgeLogger.warn(
      { letterId, attempt: researchRetries + 1, maxRetries: MAX_RESEARCH_RETRIES, error: lastError?.message },
      "[Edge] Research failed → retry_research"
    );
    return "retry_research";
  }

  edgeLogger.error(
    { letterId, totalRetries: researchRetries, error: lastError?.message },
    "[Edge] Research exhausted all retries → fallback"
  );
  return "fallback";
}

/**
 * Route after drafting stage.
 * 
 * - If draft succeeded: proceed to assembly
 * - If failed but retries remain: retry drafting
 * - If all retries exhausted: fallback (will use research if available)
 */
export function routeAfterDrafting(state: PipelineState): DraftingRoute {
  const { letterId, draft, draftingRetries, lastError } = state;

  if (draft !== null) {
    edgeLogger.info({ letterId }, "[Edge] Drafting succeeded → assembly");
    return "assembly";
  }

  if (draftingRetries < MAX_DRAFTING_RETRIES) {
    edgeLogger.warn(
      { letterId, attempt: draftingRetries + 1, maxRetries: MAX_DRAFTING_RETRIES, error: lastError?.message },
      "[Edge] Drafting failed → retry_drafting"
    );
    return "retry_drafting";
  }

  edgeLogger.error(
    { letterId, totalRetries: draftingRetries, error: lastError?.message },
    "[Edge] Drafting exhausted all retries → fallback"
  );
  return "fallback";
}

/**
 * Route after assembly stage.
 * 
 * - If assembly succeeded: proceed to vetting
 * - If failed but retries remain: retry assembly
 * - If all retries exhausted: fallback (will use draft if available)
 */
export function routeAfterAssembly(state: PipelineState): AssemblyRoute {
  const { letterId, assembledLetter, assemblyRetries, lastError } = state;

  if (assembledLetter !== null) {
    edgeLogger.info({ letterId }, "[Edge] Assembly succeeded → vetting");
    return "vetting";
  }

  if (assemblyRetries < MAX_ASSEMBLY_RETRIES) {
    edgeLogger.warn(
      { letterId, attempt: assemblyRetries + 1, maxRetries: MAX_ASSEMBLY_RETRIES, error: lastError?.message },
      "[Edge] Assembly failed → retry_assembly"
    );
    return "retry_assembly";
  }

  edgeLogger.error(
    { letterId, totalRetries: assemblyRetries, error: lastError?.message },
    "[Edge] Assembly exhausted all retries → fallback"
  );
  return "fallback";
}

/**
 * Route after vetting stage.
 * 
 * - If vetting succeeded with no critical issues: complete
 * - If vetting found critical issues and assembly retries remain: retry assembly with feedback
 * - If vetting soft-failed but no critical issues: complete (with warnings)
 * - If all retries exhausted: fallback
 */
export function routeAfterVetting(state: PipelineState): VettingRoute {
  const {
    letterId,
    vettedLetter,
    vettingReport,
    vettingCritical,
    assemblyRetries,
    lastError,
  } = state;

  // Successful vetting with no critical issues
  if (vettedLetter !== null && !vettingCritical) {
    edgeLogger.info(
      { letterId, riskLevel: vettingReport?.riskLevel },
      "[Edge] Vetting succeeded → complete"
    );
    return "complete";
  }

  // Critical vetting issues require assembly retry
  if (vettingCritical && assemblyRetries < MAX_ASSEMBLY_RETRIES) {
    const issues = [
      ...(vettingReport?.jurisdictionIssues ?? []),
      ...(vettingReport?.citationsFlagged ?? []),
      ...(vettingReport?.factualIssuesFound ?? []),
    ];
    edgeLogger.warn(
      { letterId, assemblyRetry: assemblyRetries + 1, issues },
      "[Edge] Vetting found critical issues → retry_assembly"
    );
    return "retry_assembly";
  }

  // Vetting has a result but with critical issues and no more retries
  if (vettedLetter !== null && vettingCritical) {
    edgeLogger.warn(
      { letterId, assemblyRetries },
      "[Edge] Vetting critical but retries exhausted → fallback with degraded quality"
    );
    return "fallback";
  }

  // Complete failure
  edgeLogger.error(
    { letterId, error: lastError?.message },
    "[Edge] Vetting failed completely → fallback"
  );
  return "fallback";
}

// ═══════════════════════════════════════════════════════
// HELPER: Build vetting feedback for assembly retry
// ═══════════════════════════════════════════════════════

/**
 * Constructs a feedback block from vetting issues to inject into the next
 * assembly attempt's prompt. This enables the model to address specific
 * problems identified during vetting.
 */
export function buildVettingFeedbackForRetry(state: PipelineState): string {
  const { vettingReport } = state;
  if (!vettingReport) return "";

  const issues: string[] = [];

  if (vettingReport.jurisdictionIssues?.length) {
    issues.push(
      `JURISDICTION ISSUES (MUST FIX):\n${vettingReport.jurisdictionIssues.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n")}`
    );
  }

  if (vettingReport.citationsFlagged?.length) {
    issues.push(
      `CITATION ISSUES (MUST FIX):\n${vettingReport.citationsFlagged.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n")}`
    );
  }

  if (vettingReport.factualIssuesFound?.length) {
    issues.push(
      `FACTUAL ISSUES:\n${vettingReport.factualIssuesFound.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n")}`
    );
  }

  if (vettingReport.changesApplied?.length) {
    issues.push(
      `CHANGES MADE BY VETTING (incorporate these):\n${vettingReport.changesApplied.map((c, idx) => `  ${idx + 1}. ${c}`).join("\n")}`
    );
  }

  if (issues.length === 0) return "";

  return `

## VETTING FEEDBACK FROM PREVIOUS ATTEMPT

The previous assembly attempt was rejected by the vetting stage for the following reasons:

${issues.join("\n\n")}

You MUST address ALL issues listed above in this assembly attempt. Do NOT repeat the same errors.
`;
}
