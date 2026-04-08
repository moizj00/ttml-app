/**
 * Vetting-stage prompt builders and validation helpers.
 *
 * Extracted from vetting.ts to separate pure prompt-construction functions
 * (no I/O, no DB calls) from the orchestration logic that runs them.
 */

import type { IntakeJson, ResearchPacket, CitationRegistryEntry } from "../../shared/types";

// ─── Bloat Phrase Detection ───────────────────────────────────────────────────

export const AI_BLOAT_PHRASES = [
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
] as const;

export function detectBloatPhrases(text: string): string[] {
  const textLower = text.toLowerCase();
  return (AI_BLOAT_PHRASES as readonly string[]).filter(phrase => textLower.includes(phrase));
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

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

// ─── Vetting Report Type ──────────────────────────────────────────────────────

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

// ─── Vetting Output Validation ────────────────────────────────────────────────

export interface PostVetDeterministicContext {
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
