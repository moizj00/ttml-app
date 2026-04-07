import { generateText } from "ai";
import {
  createLetterVersion,
  createWorkflowJob,
  updateWorkflowJob,
  updateLetterStatus,
  updateLetterVersionPointers,
  logReviewAction,
  markPriorPipelineRunsSuperseded,
  getLetterRequestById as getLetterById,
  hasLetterBeenPreviouslyUnlocked,
  getAllUsers,
  createNotification,
  setLetterQualityDegraded,
} from "../db";
import type { IntakeJson, ResearchPacket, DraftOutput, CitationRegistryEntry, CitationAuditReport, PipelineContext, TokenUsage, PipelineErrorCode, StructuredPipelineError } from "../../shared/types";
import { PIPELINE_ERROR_CODES, PipelineError } from "../../shared/types";
import { buildNormalizedPromptInput, type NormalizedPromptInput } from "../intake-normalizer";
import { sendNewReviewNeededEmail, sendAdminAlertEmail } from "../email";
import { captureServerException } from "../sentry";
import { formatStructuredError, classifyErrorCode, buildLessonsPromptBlock, withModelFailover } from "./shared";
import { getAnthropicClient, getVettingModelFallback, getFreeOSSModelFallback, createTokenAccumulator, accumulateTokens, calculateCost, MODEL_PRICING } from "./providers";
import { validateFinalLetter, validateContentConsistency, retryOnValidationFailure, addValidationResult } from "./validators";
import { runCitationAudit, replaceUnverifiedCitations, buildCitationRegistry } from "./citations";
import { runAssemblyStage } from "./assembly";

// ═══════════════════════════════════════════════════════
// STAGE 4: CLAUDE VETTING PASS
// ═══════════════════════════════════════════════════════

const VETTING_TIMEOUT_MS = 120_000;

const AI_BLOAT_PHRASES = [
  "it has come to our attention",
  "please be advised",
  "we write to inform you",
  "we are writing to inform you",
  "this letter serves to",
  "as you are aware",
  "as you may be aware",
  "as you may know",
  "as per our records",
  "with respect to the above",
  "in connection with the above",
  "we wish to bring to your attention",
  "kindly be informed",
  "we hereby notify you",
  "this is to certify",
  "for your information",
  "pursuant to our conversation",
  "we take this opportunity",
  "we would like to take this opportunity",
  "it is important to note that",
  "it should be noted that",
  "needless to say",
  "it goes without saying",
  "under applicable law",
  "pursuant to relevant statutes",
  "in accordance with the law",
  "as the law requires",
  "we trust this matter",
  "we trust you will",
  "your prompt attention to this matter",
  "your immediate attention is required",
  "we look forward to your prompt response",
  "please do not hesitate to contact",
  "should you have any questions",
  "we remain at your disposal",
  "thank you for your anticipated cooperation",
  "we appreciate your cooperation in advance",
];

export function detectBloatPhrases(text: string): string[] {
  const textLower = text.toLowerCase();
  return AI_BLOAT_PHRASES.filter(phrase => textLower.includes(phrase));
}

export interface VettingReport {
  citationsVerified: number;
  citationsRemoved: number;
  citationsFlagged: string[];
  bloatPhrasesRemoved: string[];
  jurisdictionIssues: string[];
  factualIssuesFound: string[];
  changesApplied: string[];
  overallAssessment: string;
  riskLevel: "low" | "medium" | "high";
  counterArgumentsAddressed?: number;
  counterArgumentGaps?: string[];
}

