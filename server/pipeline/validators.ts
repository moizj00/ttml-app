import type { IntakeJson, ResearchPacket, DraftOutput, ValidationResult, GroundingReport, ContentConsistencyReport, PipelineContext, TokenUsage, PipelineErrorCode } from "../../shared/types";
import { PIPELINE_ERROR_CODES } from "../../shared/types";
import { type NormalizedPromptInput } from "../intake-normalizer";
import { extractCitationsFromText, normalizeCitation } from "./citations";

// ═══════════════════════════════════════════════════════
// DETERMINISTIC VALIDATORS
// ═══════════════════════════════════════════════════════

export function validateResearchPacket(data: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data || typeof data !== "object")
    return {
      valid: false,
      errors: ["Research packet is not an object"],
      warnings,
    };
  const p = data as Record<string, unknown>;

  // ── Hard requirements (fail validation if missing) ──
  if (
    !p.researchSummary ||
    typeof p.researchSummary !== "string" ||
    p.researchSummary.length < 50
  )
    errors.push("researchSummary must be a non-empty string (min 50 chars)");
  if (!p.jurisdictionProfile || typeof p.jurisdictionProfile !== "object")
    errors.push("jurisdictionProfile is required");
  if (!Array.isArray(p.issuesIdentified) || p.issuesIdentified.length === 0)
    errors.push("issuesIdentified must be a non-empty array");
  if (!Array.isArray(p.applicableRules))
    errors.push("applicableRules must be an array");
  else {
    if (p.applicableRules.length === 0)
      errors.push("applicableRules must be a non-empty array");
    (p.applicableRules as unknown[]).forEach((rule, i) => {
      if (!rule || typeof rule !== "object") {
        errors.push(`applicableRules[${i}] is not an object`);
        return;
      }
      const r = rule as Record<string, unknown>;
      if (!r.ruleTitle)
        errors.push(`applicableRules[${i}].ruleTitle is required`);
      if (!r.summary) errors.push(`applicableRules[${i}].summary is required`);
    });
  }
  if (!Array.isArray(p.draftingConstraints))
    errors.push("draftingConstraints must be an array");

  // ── Soft warnings for new 8-task research fields (backwards compatible) ──
  if (
    !Array.isArray(p.recentCasePrecedents) ||
    p.recentCasePrecedents.length === 0
  )
    warnings.push(
      "recentCasePrecedents missing — drafting stage will proceed without case law citations"
    );
  if (!p.statuteOfLimitations || typeof p.statuteOfLimitations !== "object")
    warnings.push(
      "statuteOfLimitations missing — letter will not include SOL analysis"
    );
  if (!p.preSuitRequirements || typeof p.preSuitRequirements !== "object")
    warnings.push(
      "preSuitRequirements missing — letter may miss mandatory pre-suit notice requirements"
    );
  if (!p.availableRemedies || typeof p.availableRemedies !== "object")
    warnings.push(
      "availableRemedies missing — damages paragraph will be generic"
    );
  if (!Array.isArray(p.commonDefenses) || p.commonDefenses.length === 0)
    warnings.push(
      "commonDefenses missing — letter will not pre-empt anticipated defenses"
    );
  if (!p.enforcementClimate || typeof p.enforcementClimate !== "object")
    warnings.push(
      "enforcementClimate missing — letter will not reference AG/enforcement activity"
    );

  if (warnings.length > 0) {
    console.warn(
      `[Pipeline] Research packet soft warnings: ${warnings.join("; ")}`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function parseAndValidateDraftLlmOutput(raw: string): {
  valid: boolean;
  data?: DraftOutput;
  errors: string[];
} {
  const errors: string[] = [];
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If not JSON, treat raw text as the letter content
    if (raw.trim().length > 100) {
      return {
        valid: true,
        data: {
          draftLetter: raw.trim(),
          attorneyReviewSummary:
            "AI-generated draft — please review carefully.",
          openQuestions: [],
          riskFlags: [],
        },
        errors: [],
      };
    }
    return {
      valid: false,
      errors: ["Could not parse draft output as JSON or plain text"],
    };
  }

  if (!parsed || typeof parsed !== "object")
    return { valid: false, errors: ["Draft output is not an object"] };
  const d = parsed as Record<string, unknown>;
  if (
    !d.draftLetter ||
    typeof d.draftLetter !== "string" ||
    d.draftLetter.length < 100
  )
    errors.push("draftLetter must be a non-empty string (min 100 chars)");
  if (!d.attorneyReviewSummary || typeof d.attorneyReviewSummary !== "string")
    errors.push("attorneyReviewSummary is required");
  if (!Array.isArray(d.openQuestions))
    errors.push("openQuestions must be an array");
  if (!Array.isArray(d.riskFlags)) errors.push("riskFlags must be an array");

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: parsed as DraftOutput, errors: [] };
}

