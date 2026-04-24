import { loadPrompt } from "./prompts/loader";
import type { IntakeJson, ResearchPacket, CitationRegistryEntry, DraftOutput } from "../../shared/types";
import type { NormalizedPromptInput } from "../intake-normalizer";

/**
 * Stage 1: Research Prompts
 */
export function buildResearchSystemPrompt(): string {
  return loadPrompt("research-system.md");
}

export function buildResearchUserPrompt(intake: NormalizedPromptInput): string {
  return loadPrompt("research-user.md", {
    letterType: intake.letterType.replace(/-/g, " ").toUpperCase(),
    jurisdiction: `${intake.jurisdiction.state}, ${intake.jurisdiction.country}${intake.jurisdiction.city ? `, ${intake.jurisdiction.city}` : ""}`,
    subject: intake.matter.subject,
    description: intake.matter.description,
    incidentDate: intake.matter.incidentDate || "Not specified",
    amountOwed: intake.financials?.amountOwed?.toString() || "Not specified",
    desiredOutcome: intake.desiredOutcome,
    additionalContext: intake.additionalContext || "None",
    evidenceSummary: intake.evidenceSummary || "No specific evidence items extracted yet",
    situationFields: intake.situationFields ? Object.entries(intake.situationFields)
      .map(([k, v]) => `- ${k}: ${v}`).join("\n") : "None"
  });
}

/**
 * Stage 2: Drafting Prompts
 */
export function buildDraftingSystemPrompt(research?: ResearchPacket): string {
  return loadPrompt("drafting-system.md", {
    researchSummary: research?.researchSummary || "",
    riskFlags: research?.riskFlags?.join("; ") || "None",
    draftingConstraints: research?.draftingConstraints?.join("; ") || "Standard format"
  });
}

export function buildDraftingUserPrompt(
  intake: NormalizedPromptInput,
  targetWordCount: number,
  research: ResearchPacket
): string {
  const rulesBlock = research.applicableRules
    .map((r: any) => `- ${r.ruleTitle}: ${r.summary} (${r.citationText})`)
    .join("\n");

  const localElementsBlock = research.localJurisdictionElements
    .map((e: any) => `- ${e.element}: ${e.whyItMatters}`)
    .join("\n");

  return loadPrompt("drafting-user.md", {
    letterType: intake.letterType.replace(/-/g, " ").toUpperCase(),
    tone: intake.tonePreference || "firm",
    language: intake.language || "english",
    senderName: intake.sender.name,
    senderAddress: intake.sender.address,
    recipientName: intake.recipient.name,
    recipientAddress: intake.recipient.address,
    rulesBlock,
    localElementsBlock,
    desiredOutcome: intake.desiredOutcome,
    targetWordCount: targetWordCount.toString()
  });
}

/**
 * Stage 3: Assembly Prompts
 */
export function buildAssemblySystemPrompt(): string {
  return loadPrompt("assembly-system.md");
}

export function buildAssemblyUserPrompt(
  intake: NormalizedPromptInput,
  research: ResearchPacket,
  draft: DraftOutput
): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rulesBlock = research.applicableRules
    .slice(0, 6)
    .map((r: any) => `- ${r.ruleTitle}: ${r.summary} (${r.citationText})`)
    .join("\n");

  const casesBlock =
    research.recentCasePrecedents
      ?.slice(0, 3)
      .map((c: any) => `- ${c.caseName} (${c.citation}) — ${c.holding}`)
      .join("\n") ?? "";

  const solBlock = research.statuteOfLimitations
    ? `SOL: ${research.statuteOfLimitations.period} (${research.statuteOfLimitations.statute})${
        research.statuteOfLimitations.urgencyFlag ? " ⚠ APPROACHING" : ""
      }`
    : "";

  const remediesBlock = research.availableRemedies
    ? [
        research.availableRemedies.actualDamages ? `Actual: ${research.availableRemedies.actualDamages}` : null,
        research.availableRemedies.statutoryDamages ? `Statutory: ${research.availableRemedies.statutoryDamages}` : null,
        research.availableRemedies.attorneyFees ? `Fees: ${research.availableRemedies.attorneyFees}` : null,
        research.availableRemedies.multiplier && research.availableRemedies.multiplier !== "None"
          ? `Multiplier: ${research.availableRemedies.multiplier}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const defensesBlock =
    research.commonDefenses
      ?.slice(0, 3)
      .map((d: any) => `- ${d.defense}: Pre-empt with: ${d.counterArgument}`)
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

  return loadPrompt("assembly-user.md", {
    letterType: intake.letterType.replace(/-/g, " ").toUpperCase(),
    today,
    tone: intake.tonePreference || "firm",
    language: intake.language || "english",
    senderName: intake.sender.name,
    senderAddress: intake.sender.address,
    senderEmail: intake.sender.email ? `Email: ${intake.sender.email}` : "",
    senderPhone: intake.sender.phone ? `Phone: ${intake.sender.phone}` : "",
    recipientName: intake.recipient.name,
    recipientAddress: intake.recipient.address,
    rulesBlock,
    casesSection: casesBlock ? `### Case Precedents\n${casesBlock}` : "",
    solSection: solBlock ? `### Statute of Limitations\n${solBlock}` : "",
    remediesSection: remediesBlock ? `### Available Remedies\n${remediesBlock}` : "",
    defensesSection: defensesBlock ? `### Defenses to Pre-empt\n${defensesBlock}` : "",
    enforcementSection: enforcementBlock ? `### Enforcement Climate\n${enforcementBlock}` : "",
    researchSummary: research.researchSummary,
    riskFlags: research.riskFlags.join("; ") || "None",
    draftingConstraints: research.draftingConstraints.join("; ") || "Standard format",
    draftLetter: draft.draftLetter,
    attorneyReviewSummary: draft.attorneyReviewSummary
  });
}