export function buildVettingSystemPrompt(
  jurisdiction: string,
  letterType: string,
  detectedBloat: string[],
): string {
  const bloatSection = detectedBloat.length > 0
    ? `\n## DETECTED BLOAT PHRASES — MANDATORY REMOVAL
The following AI-typical filler phrases were detected in the letter. You MUST remove or replace ALL of them:
${detectedBloat.map((p, i) => `${i + 1}. "${p}"`).join("\n")}
Replace each with direct, substantive legal language or remove the sentence entirely if it adds nothing.\n`
    : "";

  return `You are the head of quality control at a premier law firm. You specialize in ${jurisdiction} law.
Your role is to perform a FINAL VETTING of a legal letter before it reaches the reviewing attorney.
You are deeply knowledgeable about ${jurisdiction} statutes, case law, local ordinances, enforcement
climate, and geopolitical context. Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.

## Your Vetting Standards

### 1. JURISDICTIONAL ACCURACY (${jurisdiction})
- Verify every statute, code section, and ordinance cited is REAL and belongs to ${jurisdiction}.
- Flag any citation from a DIFFERENT state — this is a critical error.
- Confirm statute section numbers are correctly formatted (e.g., "California Civil Code § 1950.5(b)").
- Verify the cited statutes actually apply to the claim type described in this ${letterType}.
- If the letter references a statute that was repealed, amended, or superseded, flag it.

### 2. LEGAL ACCURACY
- Verify statute of limitations periods are correct for this claim type in ${jurisdiction}.
- Confirm pre-suit notice requirements match ${jurisdiction} rules for this claim type.
- Check that filing deadlines and waiting periods are accurately stated.
- Ensure damage calculations reference the correct statutory basis.
- Verify any referenced remedies (actual damages, statutory damages, attorney fees, treble damages)
  are actually available under the cited statute.

### 3. GEOPOLITICAL & ENFORCEMENT AWARENESS
- If the letter cites enforcement climate, AG activity, or recent legislation, verify this is
  current and accurate for ${jurisdiction}.
- Strengthen the letter by noting relevant current enforcement priorities of the ${jurisdiction}
  Attorney General if the letter doesn't already reference them.
- Flag any references to outdated political context or enforcement campaigns.

### 4. ANTI-HALLUCINATION ENFORCEMENT
- Every factual claim about law, statute, case holding, or legal procedure must be traceable
  to the research packet provided.
- If a statement claims something about the law that is NOT supported by the research packet,
  either remove it or flag it with [CITATION REQUIRES ATTORNEY VERIFICATION].
- NEVER invent case names, docket numbers, or statute sections.
- If you cannot verify a legal claim, replace it with [REQUIRES VERIFICATION] rather than
  leaving an unverified assertion.

### 5. ANTI-BLOAT ENFORCEMENT
- Remove ALL filler phrases, platitudes, and vague legal language.
- Every sentence must either: state a fact, cite a law, quantify exposure, make a demand,
  or state a consequence.
- Remove redundant paragraphs that restate the same point.
- Remove hedging language ("may", "might", "could potentially", "it is possible that").
- Replace vague references ("under applicable law", "pursuant to relevant statutes") with
  specific citations or remove entirely.
${bloatSection}
### 6. FACTUAL CONSISTENCY
- Verify sender and recipient names are correct throughout the letter.
- Verify addresses, dates, and amounts are consistent with the intake data.
- Flag any instance where the sender appears as the recipient or vice versa.
- Ensure the letter's demands match the desired outcome stated in the intake.

### 7. COUNTER-ARGUMENT COVERAGE
- Review whether the letter preemptively addresses likely opposing arguments.
- The recipient will likely raise defenses — does the letter neutralize them?
- Count how many of the top anticipated counter-arguments are addressed.
- If major counter-arguments are unaddressed, flag this as a medium-risk issue.

## Output Format

Return ONLY a valid JSON object with these exact fields:
{
  "vettedLetter": "The complete vetted letter text with all corrections applied. Use \\n for line breaks.",
  "vettingReport": {
    "citationsVerified": <number of citations confirmed as valid>,
    "citationsRemoved": <number of citations removed or flagged>,
    "citationsFlagged": ["list of specific citations that were removed or flagged"],
    "bloatPhrasesRemoved": ["list of filler phrases that were removed"],
    "jurisdictionIssues": ["list of jurisdiction-related problems found and fixed"],
    "factualIssuesFound": ["list of factual errors or inconsistencies found"],
    "changesApplied": ["summary of each change made to the letter"],
    "overallAssessment": "Brief assessment of the letter quality after vetting",
    "riskLevel": "low|medium|high",
    "counterArgumentsAddressed": <number of anticipated counter-arguments the letter preemptively addresses>,
    "counterArgumentGaps": ["list of major counter-arguments NOT addressed in the letter that the attorney should consider adding"]
  }
}

## Critical Rules
- Output ONLY the JSON object. No text before or after.
- The vettedLetter must be a COMPLETE letter — not a summary or partial text.
- If the letter is already high quality with no issues, return it unchanged with riskLevel "low".
- Do NOT add new legal arguments or citations that weren't in the original letter or research.
- Do NOT change the tone or strategic approach — only fix accuracy and remove bloat.
- Preserve the signature block exactly as-is.`;
}

export function buildVettingUserPrompt(
  assembledLetter: string,
  intake: IntakeJson,
  research: ResearchPacket,
  citationRegistry: CitationRegistryEntry[],
): string {
  const registryBlock = citationRegistry.length > 0
    ? `\n## VERIFIED CITATION REGISTRY\nThese citations were verified during research. Any citation in the letter NOT on this list is suspect:\n${citationRegistry.map(r => `  [REF-${r.registryNumber}] ${r.citationText} (${r.ruleType}, confidence: ${r.confidence}, revalidated: ${r.revalidated})`).join("\n")}\n`
    : "\n## CITATION REGISTRY: No pre-verified citations available.\n";

  const researchSummary = research.researchSummary ?? "";
  const enforcementBlock = research.enforcementClimate
    ? `\n## ENFORCEMENT CLIMATE\n- AG Activity: ${research.enforcementClimate.agActivity ?? "Unknown"}\n- Class Actions: ${research.enforcementClimate.classActions ?? "Unknown"}\n- Recent Legislation: ${research.enforcementClimate.recentLegislation ?? "Unknown"}\n- Political Leaning: ${research.enforcementClimate.politicalLeaning ?? "Unknown"}\n`
    : "";

  const solBlock = research.statuteOfLimitations
    ? `\n## STATUTE OF LIMITATIONS\n- Period: ${research.statuteOfLimitations.period ?? "Unknown"}\n- Statute: ${research.statuteOfLimitations.statute ?? "Unknown"}\n- Clock Starts: ${research.statuteOfLimitations.clockStartsOn ?? "Unknown"}\n- Urgency: ${research.statuteOfLimitations.urgencyFlag ? "YES — APPROACHING" : "No"}\n`
    : "";

  const preSuitBlock = research.preSuitRequirements
    ? `\n## PRE-SUIT REQUIREMENTS\n- Demand Letter Required: ${research.preSuitRequirements.demandLetterRequired ?? "Unknown"}\n- Waiting Period: ${research.preSuitRequirements.waitingPeriodDays ?? "Unknown"} days\n- Statute: ${research.preSuitRequirements.statute ?? "Unknown"}\n`
    : "";

  return `## LETTER TO VET
${assembledLetter}

## INTAKE DATA
- Letter Type: ${intake.letterType}
- Jurisdiction: ${intake.jurisdiction?.state ?? "Unknown"}, ${intake.jurisdiction?.country ?? "US"}${intake.jurisdiction?.city ? `, ${intake.jurisdiction.city}` : ""}
- Sender: ${intake.sender?.name ?? "Unknown"}
- Recipient: ${intake.recipient?.name ?? "Unknown"}
- Subject: ${intake.matter?.subject ?? "Unknown"}
- Desired Outcome: ${intake.desiredOutcome ?? "Not specified"}
- Tone: ${intake.toneAndDelivery?.tone ?? intake.tonePreference ?? "firm"}
${intake.financials?.amountOwed ? `- Amount Owed: $${intake.financials.amountOwed}` : ""}

## RESEARCH SUMMARY
${researchSummary}
${registryBlock}${enforcementBlock}${solBlock}${preSuitBlock}

Vet this letter thoroughly. Apply all corrections and return the complete vetted letter in JSON format.`;
}