export function validateFinalLetter(text: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!text || text.length < 200)
    errors.push("Final letter must be at least 200 characters");
  if (
    !text.includes("Dear") &&
    !text.includes("To Whom") &&
    !text.includes("RE:") &&
    !text.includes("Re:")
  )
    errors.push(
      "Final letter should contain a proper salutation or subject line"
    );
  if (
    !text.includes("Sincerely") &&
    !text.includes("Respectfully") &&
    !text.includes("Very truly yours") &&
    !text.includes("Regards")
  )
    errors.push("Final letter should contain a proper closing");
  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════
// INTAKE PRE-FLIGHT VALIDATOR
// ═══════════════════════════════════════════════════════

const PLACEHOLDER_NAMES = [
  "unknown sender", "unknown recipient", "address not provided",
  "no description provided", "n/a", "tbd", "test", "placeholder",
];

export function validateIntakeCompleteness(intake: IntakeJson): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (
    !intake.sender?.name ||
    intake.sender.name.trim().length === 0 ||
    PLACEHOLDER_NAMES.includes(intake.sender.name.trim().toLowerCase())
  ) {
    errors.push("Sender name is missing or is a placeholder value. Please provide a real sender name.");
  }

  if (
    !intake.recipient?.name ||
    intake.recipient.name.trim().length === 0 ||
    PLACEHOLDER_NAMES.includes(intake.recipient.name.trim().toLowerCase())
  ) {
    errors.push("Recipient name is missing or is a placeholder value. Please provide a real recipient name.");
  }

  if (
    !intake.jurisdiction?.state ||
    intake.jurisdiction.state.trim().length === 0 ||
    intake.jurisdiction.state.trim().toLowerCase() === "unknown"
  ) {
    errors.push("Jurisdiction state is missing or set to 'Unknown'. Please specify a valid state.");
  }

  const description = intake.matter?.description ?? "";
  if (description.trim().length < 50) {
    errors.push(
      `Matter description is too short (${description.trim().length} chars, minimum 50). Please provide a more detailed description of the legal matter.`
    );
  }

  if (!intake.letterType || intake.letterType.trim().length === 0) {
    errors.push("Letter type is required. Please select a letter type.");
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════
// RETRY WITH VALIDATION ERROR FEEDBACK
// ═══════════════════════════════════════════════════════

const RETRY_BACKOFF_MS = 2000;

export async function retryOnValidationFailure<T>(
  fn: (errorFeedback?: string) => Promise<T>,
  validationErrors: string[],
  stageName: string
): Promise<T> {
  const errorFeedback = `\n\n## VALIDATION ERRORS FROM PREVIOUS ATTEMPT — FIX THESE:\n${validationErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\nYou must fix ALL of the above issues in this attempt. Do not repeat the same mistakes.`;
  console.log(
    `[Pipeline] Retrying ${stageName} with ${validationErrors.length} validation error(s) fed back into prompt (backoff ${RETRY_BACKOFF_MS}ms)`
  );
  await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS));
  return fn(errorFeedback);
}

// ═══════════════════════════════════════════════════════
// CROSS-STAGE CITATION GROUNDING VALIDATOR
// ═══════════════════════════════════════════════════════

export function validateDraftGrounding(
  draftText: string,
  research: ResearchPacket
): GroundingReport {
  const draftCitations = extractCitationsFromText(draftText);

  const researchCitationTexts: string[] = [];
  for (const rule of research.applicableRules ?? []) {
    if (rule.citationText) researchCitationTexts.push(rule.citationText.trim());
    if (rule.ruleTitle) researchCitationTexts.push(rule.ruleTitle.trim());
  }
  for (const c of research.recentCasePrecedents ?? []) {
    if (c.citation) researchCitationTexts.push(c.citation.trim());
    if (c.caseName) researchCitationTexts.push(c.caseName.trim());
  }
  if (research.statuteOfLimitations?.statute) {
    researchCitationTexts.push(research.statuteOfLimitations.statute.trim());
  }
  if (research.preSuitRequirements?.statute) {
    researchCitationTexts.push(research.preSuitRequirements.statute.trim());
  }
  for (const local of research.localJurisdictionElements ?? []) {
    if (local.element) researchCitationTexts.push(local.element.trim());
  }

  const normalizedResearch = researchCitationTexts.map(t => normalizeCitation(t));

  const grounded: string[] = [];
  const ungrounded: string[] = [];

  const tokenize = (s: string): string[] => s.split(/\s+/).filter(t => t.length > 0);

  for (const citation of draftCitations) {
    const citNorm = normalizeCitation(citation);
    const citTokens = tokenize(citNorm);
    const isGrounded = normalizedResearch.some(r => {
      if (r === citNorm || citNorm === r) return true;
      const rTokens = tokenize(r);
      if (citTokens.length === 0) return false;
      const matchCount = citTokens.filter(ct => rTokens.includes(ct)).length;
      const matchRatio = matchCount / citTokens.length;
      return matchRatio >= 0.7;
    });
    if (isGrounded) {
      grounded.push(citation);
    } else {
      ungrounded.push(citation);
    }
  }

  return {
    totalCitationsInDraft: draftCitations.length,
    groundedCitations: grounded,
    ungroundedCitations: ungrounded,
    passed: ungrounded.length <= 2,
  };
}

// ═══════════════════════════════════════════════════════
// PARTY & JURISDICTION CONSISTENCY CHECKER
// ═══════════════════════════════════════════════════════

