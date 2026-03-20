/**
 * Four-stage AI pipeline for legal letter generation:
 *
 * Stage 1: PERPLEXITY (sonar) — Legal research with web-grounded citations
 * Stage 2: ANTHROPIC (claude-opus-4-5) — Initial draft generation from research packet
 * Stage 3: ANTHROPIC (claude-opus-4-5) — Final professional letter assembly
 * Stage 4: ANTHROPIC (claude-sonnet-4) — Quality vetting: jurisdiction accuracy, anti-hallucination,
 *          anti-bloat enforcement, geopolitical awareness, factual consistency
 *
 * Each stage has deterministic validators before transitioning.
 * All stages log to workflow_jobs and research_runs for audit trail.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import {
  createLetterVersion,
  createResearchRun,
  createWorkflowJob,
  getActiveLessons,
  getLatestResearchRun,
  hasLetterBeenPreviouslyUnlocked,
  logReviewAction,
  markPriorPipelineRunsSuperseded,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateResearchRun,
  updateWorkflowJob,
} from "./db";
import type { IntakeJson, ResearchPacket, DraftOutput, CitationRegistryEntry, CitationAuditReport, CitationAuditEntry, PipelineContext, ValidationResult, GroundingReport, ContentConsistencyReport } from "../shared/types";
import {
  buildNormalizedPromptInput,
  type NormalizedPromptInput,
} from "./intake-normalizer";
import { sendLetterReadyEmail, sendStatusUpdateEmail, sendNewReviewNeededEmail } from "./email";
import { getUserById, getLetterRequestById as getLetterById, getAllUsers, setLetterResearchUnverified } from "./db";
import { captureServerException } from "./sentry";

async function buildLessonsPromptBlock(
  letterType: string,
  jurisdiction: string | null,
  stage: string,
): Promise<string> {
  try {
    const lessons = await getActiveLessons({
      letterType,
      jurisdiction: jurisdiction ?? undefined,
      pipelineStage: stage,
      limit: 10,
    });
    if (!lessons || lessons.length === 0) return "";
    const lines = lessons.map(
      (l: any, i: number) =>
        `${i + 1}. [${l.category}] ${l.lessonText}`,
    );
    return `\n\n## LESSONS FROM PAST ATTORNEY REVIEWS\nThe following lessons have been extracted from attorney feedback on similar letters. Apply them:\n${lines.join("\n")}\n`;
  } catch (err) {
    console.error("[Pipeline] Failed to load lessons for prompt injection:", err);
    return "";
  }
}

// ═══════════════════════════════════════════════════════
// MODEL PROVIDERS
// ═══════════════════════════════════════════════════════

// ── Anthropic (Claude) — direct API, used for Stage 2 (draft) and Stage 3 (assembly) ──
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[Pipeline] ANTHROPIC_API_KEY is not set — cannot run drafting or assembly stages"
    );
  }
  return createAnthropic({ apiKey });
}

/** Stage 1: Perplexity sonar-pro — web-grounded legal research (direct API) */
function getResearchModel() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      "[Pipeline] PERPLEXITY_API_KEY is not set — falling back to Claude for research"
    );
    const anthropic = getAnthropicClient();
    return {
      model: anthropic("claude-opus-4-5"),
      provider: "anthropic-fallback",
    };
  }
  // Perplexity is OpenAI-compatible — use @ai-sdk/openai with custom baseURL
  const perplexity = createOpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
    name: "perplexity",
  });
  return { model: perplexity.chat("sonar-pro"), provider: "perplexity" };
}

/** Stage 2: Anthropic claude-opus-4-5 — initial legal draft (direct Anthropic API) */
function getDraftModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-opus-4-5");
}

/** Stage 3: Anthropic claude-opus-4-5 — final polished letter assembly (direct Anthropic API) */
function getAssemblyModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-opus-4-5");
}

// Timeout constants (ms)
const RESEARCH_TIMEOUT_MS = 90_000; // 90s — Perplexity web search can be slow
const DRAFT_TIMEOUT_MS = 120_000; // 120s — Claude drafting a full legal letter
const ASSEMBLY_TIMEOUT_MS = 120_000; // 120s — Claude final assembly

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

  const expectedState = intake.jurisdiction.state;
  const expectedStateFullName = STATE_ABBREV_TO_NAME[expectedState.toUpperCase()] ?? null;
  const expectedStateNormalized = expectedStateFullName ?? expectedState;
  const jurisdictionFound =
    textLower.includes(expectedState.toLowerCase()) ||
    !!(expectedStateFullName && textLower.includes(expectedStateFullName.toLowerCase()));
  if (!jurisdictionFound) {
    warnings.push(`Expected jurisdiction "${expectedStateNormalized}" not found in output text`);
  }

  let jurisdictionMismatch = false;
  let foundJurisdiction: string | null = null;
  for (const state of US_STATE_NAMES) {
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

function addValidationResult(
  pipelineCtx: PipelineContext | undefined,
  result: ValidationResult
): void {
  if (!pipelineCtx) return;
  if (!pipelineCtx.validationResults) pipelineCtx.validationResults = [];
  pipelineCtx.validationResults.push(result);
}

// ═══════════════════════════════════════════════════════
// CITATION REGISTRY & ANTI-HALLUCINATION ENGINE
// ═══════════════════════════════════════════════════════

export function buildCitationRegistry(research: ResearchPacket): CitationRegistryEntry[] {
  const registry: CitationRegistryEntry[] = [];
  let idx = 1;

  for (const rule of research.applicableRules ?? []) {
    if (rule.citationText && rule.citationText.trim().length > 0) {
      registry.push({
        registryNumber: idx++,
        citationText: rule.citationText.trim(),
        ruleTitle: rule.ruleTitle,
        ruleType: rule.ruleType,
        confidence: rule.confidence ?? "medium",
        sourceUrl: rule.sourceUrl ?? "",
        sourceTitle: rule.sourceTitle ?? "",
        revalidated: false,
      });
    }
  }

  if (Array.isArray(research.recentCasePrecedents)) {
    for (const c of research.recentCasePrecedents) {
      if (c.citation && c.citation.trim().length > 0) {
        registry.push({
          registryNumber: idx++,
          citationText: c.citation.trim(),
          ruleTitle: c.caseName ?? "",
          ruleType: "case_law",
          confidence: "medium",
          sourceUrl: c.sourceUrl ?? "",
          sourceTitle: c.court ?? "",
          revalidated: false,
        });
      }
    }
  }

  if (research.statuteOfLimitations?.statute) {
    registry.push({
      registryNumber: idx++,
      citationText: research.statuteOfLimitations.statute.trim(),
      ruleTitle: "Statute of Limitations",
      ruleType: "statute",
      confidence: "high",
      sourceUrl: "",
      sourceTitle: "",
      revalidated: false,
    });
  }

  if (research.preSuitRequirements?.statute) {
    registry.push({
      registryNumber: idx++,
      citationText: research.preSuitRequirements.statute.trim(),
      ruleTitle: "Pre-Suit Requirement",
      ruleType: "statute",
      confidence: "high",
      sourceUrl: "",
      sourceTitle: "",
      revalidated: false,
    });
  }

  for (const local of research.localJurisdictionElements ?? []) {
    if (local.element && local.element.trim().length > 0) {
      registry.push({
        registryNumber: idx++,
        citationText: local.element.trim(),
        ruleTitle: local.element,
        ruleType: "local_ordinance",
        confidence: local.confidence ?? "medium",
        sourceUrl: local.sourceUrl ?? "",
        sourceTitle: "",
        revalidated: false,
      });
    }
  }

  return registry;
}

export function buildCitationRegistryPromptBlock(registry: CitationRegistryEntry[]): string {
  if (registry.length === 0) return "";
  const lines = registry.map(
    r => `  [REF-${r.registryNumber}] ${r.citationText} (${r.ruleType}, confidence: ${r.confidence})`
  );
  return `
## CITATION REGISTRY — MANDATORY CONSTRAINT
The following is the COMPLETE list of validated legal citations from the research packet.
You may ONLY use citations from this registry, referenced by their registry number (e.g. [REF-1]).
Adding ANY citation, statute, case name, or legal reference NOT in this list is STRICTLY FORBIDDEN.
If you need to reference a legal concept that has no citation in this registry, write:
"[CITATION REQUIRES ATTORNEY VERIFICATION]" instead.

${lines.join("\n")}

TOTAL REGISTERED CITATIONS: ${registry.length}
RULE: Use ONLY [REF-N] identifiers from the list above. Do NOT invent or add any citation not listed.
`;
}

export async function revalidateCitationsWithPerplexity(
  registry: CitationRegistryEntry[],
  jurisdiction: string,
  letterId: number
): Promise<CitationRegistryEntry[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      `[Pipeline] PERPLEXITY_API_KEY not set — skipping citation revalidation for letter #${letterId}`
    );
    return registry;
  }

  const perplexity = createOpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
    name: "perplexity",
  });

  const citationList = registry
    .map(r => `${r.registryNumber}. "${r.citationText}" (${r.ruleType})`)
    .join("\n");

  const prompt = `You are a legal citation verification engine. Verify whether each of the following legal citations is real and currently valid in ${jurisdiction}. For each citation, respond with the number and either "VALID" or "INVALID" and a brief reason.

Citations to verify:
${citationList}

Respond in this exact format, one per line:
1. VALID - [brief reason]
2. INVALID - [brief reason]
...`;

  try {
    console.log(
      `[Pipeline] Revalidating ${registry.length} citations with Perplexity for letter #${letterId}`
    );
    const { text } = await generateText({
      model: perplexity.chat("sonar-pro"),
      prompt,
      maxOutputTokens: 2000,
      abortSignal: AbortSignal.timeout(60_000),
    });

    const updatedRegistry = registry.map(entry => ({ ...entry }));

    const lines = text.split("\n").filter(l => l.trim().length > 0);
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*(VALID|INVALID)/i);
      if (match) {
        const num = parseInt(match[1]);
        const isValid = match[2].toUpperCase() === "VALID";
        const regEntry = updatedRegistry.find(r => r.registryNumber === num);
        if (regEntry) {
          regEntry.revalidated = true;
          if (!isValid) {
            regEntry.confidence = "low";
          }
        }
      }
    }

    console.log(
      `[Pipeline] Citation revalidation complete for letter #${letterId}: ${updatedRegistry.filter(r => r.revalidated).length}/${registry.length} checked`
    );
    return updatedRegistry;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Pipeline] Citation revalidation failed for letter #${letterId}: ${msg}. Continuing with unvalidated registry.`
    );
    return registry;
  }
}

const CITATION_PATTERNS = [
  /§\s*[\d.]+(?:\([a-z]\))?/g,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+v\.\s+[A-Z][a-z]+(?:[\w\s,]*\d{4})?/g,
  /\b\d+\s+[A-Z]\.\w+\.?\s*(?:\d+[a-z]*\s+)?\d+/g,
  /\b(?:Cal\.|Tex\.|N\.Y\.|Fla\.|Ill\.|Ohio|Pa\.|Ga\.|Mass\.|Mich\.|Wash\.|Va\.)[\s\w.]*§\s*[\d.]+/g,
  /\b\d+\s+(?:U\.S\.C\.|C\.F\.R\.|F\.\d+[a-z]*|F\.Supp\.\d*|S\.Ct\.|L\.Ed\.\d*)\s*§?\s*\d+/g,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Code\s+§\s*[\d.]+/g,
];

export function extractCitationsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of CITATION_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags));
    if (matches) {
      for (const m of matches) {
        found.add(m.trim());
      }
    }
  }
  return Array.from(found);
}

function normalizeCitation(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:'"()[\]{}]/g, "")
    .replace(/§/g, "section")
    .trim();
}