interface PostVetDeterministicContext {
  postVetUnverifiedCitations: number;
  postVetJurisdictionMismatch: boolean;
  postVetFoundJurisdiction?: string | null;
  postVetExpectedJurisdiction?: string;
}

export function validateVettingOutput(
  report: VettingReport,
  originalLetter: string,
  vettedLetter: string,
  postVetCtx?: PostVetDeterministicContext,
): { valid: boolean; errors: string[]; critical: boolean } {
  const errors: string[] = [];
  let critical = false;

  if (!vettedLetter || vettedLetter.trim().length < 200) {
    errors.push("Vetted letter is too short or empty — vetting may have truncated the content");
    critical = true;
  }

  const originalWc = originalLetter.split(/\s+/).filter(w => w.length > 0).length;
  const vettedWc = vettedLetter.split(/\s+/).filter(w => w.length > 0).length;
  if (vettedWc < originalWc * 0.5) {
    errors.push(`Vetted letter lost too much content: ${vettedWc} words vs ${originalWc} original (>50% reduction)`);
    critical = true;
  }

  const hasClosing = /(?:sincerely|regards|respectfully|very truly yours|best|cordially|faithfully|warmly|yours truly)/i.test(vettedLetter);
  const hasSalutation = /(?:dear|re:|attention|to:|to whom it may concern)/i.test(vettedLetter);
  if (!hasClosing) errors.push("Vetted letter is missing a closing (Sincerely/Regards)");
  if (!hasSalutation) errors.push("Vetted letter is missing a salutation (Dear/RE:)");

  if (postVetCtx) {
    if (postVetCtx.postVetJurisdictionMismatch) {
      critical = true;
      errors.push(`CRITICAL: Post-vet jurisdiction mismatch persists — letter references "${postVetCtx.postVetFoundJurisdiction}" but should reference "${postVetCtx.postVetExpectedJurisdiction}"`);
    }

    if (postVetCtx.postVetUnverifiedCitations > 0) {
      critical = true;
      errors.push(`CRITICAL: ${postVetCtx.postVetUnverifiedCitations} unverified citation(s) remain after vetting`);
    }
  }

  if (report.riskLevel === "high") {
    critical = true;
    errors.push(`CRITICAL: Vetting assessed overall risk as HIGH`);
  }

  if (report.riskLevel === "medium" && report.factualIssuesFound.length > 3) {
    errors.push(`Warning: ${report.factualIssuesFound.length} factual issues reported (some may have been fixed by vetting)`);
  }

  if (report.counterArgumentGaps && report.counterArgumentGaps.length >= 2) {
    errors.push(`COUNTER-ARGUMENT GAPS: ${report.counterArgumentGaps.length} major counter-arguments are not addressed in the letter. Attorney should consider strengthening preemptive language.`);
    if (report.riskLevel !== "high") {
      report.riskLevel = "medium";
    }
  }

  return { valid: errors.length === 0, errors, critical };
}