/**
 * Stage 4: Vetting Prompts
 */
export function buildVettingSystemPrompt(
  jurisdiction: string,
  letterType: string,
  detectedBloat: string[],
): string {
  const bloatSection = detectedBloat.length > 0
    ? `\n## DETECTED BLOAT PHRASES — MANDATORY REMOVAL\nThe following AI-typical filler phrases were detected in the letter. You MUST remove or replace ALL of them:\n${detectedBloat.map((p, i) => `${i + 1}. "${p}"`).join("\n")}\nReplace each with direct, substantive legal language or remove the sentence entirely if it adds nothing.\n`
    : "";

  return loadPrompt("vetting-system.md", {
    jurisdiction,
    letterType,
    today: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    bloatSection
  });
}

export function buildVettingUserPrompt(
  assembledLetter: string,
  intake: NormalizedPromptInput,
  research: ResearchPacket,
  citationRegistry: CitationRegistryEntry[],
): string {
  const registryBlock = citationRegistry.length > 0
    ? `\n## VERIFIED CITATION REGISTRY\nThese citations were verified during research. Any citation in the letter NOT on this list is suspect:\n${citationRegistry.map(r => `  [REF-${r.registryNumber}] ${r.citationText} (${r.ruleType}, confidence: ${r.confidence}, revalidated: ${r.revalidated})`).join("\n")}\n`
    : "\n## CITATION REGISTRY: No pre-verified citations available.\n";

  const enforcementBlock = research.enforcementClimate
    ? `\n## ENFORCEMENT CLIMATE\n- AG Activity: ${research.enforcementClimate.agActivity ?? "Unknown"}\n- Class Actions: ${research.enforcementClimate.classActions ?? "Unknown"}\n- Recent Legislation: ${research.enforcementClimate.recentLegislation ?? "Unknown"}\n- Political Leaning: ${research.enforcementClimate.politicalLeaning ?? "Unknown"}\n`
    : "";

  const solBlock = research.statuteOfLimitations
    ? `\n## STATUTE OF LIMITATIONS\n- Period: ${research.statuteOfLimitations.period ?? "Unknown"}\n- Statute: ${research.statuteOfLimitations.statute ?? "Unknown"}\n- Clock Starts: ${research.statuteOfLimitations.clockStartsOn ?? "Unknown"}\n- Urgency: ${research.statuteOfLimitations.urgencyFlag ? "YES — APPROACHING" : "No"}\n`
    : "";

  const preSuitBlock = research.preSuitRequirements
    ? `\n## PRE-SUIT REQUIREMENTS\n- Demand Letter Required: ${research.preSuitRequirements.demandLetterRequired ?? "Unknown"}\n- Waiting Period: ${research.preSuitRequirements.waitingPeriodDays ?? "Unknown"} days\n- Statute: ${research.preSuitRequirements.statute ?? "Unknown"}\n`
    : "";

  return loadPrompt("vetting-user.md", {
    assembledLetter,
    letterType: intake.letterType,
    jurisdictionDisplay: `${intake.jurisdiction?.state ?? "Unknown"}, ${intake.jurisdiction?.country ?? "US"}${intake.jurisdiction?.city ? `, ${intake.jurisdiction.city}` : ""}`,
    senderName: intake.sender?.name ?? "Unknown",
    recipientName: intake.recipient?.name ?? "Unknown",
    subject: intake.matter?.subject ?? "Unknown",
    desiredOutcome: intake.desiredOutcome ?? "Not specified",
    tone: intake.tonePreference ?? "firm",
    amountOwedBlock: intake.financials?.amountOwed ? `- Amount Owed: $${intake.financials.amountOwed}` : "",
    researchSummary: research.researchSummary ?? "",
    registryBlock,
    enforcementBlock,
    solBlock,
    preSuitBlock
  });
}