export function runCitationAudit(
  letterText: string,
  registry: CitationRegistryEntry[]
): CitationAuditReport {
  const extractedCitations = extractCitationsFromText(letterText);
  const verified: CitationAuditEntry[] = [];
  const unverified: CitationAuditEntry[] = [];

  const normalizedRegistry = registry.map(r => ({
    entry: r,
    normalized: normalizeCitation(r.citationText),
  }));

  for (const citation of extractedCitations) {
    const citNorm = normalizeCitation(citation);
    const matchedEntry = normalizedRegistry.find(r =>
      r.normalized.includes(citNorm) || citNorm.includes(r.normalized)
    )?.entry ?? null;

    if (matchedEntry) {
      verified.push({
        citation,
        registryNumber: matchedEntry.registryNumber,
        status: "verified",
        confidence: matchedEntry.confidence,
        source: "research_packet",
      });
    } else {
      unverified.push({
        citation,
        registryNumber: null,
        status: "unverified",
        confidence: "low",
        source: "claude_generated",
      });
    }
  }

  const total = verified.length + unverified.length;
  const riskScore = total > 0 ? Math.round((unverified.length / total) * 100) : 0;

  return {
    verifiedCitations: verified,
    unverifiedCitations: unverified,
    totalCitations: total,
    hallucinationRiskScore: riskScore,
    auditedAt: new Date().toISOString(),
  };
}

export function replaceUnverifiedCitations(
  letterText: string,
  auditReport: CitationAuditReport
): string {
  let result = letterText;
  for (const entry of auditReport.unverifiedCitations) {
    const escaped = entry.citation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "g");
    result = result.replace(regex, "[CITATION REQUIRES ATTORNEY VERIFICATION]");
  }
  return result;
}

// ═══════════════════════════════════════════════════════
// STAGE 1: PERPLEXITY LEGAL RESEARCH
// ═══════════════════════════════════════════════════════

export async function runResearchStage(
  letterId: number,
  intake: IntakeJson,
  pipelineCtx?: PipelineContext
): Promise<{ packet: ResearchPacket; provider: string }> {
  const researchConfig = getResearchModel();
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "research",
    provider: researchConfig.provider,
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      letterType: intake.letterType,
      jurisdiction: intake.jurisdiction,
      sender: intake.sender,
      recipient: intake.recipient,
    },
  });
  const jobId = (job as any)?.insertId ?? 0;
  const researchRun = await createResearchRun({
    letterRequestId: letterId,
    workflowJobId: jobId,
    provider: researchConfig.provider,
  });
  const runId = (researchRun as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });
  await updateResearchRun(runId, { status: "running" });
  await updateLetterStatus(letterId, "researching");
  try {
    const { notifyAdmins } = await import("./db");
    await notifyAdmins({
      category: "letters",
      type: "pipeline_researching",
      title: `Letter #${letterId} entering research stage`,
      body: `AI pipeline has started researching for letter #${letterId}.`,
      link: `/admin/letters/${letterId}`,
    });
  } catch (err) {
    console.error("[notifyAdmins] pipeline_researching:", err);
  }

  // Build normalized intake for the research prompt
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
  const systemPrompt = buildResearchSystemPrompt();
  const userPrompt = buildResearchUserPrompt(normalizedIntake);

  try {
    console.log(
      `[Pipeline] Stage 1: ${researchConfig.provider} 8-task deep research for letter #${letterId}`
    );
    const { text } = await generateText({
      model: researchConfig.model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 6000,
      abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
    });

    const parseResearchJson = (raw: string): ResearchPacket => {
      const jsonMatch =
        raw.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        raw.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;
      return JSON.parse(jsonStr);
    };

    const generateResearch = async (errorFeedback?: string): Promise<string> => {
      const promptWithFeedback = errorFeedback ? userPrompt + errorFeedback : userPrompt;
      const { text: t } = await generateText({
        model: researchConfig.model,
        system: systemPrompt,
        prompt: promptWithFeedback,
        maxOutputTokens: 6000,
        abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
      });
      return t;
    };

    let researchPacket: ResearchPacket;
    let stage1RetryUsed = false;

    try {
      researchPacket = parseResearchJson(text);
    } catch {
      stage1RetryUsed = true;
      console.warn(
        `[Pipeline] Stage 1: First JSON parse failed for letter #${letterId}. Retrying (1 of 1) with stricter prompt.`
      );
      try {
        const retryText = await retryOnValidationFailure(
          generateResearch,
          ["Response was not valid JSON. Return ONLY a JSON object starting with { and ending with }. No markdown, no explanation."],
          "Stage 1 (JSON parse)"
        );
        researchPacket = parseResearchJson(retryText);
      } catch {
        const failedResult: ValidationResult = {
          stage: "research",
          check: "json_parse",
          passed: false,
          errors: ["Research response could not be parsed as valid JSON after 2 attempts"],
          warnings: [],
          timestamp: new Date().toISOString(),
        };
        addValidationResult(pipelineCtx, failedResult);
        await updateResearchRun(runId, {
          status: "failed",
          errorMessage: "Research response could not be parsed as valid JSON after 2 attempts",
          validationResultJson: failedResult,
        });
        await updateWorkflowJob(jobId, {
          status: "failed",
          errorMessage: "Research response could not be parsed as valid JSON after 2 attempts",
          completedAt: new Date(),
          responsePayloadJson: { validationResult: failedResult },
        });
        throw new Error(
          "Research stage failed: AI response was not valid JSON after 2 attempts. Please try again."
        );
      }
    }

    let validation = validateResearchPacket(researchPacket);

    if (!validation.valid && !stage1RetryUsed) {
      stage1RetryUsed = true;
      try {
        const retryText = await retryOnValidationFailure(
          generateResearch,
          validation.errors,
          "Stage 1 (research validation)"
        );
        researchPacket = parseResearchJson(retryText);
      } catch {
        const failedResult: ValidationResult = {
          stage: "research",
          check: "research_packet_validation_retry",
          passed: false,
          errors: ["Research retry response could not be parsed as JSON"],
          warnings: [],
          timestamp: new Date().toISOString(),
        };
        addValidationResult(pipelineCtx, failedResult);
        await updateResearchRun(runId, {
          status: "failed",
          resultJson: null,
          validationResultJson: failedResult,
          errorMessage: "Research retry response could not be parsed as JSON",
        });
        await updateWorkflowJob(jobId, {
          status: "failed",
          errorMessage: "Research retry response could not be parsed as JSON",
          completedAt: new Date(),
          responsePayloadJson: { validationResult: failedResult },
        });
        throw new Error("Research retry response could not be parsed as JSON");
      }
      validation = validateResearchPacket(researchPacket);
    }

    if (!validation.valid) {
      const failedResult: ValidationResult = {
        stage: "research",
        check: "research_packet_validation",
        passed: false,
        errors: validation.errors,
        warnings: validation.warnings,
        timestamp: new Date().toISOString(),
      };
      addValidationResult(pipelineCtx, failedResult);
      await updateResearchRun(runId, {
        status: "invalid",
        resultJson: researchPacket,
        validationResultJson: failedResult,
        errorMessage: `Validation failed${stage1RetryUsed ? " after retry" : ""}: ${validation.errors.join("; ")}`,
      });
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: `Research validation failed${stage1RetryUsed ? " after retry" : ""}: ${validation.errors.join("; ")}`,
        completedAt: new Date(),
        responsePayloadJson: { validationResult: failedResult },
      });
      throw new Error(
        `Research packet validation failed${stage1RetryUsed ? " after retry" : ""}: ${validation.errors.join("; ")}`
      );
    }

    const isClaudeFallback = researchConfig.provider === "anthropic-fallback";
    const successResult: ValidationResult = {
      stage: "research",
      check: "research_packet_validation",
      passed: true,
      errors: [],
      warnings: [
        ...validation.warnings,
        ...(isClaudeFallback ? ["Research is NOT web-grounded (Claude fallback used)"] : []),
      ],
      timestamp: new Date().toISOString(),
    };

    await updateResearchRun(runId, {
      status: "completed",
      resultJson: researchPacket,
      validationResultJson: { ...successResult, webGrounded: !isClaudeFallback },
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: {
        researchRunId: runId,
        webGrounded: !isClaudeFallback,
        validationResult: successResult,
      },
    });

    if (isClaudeFallback) {
      console.warn(
        `[Pipeline] Stage 1: Claude fallback used for letter #${letterId} — research is NOT web-grounded. Citations may not be verified.`
      );
    }

    console.log(`[Pipeline] Stage 1 complete for letter #${letterId} (provider: ${researchConfig.provider})`);
    return { packet: researchPacket, provider: researchConfig.provider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 1 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "research", letter_id: String(letterId) },
      extra: { researchRunId: runId, jobId, errorMessage: msg },
    });
    const failedResult: ValidationResult = {
      stage: "research",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    };
    await updateResearchRun(runId, {
      status: "failed",
      errorMessage: msg,
      validationResultJson: failedResult,
    });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
      responsePayloadJson: { validationResult: failedResult },
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// STAGE 2: OPENAI DRAFT GENERATION
// ═══════════════════════════════════════════════════════

