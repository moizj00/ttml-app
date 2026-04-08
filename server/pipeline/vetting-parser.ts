import type { VettingReport, PostVetDeterministicContext } from "./vetting-prompts";
import { validateVettingOutput } from "./vetting-prompts";
import type { CitationRegistryEntry } from "../../shared/types";
import type { NormalizedPromptInput } from "../intake-normalizer";
import { runCitationAudit, replaceUnverifiedCitations } from "./citations";
import { validateContentConsistency } from "./validators";
import { captureServerException } from "../sentry";
import { logger } from "../logger";

export function parseVettingResponse(raw: string): { vettedLetter: string; vettingReport: VettingReport } | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      vettedLetter: parsed.vettedLetter ?? "",
      vettingReport: {
        citationsVerified: parsed.vettingReport?.citationsVerified ?? 0,
        citationsRemoved: parsed.vettingReport?.citationsRemoved ?? 0,
        citationsFlagged: parsed.vettingReport?.citationsFlagged ?? [],
        bloatPhrasesRemoved: parsed.vettingReport?.bloatPhrasesRemoved ?? [],
        jurisdictionIssues: parsed.vettingReport?.jurisdictionIssues ?? [],
        factualIssuesFound: parsed.vettingReport?.factualIssuesFound ?? [],
        changesApplied: parsed.vettingReport?.changesApplied ?? [],
        overallAssessment: parsed.vettingReport?.overallAssessment ?? "No assessment provided",
        riskLevel: parsed.vettingReport?.riskLevel ?? "medium",
        counterArgumentsAddressed: typeof parsed.vettingReport?.counterArgumentsAddressed === "number" ? parsed.vettingReport.counterArgumentsAddressed : undefined,
        counterArgumentGaps: Array.isArray(parsed.vettingReport?.counterArgumentGaps) ? parsed.vettingReport.counterArgumentGaps : undefined,
      },
    };
  } catch (parseErr) {
    logger.warn({ err: parseErr }, "[Pipeline] Failed to parse vetting response JSON, skipping vetting stage:");
    captureServerException(parseErr instanceof Error ? parseErr : new Error(String(parseErr)), {
      tags: { component: "pipeline", error_type: "vetting_parse_failed" },
    });
    return null;
  }
}

export interface PostVetCheckParams {
  citationRegistry: CitationRegistryEntry[];
  normalizedIntake: NormalizedPromptInput;
  assembledLetter: string;
}

export function runPostVetChecks(
  letter: string,
  report: VettingReport,
  params: PostVetCheckParams,
) {
  const safeReport: VettingReport = {
    ...report,
    citationsFlagged: [...report.citationsFlagged],
    jurisdictionIssues: [...report.jurisdictionIssues],
    factualIssuesFound: [...report.factualIssuesFound],
    bloatPhrasesRemoved: [...report.bloatPhrasesRemoved],
    changesApplied: [...report.changesApplied],
  };

  const postVetCitationAudit = runCitationAudit(letter, params.citationRegistry);
  if (postVetCitationAudit.unverifiedCitations.length > 0) {
    safeReport.citationsFlagged.push(
      ...postVetCitationAudit.unverifiedCitations.map(c => c.citation)
    );
    safeReport.citationsRemoved += postVetCitationAudit.unverifiedCitations.length;
  }

  const postVetConsistency = validateContentConsistency(letter, params.normalizedIntake);
  if (postVetConsistency.jurisdictionMismatch) {
    safeReport.jurisdictionIssues.push(
      `Post-vet jurisdiction mismatch: "${postVetConsistency.foundJurisdiction}" cited instead of "${postVetConsistency.expectedJurisdiction}"`
    );
  }

  const finalLetter = postVetCitationAudit.unverifiedCitations.length > 0
    ? replaceUnverifiedCitations(letter, postVetCitationAudit)
    : letter;

  const postVetCtx: PostVetDeterministicContext = {
    postVetUnverifiedCitations: postVetCitationAudit.unverifiedCitations.length,
    postVetJurisdictionMismatch: postVetConsistency.jurisdictionMismatch,
    postVetFoundJurisdiction: postVetConsistency.foundJurisdiction,
    postVetExpectedJurisdiction: postVetConsistency.expectedJurisdiction,
  };

  const validation = validateVettingOutput(safeReport, params.assembledLetter, finalLetter, postVetCtx);
  return { finalLetter, postVetCitationAudit, postVetConsistency, validation };
}