export async function runVettingStage(
  letterId: number,
  assembledLetter: string,
  intake: IntakeJson,
  research: ResearchPacket,
  pipelineCtx?: PipelineContext,
): Promise<{ vettedLetter: string; vettingReport: VettingReport; critical: boolean }> {
  let jobId = 0;
  try {
    const job = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "vetting",
      provider: "anthropic",
      requestPayloadJson: {
        letterId,
        userId: pipelineCtx?.userId,
        stage: "vetting",
      },
    });
    const rawJobId = (job as any)?.insertId;
    if (rawJobId == null) {
      console.warn(`[Pipeline] Stage 4: createWorkflowJob returned nullish insertId for letter #${letterId}, falling back to jobId=0`);
    }
    jobId = rawJobId ?? 0;
  } catch (jobCreateErr) {
    console.warn(`[Pipeline] Stage 4: createWorkflowJob INSERT failed for letter #${letterId}, falling back to jobId=0:`, jobCreateErr instanceof Error ? jobCreateErr.message : jobCreateErr);
    captureServerException(jobCreateErr, { tags: { component: "pipeline", error_type: "workflow_job_create_failed" }, extra: { letterId } });
  }
  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });

  const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
  const letterType = intake.letterType ?? "general-legal";
  const citationRegistry = pipelineCtx?.citationRegistry ?? [];

  const normalizedIntake = buildNormalizedPromptInput(
    {
      subject: intake.matter?.subject ?? "Legal Matter",
      issueSummary: intake.matter?.description,
      jurisdictionCountry: intake.jurisdiction?.country,
      jurisdictionState: intake.jurisdiction?.state,
      jurisdictionCity: intake.jurisdiction?.city,
      letterType: intake.letterType,
    },
    intake
  );

  const preVetCitationAudit = runCitationAudit(assembledLetter, citationRegistry);
  console.log(
    `[Pipeline] Stage 4: Pre-vet citation audit for letter #${letterId}: ${preVetCitationAudit.verifiedCitations.length} verified, ${preVetCitationAudit.unverifiedCitations.length} unverified, risk score: ${preVetCitationAudit.hallucinationRiskScore}%`
  );

  addValidationResult(pipelineCtx, {
    stage: "vetting",
    check: "pre_vet_citation_audit",
    passed: preVetCitationAudit.unverifiedCitations.length === 0,
    errors: preVetCitationAudit.unverifiedCitations.map(c => `Unverified citation: "${c.citation}"`),
    warnings: [`Total citations: ${preVetCitationAudit.totalCitations}, hallucination risk: ${preVetCitationAudit.hallucinationRiskScore}%`],
    timestamp: new Date().toISOString(),
  });

  const preVetConsistency = validateContentConsistency(assembledLetter, normalizedIntake);
  addValidationResult(pipelineCtx, {
    stage: "vetting",
    check: "pre_vet_content_consistency",
    passed: preVetConsistency.passed,
    errors: preVetConsistency.jurisdictionMismatch
      ? [`Jurisdiction mismatch: expected "${preVetConsistency.expectedJurisdiction}" but found "${preVetConsistency.foundJurisdiction}"`]
      : [],
    warnings: preVetConsistency.warnings,
    timestamp: new Date().toISOString(),
  });

  const detectedBloat = detectBloatPhrases(assembledLetter);
  if (detectedBloat.length > 0) {
    console.log(
      `[Pipeline] Stage 4: Detected ${detectedBloat.length} bloat phrases in letter #${letterId}: ${detectedBloat.slice(0, 5).join(", ")}${detectedBloat.length > 5 ? "..." : ""}`
    );
  }

  const preVetIssues: string[] = [];
  if (preVetCitationAudit.unverifiedCitations.length > 0) {
    preVetIssues.push(`UNVERIFIED CITATIONS FOUND: ${preVetCitationAudit.unverifiedCitations.map(c => `"${c.citation}"`).join(", ")}. These must be removed or replaced with [CITATION REQUIRES ATTORNEY VERIFICATION].`);
  }
  if (preVetConsistency.jurisdictionMismatch) {
    preVetIssues.push(`JURISDICTION MISMATCH: Letter references "${preVetConsistency.foundJurisdiction}" law but should only reference "${preVetConsistency.expectedJurisdiction}". Remove all cross-jurisdiction citations.`);
  }

  const lessonsBlockVetting = await buildLessonsPromptBlock(letterType, jurisdiction, "vetting", undefined, pipelineCtx);
  const systemPrompt = buildVettingSystemPrompt(jurisdiction, letterType, detectedBloat) + lessonsBlockVetting;
  const baseUserPrompt = buildVettingUserPrompt(assembledLetter, intake, research, citationRegistry);
  const preVetBlock = preVetIssues.length > 0
    ? `\n\n## PRE-VET ISSUES DETECTED (MUST FIX)\n${preVetIssues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}\n`
    : "";
  const userPrompt = baseUserPrompt + preVetBlock;

  const vettingTokens = createTokenAccumulator();
  let vettingProvider = "anthropic";
  let vettingModelKey = "claude-sonnet-4-20250514";

  const generateVetting = async (errorFeedback?: string): Promise<string> => {
    const promptWithFeedback = errorFeedback
      ? userPrompt + errorFeedback
      : userPrompt;
    const { result: vettingText, provider: retryProvider, failoverTriggered: retryFailover } = await withModelFailover(
      "Stage 4 (vetting retry)",
      letterId,
      async () => {
        if (vettingProvider === "openai-failover") {
          const { text, usage: vettingUsage } = await generateText({
            model: getVettingModelFallback(),
            system: systemPrompt,
            prompt: promptWithFeedback,
            maxOutputTokens: 16000,
            abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
          });
          accumulateTokens(vettingTokens, vettingUsage);
          return text;
        }
        if (vettingProvider === "groq-oss-fallback") {
          const { text, usage: vettingUsage } = await generateText({
            model: getFreeOSSModelFallback(),
            system: systemPrompt,
            prompt: promptWithFeedback,
            maxOutputTokens: 16000,
            abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
          });
          accumulateTokens(vettingTokens, vettingUsage);
          return text;
        }
        const anthropic = getAnthropicClient();
        const { text, usage: vettingUsage } = await generateText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, vettingUsage);
        return text;
      },
      async () => {
        vettingProvider = "openai-failover";
        vettingModelKey = "gpt-4o-mini";
        const { text, usage: vettingUsage } = await generateText({
          model: getVettingModelFallback(),
          system: systemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, vettingUsage);
        return text;
      },
      async () => {
        vettingProvider = "groq-oss-fallback";
        vettingModelKey = "llama-3.3-70b-versatile";
        const { text, usage: vettingUsage } = await generateText({
          model: getFreeOSSModelFallback(),
          system: systemPrompt,
          prompt: promptWithFeedback,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, vettingUsage);
        return text;
      }
    );
    if (retryProvider === "groq-oss-fallback" && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("VETTING_OSS_FALLBACK"))) {
        pipelineCtx.qualityWarnings.push(
          `VETTING_OSS_FALLBACK: Groq Llama 3.3 used as last-resort during vetting retry (both Claude and OpenAI were unavailable). Quality vetting may be incomplete. Heightened attorney scrutiny required.`
        );
      }
    } else if (retryFailover && pipelineCtx) {
      if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
      if (!pipelineCtx.qualityWarnings.some(w => w.startsWith("VETTING_FAILOVER"))) {
        pipelineCtx.qualityWarnings.push(
          `VETTING_FAILOVER: Switched to OpenAI GPT-4o-mini during vetting retry due to rate limit on primary model. Heightened attorney scrutiny recommended.`
        );
      }
    }
    return vettingText;
  };

  const parseVettingResponse = (raw: string): { vettedLetter: string; vettingReport: VettingReport } | null => {
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
      console.warn("[Pipeline] Failed to parse vetting response JSON, skipping vetting stage:", parseErr);
      captureServerException(parseErr instanceof Error ? parseErr : new Error(String(parseErr)), {
        tags: { component: "pipeline", error_type: "vetting_parse_failed" },
      });
      return null;
    }
  };

  try {
    console.log(
      `[Pipeline] Stage 4: Claude vetting pass for letter #${letterId}`
    );

    const { result: initialVettingText, provider: initialVettingProvider, failoverTriggered: vettingFailover } = await withModelFailover(
      "Stage 4 (vetting)",
      letterId,
      () => {
        const anthropic = getAnthropicClient();
        return generateText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        }).then(r => { accumulateTokens(vettingTokens, r.usage); return r.text; });
      },
      () => {
        vettingProvider = "openai-failover";
        vettingModelKey = "gpt-4o-mini";
        return generateText({
          model: getVettingModelFallback(),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        }).then(r => { accumulateTokens(vettingTokens, r.usage); return r.text; });
      },
      async () => {
        vettingProvider = "groq-oss-fallback";
        vettingModelKey = "llama-3.3-70b-versatile";
        const r = await generateText({
          model: getFreeOSSModelFallback(),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 16000,
          abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
        });
        accumulateTokens(vettingTokens, r.usage);
        return r.text;
      }
    );

    if (initialVettingProvider === "groq-oss-fallback") {
      console.warn(
        `[Pipeline] Stage 4: Groq Llama 3.3 used as last-resort for letter #${letterId} (VETTING_OSS_FALLBACK)`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `VETTING_OSS_FALLBACK: Groq Llama 3.3 used as last-resort for vetting (both Claude Sonnet and OpenAI were unavailable). Quality vetting may be significantly reduced. Heightened attorney scrutiny required.`
        );
      }
    } else if (vettingFailover) {
      console.warn(
        `[Pipeline] Stage 4: Switched to OpenAI GPT-4o-mini failover for letter #${letterId} (provider=${vettingProvider})`
      );
      if (pipelineCtx) {
        if (!pipelineCtx.qualityWarnings) pipelineCtx.qualityWarnings = [];
        pipelineCtx.qualityWarnings.push(
          `VETTING_FAILOVER: Primary vetting model (Claude Sonnet) was rate-limited. Final quality vetting performed by OpenAI GPT-4o-mini. Claude's legal polish and tone review was not applied — heightened attorney scrutiny recommended.`
        );
      }
    }

    let rawResponse = initialVettingText;
    let parsed = parseVettingResponse(rawResponse);

    if (!parsed) {
      console.warn(
        `[Pipeline] Stage 4: Failed to parse vetting JSON for letter #${letterId}, retrying...`
      );
      rawResponse = await retryOnValidationFailure(
        generateVetting,
        ["Your previous response was not valid JSON. Return ONLY a JSON object with vettedLetter and vettingReport fields."],
        "Stage 4 (JSON parse retry)"
      );
      parsed = parseVettingResponse(rawResponse);
      if (!parsed) {
        const failMsg = `Stage 4 vetting failed: could not parse valid JSON after retry for letter #${letterId}`;
        console.error(`[Pipeline] ${failMsg}`);
        addValidationResult(pipelineCtx, {
          stage: "vetting",
          check: "json_parse",
          passed: false,
          errors: [failMsg],
          warnings: [],
          timestamp: new Date().toISOString(),
        });
        await updateWorkflowJob(jobId, {
          status: "failed",
          errorMessage: formatStructuredError(
            PIPELINE_ERROR_CODES.JSON_PARSE_FAILED,
            failMsg,
            "vetting",
            "Could not parse vetting response as valid JSON after retry"
          ),
          completedAt: new Date(),
        });
        throw new PipelineError(PIPELINE_ERROR_CODES.JSON_PARSE_FAILED, failMsg, "vetting");
      }
    }

    const runPostVetChecks = (letter: string, report: VettingReport) => {
      const safeReport: VettingReport = {
        ...report,
        citationsFlagged: [...report.citationsFlagged],
        jurisdictionIssues: [...report.jurisdictionIssues],
        factualIssuesFound: [...report.factualIssuesFound],
        bloatPhrasesRemoved: [...report.bloatPhrasesRemoved],
        changesApplied: [...report.changesApplied],
      };

      const postVetCitationAudit = runCitationAudit(letter, citationRegistry);
      if (postVetCitationAudit.unverifiedCitations.length > 0) {
        safeReport.citationsFlagged.push(
          ...postVetCitationAudit.unverifiedCitations.map(c => c.citation)
        );
        safeReport.citationsRemoved += postVetCitationAudit.unverifiedCitations.length;
      }

      const postVetConsistency = validateContentConsistency(letter, normalizedIntake);
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

      const validation = validateVettingOutput(safeReport, assembledLetter, finalLetter, postVetCtx);
      return { finalLetter, postVetCitationAudit, postVetConsistency, validation };
    };

    let currentLetter = parsed.vettedLetter;
    let currentReport = parsed.vettingReport;
    let checks = runPostVetChecks(currentLetter, currentReport);

    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "post_vet_citation_audit",
      passed: checks.postVetCitationAudit.unverifiedCitations.length === 0,
      errors: checks.postVetCitationAudit.unverifiedCitations.map(c => `Still unverified after vetting: "${c.citation}"`),
      warnings: [`Post-vet hallucination risk: ${checks.postVetCitationAudit.hallucinationRiskScore}%`],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "post_vet_content_consistency",
      passed: checks.postVetConsistency.passed,
      errors: checks.postVetConsistency.jurisdictionMismatch
        ? [`Post-vet jurisdiction mismatch persists: "${checks.postVetConsistency.foundJurisdiction}"`]
        : [],
      warnings: checks.postVetConsistency.warnings,
      timestamp: new Date().toISOString(),
    });

    if (!checks.validation.valid) {
      console.warn(
        `[Pipeline] Stage 4: Vetting validation failed for letter #${letterId}: ${checks.validation.errors.join("; ")}. Retrying vetting...`
      );
      const retryResponse = await retryOnValidationFailure(
        generateVetting,
        checks.validation.errors,
        "Stage 4 (vetting validation retry)"
      );
      const retryParsed = parseVettingResponse(retryResponse);
      if (retryParsed) {
        const retryChecks = runPostVetChecks(retryParsed.vettedLetter, retryParsed.vettingReport);

        addValidationResult(pipelineCtx, {
          stage: "vetting",
          check: "vetting_retry_validation",
          passed: retryChecks.validation.valid,
          errors: retryChecks.validation.errors,
          warnings: [],
          timestamp: new Date().toISOString(),
        });

        if (retryChecks.validation.valid || !retryChecks.validation.critical) {
          currentLetter = retryParsed.vettedLetter;
          currentReport = retryParsed.vettingReport;
          checks = retryChecks;
          console.log(`[Pipeline] Stage 4: Retry improved results for letter #${letterId}`);
        }
      }
    }

    const postVetBloat = detectBloatPhrases(currentLetter);
    if (postVetBloat.length > 0) {
      console.warn(
        `[Pipeline] Stage 4: ${postVetBloat.length} bloat phrase(s) persist after vetting for letter #${letterId}: ${postVetBloat.join(", ")}`
      );
      addValidationResult(pipelineCtx, {
        stage: "vetting",
        check: "post_vet_bloat_enforcement",
        passed: true,
        errors: [],
        warnings: postVetBloat.map(p => `Bloat phrase persists after vetting: "${p}"`),
        timestamp: new Date().toISOString(),
      });
    }

    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "vetting_output_validation",
      passed: checks.validation.valid,
      errors: checks.validation.errors,
      warnings: [
        `Risk: ${currentReport.riskLevel}`,
        `Changes: ${currentReport.changesApplied.length}`,
        `Citations flagged: ${currentReport.citationsFlagged.length}`,
        `Bloat removed: ${currentReport.bloatPhrasesRemoved.length}`,
        `Post-vet hallucination risk: ${checks.postVetCitationAudit.hallucinationRiskScore}%`,
      ],
      timestamp: new Date().toISOString(),
    });

    const jobStatus = checks.validation.valid ? "completed" : (checks.validation.critical ? "failed" : "completed");

    if (checks.validation.critical) {
      console.error(
        `[Pipeline] Stage 4: CRITICAL issues for letter #${letterId} (needs assembly retry): ${checks.validation.errors.join("; ")}`
      );
      await updateWorkflowJob(jobId, {
        status: jobStatus,
        completedAt: new Date(),
        promptTokens: vettingTokens.promptTokens,
        completionTokens: vettingTokens.completionTokens,
        estimatedCostUsd: calculateCost(vettingModelKey, vettingTokens),
        errorMessage: formatStructuredError(
          PIPELINE_ERROR_CODES.VETTING_REJECTED,
          "Vetting validation issues",
          "vetting",
          checks.validation.errors.join("; ")
        ),
        responsePayloadJson: {
          provider: vettingProvider,
          failoverUsed: vettingProvider === "openai-failover" || vettingProvider === "groq-oss-fallback",
          vettingReport: currentReport,
          bloatDetected: detectedBloat.length,
          preVetCitationAudit: {
            verified: preVetCitationAudit.verifiedCitations.length,
            unverified: preVetCitationAudit.unverifiedCitations.length,
            riskScore: preVetCitationAudit.hallucinationRiskScore,
          },
          postVetCitationAudit: {
            verified: checks.postVetCitationAudit.verifiedCitations.length,
            unverified: checks.postVetCitationAudit.unverifiedCitations.length,
            riskScore: checks.postVetCitationAudit.hallucinationRiskScore,
          },
          postVetConsistency: checks.postVetConsistency,
          critical: true,
        },
      });
      return { vettedLetter: checks.finalLetter, vettingReport: currentReport, critical: true };
    }

    if (!checks.validation.valid) {
      console.warn(
        `[Pipeline] Stage 4: Non-critical structural issues for letter #${letterId} (proceeding with best available): ${checks.validation.errors.join("; ")}`
      );
      addValidationResult(pipelineCtx, {
        stage: "vetting",
        check: "non_critical_warnings",
        passed: true,
        errors: [],
        warnings: checks.validation.errors,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(
      `[Pipeline] Stage 4 complete for letter #${letterId}: risk=${currentReport.riskLevel}, changes=${currentReport.changesApplied.length}, bloat_removed=${currentReport.bloatPhrasesRemoved.length}`
    );

    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      promptTokens: vettingTokens.promptTokens,
      completionTokens: vettingTokens.completionTokens,
      estimatedCostUsd: calculateCost(vettingModelKey, vettingTokens),
      errorMessage: checks.validation.valid ? undefined : formatStructuredError(
        PIPELINE_ERROR_CODES.VETTING_REJECTED,
        "Vetting validation issues",
        "vetting",
        checks.validation.errors.join("; ")
      ),
      responsePayloadJson: {
        provider: vettingProvider,
        failoverUsed: vettingProvider === "openai-failover" || vettingProvider === "groq-oss-fallback",
        vettingReport: currentReport,
        bloatDetected: detectedBloat.length,
        preVetCitationAudit: {
          verified: preVetCitationAudit.verifiedCitations.length,
          unverified: preVetCitationAudit.unverifiedCitations.length,
          riskScore: preVetCitationAudit.hallucinationRiskScore,
        },
        postVetCitationAudit: {
          verified: checks.postVetCitationAudit.verifiedCitations.length,
          unverified: checks.postVetCitationAudit.unverifiedCitations.length,
          riskScore: checks.postVetCitationAudit.hallucinationRiskScore,
        },
        postVetConsistency: checks.postVetConsistency,
        critical: false,
      },
    });

    console.log(
      `[Pipeline] Stage 4 complete for letter #${letterId}: provider=${vettingProvider}, risk=${currentReport.riskLevel}`
    );
    return { vettedLetter: checks.finalLetter, vettingReport: currentReport, critical: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 4 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "vetting", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    addValidationResult(pipelineCtx, {
      stage: "vetting",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    });
    const vettingErrCode = err instanceof PipelineError ? err.code : classifyErrorCode(err);
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: formatStructuredError(vettingErrCode, msg, "vetting"),
      completedAt: new Date(),
      promptTokens: vettingTokens.promptTokens,
      completionTokens: vettingTokens.completionTokens,
      estimatedCostUsd: vettingTokens.promptTokens > 0 ? calculateCost(vettingModelKey, vettingTokens) : undefined,
    });
    throw err instanceof PipelineError ? err : new PipelineError(vettingErrCode, `Stage 4 vetting failed for letter #${letterId}: ${msg}`, "vetting");
  }
}