export async function runDraftingStage(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  pipelineCtx?: PipelineContext
): Promise<DraftOutput> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "draft_generation",
    provider: "anthropic",
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      letterType: intake.letterType,
      sender: intake.sender,
      recipient: intake.recipient,
    },
  });
  const jobId = (job as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });
  await updateLetterStatus(letterId, "drafting");
  try {
    const { notifyAdmins } = await import("./db");
    await notifyAdmins({
      category: "letters",
      type: "pipeline_drafting",
      title: `Letter #${letterId} entering drafting stage`,
      body: `AI pipeline is now drafting letter #${letterId}.`,
      link: `/admin/letters/${letterId}`,
    });
  } catch (err) {
    console.error("[notifyAdmins] pipeline_drafting:", err);
  }

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
  const citationRegistryBlock = pipelineCtx?.citationRegistry
    ? buildCitationRegistryPromptBlock(pipelineCtx.citationRegistry)
    : "";
  const lessonsBlockDrafting = await buildLessonsPromptBlock(intake.letterType, intake.jurisdiction?.state ?? null, "drafting");
  const draftSystemPrompt = buildDraftingSystemPrompt() + citationRegistryBlock + lessonsBlockDrafting;
  // Look up the target word count for this letter type from the shared config
  const { LETTER_TYPE_CONFIG } = await import("../shared/types");
  const letterTypeConfig = LETTER_TYPE_CONFIG[intake.letterType];
  const targetWordCount = letterTypeConfig?.targetWordCount ?? 450;
  console.log(
    `[Pipeline] Stage 2: targetWordCount=${targetWordCount} for letterType=${intake.letterType}`
  );
  const draftUserPrompt = buildDraftingUserPrompt(
    normalizedIntake,
    targetWordCount,
    research
  );

  const generateDraft = async (errorFeedback?: string): Promise<{ text: string }> => {
    const promptWithFeedback = errorFeedback
      ? draftUserPrompt + errorFeedback
      : draftUserPrompt;
    return generateText({
      model: getDraftModel(),
      system: draftSystemPrompt,
      prompt: promptWithFeedback,
      maxOutputTokens: 8000,
      abortSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
  };

  const runAllDraftValidations = (draft: DraftOutput) => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    const grounding = validateDraftGrounding(draft.draftLetter, research);
    if (!grounding.passed) {
      allErrors.push(`${grounding.ungroundedCitations.length} ungrounded citations: ${grounding.ungroundedCitations.join("; ")}. Use ONLY citations from the research packet.`);
    } else if (grounding.ungroundedCitations.length > 0) {
      allWarnings.push(`${grounding.ungroundedCitations.length} ungrounded citation(s): ${grounding.ungroundedCitations.join("; ")}`);
    }

    const consistency = validateContentConsistency(draft.draftLetter, normalizedIntake);
    if (consistency.jurisdictionMismatch) {
      allErrors.push(`JURISDICTION MISMATCH: Letter references "${consistency.foundJurisdiction}" law but intake specifies "${consistency.expectedJurisdiction}". ALL legal citations MUST be for ${consistency.expectedJurisdiction}.`);
    }
    allWarnings.push(...consistency.warnings);

    return { allErrors, allWarnings, grounding, consistency };
  };

  try {
    console.log(
      `[Pipeline] Stage 2: Claude structured drafting for letter #${letterId}`
    );
    let { text } = await generateDraft();
    let validation = parseAndValidateDraftLlmOutput(text);

    let needsRetry = false;
    let retryErrors: string[] = [];

    if (!validation.valid || !validation.data) {
      needsRetry = true;
      retryErrors = validation.errors;
    } else {
      const checks = runAllDraftValidations(validation.data);
      if (checks.allErrors.length > 0) {
        needsRetry = true;
        retryErrors = checks.allErrors;
      }
    }

    if (needsRetry) {
      addValidationResult(pipelineCtx, {
        stage: "draft_generation",
        check: "first_attempt_validation",
        passed: false,
        errors: retryErrors,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      console.warn(
        `[Pipeline] Stage 2: First attempt failed validation for letter #${letterId}: ${retryErrors.join("; ")}. Retrying (1 of 1)...`
      );
      const retryResult = await retryOnValidationFailure(
        async (feedback) => {
          const r = await generateDraft(feedback);
          return parseAndValidateDraftLlmOutput(r.text);
        },
        retryErrors,
        "Stage 2 (consolidated retry)"
      );
      validation = retryResult;
    }

    if (!validation.valid || !validation.data) {
      addValidationResult(pipelineCtx, {
        stage: "draft_generation",
        check: "parse_and_validate",
        passed: false,
        errors: validation.errors,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: `Draft validation failed${needsRetry ? " after retry" : ""}: ${validation.errors.join("; ")}`,
        completedAt: new Date(),
        responsePayloadJson: { validationErrors: validation.errors, retried: needsRetry },
      });
      throw new Error(
        `Draft output validation failed${needsRetry ? " after retry" : ""}: ${validation.errors.join("; ")}`
      );
    }

    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "parse_and_validate",
      passed: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    let draft = validation.data;

    const { allErrors: finalErrors, allWarnings: finalWarnings, grounding: finalGrounding, consistency: finalConsistency } = runAllDraftValidations(draft);

    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "citation_grounding",
      passed: finalGrounding.passed,
      errors: finalGrounding.passed ? [] : [`${finalGrounding.ungroundedCitations.length} ungrounded citations: ${finalGrounding.ungroundedCitations.join("; ")}`],
      warnings: finalGrounding.ungroundedCitations.length > 0 && finalGrounding.ungroundedCitations.length <= 2
        ? [`${finalGrounding.ungroundedCitations.length} ungrounded citation(s): ${finalGrounding.ungroundedCitations.join("; ")}`]
        : [],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "content_consistency",
      passed: finalConsistency.passed,
      errors: finalConsistency.jurisdictionMismatch
        ? [`Jurisdiction mismatch: expected "${finalConsistency.expectedJurisdiction}" but found "${finalConsistency.foundJurisdiction}"`]
        : [],
      warnings: finalConsistency.warnings,
      timestamp: new Date().toISOString(),
    });

    if (finalConsistency.jurisdictionMismatch) {
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: `Draft jurisdiction mismatch${needsRetry ? " persists after retry" : ""}: letter references "${finalConsistency.foundJurisdiction}" but intake specifies "${finalConsistency.expectedJurisdiction}"`,
        completedAt: new Date(),
        responsePayloadJson: {
          validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
          consistencyReport: finalConsistency,
        },
      });
      throw new Error(
        `Draft jurisdiction mismatch${needsRetry ? " persists after retry" : ""}: letter references "${finalConsistency.foundJurisdiction}" but intake specifies "${finalConsistency.expectedJurisdiction}"`
      );
    }

    if (!finalGrounding.passed) {
      draft.groundingWarnings = finalGrounding.ungroundedCitations;
      console.warn(
        `[Pipeline] Stage 2: ${finalGrounding.ungroundedCitations.length} ungrounded citations for letter #${letterId}${needsRetry ? " after retry" : ""}. Storing with groundingWarnings.`
      );
    }

    if (pipelineCtx) {
      pipelineCtx.groundingReport = finalGrounding;
      pipelineCtx.consistencyReport = finalConsistency;
    }

    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: draft.draftLetter,
      createdByType: "system",
      metadataJson: {
        provider: "anthropic",
        stage: "draft_generation",
        attorneyReviewSummary: draft.attorneyReviewSummary,
        openQuestions: draft.openQuestions,
        riskFlags: draft.riskFlags,
        reviewNotes: draft.reviewNotes,
        citationRegistrySize: pipelineCtx?.citationRegistry?.length ?? 0,
        researchUnverified: pipelineCtx?.researchUnverified ?? false,
        webGrounded: pipelineCtx?.webGrounded ?? true,
        groundingWarnings: draft.groundingWarnings,
        groundingReport: pipelineCtx?.groundingReport,
        consistencyReport: pipelineCtx?.consistencyReport,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
      },
    });
    const versionId = (version as any)?.insertId ?? 0;

    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: versionId,
    });
    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: {
        versionId,
        groundingReport: pipelineCtx?.groundingReport,
        consistencyReport: pipelineCtx?.consistencyReport,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
      },
    });

    console.log(`[Pipeline] Stage 2 complete for letter #${letterId}`);
    return draft;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 2 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "drafting", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    addValidationResult(pipelineCtx, {
      stage: "draft_generation",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
      responsePayloadJson: {
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "draft_generation"),
      },
    });
    throw err;
  }
}
// ═══════════════════════════════════════════════════════
// STAGE 3: CLAUDE FINAL LETTER ASSEMBLYY
// ═══════════════════════════════════════════════════════

export async function runAssemblyStage(
  letterId: number,
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput,
  pipelineCtx?: PipelineContext
): Promise<string> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "draft_generation",
    provider: "anthropic",
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      stage: "final_assembly",
      sender: intake.sender,
      recipient: intake.recipient,
    },
  });
  const jobId = (job as any)?.insertId ?? 0;

  await updateWorkflowJob(jobId, { status: "running", startedAt: new Date() });

  const citationRegistryBlock = pipelineCtx?.citationRegistry
    ? buildCitationRegistryPromptBlock(pipelineCtx.citationRegistry)
    : "";
  const lessonsBlockAssembly = await buildLessonsPromptBlock(intake.letterType, intake.jurisdiction?.state ?? null, "assembly");
  const assemblySystem = buildAssemblySystemPrompt() + citationRegistryBlock + lessonsBlockAssembly;
  const vettingFeedbackBlock = pipelineCtx?.assemblyVettingFeedback
    ? `\n\n## VETTING FEEDBACK FROM PREVIOUS ATTEMPT\n${pipelineCtx.assemblyVettingFeedback}\n\nYou MUST address every issue listed above in this assembly attempt. Do NOT repeat the same errors.\n`
    : "";
  const assemblyUser = buildAssemblyUserPrompt(intake, research, draft) + vettingFeedbackBlock;

  const { LETTER_TYPE_CONFIG } = await import("../shared/types");
  const letterTypeConfig = LETTER_TYPE_CONFIG[intake.letterType];
  const targetWordCount = letterTypeConfig?.targetWordCount ?? 450;

  const generateAssembly = async (errorFeedback?: string): Promise<string> => {
    const promptWithFeedback = errorFeedback
      ? assemblyUser + errorFeedback
      : assemblyUser;
    const { text } = await generateText({
      model: getAssemblyModel(),
      system: assemblySystem,
      prompt: promptWithFeedback,
      maxOutputTokens: 10000,
      abortSignal: AbortSignal.timeout(ASSEMBLY_TIMEOUT_MS),
    });
    return text;
  };

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

  const runAllAssemblyValidations = (letter: string) => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    const structureValidation = validateFinalLetter(letter);
    allErrors.push(...structureValidation.errors);

    const wc = letter.split(/\s+/).filter(w => w.length > 0).length;
    if (wc < minWords) {
      allErrors.push(`Letter is too short: ${wc} words (minimum ${minWords} words, target ${targetWordCount})`);
    }
    if (wc > maxWords) {
      allErrors.push(`Letter is too long: ${wc} words (maximum ${maxWords} words, target ${targetWordCount})`);
    }

    const consistency = validateContentConsistency(letter, normalizedIntake);
    if (consistency.jurisdictionMismatch) {
      allWarnings.push(`JURISDICTION WARNING: Final letter references "${consistency.foundJurisdiction}" but intake specifies "${consistency.expectedJurisdiction}". Stage 4 vetting will enforce this as a hard gate.`);
    }

    return { allErrors, allWarnings, structureValidation, wordCount: wc, consistency };
  };

  const minWords = Math.floor(targetWordCount * 0.6);
  const maxWords = Math.floor(targetWordCount * 2.0);

  try {
    console.log(
      `[Pipeline] Stage 3: Claude final assembly for letter #${letterId}`
    );
    let rawFinalLetter = await generateAssembly();

    let checks = runAllAssemblyValidations(rawFinalLetter);
    let didRetry = false;

    if (checks.allErrors.length > 0) {
      didRetry = true;
      addValidationResult(pipelineCtx, {
        stage: "final_assembly",
        check: "first_attempt_validation",
        passed: false,
        errors: checks.allErrors,
        warnings: [],
        timestamp: new Date().toISOString(),
      });
      console.warn(
        `[Pipeline] Stage 3: First attempt failed validation for letter #${letterId}: ${checks.allErrors.join("; ")}. Retrying (1 of 1)...`
      );
      const retryLetter = await retryOnValidationFailure(
        generateAssembly,
        checks.allErrors,
        "Stage 3 (consolidated retry)"
      );
      rawFinalLetter = retryLetter;
      checks = runAllAssemblyValidations(rawFinalLetter);
    }

    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "letter_validation",
      passed: checks.structureValidation.valid,
      errors: checks.structureValidation.errors,
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "word_count",
      passed: checks.wordCount >= minWords && checks.wordCount <= maxWords,
      errors: checks.wordCount < minWords
        ? [`Letter is too short: ${checks.wordCount} words (minimum ${minWords})`]
        : checks.wordCount > maxWords
          ? [`Letter is too long: ${checks.wordCount} words (maximum ${maxWords})`]
          : [],
      warnings: [`Word count: ${checks.wordCount} (target: ${targetWordCount})`],
      timestamp: new Date().toISOString(),
    });

    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "content_consistency",
      passed: checks.consistency.passed,
      errors: checks.consistency.jurisdictionMismatch
        ? [`Jurisdiction mismatch: expected "${checks.consistency.expectedJurisdiction}" but found "${checks.consistency.foundJurisdiction}"`]
        : [],
      warnings: checks.consistency.warnings,
      timestamp: new Date().toISOString(),
    });

    if (checks.allErrors.length > 0) {
      await updateWorkflowJob(jobId, {
        status: "failed",
        errorMessage: `Final letter validation failed${didRetry ? " after retry" : ""}: ${checks.allErrors.join("; ")}`,
        completedAt: new Date(),
        responsePayloadJson: {
          validationErrors: checks.allErrors,
          retried: didRetry,
          validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "final_assembly"),
          consistencyReport: checks.consistency,
        },
      });
      throw new Error(
        `Final letter validation failed${didRetry ? " after retry" : ""}: ${checks.allErrors.join("; ")}`
      );
    }

    await updateWorkflowJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: {
        consistencyReport: checks.consistency,
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "final_assembly"),
        wordCount: rawFinalLetter.split(/\s+/).filter(w => w.length > 0).length,
        targetWordCount,
      },
    });

    console.log(
      `[Pipeline] Stage 3 complete for letter #${letterId} — assembled letter ready for vetting`
    );
    return rawFinalLetter;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Stage 3 failed for letter #${letterId}:`, msg);
    captureServerException(err, {
      tags: { pipeline_stage: "assembly", letter_id: String(letterId) },
      extra: { jobId, errorMessage: msg },
    });
    addValidationResult(pipelineCtx, {
      stage: "final_assembly",
      check: "stage_completion",
      passed: false,
      errors: [msg],
      warnings: [],
      timestamp: new Date().toISOString(),
    });
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
      responsePayloadJson: {
        validationResults: pipelineCtx?.validationResults?.filter(v => v.stage === "final_assembly"),
      },
    });
    throw err;
  }
}
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

function detectBloatPhrases(text: string): string[] {
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
}

