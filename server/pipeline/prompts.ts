import type { IntakeJson, ResearchPacket, DraftOutput } from "../../shared/types";
import { type NormalizedPromptInput } from "../intake-normalizer";

// ═══════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// STAGE 1 PROMPT — PERPLEXITY LEGAL RESEARCH
// Split into system + user so Perplexity's search engine
// knows its role before reading the case details.
// ═══════════════════════════════════════════════════════

export function buildResearchSystemPrompt(): string {
  return `You are an elite legal research engine with real-time web search access. Find REAL, CURRENT, VERIFIABLE legal information only — never hallucinate statutes or cases.

## Standards
- COURT DECISIONS: Real case names, docket numbers, courts, years. Format: "Smith v. Jones, 2022 WL 4839201 (Cal. App. 4th 2022)". If none found, say so — never invent.
- STATUTES: Exact code sections with title, chapter, section. Verify still in effect.
- LOCAL ORDINANCES: Search the specific city/county — local rules often provide stronger protections than state law.
- ENFORCEMENT CONTEXT: Current AG activity, recent legislation (last 3 years), political control of regulatory bodies.
- Research order: local ordinances → state statutes → federal law → appellate decisions.
- Always find: (1) statute of limitations with exact deadline, (2) pre-suit requirements (demand letters, waiting periods, notice filings).

## NEVER
- Invent citations, docket numbers, or statute sections
- Use "see generally" without a real cite
- Skip local ordinances
- Give national averages when jurisdiction-specific data exists`;
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

Return ONLY a valid JSON object. Start with { and end with }. No markdown wrapping.

\`\`\`json
{
  "researchSummary": "3-4 paragraphs: legal landscape, strongest authorities, enforcement climate, risks. Min 300 words.",
  "jurisdictionProfile": {
    "country": "${intake.jurisdiction.country}",
    "stateProvince": "${intake.jurisdiction.state}",
    "city": "${intake.jurisdiction.city ?? ""}",
    "authorityHierarchy": ["Federal", "${intake.jurisdiction.state}", "${intake.jurisdiction.city ?? "Local"}"],
    "politicalContext": "Legislature/AG control, enforcement climate, recent legislation",
    "localCourts": "Trial court name, small claims limit, local rules"
  },
  "issuesIdentified": ["Legal issue with statute/doctrine cite"],
  "applicableRules": [{
    "ruleTitle": "Name", "ruleType": "statute|regulation|case_law|local_ordinance|common_law",
    "jurisdiction": "State|Federal|Local", "citationText": "Exact citation",
    "sectionOrRule": "Section number", "summary": "What it says and how it applies",
    "sourceUrl": "URL", "sourceTitle": "Source name",
    "relevance": "How it affects this matter", "dateVerified": "YYYY-MM",
    "confidence": "high|medium|low", "caseOutcome": "For case_law only"
  }],
  "recentCasePrecedents": [{
    "caseName": "Name", "citation": "Full citation", "court": "Court",
    "year": 2023, "facts": "Brief facts", "holding": "Decision",
    "relevance": "Why it matters", "damages": "Amount awarded", "sourceUrl": "URL"
  }],
  "statuteOfLimitations": {
    "period": "Duration", "statute": "Code section",
    "clockStartsOn": "Trigger event",
    "deadlineEstimate": "Based on ${intake.matter.incidentDate ?? "unknown date"}",
    "tollingExceptions": ["Exceptions"], "urgencyFlag": false, "notes": "Special rules"
  },
  "preSuitRequirements": {
    "demandLetterRequired": false, "statute": "Code section",
    "waitingPeriodDays": 30, "requiredContent": ["Requirements"],
    "deliveryMethod": "Method", "penaltyForNonCompliance": "Consequence"
  },
  "availableRemedies": {
    "actualDamages": "Formula", "statutoryDamages": "Per-violation amount",
    "punitiveDamages": "Standard", "attorneyFees": "Fee-shifting type with cite",
    "injunctiveRelief": "Available|N/A", "multiplier": "Multiplier with cite"
  },
  "localJurisdictionElements": [{
    "element": "Local rule", "whyItMatters": "Strategic impact",
    "sourceUrl": "URL", "confidence": "high|medium|low"
  }],
  "enforcementClimate": {
    "agActivity": "Recent actions", "classActions": "Active cases",
    "recentLegislation": "Since 2022", "politicalLeaning": "Impact on enforcement",
    "courtReputations": "Local court tendencies"
  },
  "commonDefenses": [{
    "defense": "Name", "description": "How argued",
    "counterArgument": "How to rebut", "successRate": "Typical|Rare|Depends"
  }],
  "factualDataNeeded": ["Missing facts"],
  "openQuestions": ["Unresolved questions"],
  "riskFlags": ["Specific risks"],
  "draftingConstraints": ["Requirements for the letter draft"]
}
\`\`\``;
}

export function buildDraftingSystemPrompt(): string {
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

export function buildDraftingUserPrompt(
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
  ],

  "counterArguments": [
    {
      "argument": "The specific argument the recipient is likely to raise — e.g. 'Recipient will claim the statute of limitations has expired'",
      "howAddressed": "How this letter preemptively addresses or neutralizes this argument — e.g. 'The letter explicitly cites the discovery rule tolling under [statute], which extends the deadline'",
      "strength": "strong"
    },
    {
      "argument": "Second likely opposing argument",
      "howAddressed": "How the letter handles it",
      "strength": "moderate"
    }
  ]
}

IMPORTANT: The counterArguments array must contain 3–5 entries. Each entry identifies a likely argument the recipient will make and explains how the letter preemptively addresses it. strength must be "strong", "moderate", or "weak" — indicating how well the letter neutralizes that argument. If a counter-argument is only weakly addressed, note what the reviewing attorney should strengthen. `;
}

export function buildAssemblySystemPrompt(): string {
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

export function buildAssemblyUserPrompt(
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
    (draft.counterArguments && draft.counterArguments.length > 0
      ? "## Counter-Arguments Identified in Stage 2\nThe letter should preemptively address these anticipated opposing arguments:\n" +
        draft.counterArguments.map((ca, i) =>
          `${i + 1}. ${ca.argument} (strength: ${ca.strength})\n   How addressed: ${ca.howAddressed}`
        ).join("\n") + "\n\nENSURE all counter-arguments marked 'weak' are strengthened in the final letter.\n\n"
      : "") +
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