// ═══════════════════════════════════════════════════════
// FINALIZE LETTER (post-vetting: version, status, email)
// ═══════════════════════════════════════════════════════

export async function finalizeLetterAfterVetting(
  letterId: number,
  vettedLetter: string,
  vettingReport: VettingReport,
  pipelineCtx?: PipelineContext,
): Promise<void> {
  const qualityWarnings = pipelineCtx?.qualityWarnings ?? [];
  const isDegraded = qualityWarnings.length > 0;

  // Always explicitly set qualityDegraded so a clean re-run resets a previously-degraded letter
  await setLetterQualityDegraded(letterId, isDegraded);

  const version = await createLetterVersion({
    letterRequestId: letterId,
    versionType: "ai_draft",
    content: vettedLetter,
    createdByType: "system",
    metadataJson: {
      provider: "multi-provider",
      researchProvider: pipelineCtx?.researchProvider,
      failoverUsed: qualityWarnings.some(w =>
        w.includes("_FAILOVER:") || w.includes("FAILOVER")
      ),
      stage: "vetted_final",
      vettingReport,
      counterArguments: pipelineCtx?.counterArguments,
      researchUnverified: pipelineCtx?.researchUnverified ?? false,
      webGrounded: pipelineCtx?.webGrounded ?? true,
      citationRegistry: pipelineCtx?.citationRegistry ?? [],
      validationResults: pipelineCtx?.validationResults,
      wordCount: vettedLetter.split(/\s+/).filter(w => w.length > 0).length,
      qualityDegraded: isDegraded,
      qualityWarnings,
    },
  });
  const versionId = (version as any)?.insertId ?? 0;

  await updateLetterVersionPointers(letterId, {
    currentAiDraftVersionId: versionId,
  });

  const finalStatus = "generated_locked" as const;
  await updateLetterStatus(letterId, finalStatus);

  const noteText = isDegraded
    ? `Draft ready with quality warnings. Our AI completed research, drafting, and vetting, but some checks raised flags (see attorney-only notes). Attorney review will address these. ${qualityWarnings.length} quality warning(s) attached.`
    : `Draft ready. Our legal team has completed research, drafting, and quality vetting. Submit for attorney review to receive your finalised letter.`;

  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "ai_pipeline_completed",
    noteText,
    noteVisibility: isDegraded ? "internal" : "user_visible",
    fromStatus: "drafting",
    toStatus: finalStatus,
  });

  // ── Admin alert for degraded drafts (normal completion path) ────────────────
  if (isDegraded) {
    (async () => {
      try {
        const appBaseUrl = process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
        const admins = await getAllUsers("admin");
        for (const admin of admins) {
          if (admin.email) {
            sendAdminAlertEmail({
              to: admin.email,
              name: admin.name ?? "Admin",
              subject: `Quality-flagged draft produced for letter #${letterId}`,
              preheader: `Vetting raised quality warnings — attorney scrutiny required`,
              bodyHtml: `<p>Letter #${letterId} completed the pipeline with quality warnings attached.</p><p>Warnings:</p><ul>${qualityWarnings.map(w => `<li>${w}</li>`).join("")}</ul><p>The draft is in <strong>generated_locked</strong> status and requires heightened attorney scrutiny upon review.</p>`,
              ctaText: "View Letter",
              ctaUrl: `${appBaseUrl}/admin/letters/${letterId}`,
            }).catch(e => console.error(`[Pipeline] Failed admin alert email for degraded draft #${letterId}:`, e));
          }
          createNotification({
            userId: admin.id,
            type: "quality_alert",
            category: "letters",
            title: `Quality-flagged draft: letter #${letterId}`,
            body: `Vetting quality warnings attached (${qualityWarnings.length}). Extra attorney scrutiny needed.`,
            link: `/admin/letters/${letterId}`,
          }).catch(e => console.error(`[Pipeline] Failed notification for degraded draft #${letterId}:`, e));
        }
      } catch (alertErr) {
        console.error(`[Pipeline] Failed to notify admins of quality-degraded draft #${letterId}:`, alertErr);
      }
    })();
  }

  const letterForPaywall = await getLetterById(letterId);
  if (letterForPaywall?.submittedByAdmin) {
    console.log(
      `[Pipeline] Skipping paywall email for #${letterId} — admin-submitted letter`
    );
  } else {
    const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
    if (!wasAlreadyUnlocked) {
      console.log(
        `[Pipeline] Letter #${letterId} is generated_locked — paywall email will fire via cron in ~10–15 min`
      );
    } else {
      console.log(
        `[Pipeline] Skipping paywall email for #${letterId} — previously unlocked`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════
// SHARED ASSEMBLY↔VETTING RETRY LOOP
// ═══════════════════════════════════════════════════════

const MAX_ASSEMBLY_VETTING_RETRIES = 2;

export async function runAssemblyVettingLoop(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput,
  pipelineCtx: PipelineContext,
): Promise<{ vettingResult: { vettedLetter: string; vettingReport: VettingReport; critical: boolean }; assemblyRetries: number }> {
  let assembledLetter = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
  let vettingResult = await runVettingStage(letterId, assembledLetter, intake, research, pipelineCtx);
  let assemblyRetries = 0;

  while (vettingResult.critical && assemblyRetries < MAX_ASSEMBLY_VETTING_RETRIES) {
    assemblyRetries++;
    const lastValidation = pipelineCtx.validationResults
      ?.filter(r => r.stage === "vetting" && r.check === "vetting_output_validation")
      .pop();
    const lastErrors = lastValidation?.errors;
    const reportErrors = vettingResult.vettingReport.jurisdictionIssues
      .concat(vettingResult.vettingReport.citationsFlagged)
      .concat(vettingResult.vettingReport.factualIssuesFound);

    let allCriticalErrors: string[];
    if (lastErrors && lastErrors.length > 0) {
      allCriticalErrors = lastErrors;
    } else if (reportErrors.length > 0) {
      allCriticalErrors = reportErrors;
    } else {
      allCriticalErrors = [vettingResult.vettingReport.overallAssessment || "Vetting flagged critical issues but no specific errors were provided"];
    }

    console.warn(
      `[Pipeline] Assembly↔Vetting retry #${assemblyRetries} for letter #${letterId}: critical issues found: ${allCriticalErrors.join("; ")}`
    );

    addValidationResult(pipelineCtx, {
      stage: "assembly_vetting_retry",
      check: `retry_${assemblyRetries}`,
      passed: false,
      errors: allCriticalErrors,
      warnings: [`Retry triggered by vetting critical flag (attempt ${assemblyRetries}/${MAX_ASSEMBLY_VETTING_RETRIES})`],
      timestamp: new Date().toISOString(),
    });

    pipelineCtx.assemblyVettingFeedback = `CRITICAL ISSUES FROM PREVIOUS ATTEMPT (must fix):\n${allCriticalErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;

    assembledLetter = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
    vettingResult = await runVettingStage(letterId, assembledLetter, intake, research, pipelineCtx);
  }

  return { vettingResult, assemblyRetries };
}