const US_STATE_NAMES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const STATE_ABBREV_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export function validateContentConsistency(
  text: string,
  intake: NormalizedPromptInput
): ContentConsistencyReport {
  const warnings: string[] = [];
  const textLower = text.toLowerCase();

  const senderLastName = intake.sender.name.split(/\s+/).pop() ?? "";
  const senderNameFound =
    senderLastName.length > 1 && textLower.includes(senderLastName.toLowerCase());
  if (!senderNameFound && senderLastName.length > 1) {
    warnings.push(`Sender's last name "${senderLastName}" not found in output text`);
  }

  const recipientName = intake.recipient.name;
  const recipientLastName = recipientName.split(/\s+/).pop() ?? "";
  const recipientNameFound =
    recipientLastName.length > 1 && textLower.includes(recipientLastName.toLowerCase());
  if (!recipientNameFound && recipientLastName.length > 1) {
    warnings.push(`Recipient's last name "${recipientLastName}" not found in output text`);
  }

  if (
    senderLastName.length > 1 &&
    recipientLastName.length > 1 &&
    senderLastName.toLowerCase() !== recipientLastName.toLowerCase()
  ) {
    const senderAsRecipientPattern = new RegExp(
      `(?:dear|to|attention|addressed\\s+to)\\s+.*?\\b${senderLastName}\\b`,
      "i"
    );
    const recipientAsSenderPattern = new RegExp(
      `(?:sincerely|regards|respectfully|from)\\s*,?\\s*.*?\\b${recipientLastName}\\b`,
      "i"
    );
    if (senderAsRecipientPattern.test(text)) {
      warnings.push(`Possible swapped parties: sender "${senderLastName}" appears as letter recipient`);
    }
    if (recipientAsSenderPattern.test(text)) {
      warnings.push(`Possible swapped parties: recipient "${recipientLastName}" appears as letter signatory`);
    }
  }

  const expectedState = (intake.jurisdiction.state ?? "").trim();
  const expectedStateFromAbbrev = STATE_ABBREV_TO_NAME[expectedState.toUpperCase()] ?? null;
  const expectedStateIsFullName = US_STATE_NAMES.some(
    (s) => s.toLowerCase() === expectedState.toLowerCase()
  );
  const expectedStateFullName = expectedStateFromAbbrev ?? (expectedStateIsFullName ? expectedState : null);
  const expectedStateNormalized = expectedStateFullName ?? expectedState;
  const expectedStateIsKnown =
    expectedStateFromAbbrev !== null || expectedStateIsFullName;
  const jurisdictionFound =
    textLower.includes(expectedState.toLowerCase()) ||
    !!(expectedStateFullName && textLower.includes(expectedStateFullName.toLowerCase()));
  if (!jurisdictionFound) {
    warnings.push(`Expected jurisdiction "${expectedStateNormalized}" not found in output text`);
  }

  let jurisdictionMismatch = false;
  let foundJurisdiction: string | null = null;
  if (!expectedStateIsKnown) {
    console.warn(`[Pipeline] validateContentConsistency: expectedState "${expectedState}" is not a known US state; skipping jurisdiction mismatch loop`);
  }
  for (const state of expectedStateIsKnown ? US_STATE_NAMES : []) {
    if (state.toLowerCase() === expectedState.toLowerCase()) continue;
    if (expectedStateFullName && state.toLowerCase() === expectedStateFullName.toLowerCase()) continue;
    const stateRegex = new RegExp(`\\b${state}\\b`, "i");
    const codePattern = new RegExp(
      `\\b${state.substring(0, 3)}\\.\\s*(?:Civ\\.|Bus\\.|Penal|Rev\\.|Gen\\.|Lab\\.|Gov|Prop)`,
      "i"
    );
    if (stateRegex.test(text) || codePattern.test(text)) {
      const contextCheck = text.match(new RegExp(`.{0,50}\\b${state}\\b.{0,50}`, "i"));
      const contextStr = contextCheck?.[0]?.toLowerCase() ?? "";
      const isLikelyStatutoryRef =
        contextStr.includes("code") ||
        contextStr.includes("§") ||
        contextStr.includes("statute") ||
        contextStr.includes("law") ||
        contextStr.includes("court");
      if (isLikelyStatutoryRef) {
        jurisdictionMismatch = true;
        foundJurisdiction = state;
        warnings.push(
          `JURISDICTION MISMATCH: Letter references "${state}" legal authority but intake specifies "${expectedState}"`
        );
        break;
      }
    }
  }

  return {
    senderNameFound,
    recipientNameFound,
    jurisdictionFound,
    jurisdictionMismatch,
    expectedJurisdiction: expectedState,
    foundJurisdiction,
    passed: !jurisdictionMismatch,
    warnings,
  };
}

export function addValidationResult(
  pipelineCtx: PipelineContext | undefined,
  result: ValidationResult
): void {
  if (!pipelineCtx) return;
  if (!pipelineCtx.validationResults) pipelineCtx.validationResults = [];
  pipelineCtx.validationResults.push(result);
}