function buildVettingSystemPrompt(
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
    "riskLevel": "low|medium|high"
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

function buildVettingUserPrompt(
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

function validateVettingOutput(
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

  const hasClosing = /(?:sincerely|regards|respectfully|very truly yours)/i.test(vettedLetter);
  const hasSalutation = /(?:dear|re:|attention)/i.test(vettedLetter);
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

  return { valid: errors.length === 0, errors, critical };
}

export async function runVettingStage(
  letterId: number,
  assembledLetter: string,
  intake: IntakeJson,
  research: ResearchPacket,
  pipelineCtx?: PipelineContext,
): Promise<{ vettedLetter: string; vettingReport: VettingReport; critical: boolean }> {
  const job = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "draft_generation",
    provider: "anthropic",
    requestPayloadJson: {
      letterId,
      userId: pipelineCtx?.userId,
      stage: "vetting",
    },
  });
  const jobId = (job as any)?.insertId ?? 0;
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

  const lessonsBlockVetting = await buildLessonsPromptBlock(letterType, jurisdiction, "vetting");
  const systemPrompt = buildVettingSystemPrompt(jurisdiction, letterType, detectedBloat) + lessonsBlockVetting;
  const baseUserPrompt = buildVettingUserPrompt(assembledLetter, intake, research, citationRegistry);
  const preVetBlock = preVetIssues.length > 0
    ? `\n\n## PRE-VET ISSUES DETECTED (MUST FIX)\n${preVetIssues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}\n`
    : "";
  const userPrompt = baseUserPrompt + preVetBlock;

  const generateVetting = async (errorFeedback?: string): Promise<string> => {
    const promptWithFeedback = errorFeedback
      ? userPrompt + errorFeedback
      : userPrompt;
    const anthropic = getAnthropicClient();
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      prompt: promptWithFeedback,
      maxOutputTokens: 12000,
      abortSignal: AbortSignal.timeout(VETTING_TIMEOUT_MS),
    });
    return text;
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
        },
      };
    } catch {
      return null;
    }
  };

  try {
    console.log(
      `[Pipeline] Stage 4: Claude vetting pass for letter #${letterId}`
    );

    let rawResponse = await generateVetting();
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
          errorMessage: failMsg,
          completedAt: new Date(),
        });
        throw new Error(failMsg);
      }
    }

    const runPostVetChecks = (letter: string, report: VettingReport) => {
      const postVetCitationAudit = runCitationAudit(letter, citationRegistry);
      if (postVetCitationAudit.unverifiedCitations.length > 0) {
        report.citationsFlagged.push(
          ...postVetCitationAudit.unverifiedCitations.map(c => c.citation)
        );
        report.citationsRemoved += postVetCitationAudit.unverifiedCitations.length;
      }

      const postVetConsistency = validateContentConsistency(letter, normalizedIntake);
      if (postVetConsistency.jurisdictionMismatch) {
        report.jurisdictionIssues.push(
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

      const validation = validateVettingOutput(report, assembledLetter, finalLetter, postVetCtx);
      return { finalLetter, postVetCitationAudit, postVetConsistency, validation };
    };

    let currentLetter = parsed.vettedLetter;
    let currentReport = parsed.vettingReport;
    let checks = runPostVetChecks(currentLetter, { ...currentReport });

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
        const retryChecks = runPostVetChecks(retryParsed.vettedLetter, { ...retryParsed.vettingReport });

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

    await updateWorkflowJob(jobId, {
      status: checks.validation.valid ? "completed" : "failed",
      completedAt: new Date(),
      errorMessage: checks.validation.valid ? undefined : `Vetting validation failed: ${checks.validation.errors.join("; ")}`,
      responsePayloadJson: {
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
        critical: checks.validation.critical,
      },
    });

    if (checks.validation.critical) {
      console.error(
        `[Pipeline] Stage 4: CRITICAL issues for letter #${letterId} (needs assembly retry): ${checks.validation.errors.join("; ")}`
      );
      return { vettedLetter: checks.finalLetter, vettingReport: currentReport, critical: true };
    }

    if (!checks.validation.valid) {
      const failMsg = `Stage 4 vetting validation failed for letter #${letterId} (non-critical structural issues after retry): ${checks.validation.errors.join("; ")}`;
      console.error(`[Pipeline] ${failMsg}`);
      throw new Error(failMsg);
    }

    console.log(
      `[Pipeline] Stage 4 complete for letter #${letterId}: risk=${currentReport.riskLevel}, changes=${currentReport.changesApplied.length}, bloat_removed=${currentReport.bloatPhrasesRemoved.length}`
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
    await updateWorkflowJob(jobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    throw new Error(`Stage 4 vetting failed for letter #${letterId}: ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════
// FINALIZE LETTER (post-vetting: version, status, email)
// ═══════════════════════════════════════════════════════

async function finalizeLetterAfterVetting(
  letterId: number,
  vettedLetter: string,
  vettingReport: VettingReport,
  pipelineCtx?: PipelineContext,
): Promise<void> {
  const version = await createLetterVersion({
    letterRequestId: letterId,
    versionType: "ai_draft",
    content: vettedLetter,
    createdByType: "system",
    metadataJson: {
      provider: "anthropic",
      stage: "vetted_final",
      vettingReport,
      researchUnverified: pipelineCtx?.researchUnverified ?? false,
      webGrounded: pipelineCtx?.webGrounded ?? true,
      citationRegistry: pipelineCtx?.citationRegistry ?? [],
      validationResults: pipelineCtx?.validationResults,
      wordCount: vettedLetter.split(/\s+/).filter(w => w.length > 0).length,
    },
  });
  const versionId = (version as any)?.insertId ?? 0;

  await updateLetterVersionPointers(letterId, {
    currentAiDraftVersionId: versionId,
  });

  const finalStatus = "generated_locked" as const;
  await updateLetterStatus(letterId, finalStatus);
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "ai_pipeline_completed",
    noteText: `Draft ready. Our legal team has completed research, drafting, and quality vetting. Submit for attorney review to receive your finalised letter.`,
    noteVisibility: "user_visible",
    fromStatus: "drafting",
    toStatus: finalStatus,
  });

  const letterRecord = await getLetterById(letterId);
  const wasAlreadyUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
  if (!wasAlreadyUnlocked) {
    (() => {
      const record = letterRecord;
      if (!record) return;
      getUserById(record.userId)
        .then(async subscriber => {
          const appBaseUrl =
            process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
          if (subscriber?.email) {
            await sendLetterReadyEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: record.subject,
              letterId,
              appUrl: appBaseUrl,
              letterType: record.letterType ?? undefined,
              jurisdictionState: record.jurisdictionState ?? undefined,
            });
            console.log(
              `[Pipeline] Letter-ready email sent to ${subscriber.email} for letter #${letterId}`
            );
          }
        })
        .catch(emailErr =>
          console.error(
            `[Pipeline] Failed to send letter-ready email for #${letterId}:`,
            emailErr
          )
        );
    })();
  } else {
    console.log(
      `[Pipeline] Skipping letter-ready (paywall) email for #${letterId} — previously unlocked`
    );
  }
}

// ═══════════════════════════════════════════════════════
// FULL PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════

