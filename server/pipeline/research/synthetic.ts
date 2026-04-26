import type { IntakeJson, ResearchPacket } from "../../../shared/types";

export function synthesizeResearchFromIntake(intake: IntakeJson): ResearchPacket {
  const state =
    intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "Unknown";
  const country = intake.jurisdiction?.country ?? "US";
  const city = intake.jurisdiction?.city;
  const letterType = intake.letterType ?? "general";
  const subject = intake.matter?.subject ?? "Legal Matter";
  const description = intake.matter?.description ?? "";
  const desiredOutcome = intake.desiredOutcome ?? "";

  return {
    researchSummary:
      `[SYNTHETIC RESEARCH — All research providers were unavailable. This research packet was synthesized from the client's intake data and must be independently verified by the reviewing attorney.]\n\n` +
      `Subject: ${subject}\n` +
      `Letter Type: ${letterType}\n` +
      `Jurisdiction: ${state}, ${country}\n` +
      (description ? `\nClient Description: ${description}\n` : "") +
      (desiredOutcome ? `\nDesired Outcome: ${desiredOutcome}\n` : "") +
      `\nATTORNEY NOTE: No external legal research was performed. The reviewing attorney must independently verify all applicable statutes, regulations, case law, and procedural requirements for ${state} before approving this letter.`,
    jurisdictionProfile: {
      country,
      stateProvince: state,
      city: city ?? undefined,
      authorityHierarchy: [
        `${state} State Legislature`,
        `${state} Courts`,
        country === "US" ? "Federal Courts" : `${country} National Courts`,
      ],
    },
    issuesIdentified: [
      `Client seeks ${letterType} letter regarding: ${subject}`,
      ...(desiredOutcome ? [`Desired outcome: ${desiredOutcome}`] : []),
      `[UNVERIFIED] All legal issues require independent attorney verification — no external research was available.`,
    ],
    applicableRules: [],
    localJurisdictionElements: [
      {
        element: `${state} jurisdiction requirements`,
        whyItMatters: `Letter must comply with ${state} procedural and substantive requirements. Attorney must verify applicable rules.`,
        sourceUrl: "",
        confidence: "low" as const,
      },
    ],
    recentCasePrecedents: [],
    statuteOfLimitations: {
      notes: `[UNVERIFIED] Attorney must independently determine applicable statute of limitations for ${state}.`,
    },
    factualDataNeeded: [
      `[UNVERIFIED] Attorney must assess what additional factual information is required for ${state}.`,
    ],
    openQuestions: [
      `[UNVERIFIED] No external research was available. Attorney must identify all open legal questions for this ${letterType} matter.`,
    ],
    riskFlags: [
      `SYNTHETIC_RESEARCH: All research was synthesized from intake data — no external legal research was performed. Independent verification required.`,
    ],
    draftingConstraints: [
      `Must clearly indicate unverified research status in letter where appropriate.`,
      `Attorney must verify all procedural requirements for ${state} before approving.`,
    ],
  };
}