export async function runFullPipeline(
  letterId: number,
  intake: IntakeJson,
  dbFields?: {
    subject: string;
    issueSummary?: string | null;
    jurisdictionCountry?: string | null;
    jurisdictionState?: string | null;
    jurisdictionCity?: string | null;
    letterType: string;
  },
  userId?: number
): Promise<void> {
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    console.error(
      `[Pipeline] Intake pre-flight failed for letter #${letterId}: ${intakeCheck.errors.join("; ")}`
    );
    throw new Error(
      `Intake validation failed: ${intakeCheck.errors.join("; ")}`
    );
  }

  const normalizedInput = buildNormalizedPromptInput(
    dbFields ?? {
      subject: intake.matter?.subject ?? "Legal Matter",
      issueSummary: intake.matter?.description,
      jurisdictionCountry: intake.jurisdiction?.country,
      jurisdictionState: intake.jurisdiction?.state,
      jurisdictionCity: intake.jurisdiction?.city,
      letterType: intake.letterType,
    },
    intake
  );
  console.log(
    `[Pipeline] Normalized intake for letter #${letterId}: letterType=${normalizedInput.letterType}, jurisdiction=${normalizedInput.jurisdiction.state}`
  );

  // ── Try n8n workflow first (primary path) ──────────────────────────────────
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL ?? "";
  const n8nCallbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";
  // ── Routing: Direct 4-stage pipeline is PRIMARY.
  // Set N8N_PRIMARY=true in env to route through n8n instead (useful for debugging/experimentation).
  const useN8nPrimary =
    process.env.N8N_PRIMARY === "true" &&
    !!n8nWebhookUrl &&
    n8nWebhookUrl.startsWith("https://");
  if (useN8nPrimary) {
    const pipelineJob = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "generation_pipeline",
      provider: "n8n",
      requestPayloadJson: {
        letterId,
        stages: ["n8n-perplexity-research", "n8n-openai-draft"],
        normalizedInput,
      },
    });
    const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;
    await updateWorkflowJob(pipelineJobId, {
      status: "running",
      startedAt: new Date(),
    });
    await updateLetterStatus(letterId, "researching");

    try {
      console.log(
        `[Pipeline] Triggering n8n workflow for letter #${letterId}: ${n8nWebhookUrl}`
      );
      const callbackUrl = `${process.env.BUILT_IN_FORGE_API_URL ? "" : ""}/api/pipeline/n8n-callback`;
      // We fire-and-forget the n8n webhook — the callback endpoint will handle the result
      const payload = {
        letterId,
        letterType: intake.letterType,
        userId: intake.sender?.name ?? "unknown",
        callbackUrl:
          callbackUrl ||
          `https://www.talk-to-my-lawyer.com/api/pipeline/n8n-callback`,
        callbackSecret: n8nCallbackSecret,
        intakeData: {
          sender: intake.sender,
          recipient: intake.recipient,
          jurisdictionState: intake.jurisdiction?.state ?? "",
          jurisdictionCountry: intake.jurisdiction?.country ?? "US",
          matter: intake.matter,
          desiredOutcome: intake.desiredOutcome,
          letterType: intake.letterType,
          tonePreference: intake.tonePreference,
          financials: intake.financials,
          additionalContext: intake.additionalContext,
        },
      };

      // Correct stale webhook URL path if needed
      const resolvedWebhookUrl = n8nWebhookUrl.includes("ttml-legal-pipeline")
        ? n8nWebhookUrl.replace(
            "ttml-legal-pipeline",
            "legal-letter-submission"
          )
        : n8nWebhookUrl;
      const response = await fetch(resolvedWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // n8n webhook uses headerAuth — the credential's header name is X-Auth-Token
          "X-Auth-Token": n8nCallbackSecret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10s to get acknowledgment
      });

      if (response.ok) {
        const ack = await response.json().catch(() => ({}));
        console.log(`[Pipeline] n8n acknowledged letter #${letterId}:`, ack);
        await updateWorkflowJob(pipelineJobId, {
          status: "running",
          responsePayloadJson: { ack, mode: "n8n-async" },
        });
        // n8n will call back when done — we return here and let the callback handle the rest
        return;
      } else {
        const errText = await response.text().catch(() => "unknown");
        console.warn(
          `[Pipeline] n8n returned ${response.status} for letter #${letterId}: ${errText}. Falling back to in-app pipeline.`
        );
        await updateWorkflowJob(pipelineJobId, {
          status: "failed",
          errorMessage: `n8n returned ${response.status}: ${errText}`,
          completedAt: new Date(),
        });
      }
    } catch (n8nErr) {
      const n8nMsg = n8nErr instanceof Error ? n8nErr.message : String(n8nErr);
      console.warn(
        `[Pipeline] n8n call failed for letter #${letterId}: ${n8nMsg}. Falling back to in-app pipeline.`
      );
    }
  } else {
    console.log(
      `[Pipeline] N8N_PRIMARY not set — using direct 4-stage pipeline (primary path) for letter #${letterId}`
    );
  }

  // ── Mark stale pipeline runs as superseded before starting fresh ──────────
  await markPriorPipelineRunsSuperseded(letterId);

  // ── Fallback: In-app 4-stage pipeline ─────────────────────────────────────
  const pipelineJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "generation_pipeline",
    provider: "multi-provider",
    requestPayloadJson: {
      letterId,
      stages: ["perplexity-research", "anthropic-draft", "anthropic-assembly", "anthropic-vetting"],
      normalizedInput,
    },
  });
  const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;
  await updateWorkflowJob(pipelineJobId, {
    status: "running",
    startedAt: new Date(),
  });

  const pipelineCtx: PipelineContext = {
    letterId,
    userId: userId ?? 0,
    intake,
  };

  try {
    // Stage 1: Perplexity Research
    pipelineCtx.validationResults = [];

    const { packet: research, provider: researchProvider } = await runResearchStage(letterId, intake, pipelineCtx);
    pipelineCtx.researchProvider = researchProvider;
    pipelineCtx.researchUnverified = researchProvider === "anthropic-fallback";
    pipelineCtx.webGrounded = researchProvider !== "anthropic-fallback";
    await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);

    addValidationResult(pipelineCtx, {
      stage: "intake",
      check: "intake_completeness",
      passed: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    });

    let citationRegistry = buildCitationRegistry(research);
    console.log(
      `[Pipeline] Built citation registry for letter #${letterId}: ${citationRegistry.length} citations extracted`
    );

    if (!pipelineCtx.researchUnverified && citationRegistry.length > 0) {
      const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
      citationRegistry = await revalidateCitationsWithPerplexity(
        citationRegistry, jurisdiction, letterId
      );
    }
    pipelineCtx.citationRegistry = citationRegistry;

    const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);

    const MAX_ASSEMBLY_VETTING_RETRIES = 2;
    let assembledLetter = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
    let vettingResult = await runVettingStage(letterId, assembledLetter, intake, research, pipelineCtx);
    let assemblyRetries = 0;

    while (vettingResult.critical && assemblyRetries < MAX_ASSEMBLY_VETTING_RETRIES) {
      assemblyRetries++;
      const lastValidation = pipelineCtx.validationResults
        ?.filter(r => r.stage === "vetting" && r.check === "vetting_output_validation")
        .pop();
      const allCriticalErrors = lastValidation?.errors ?? vettingResult.vettingReport.jurisdictionIssues
        .concat(vettingResult.vettingReport.citationsFlagged)
        .concat(vettingResult.vettingReport.factualIssuesFound);

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

    if (vettingResult.critical) {
      const failMsg = `Pipeline failed: vetting found critical issues after ${assemblyRetries} assembly retries for letter #${letterId}. Issues: ${vettingResult.vettingReport.jurisdictionIssues.concat(vettingResult.vettingReport.citationsFlagged).join("; ")}`;
      console.error(`[Pipeline] ${failMsg}`);
      throw new Error(failMsg);
    }

    await finalizeLetterAfterVetting(letterId, vettingResult.vettedLetter, vettingResult.vettingReport, pipelineCtx);

    await updateWorkflowJob(pipelineJobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
        vettingReport: vettingResult.vettingReport,
        assemblyRetries,
      },
    });
    console.log(
      `[Pipeline] Full 4-stage in-app pipeline completed for letter #${letterId} (vetting risk: ${vettingResult.vettingReport.riskLevel}, assembly retries: ${assemblyRetries})`
    );

    // ── Auto-unlock: if the letter was previously unlocked (paid/free),
    // skip generated_locked and go straight to pending_review ──
    try {
      await autoAdvanceIfPreviouslyUnlocked(letterId);
    } catch (autoUnlockErr) {
      console.error(
        `[Pipeline] Auto-unlock check failed for letter #${letterId} (pipeline still succeeded):`,
        autoUnlockErr
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[Pipeline] Full pipeline failed for letter #${letterId}:`,
      msg
    );
    captureServerException(err, {
      tags: { pipeline_stage: "full_pipeline", letter_id: String(letterId) },
      extra: { pipelineJobId, errorMessage: msg },
    });
    await updateWorkflowJob(pipelineJobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    await updateLetterStatus(letterId, "submitted"); // revert to allow retry
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// AUTO-ADVANCE (previously unlocked letters skip paywall)
// ═══════════════════════════════════════════════════════

export async function autoAdvanceIfPreviouslyUnlocked(
  letterId: number
): Promise<boolean> {
  const wasUnlocked = await hasLetterBeenPreviouslyUnlocked(letterId);
  if (!wasUnlocked) {
    console.log(
      `[Pipeline] Letter #${letterId} has not been previously unlocked — staying at generated_locked`
    );
    return false;
  }

  console.log(
    `[Pipeline] Letter #${letterId} was previously unlocked — auto-advancing to pending_review`
  );
  await updateLetterStatus(letterId, "pending_review");
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "auto_unlock",
    noteText:
      "Letter was previously unlocked (paid/free). Automatically advanced to pending_review after re-pipeline.",
    noteVisibility: "user_visible",
    fromStatus: "generated_locked",
    toStatus: "pending_review",
  });

  const letterRecord = await getLetterById(letterId);
  if (letterRecord) {
    const appBaseUrl =
      process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
    const subscriber = await getUserById(letterRecord.userId);
    if (subscriber?.email) {
      sendStatusUpdateEmail({
        to: subscriber.email,
        name: subscriber.name ?? "Subscriber",
        subject: letterRecord.subject,
        letterId,
        newStatus: "pending_review",
        appUrl: appBaseUrl,
      }).catch(err =>
        console.error(
          `[Pipeline] Failed to send pending_review email for #${letterId}:`,
          err
        )
      );
    }
    const attorneys = await getAllUsers("attorney");
    for (const attorney of attorneys) {
      if (attorney.email) {
        sendNewReviewNeededEmail({
          to: attorney.email,
          name: attorney.name ?? "Attorney",
          letterSubject: letterRecord.subject,
          letterId,
          letterType: letterRecord.letterType,
          jurisdiction: letterRecord.jurisdictionState ?? "Unknown",
          appUrl: appBaseUrl,
        }).catch(err =>
          console.error(
            `[Pipeline] Failed to notify attorney for #${letterId}:`,
            err
          )
        );
      }
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════
// RETRY LOGIC
// ═══════════════════════════════════════════════════════

export async function retryPipelineFromStage(
  letterId: number,
  intake: IntakeJson,
  stage: "research" | "drafting",
  userId?: number
): Promise<void> {
  const intakeCheck = validateIntakeCompleteness(intake);
  if (!intakeCheck.valid) {
    throw new Error(
      `Intake validation failed: ${intakeCheck.errors.join("; ")}`
    );
  }

  const retryJob = await createWorkflowJob({
    letterRequestId: letterId,
    jobType: "retry",
    provider: "multi-provider",
    requestPayloadJson: { letterId, stage, userId },
  });
  const retryJobId = (retryJob as any)?.insertId ?? 0;
  await updateWorkflowJob(retryJobId, {
    status: "running",
    startedAt: new Date(),
  });

  const pipelineCtx: PipelineContext = {
    letterId,
    userId: userId ?? 0,
    intake,
    validationResults: [],
  };

  const runVettingAndFinalize = async (
    research: ResearchPacket,
    draft: DraftOutput,
    initialAssembled: string
  ) => {
    const MAX_ASSEMBLY_VETTING_RETRIES = 2;
    let assembled = initialAssembled;
    let vettingResult = await runVettingStage(letterId, assembled, intake, research, pipelineCtx);
    let assemblyRetries = 0;
    while (vettingResult.critical && assemblyRetries < MAX_ASSEMBLY_VETTING_RETRIES) {
      assemblyRetries++;
      const lastValidation = pipelineCtx.validationResults
        ?.filter(r => r.stage === "vetting" && r.check === "vetting_output_validation")
        .pop();
      const allCriticalErrors = lastValidation?.errors ?? vettingResult.vettingReport.jurisdictionIssues
        .concat(vettingResult.vettingReport.citationsFlagged)
        .concat(vettingResult.vettingReport.factualIssuesFound);
      pipelineCtx.assemblyVettingFeedback = `CRITICAL ISSUES FROM PREVIOUS ATTEMPT:\n${allCriticalErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
      assembled = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
      vettingResult = await runVettingStage(letterId, assembled, intake, research, pipelineCtx);
    }
    if (vettingResult.critical) {
      throw new Error(`Retry pipeline failed: vetting critical issues after ${assemblyRetries} assembly retries`);
    }
    await finalizeLetterAfterVetting(letterId, vettingResult.vettedLetter, vettingResult.vettingReport, pipelineCtx);
    return vettingResult;
  };

  try {
    if (stage === "research") {
      const { packet: research, provider: researchProvider } = await runResearchStage(letterId, intake, pipelineCtx);
      pipelineCtx.researchProvider = researchProvider;
      pipelineCtx.researchUnverified = researchProvider === "anthropic-fallback";
      pipelineCtx.webGrounded = researchProvider !== "anthropic-fallback";
      await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);
      let citationRegistry = buildCitationRegistry(research);
      if (!pipelineCtx.researchUnverified && citationRegistry.length > 0) {
        const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
        citationRegistry = await revalidateCitationsWithPerplexity(citationRegistry, jurisdiction, letterId);
      }
      pipelineCtx.citationRegistry = citationRegistry;
      const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
      const assembled = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
      await runVettingAndFinalize(research, draft, assembled);
    } else {
      const latestResearch = await getLatestResearchRun(letterId);
      if (!latestResearch?.resultJson)
        throw new Error("No completed research run found for retry");
      const research = latestResearch.resultJson as ResearchPacket;
      pipelineCtx.researchProvider = latestResearch.provider ?? "perplexity";
      pipelineCtx.researchUnverified = latestResearch.provider === "anthropic-fallback";
      pipelineCtx.webGrounded = !pipelineCtx.researchUnverified;
      await setLetterResearchUnverified(letterId, pipelineCtx.researchUnverified);
      let citationRegistry = buildCitationRegistry(research);
      if (!pipelineCtx.researchUnverified && citationRegistry.length > 0) {
        const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
        citationRegistry = await revalidateCitationsWithPerplexity(citationRegistry, jurisdiction, letterId);
      }
      pipelineCtx.citationRegistry = citationRegistry;
      await updateLetterStatus(letterId, "researching", { force: true });
      const draft = await runDraftingStage(letterId, intake, research, pipelineCtx);
      const assembled = await runAssemblyStage(letterId, intake, research, draft, pipelineCtx);
      await runVettingAndFinalize(research, draft, assembled);
    }
    await updateWorkflowJob(retryJobId, {
      status: "completed",
      completedAt: new Date(),
      responsePayloadJson: {
        validationResults: pipelineCtx.validationResults,
        webGrounded: pipelineCtx.webGrounded,
        groundingReport: pipelineCtx.groundingReport,
        consistencyReport: pipelineCtx.consistencyReport,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateWorkflowJob(retryJobId, {
      status: "failed",
      errorMessage: msg,
      completedAt: new Date(),
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// STAGE 1 PROMPT — PERPLEXITY LEGAL RESEARCH
// Split into system + user so Perplexity's search engine
// knows its role before reading the case details.
// ═══════════════════════════════════════════════════════

export function buildResearchSystemPrompt(): string {
  return `You are an elite legal research engine with real-time web search access. 
Your sole mission is to find REAL, CURRENT, VERIFIABLE legal information — not 
summaries, not approximations, not hallucinated statutes.

## Your Research Standards

REAL COURT DECISIONS: You must find actual case law with real case names, 
docket numbers, courts, and years. Example format: 
"Smith v. Jones, 2022 WL 4839201 (Cal. App. 4th 2022)" or 
"Green v. ABC Corp., 187 F.3d 129 (9th Cir. 2021)". 
If you cannot find a real case, say so — never invent citations.

REAL STATUTES: Cite actual code sections with their exact title, chapter, 
and section numbers. Example: "California Civil Code § 1950.5(b)" or 
"Texas Property Code § 92.104". Verify the section is still in effect.

LOCAL ORDINANCES: Search specifically for the city and county named. 
Local ordinances often provide stronger protections or additional requirements 
than state law and are frequently overlooked.

POLITICAL & ENFORCEMENT CONTEXT: Report the current enforcement climate — 
which party controls the relevant legislature, whether the state AG has 
active enforcement campaigns in this area, and any recent legislative 
changes (passed in the last 3 years) that affect this issue.

RECENT EXAMPLES: Find 2–3 real reported cases from the specific state or 
federal circuit covering this jurisdiction decided in the last 5 years. 
Prioritize cases where the fact pattern is similar to the matter described.

JURISDICTIONAL HIERARCHY: Always research in this order:
1. Specific city/county ordinances and local rules
2. State statutes and state administrative regulations  
3. Federal law (if applicable)
4. Relevant federal circuit and state appellate court decisions

STATUTE OF LIMITATIONS: Always find the exact filing deadline for this 
type of claim in this specific state. This is non-negotiable — missing 
it could destroy the client's case.

PRE-SUIT REQUIREMENTS: Many states require demand letters, waiting periods, 
or notice filings before suit. Find the exact requirement for this 
jurisdiction and claim type.

## What You Must NEVER Do
- Invent case names, docket numbers, or statute sections
- Use placeholder citations like "see generally" without a real cite
- Ignore local ordinances in favor of only state/federal law
- Give national averages when jurisdiction-specific data exists
- Use data older than 5 years without flagging it as potentially outdated`;
}

export function buildResearchUserPrompt(intake: NormalizedPromptInput): string {
  const jurisdiction = [
    intake.jurisdiction.city,
    intake.jurisdiction.state,
    intake.jurisdiction.country,
  ]
    .filter(Boolean)
    .join(", ");

  const financialsLine = intake.financials?.amountOwed
    ? `Amount in dispute: $${intake.financials.amountOwed.toLocaleString()} ${intake.financials.currency}`
    : null;

  const today = new Date().toISOString().split("T")[0];

  return `## Legal Matter Requiring Research
Today's date: ${today}

**Letter Type:** ${intake.letterType.replace(/-/g, " ").toUpperCase()}
**Matter Category:** ${intake.matterCategory}
**Jurisdiction (CRITICAL — research must be specific to this location):**
  - Country: ${intake.jurisdiction.country}
  - State/Province: ${intake.jurisdiction.state}
  - City/County: ${intake.jurisdiction.city ?? "Not specified — use state level"}
**Subject:** ${intake.matter.subject}
**Incident Date:** ${intake.matter.incidentDate ?? "Not specified"}
${financialsLine ? `**${financialsLine}**` : ""}
**Desired Outcome:** ${intake.desiredOutcome}
${intake.deadlineDate ? `**Client's Deadline:** ${intake.deadlineDate}` : ""}
${intake.tonePreference === "aggressive" ? "**Note:** Client wants aggressive legal posture — research maximum available remedies including attorney fees, punitive damages, and statutory penalties." : ""}

## Case Facts
${intake.matter.description}

${intake.additionalContext ? `## Additional Context Provided by Client\n${intake.additionalContext}` : ""}

${intake.evidenceSummary ? `## Evidence Available\n${intake.evidenceSummary}` : ""}

${intake.timeline.length > 0 ? `## Timeline of Events\n${intake.timeline.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : ""}

---

## Research Tasks — Complete ALL of the following:

### Task 1: Jurisdiction-Specific Statutes
Search for the primary state statute(s) governing this type of matter in 
**${intake.jurisdiction.state}**. Find the exact code section numbers, 
current text, and any relevant subsections. Check if there have been 
amendments in the last 3 years.

### Task 2: Local Ordinances
Search for **${intake.jurisdiction.city ?? intake.jurisdiction.state}** 
city or county ordinances that apply to this matter. Many municipalities 
have stronger tenant protections, consumer protections, or employer 
obligations than state law.

### Task 3: Real Court Decisions (State + Federal)
Find 2–4 real court decisions from **${intake.jurisdiction.state}** state 
courts OR the relevant federal circuit that cover this exact type of dispute. 
Prioritize decisions from 2019–${new Date().getFullYear()}. Include:
- Full case name and citation
- Court name and year
- The specific holding and how it applies to this matter
- Any damages or remedies awarded

### Task 4: Statute of Limitations
Find the EXACT statute of limitations for this type of claim in 
**${intake.jurisdiction.state}**. Include:
- The specific statute that sets the deadline
- The exact time period
- When the clock starts (discovery rule vs. incident date)
- Any tolling exceptions that might apply here

### Task 5: Pre-Suit Requirements & Demand Letter Rules
Does **${intake.jurisdiction.state}** require a formal demand letter, 
waiting period, or administrative filing before a lawsuit can be filed 
for this type of matter? Find the exact statutory requirement including:
- Required content of any demand notice
- Mandatory waiting period before suit
- Method of delivery required (certified mail, etc.)
- Penalties for failing to send proper notice

### Task 6: Available Remedies & Damages
What specific remedies are available in **${intake.jurisdiction.state}** 
for this type of claim? Research:
- Actual damages formula
- Statutory damages (if any — many consumer/tenant statutes have per-violation amounts)
- Attorney's fees availability (one-way or two-way fee shifting?)
- Punitive damages standard in this state
- Any statutory multipliers (2x, 3x damages)

### Task 7: Political & Enforcement Climate
Research the current enforcement environment in **${intake.jurisdiction.state}**:
- Has the state Attorney General recently pursued cases in this area?
- Are there any active class actions or mass litigation in this jurisdiction for this issue type?
- Any recent legislation (passed since 2022) that strengthened or weakened these protections?
- Which political party controls the relevant regulatory bodies and legislature, and how does that affect enforcement likelihood?

### Task 8: Jurisdiction-Specific Defenses
What are the most common defenses raised by the opposing party 
(${intake.recipient.name}) in ${intake.jurisdiction.state} for this 
type of matter? List the top 3–4 and note which are typically successful.

---

## Required Output Format

Return ONLY a valid JSON object. No markdown outside the JSON. 
No explanatory text before or after. Start with { and end with }.

\`\`\`json
{
  "researchSummary": "3–4 paragraphs covering: (1) the legal landscape in ${intake.jurisdiction.state} for this matter type, (2) the strongest statutes and cases found, (3) the enforcement/political climate, (4) key risks and strategic observations. Minimum 300 words.",
  
  "jurisdictionProfile": {
    "country": "${intake.jurisdiction.country}",
    "stateProvince": "${intake.jurisdiction.state}",
    "city": "${intake.jurisdiction.city ?? ""}",
    "authorityHierarchy": ["Federal", "State — ${intake.jurisdiction.state}", "County", "City — ${intake.jurisdiction.city ?? "N/A"}"],
    "politicalContext": "Who controls the legislature and AG office, enforcement climate, recent relevant legislation",
    "localCourts": "Name of the specific trial court, small claims limit, and relevant local rules for ${intake.jurisdiction.city ?? intake.jurisdiction.state}"
  },
  
  "issuesIdentified": [
    "Specific legal issue 1 — cite the statute or doctrine",
    "Specific legal issue 2"
  ],
  
  "applicableRules": [
    {
      "ruleTitle": "Exact name of statute, regulation, or case",
      "ruleType": "statute | regulation | case_law | local_ordinance | common_law",
      "jurisdiction": "${intake.jurisdiction.state} | Federal | ${intake.jurisdiction.city ?? "Local"}",
      "citationText": "EXACT citation — e.g. Cal. Civ. Code § 1950.5 or Smith v. Jones, 156 F.3d 129 (9th Cir. 2023)",
      "sectionOrRule": "Specific section or subsection number",
      "summary": "Plain English: what this rule says and exactly how it applies to THIS case",
      "sourceUrl": "Direct URL to official source, Westlaw, Lexis, or government website",
      "sourceTitle": "Official source name — e.g. California Legislative Information, Cornell LII, Justia",
      "relevance": "Specific sentence explaining how this rule supports or affects this exact matter",
      "dateVerified": "YYYY-MM",
      "confidence": "high | medium | low",
      "caseOutcome": "For case_law only — what happened to the plaintiff and what damages/relief were awarded"
    }
  ],
  
  "recentCasePrecedents": [
    {
      "caseName": "Full case name",
      "citation": "Full citation with court and year",
      "court": "Exact court name",
      "year": 2023,
      "facts": "1–2 sentences on the relevant facts",
      "holding": "What the court decided",
      "relevance": "Why this case matters for this specific matter",
      "damages": "Dollar amount or remedy awarded if reported",
      "sourceUrl": "Justia, Google Scholar, or official court URL"
    }
  ],
  
  "statuteOfLimitations": {
    "period": "e.g. 2 years",
    "statute": "Exact code section",
    "clockStartsOn": "Incident date | Discovery of harm | Last payment | etc.",
    "deadlineEstimate": "Approximate deadline based on ${intake.matter.incidentDate ?? "incident date unknown"}",
    "tollingExceptions": ["Exception 1", "Exception 2"],
    "urgencyFlag": false,
    "notes": "Any unusual SOL rules for this claim type in this state"
  },
  
  "preSuitRequirements": {
    "demandLetterRequired": false,
    "statute": "Code section if required",
    "waitingPeriodDays": 30,
    "requiredContent": ["What the demand letter must include"],
    "deliveryMethod": "Certified mail | Personal service | etc.",
    "penaltyForNonCompliance": "What happens if you skip this step"
  },
  
  "availableRemedies": {
    "actualDamages": "Description and formula",
    "statutoryDamages": "Amount per violation if applicable",
    "punitiveDamages": "Standard and likelihood in ${intake.jurisdiction.state}",
    "attorneyFees": "One-way | Two-way | Not available — cite the statute",
    "injunctiveRelief": "Available | Not applicable",
    "multiplier": "2x | 3x | None — cite authority"
  },
  
  "localJurisdictionElements": [
    {
      "element": "Specific local rule, ordinance, or court practice",
      "whyItMatters": "How this changes the strategy or strengthens the letter",
      "sourceUrl": "URL to local government or court site",
      "confidence": "high | medium | low"
    }
  ],
  
  "enforcementClimate": {
    "agActivity": "Recent AG enforcement actions in this area",
    "classActions": "Any active class actions in this jurisdiction on this issue",
    "recentLegislation": "Laws passed since 2022 that affect this matter",
    "politicalLeaning": "How the current political environment affects enforcement",
    "courtReputations": "Anything notable about how local courts handle this type of case"
  },
  
  "commonDefenses": [
    {
      "defense": "Defense name",
      "description": "How the opposing party typically argues this",
      "counterArgument": "How to pre-empt or rebut this in the demand letter",
      "successRate": "Typically successful | Rarely successful | Depends on facts"
    }
  ],
  
  "factualDataNeeded": [
    "Specific missing fact that would strengthen the legal position"
  ],
  
  "openQuestions": [
    "Unresolved legal question relevant to this matter"
  ],
  
  "riskFlags": [
    "Specific risk — e.g. SOL may have run, client may have waived rights, etc."
  ],
  
  "draftingConstraints": [
    "Specific requirement the letter draft must include — e.g. must reference Cal. Civ. Code § 1950.5, must demand response within 30 days per statutory requirement"
  ]
}
\`\`\``;
}

function buildDraftingSystemPrompt(): string {
  return `You are a senior litigation attorney at a top-tier law firm with 20 years of experience 
drafting demand letters, cease and desist notices, and pre-litigation correspondence. 
You have won cases by writing letters so precise, well-cited, and strategically framed 
that the opposing party settled before suit was filed.

## Your Drafting Philosophy

EVERY legal claim must cite a real, specific statute or case from the research packet.
Never write "under applicable law" or "pursuant to relevant statutes." 
Name the law. Cite the section. That specificity is what makes opposing counsel take the letter seriously.

STRUCTURE IS STRATEGY. The order of your paragraphs is deliberate:
1. Establish facts the recipient cannot dispute
2. State the legal basis they cannot ignore  
3. Quantify the exposure they want to avoid
4. Make a demand that gives them a face-saving exit
5. State the consequence of non-compliance in cold, factual terms

PRE-EMPT DEFENSES. If the research packet identifies common defenses, 
address and neutralize them in the letter body. Don't wait for them to raise it — 
take it off the table first.

LEVERAGE ENFORCEMENT CLIMATE. If the research shows active AG enforcement, 
pending class actions, or recent legislative changes that favor the sender, 
reference these in the letter. "The California Attorney General has recently 
pursued identical claims under this statute" is worth more than three legal citations.

STATUTE OF LIMITATIONS AWARENESS. If the SOL is approaching or has unusual 
tolling rules, the letter must reflect that urgency without sounding desperate.

TONE CALIBRATION:
- firm: Professional, serious, no hedging — makes clear suit will follow. No threats, just facts.
- moderate: Firm but leaves a clear door open for resolution. Good for ongoing relationships.
- aggressive: Maximum legal pressure. References every available remedy, mentions AG/regulatory 
  referral as an explicit option, demands a short response window. Still professional — 
  aggressive does not mean unprofessional.

## Output Format Rules

Return ONLY a valid JSON object. Nothing before the opening brace. Nothing after the closing brace.
No markdown code fences outside the JSON values. No apologies. No commentary.
The draftLetter value must be plain text with \\n for line breaks �� no markdown inside it.`;
}

function buildDraftingUserPrompt(
  intake: NormalizedPromptInput,
  targetWordCount: number,
  research: ResearchPacket
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ── Build a clean, curated context string rather than raw JSON dump ──

  // Top 6 most relevant rules, ranked by confidence
  const topRules = [...research.applicableRules]
    .sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[a.confidence] ?? 2) - (order[b.confidence] ?? 2);
    })
    .slice(0, 6);

  const rulesBlock = topRules
    .map(
      r =>
        `- [${r.ruleType.toUpperCase()}] ${r.ruleTitle} | Citation: ${r.citationText} | Section: ${r.sectionOrRule}
    Summary: ${r.summary}
    Relevance to this case: ${r.relevance}
    Source: ${r.sourceTitle} (${r.sourceUrl})`
    )
    .join("\n\n");

  const casesBlock =
    research.recentCasePrecedents
      ?.slice(0, 3)
      .map(
        c =>
          `- ${c.caseName} (${c.citation})
    Court: ${c.court} | Year: ${c.year}
    Facts: ${c.facts}
    Holding: ${c.holding}
    Relevance here: ${c.relevance}${c.damages ? `\n    Damages awarded: ${c.damages}` : ""}`
      )
      .join("\n\n") ?? "No specific cases retrieved.";

  const solBlock = research.statuteOfLimitations
    ? `Statute of limitations: ${research.statuteOfLimitations.period} (${research.statuteOfLimitations.statute})
Clock starts: ${research.statuteOfLimitations.clockStartsOn}
${research.statuteOfLimitations.deadlineEstimate ? `Estimated deadline: ${research.statuteOfLimitations.deadlineEstimate}` : ""}
${research.statuteOfLimitations.urgencyFlag ? "⚠ URGENCY FLAG: SOL may be approaching — letter must convey time sensitivity" : ""}
${research.statuteOfLimitations.notes ?? ""}`
    : "Statute of limitations data not available.";

  const preSuitBlock = research.preSuitRequirements
    ? `Formal demand letter required: ${research.preSuitRequirements.demandLetterRequired ? "YES" : "No"}
${research.preSuitRequirements.statute ? `Governing statute: ${research.preSuitRequirements.statute}` : ""}
${research.preSuitRequirements.waitingPeriodDays ? `Required waiting period: ${research.preSuitRequirements.waitingPeriodDays} days before filing suit` : ""}
${research.preSuitRequirements.deliveryMethod ? `Required delivery method: ${research.preSuitRequirements.deliveryMethod}` : ""}
${research.preSuitRequirements.requiredContent?.length ? `Letter must include: ${research.preSuitRequirements.requiredContent.join("; ")}` : ""}
${research.preSuitRequirements.consequenceOfNonCompliance ? `Consequence of skipping: ${research.preSuitRequirements.consequenceOfNonCompliance}` : ""}`
    : "No special pre-suit requirements identified.";

  const remediesBlock = research.availableRemedies
    ? `Actual damages: ${research.availableRemedies.actualDamages ?? "N/A"}
Statutory damages: ${research.availableRemedies.statutoryDamages ?? "N/A"}
Attorney fees: ${research.availableRemedies.attorneyFees ?? "N/A"}
Punitive damages: ${research.availableRemedies.punitiveDamages ?? "N/A"}
Multiplier: ${research.availableRemedies.multiplier ?? "None"}
Injunctive relief: ${research.availableRemedies.injunctiveRelief ?? "N/A"}`
    : "Remedies data not available.";

  const defensesBlock =
    research.commonDefenses
      ?.slice(0, 3)
      .map(
        d =>
          `- Defense: ${d.defense}
    How they argue it: ${d.description}
    How to pre-empt it: ${d.counterArgument}
    Success rate: ${d.successRate}`
      )
      .join("\n\n") ?? "No common defenses identified.";

  const enforcementBlock = research.enforcementClimate
    ? [
        research.enforcementClimate.agActivity
          ? `AG Activity: ${research.enforcementClimate.agActivity}`
          : null,
        research.enforcementClimate.classActions
          ? `Active class actions: ${research.enforcementClimate.classActions}`
          : null,
        research.enforcementClimate.recentLegislation
          ? `Recent legislation: ${research.enforcementClimate.recentLegislation}`
          : null,
        research.enforcementClimate.politicalLeaning
          ? `Enforcement climate: ${research.enforcementClimate.politicalLeaning}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "No enforcement climate data.";

  const financialsLine = intake.financials?.amountOwed
    ? `$${intake.financials.amountOwed.toLocaleString()} ${intake.financials.currency}`
    : null;

  // Calculate response deadline for letter body
  const responseDeadlineDays =
    intake.tonePreference === "aggressive"
      ? 10
      : intake.tonePreference === "moderate"
        ? 21
        : 14;

  const responseDeadlineDate = new Date(
    Date.now() + responseDeadlineDays * 24 * 60 * 60 * 1000
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `## Matter Summary
Letter Type: ${intake.letterType.replace(/-/g, " ").toUpperCase()}
Category: ${intake.matterCategory}
Date: ${today}
Tone Required: ${intake.tonePreference.toUpperCase()}
Language Required: ${intake.language.toUpperCase()}
Response Deadline to use in letter: ${responseDeadlineDate} (${responseDeadlineDays} days from today)

## Parties
SENDER (your client):
  Name: ${intake.sender.name}
  Address: ${intake.sender.address}
  ${intake.sender.email ? `Email: ${intake.sender.email}` : ""}
  ${intake.sender.phone ? `Phone: ${intake.sender.phone}` : ""}

RECIPIENT (opposing party):
  Name: ${intake.recipient.name}
  Address: ${intake.recipient.address}
  ${intake.recipient.email ? `Email: ${intake.recipient.email}` : ""}

## Jurisdiction
${intake.jurisdiction.city ? `City: ${intake.jurisdiction.city}` : ""}
State: ${intake.jurisdiction.state}
Country: ${intake.jurisdiction.country}
Local Court: ${research.jurisdictionProfile.localCourts ?? "State trial court"}
${research.jurisdictionProfile.politicalContext ? `Political Context: ${research.jurisdictionProfile.politicalContext}` : ""}

## Facts of the Matter
${intake.matter.description}
${intake.matter.incidentDate ? `\nIncident date: ${intake.matter.incidentDate}` : ""}
${financialsLine ? `Amount in dispute: ${financialsLine}` : ""}
${intake.desiredOutcome ? `\nDesired outcome: ${intake.desiredOutcome}` : ""}
${intake.deadlineDate ? `\nClient's hard deadline: ${intake.deadlineDate}` : ""}
${intake.additionalContext ? `\nAdditional context: ${intake.additionalContext}` : ""}
${intake.evidenceSummary ? `\nEvidence available: ${intake.evidenceSummary}` : ""}

${
  intake.timeline.length > 0
    ? `## Chronology of Events\n${intake.timeline.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}`
    : ""
}

---

## Legal Foundation (from Perplexity Research)

### Applicable Statutes and Case Law
${rulesBlock}

### Recent Precedents From This Jurisdiction
${casesBlock}

### Statute of Limitations Analysis
${solBlock}

### Pre-Suit Requirements
${preSuitBlock}

### Available Remedies and Damages
${remediesBlock}

### Enforcement Climate
${enforcementBlock}

### Anticipated Defenses (Pre-empt These in the Letter)
${defensesBlock}

### Research Summary
${research.researchSummary}

### Risk Flags From Research
${research.riskFlags.length > 0 ? research.riskFlags.map((f: string) => `- ${f}`).join("\n") : "None identified."}

### Required Drafting Constraints
${research.draftingConstraints.length > 0 ? research.draftingConstraints.map((c: string) => `- ${c}`).join("\n") : "Standard professional format."}

---

## Drafting Instructions

Write a complete, professional ${intake.letterType.replace(/-/g, " ")} following 
this exact structure. Every instruction below is mandatory.

**STRUCTURE:**

1. HEADER BLOCK (no label, just formatting):
   [Today's date: ${today}]
   [blank line]
   ${intake.deliveryMethod === "certified_mail" ? "VIA CERTIFIED MAIL" : ""}
   [blank line]
   [Sender's full name and address — left-aligned]
   [blank line]
   [Recipient's full name and address — left-aligned]
   [blank line]
   RE: [Concise subject line that names the legal claim and the statute if applicable]
   [blank line]
   Dear [Recipient's appropriate title and last name, or "To Whom It May Concern" if unknown]:

2. OPENING PARAGRAPH — Purpose and Standing:
   Identify who the sender is, the purpose of the letter, and the legal basis in 
   one clear paragraph. Reference the primary statute by name and section number. 
   This paragraph must immediately signal this is a serious legal communication, 
   not a complaint.
   ${
     research.preSuitRequirements?.demandLetterRequired
       ? `\n   REQUIRED: This letter serves as the formal statutory demand required by 
   ${research.preSuitRequirements.statute ?? "applicable law"} prior to initiating legal proceedings.
   ${research.preSuitRequirements.waitingPeriodDays ? `The mandatory ${research.preSuitRequirements.waitingPeriodDays}-day waiting period will begin upon delivery of this notice.` : ""}`
       : ""
   }

3. FACTS PARAGRAPH(S) — Undisputed Record:
   State the factual chronology in plain, neutral language. Use dates where 
   available. Every fact stated must be something the recipient cannot dispute 
   without lying — stick to observable events, communications, and omissions.
   ${intake.timeline.length > 0 ? "Use the chronology of events provided above." : ""}
   ${intake.priorCommunication ? `Reference prior communication: ${intake.priorCommunication}` : ""}

4. LEGAL BASIS PARAGRAPH(S) — Statute + Case Law:
   This is the most important section. Cite at minimum 2 specific statutes or 
   regulations from the research packet by full name and section number.
   ${
     topRules.length > 0
       ? `You MUST reference these specific authorities:
   ${topRules
     .slice(0, 3)
     .map(r => `- ${r.ruleTitle}: ${r.citationText}`)
     .join("\n   ")}`
       : ""
   }
   ${
     research.recentCasePrecedents && research.recentCasePrecedents.length > 0
       ? `\n   Cite at least one of these real court decisions to show how courts have ruled:
   ${research.recentCasePrecedents
     .slice(0, 2)
     .map(c => `- ${c.caseName}, ${c.citation} — ${c.holding}`)
     .join("\n   ")}`
       : ""
   }
   
   Pre-empt defenses here. Address any of the following anticipated defenses 
   and neutralize them with legal authority:
   ${
     research.commonDefenses && research.commonDefenses.length > 0
       ? research.commonDefenses
           .slice(0, 2)
           .map(d => `- ${d.defense}: ${d.counterArgument}`)
           .join("\n   ")
       : "No specific defenses to pre-empt."
   }

5. DAMAGES / EXPOSURE PARAGRAPH — What Is at Stake:
   Quantify the full legal exposure clearly. Reference all applicable remedies.
   ${
     research.availableRemedies
       ? `Include:
   ${research.availableRemedies.actualDamages ? `- Actual damages: ${research.availableRemedies.actualDamages}` : ""}
   ${research.availableRemedies.statutoryDamages ? `- Statutory damages: ${research.availableRemedies.statutoryDamages}` : ""}
   ${research.availableRemedies.attorneyFees ? `- Attorney's fees: ${research.availableRemedies.attorneyFees}` : ""}
   ${research.availableRemedies.multiplier && research.availableRemedies.multiplier !== "None" ? `- Damage multiplier: ${research.availableRemedies.multiplier}` : ""}
   ${financialsLine ? `- Primary damages sought: ${financialsLine}` : ""}`
       : financialsLine
         ? `Demand ${financialsLine} plus applicable statutory penalties and attorney's fees.`
         : "Quantify available remedies based on research findings."
   }
   ${
     enforcementBlock !== "No enforcement climate data." &&
     intake.tonePreference !== "moderate"
       ? `\n   Reference enforcement climate if relevant: ${research.enforcementClimate?.agActivity ?? ""}`
       : ""
   }

6. DEMAND PARAGRAPH — Specific, Numbered, Time-Bound:
   List each demand as a numbered item. Each demand must be specific and 
   measurable — no vague demands like "cease and desist." 
   State: "On or before ${responseDeadlineDate}, you must:"
   1. [Primary demand — specific action, amount, or document]
   2. [Secondary demand if applicable]
   3. [Written confirmation of compliance required]
   ${intake.desiredOutcome ? `\n   Client's stated outcome to incorporate: ${intake.desiredOutcome}` : ""}

7. CONSEQUENCE PARAGRAPH — If Demands Are Not Met:
   State plainly what legal action follows. Do not threaten — state facts.
   Tone-appropriate language:
   ${
     intake.tonePreference === "aggressive"
       ? `- "Failure to comply by the stated deadline will result in the immediate filing of a civil complaint in ${research.jurisdictionProfile.localCourts ?? "the appropriate court"}, seeking the full range of damages described above including statutory penalties, attorney's fees, and where applicable, punitive damages."
   - If AG enforcement is active, add: "Additionally, this matter will be referred to the ${intake.jurisdiction.state} Attorney General's office for investigation under [statute]."
   - If class actions are active, reference them.`
       : intake.tonePreference === "moderate"
         ? `- "In the event this matter is not resolved by the date stated above, we will have no choice but to pursue all available legal remedies, including but not limited to filing suit in ${research.jurisdictionProfile.localCourts ?? "the appropriate court"}. We remain open to discussion of a reasonable resolution."`
         : `- "If we do not receive your written compliance or a substantive response by ${responseDeadlineDate}, we will proceed with legal action without further notice."`
   }
   ${
     research.statuteOfLimitations?.urgencyFlag
       ? `\n   NOTE: Mention that the statute of limitations (${research.statuteOfLimitations.period}) creates urgency for prompt resolution.`
       : ""
   }

8. CLOSING:
   [One sentence inviting written response]
   [blank line]
   ${intake.tonePreference === "aggressive" ? "Very truly yours," : intake.tonePreference === "moderate" ? "Respectfully yours," : "Sincerely,"}
   [blank line]
   [blank line]
   [Sender's full name]
   ${intake.sender.address}
   ${intake.sender.email ? `Email: ${intake.sender.email}` : ""}
   ${intake.sender.phone ? `Phone: ${intake.sender.phone}` : ""}

---

## JSON Output Required

Return this exact structure:

{
  "draftLetter": "The complete letter text as described above. Use \\n for line breaks. No markdown. Plain text only. The letter must be complete — no placeholders, no [INSERT HERE] gaps. Target length: approximately ${targetWordCount} words (±15%). Do not pad with filler — every sentence must add legal value.",
  
  "attorneyReviewSummary": "A 2–3 paragraph memo to the reviewing attorney covering: (1) which statutes and cases were cited and why they were chosen, (2) the legal theory being advanced and its strength in ${intake.jurisdiction.state}, (3) any gaps in the client's stated facts that should be confirmed before sending, (4) whether the demand amount is supported by available remedies.",
  
  "openQuestions": [
    "Specific factual question the attorney should ask the client before approving — e.g. 'Client should confirm they have documentation of [specific item]'",
    "..."
  ],

  "reviewNotes": "Stage 2 Focus: This is an initial draft. Focus on legal accuracy and completeness. An attorney will review and polish this later.",
  
  "riskFlags": [
    "Specific legal risk — e.g. '${research.statuteOfLimitations?.urgencyFlag ? `SOL urgency: ${research.statuteOfLimitations.period} from ${research.statuteOfLimitations.clockStartsOn}` : "Verify all factual claims are documented before sending"}'",
    "..."
  ]
} `;
}

function buildAssemblySystemPrompt(): string {
  return `You are the managing partner of a top-tier law firm performing the FINAL quality review 
of a legal letter before it goes to the reviewing attorney. Your job is to take the Stage 2 draft 
and produce a polished, print-ready letter that meets the highest professional standards.

## Your Assembly Philosophy

You are NOT rewriting the letter from scratch. The Stage 2 draft already contains the correct 
legal analysis, citations, and structure. Your job is to:

1. POLISH the language — eliminate any awkward phrasing, redundancy, or unclear sentences
2. VERIFY citation format — ensure every statute and case citation is properly formatted
3. STRENGTHEN weak paragraphs — if the demand is vague, sharpen it; if a legal argument 
   trails off, tighten it
4. ENSURE completeness — the letter must have every required section with no placeholders
5. FORMAT for print — proper spacing, paragraph breaks, and professional letter structure
6. PRE-EMPT DEFENSES — if the draft missed addressing a common defense from the research, 
   weave it in naturally
7. VERIFY TONE CONSISTENCY — the entire letter should maintain the requested tone from 
   opening to closing

## Critical Rules

- Output ONLY the final letter text. No JSON. No markdown code fences. No commentary.
- The letter must be complete and ready to print on letterhead.
- Every legal citation from the draft must be preserved and properly formatted.
- If the draft referenced case law, keep those references and ensure they're accurate.
- The letter must be minimum 800 words for demand letters, 600 words for cease and desist.
- Use plain text with line breaks. No markdown formatting inside the letter body.
- Include the full signature block with all sender contact information.`;
}

function buildAssemblyUserPrompt(
  intake: IntakeJson,
  research: ResearchPacket,
  draft: DraftOutput
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // Build enriched research context for the assembly stage
  const rulesBlock = research.applicableRules
    .slice(0, 6)
    .map(r => `- ${r.ruleTitle}: ${r.summary} (${r.citationText})`)
    .join("\n");

  const casesBlock =
    research.recentCasePrecedents
      ?.slice(0, 3)
      .map(c => `- ${c.caseName} (${c.citation}) — ${c.holding}`)
      .join("\n") ?? "";

  const solBlock = research.statuteOfLimitations
    ? `SOL: ${research.statuteOfLimitations.period} (${research.statuteOfLimitations.statute})${
        research.statuteOfLimitations.urgencyFlag ? " ⚠ APPROACHING" : ""
      }`
    : "";

  const remediesBlock = research.availableRemedies
    ? [
        research.availableRemedies.actualDamages
          ? `Actual: ${research.availableRemedies.actualDamages}`
          : null,
        research.availableRemedies.statutoryDamages
          ? `Statutory: ${research.availableRemedies.statutoryDamages}`
          : null,
        research.availableRemedies.attorneyFees
          ? `Fees: ${research.availableRemedies.attorneyFees}`
          : null,
        research.availableRemedies.multiplier &&
        research.availableRemedies.multiplier !== "None"
          ? `Multiplier: ${research.availableRemedies.multiplier}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const defensesBlock =
    research.commonDefenses
      ?.slice(0, 3)
      .map(d => `- ${d.defense}: Pre-empt with: ${d.counterArgument}`)
      .join("\n") ?? "";

  const enforcementBlock = research.enforcementClimate
    ? [
        research.enforcementClimate.agActivity,
        research.enforcementClimate.classActions,
        research.enforcementClimate.recentLegislation,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const casesSection = casesBlock ? "### Case Precedents\n" + casesBlock : "";
  const solSection = solBlock ? "### Statute of Limitations\n" + solBlock : "";
  const remediesSection = remediesBlock ? "### Available Remedies\n" + remediesBlock : "";
  const defensesSection = defensesBlock ? "### Defenses to Pre-empt\n" + defensesBlock : "";
  const enforcementSection = enforcementBlock ? "### Enforcement Climate\n" + enforcementBlock : "";
  const senderEmail = intake.sender.email ? "Email: " + intake.sender.email : "";
  const senderPhone = intake.sender.phone ? "Phone: " + intake.sender.phone : "";
  const tone = intake.tonePreference ?? "firm";
  const step6 = (research.commonDefenses?.length ?? 0) > 0 ? "6. VERIFY all identified defenses are pre-empted in the letter body" : "";
  const step7 = research.statuteOfLimitations?.urgencyFlag ? "7. ENSURE SOL urgency is reflected in the letter's timeline demands" : "";

  return "## Letter Context\n" +
    "Type: " + intake.letterType.replace(/-/g, " ").toUpperCase() + "\n" +
    "Date: " + today + "\n" +
    "Tone: " + tone + "\n" +
    "Language: " + (intake.language ?? "english") + "\n\n" +
    "## Parties\n" +
    "SENDER: " + intake.sender.name + ", " + intake.sender.address + "\n" +
    senderEmail + "\n" +
    senderPhone + "\n\n" +
    "RECIPIENT: " + intake.recipient.name + ", " + intake.recipient.address + "\n\n" +
    "## Research Foundation\n" +
    "### Key Statutes and Rules\n" +
    rulesBlock + "\n\n" +
    casesSection + "\n" +
    solSection + "\n" +
    remediesSection + "\n" +
    defensesSection + "\n" +
    enforcementSection + "\n\n" +
    "Research Summary: " + research.researchSummary + "\n" +
    "Risk Flags: " + (research.riskFlags.join("; ") || "None") + "\n" +
    "Drafting Constraints: " + (research.draftingConstraints.join("; ") || "Standard format") + "\n\n" +
    "## Stage 2 Draft (from Claude)\n" +
    draft.draftLetter + "\n\n" +
    "## Attorney Review Notes from Stage 2\n" +
    draft.attorneyReviewSummary + "\n\n" +
    "Open Questions: " + (draft.openQuestions.join("; ") || "None") + "\n" +
    "Risk Flags: " + (draft.riskFlags.join("; ") || "None") + "\n\n" +
    "## Assembly Instructions\n\n" +
    "Take the Stage 2 draft above and produce the FINAL letter. Your specific tasks:\n\n" +
    "1. PRESERVE all legal citations and case references from the draft — do not remove any\n" +
    "2. POLISH language: eliminate redundancy, tighten sentences, ensure professional tone throughout\n" +
    "3. VERIFY the letter has ALL required sections:\n" +
    "   - Date and addresses (use " + today + ")\n" +
    "   - RE: line with specific subject\n" +
    "   - Professional salutation\n" +
    "   - Opening paragraph establishing purpose and legal standing\n" +
    "   - Facts paragraph(s) with chronology\n" +
    "   - Legal basis paragraph(s) with specific citations\n" +
    "   - Damages/exposure paragraph quantifying consequences\n" +
    "   - Demand paragraph with numbered, specific, time-bound demands\n" +
    "   - Consequences paragraph stating what follows non-compliance\n" +
    "   - Professional closing with full signature block\n" +
    "4. STRENGTHEN any weak sections — if the demand is vague, make it specific; if a legal argument is thin, bolster it with additional citations from the research\n" +
    "5. ENSURE the tone is consistently " + tone + " throughout — no tone shifts mid-letter\n" +
    step6 + "\n" +
    step7 + "\n\n" +
    "OUTPUT ONLY THE FINAL LETTER TEXT. No JSON. No markdown code blocks. No commentary before or after.";
}
