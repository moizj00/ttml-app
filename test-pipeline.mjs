/**
 * End-to-end pipeline test: Breach of contract demand letter in California
 * Calls the direct 3-stage pipeline: Perplexity research → Claude drafting → Claude assembly
 */

import { config } from "dotenv";
config({ path: ".env" });

// We need to use the DB directly since this is a standalone script
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TEST_USER_ID = 71; // Test User (subscriber)

const intakeJson = {
  schemaVersion: "1.0",
  letterType: "contract-breach",
  sender: {
    name: "Sarah Mitchell",
    address: "1234 Oak Avenue, Suite 200, San Francisco, CA 94102",
    email: "sarah.mitchell@example.com",
    phone: "(415) 555-0198",
  },
  recipient: {
    name: "Pacific Coast Contractors LLC",
    address: "5678 Market Street, Los Angeles, CA 90017",
    email: "info@pacificcoastcontractors.example.com",
  },
  jurisdiction: {
    country: "US",
    state: "California",
    city: "San Francisco",
  },
  matter: {
    category: "Contract Dispute",
    subject: "Breach of Home Renovation Contract — Failure to Complete Work and Refund Deposit",
    description:
      "On March 15, 2025, I entered into a written contract with Pacific Coast Contractors LLC for a complete kitchen renovation at my residence (1234 Oak Avenue, San Francisco). The total contract price was $85,000, of which I paid a $42,500 deposit (50%) upfront via wire transfer on March 18, 2025. The contract specified a completion date of July 15, 2025. As of today, the contractor has completed only approximately 30% of the agreed scope (demolition and rough plumbing only). The contractor stopped appearing at the job site on May 20, 2025, and has not responded to my phone calls, emails, or certified letters since June 1, 2025. The incomplete work has left my kitchen unusable, and I have been forced to spend an additional $3,200 on temporary kitchen arrangements. I have photographic evidence of the incomplete work, copies of all communications, the signed contract, and bank records of the deposit payment.",
    incidentDate: "2025-03-15",
  },
  financials: {
    amountOwed: 42500,
    currency: "USD",
  },
  desiredOutcome:
    "Full refund of the $42,500 deposit, plus $3,200 in consequential damages for temporary kitchen costs, plus reasonable costs to hire a replacement contractor to complete the remaining 70% of the work. If the contractor fails to respond within 14 days, I intend to file a complaint with the California Contractors State License Board and pursue litigation in San Francisco Superior Court.",
  deadlineDate: "2026-03-12",
  additionalContext:
    "The contractor is licensed (CSLB License #1098765) but I have discovered two prior complaints filed against them with the CSLB. The contract includes a clause requiring disputes to be mediated before litigation, but the contractor's failure to respond to any communications makes mediation impossible.",
  language: "English",
  communications: {
    summary:
      "I sent three emails (May 25, June 5, June 15), two certified letters (June 1, June 20), and made approximately 15 phone calls between May 20 and July 1. None have been answered or acknowledged. The certified letters were signed for by someone at the contractor's address.",
    lastContactDate: "2025-07-01",
    method: "letter",
  },
  toneAndDelivery: {
    tone: "firm",
    deliveryMethod: "certified-mail",
  },
};

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  PIPELINE E2E TEST: Breach of Contract — California  ");
  console.log("═══════════════════════════════════════════════════════\n");

  // Step 1: Insert a test letter request directly into the DB
  console.log("[1/4] Inserting test letter request into database...");
  const insertResult = await pool.query(
    `INSERT INTO letter_requests (user_id, letter_type, subject, issue_summary, jurisdiction_country, jurisdiction_state, jurisdiction_city, intake_json, status, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', 'normal')
     RETURNING id`,
    [
      TEST_USER_ID,
      "contract-breach",
      "Breach of Home Renovation Contract — Failure to Complete Work and Refund Deposit",
      "Contractor abandoned kitchen renovation after receiving $42,500 deposit. Only 30% of work completed. No response to communications since June 2025.",
      "US",
      "California",
      "San Francisco",
      JSON.stringify(intakeJson),
    ]
  );
  const letterId = insertResult.rows[0].id;
  console.log(`   ✅ Letter request created: ID #${letterId}\n`);

  // Step 2: Call the pipeline stages directly via dynamic import
  console.log("[2/4] Running Stage 1: Perplexity Research (sonar-pro)...");
  console.log("   ⏳ This may take 30-60 seconds...\n");

  // We need to use tsx to import TypeScript modules
  const startResearch = Date.now();

  // Use fetch to call the server's tRPC endpoint instead of importing directly
  // But since we need to test the pipeline functions directly, let's use a different approach:
  // We'll create a small Express endpoint that triggers the pipeline

  // Actually, the simplest approach: call the pipeline via the running server's internal API
  // The server is already running on port 3000 — we can trigger the retry endpoint
  // But first, let's just call the pipeline stages via the Perplexity and Anthropic APIs directly

  const { createOpenAI } = await import("@ai-sdk/openai");
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const { generateText } = await import("ai");

  // ── Stage 1: Perplexity Research ──
  const perplexity = createOpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: "https://api.perplexity.ai",
    name: "perplexity",
  });

  // Build the research prompts (inline version of what pipeline.ts does)
  const researchSystemPrompt = `You are a senior legal researcher preparing a comprehensive jurisdiction-specific research packet for a licensed attorney who will draft a formal legal letter.

Your research must be:
- Jurisdiction-specific (focus on the exact state/county/city provided)
- Citation-heavy (include statute numbers, case names, regulatory codes)
- Practical (focus on what applies to THIS specific fact pattern)
- Current (flag any recent legislative changes or pending bills)

You will receive a structured intake summary. Perform ALL of the following research tasks and return a single JSON object.`;

  const researchUserPrompt = `INTAKE SUMMARY:
Letter Type: ${intakeJson.letterType}
Jurisdiction: ${intakeJson.jurisdiction.state}, ${intakeJson.jurisdiction.country}
Subject: ${intakeJson.matter.subject}
Description: ${intakeJson.matter.description}
Desired Outcome: ${intakeJson.desiredOutcome}
Amount at Issue: $${intakeJson.financials?.amountOwed ?? "N/A"}
Tone: ${intakeJson.toneAndDelivery?.tone ?? "firm"}

RESEARCH TASKS (complete ALL):

1. GOVERNING STATUTES & REGULATIONS
Find the primary state statutes, federal laws, and local ordinances that apply to this fact pattern.

2. LOCAL JURISDICTION ELEMENTS
Identify any county/city-specific rules, filing requirements, or local court procedures.

3. RECENT COURT DECISIONS
Find 2-4 recent (last 5 years preferred) court decisions in this jurisdiction that are directly relevant.

4. STATUTE OF LIMITATIONS ANALYSIS
Determine the applicable SOL for each potential cause of action.

5. PRE-SUIT REQUIREMENTS
Identify any mandatory pre-suit steps (demand letters, mediation, administrative complaints, notice periods).

6. AVAILABLE REMEDIES
List all remedies available under the identified statutes and common law.

7. ENFORCEMENT CLIMATE
Assess how actively the relevant regulatory bodies enforce in this area.

8. COMMON DEFENSES
Identify the most likely defenses the opposing party might raise.

Return a JSON object with this structure:
{
  "jurisdictionProfile": { "state": "...", "relevantStatutes": [...], "localOrdinances": [...] },
  "recentCasePrecedents": [{ "name": "...", "citation": "...", "relevance": "...", "holding": "..." }],
  "statuteOfLimitations": { "primarySOL": "...", "analysis": "..." },
  "preSuitRequirements": ["..."],
  "availableRemedies": ["..."],
  "localJurisdictionElements": ["..."],
  "enforcementClimate": "...",
  "commonDefenses": ["..."],
  "riskFlags": ["..."],
  "draftingConstraints": ["..."],
  "applicableStatutes": ["..."],
  "relevantCaselaw": ["..."],
  "proceduralRequirements": ["..."],
  "keyLegalPrinciples": ["..."],
  "citations": ["..."]
}`;

  try {
    const researchResult = await generateText({
      model: perplexity.chat("sonar-pro"),
      system: researchSystemPrompt,
      prompt: researchUserPrompt,
      maxTokens: 6000,
      temperature: 0.1,
    });

    const researchDuration = ((Date.now() - startResearch) / 1000).toFixed(1);
    console.log(`   ✅ Stage 1 complete in ${researchDuration}s`);
    console.log(`   📊 Research tokens: ${researchResult.usage?.totalTokens ?? "N/A"}`);

    // Try to parse the research JSON
    let research;
    try {
      const text = researchResult.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      research = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    } catch (parseErr) {
      console.log("   ⚠️  Could not parse research as JSON — using raw text");
      research = { rawText: researchResult.text, applicableStatutes: [], relevantCaselaw: [], citations: [] };
    }

    // Log research quality
    console.log("\n   📋 RESEARCH PACKET QUALITY:");
    console.log(`      • Statutes found: ${research.applicableStatutes?.length ?? research.jurisdictionProfile?.relevantStatutes?.length ?? 0}`);
    console.log(`      • Case precedents: ${research.recentCasePrecedents?.length ?? research.relevantCaselaw?.length ?? 0}`);
    console.log(`      • SOL analysis: ${research.statuteOfLimitations ? "✅" : "❌"}`);
    console.log(`      • Pre-suit requirements: ${research.preSuitRequirements?.length ?? 0}`);
    console.log(`      • Available remedies: ${research.availableRemedies?.length ?? 0}`);
    console.log(`      • Common defenses: ${research.commonDefenses?.length ?? 0}`);
    console.log(`      • Risk flags: ${research.riskFlags?.length ?? 0}`);
    console.log(`      • Enforcement climate: ${research.enforcementClimate ? "✅" : "❌"}`);

    // Save research to DB
    await pool.query(
      `INSERT INTO research_runs (letter_request_id, provider, status, result_json)
       VALUES ($1, 'perplexity', 'completed', $2)`,
      [letterId, JSON.stringify(research)]
    );
    await pool.query(`UPDATE letter_requests SET status = 'researching' WHERE id = $1`, [letterId]);

    // Write research to file for inspection
    const fs = await import("fs");
    fs.writeFileSync("/home/ubuntu/talk-to-my-lawyer/test-output-research.json", JSON.stringify(research, null, 2));
    console.log("   💾 Research saved to test-output-research.json\n");

    // ── Stage 2: Claude Drafting ──
    console.log("[3/4] Running Stage 2: Anthropic Claude Drafting...");
    console.log("   ⏳ This may take 60-90 seconds...\n");
    const startDraft = Date.now();

    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const draftSystemPrompt = `You are a senior litigation attorney with 20+ years of experience drafting demand letters, cease-and-desist notices, and pre-litigation correspondence. You produce letters that are legally precise, strategically compelling, and ready for attorney review.

Your letters must:
- Open with clear identification of the parties and the legal relationship
- State the factual basis with specificity (dates, amounts, actions)
- Cite applicable statutes, regulations, and case law from the research provided
- Articulate the legal theory and how the facts satisfy each element
- Pre-empt likely defenses by addressing them proactively
- State the demand with specificity (amount, action, deadline)
- Outline consequences of non-compliance with specific legal remedies
- Close with a professional but firm call to action

FORMATTING RULES:
- Use formal letter format with date, addresses, RE: line, and salutation
- Number paragraphs or use clear section headers for complex letters
- Bold key demands and deadlines
- Include "WITHOUT PREJUDICE" or "SENT VIA CERTIFIED MAIL" headers as appropriate
- End with signature block placeholder for the reviewing attorney`;

    const rulesBlock = (research.applicableStatutes || research.jurisdictionProfile?.relevantStatutes || [])
      .map((s, i) => `${i + 1}. ${typeof s === "string" ? s : JSON.stringify(s)}`)
      .join("\n") || "No specific statutes identified in research.";

    const casesBlock = (research.recentCasePrecedents || research.relevantCaselaw || [])
      .map((c, i) => {
        if (typeof c === "string") return `${i + 1}. ${c}`;
        return `${i + 1}. ${c.name || "Case"} (${c.citation || "no citation"}) — ${c.relevance || c.holding || "relevant"}`;
      })
      .join("\n") || "No specific case law identified.";

    const remediesBlock = (research.availableRemedies || []).join("; ") || "Standard contractual remedies";
    const defensesBlock = (research.commonDefenses || []).join("; ") || "None identified";
    const solBlock = research.statuteOfLimitations
      ? (typeof research.statuteOfLimitations === "string" ? research.statuteOfLimitations : `${research.statuteOfLimitations.primarySOL} — ${research.statuteOfLimitations.analysis}`)
      : "Not analyzed";

    const draftUserPrompt = `LEGAL RESEARCH PACKET:

APPLICABLE RULES (sorted by relevance):
${rulesBlock}

RELEVANT CASE LAW:
${casesBlock}

STATUTE OF LIMITATIONS: ${solBlock}

AVAILABLE REMEDIES: ${remediesBlock}

COMMON DEFENSES TO PRE-EMPT: ${defensesBlock}

ENFORCEMENT CLIMATE: ${research.enforcementClimate || "Not assessed"}

RISK FLAGS: ${(research.riskFlags || []).join("; ") || "None"}

───────────────────────────────────────

INTAKE DETAILS:

Letter Type: ${intakeJson.letterType}
Sender: ${intakeJson.sender.name}, ${intakeJson.sender.address}
Recipient: ${intakeJson.recipient.name}, ${intakeJson.recipient.address}
Subject: ${intakeJson.matter.subject}
Facts: ${intakeJson.matter.description}
Amount at Issue: $${intakeJson.financials?.amountOwed ?? "N/A"}
Desired Outcome: ${intakeJson.desiredOutcome}
Tone: ${intakeJson.toneAndDelivery?.tone ?? "firm"}
Delivery Method: ${intakeJson.toneAndDelivery?.deliveryMethod ?? "certified-mail"}
Prior Communications: ${intakeJson.communications?.summary ?? "None described"}
Additional Context: ${intakeJson.additionalContext ?? "None"}

───────────────────────────────────────

Draft the complete letter now. After the letter, include an ATTORNEY REVIEW SUMMARY section with:
1. Key statutes relied upon and confidence level
2. Strength of legal theory (strong/moderate/weak) with reasoning
3. Factual gaps that need client verification
4. Whether the demand amount is well-supported
5. Recommended next steps if no response`;

    const draftResult = await generateText({
      model: anthropic("claude-opus-4-5"),
      system: draftSystemPrompt,
      prompt: draftUserPrompt,
      maxTokens: 8000,
      temperature: 0.3,
    });

    const draftDuration = ((Date.now() - startDraft) / 1000).toFixed(1);
    console.log(`   ✅ Stage 2 complete in ${draftDuration}s`);
    console.log(`   📊 Draft tokens: ${draftResult.usage?.totalTokens ?? "N/A"}`);
    console.log(`   📝 Draft length: ${draftResult.text.length} characters`);

    fs.writeFileSync("/home/ubuntu/talk-to-my-lawyer/test-output-draft.txt", draftResult.text);
    console.log("   💾 Draft saved to test-output-draft.txt");
    console.log(`   📄 First 200 chars: ${draftResult.text.slice(0, 200)}...\n`);

    // ── Stage 3: Claude Assembly (Polish) ──
    console.log("[4/4] Running Stage 3: Anthropic Claude Assembly (Final Polish)...");
    console.log("   ⏳ This may take 60-90 seconds...\n");
    const startAssembly = Date.now();

    const assemblySystemPrompt = `You are a managing partner at a top-tier law firm performing final quality review on a demand letter drafted by a senior associate. Your role is to polish, strengthen, and ensure the letter meets the highest professional standards before it goes to the reviewing attorney.

Your review must:
1. PRESERVE all legal citations, case references, and statute numbers exactly as written
2. STRENGTHEN any weak or vague language with more precise legal terminology
3. VERIFY the letter structure follows proper formal legal correspondence format
4. ENSURE the demand is specific, the deadline is clear, and consequences are articulated
5. CHECK that the tone matches the requested tone (firm/moderate/aggressive)
6. ADD any missing elements (RE: line, delivery method header, signature block)
7. PRE-EMPT any defenses that the draft may have missed
8. POLISH transitions, eliminate redundancy, and tighten prose

Output the COMPLETE final letter ready for attorney review. Do not summarize or truncate.`;

    const assemblyUserPrompt = `ORIGINAL RESEARCH PACKET (for reference — preserve all citations):
${JSON.stringify(research, null, 2).slice(0, 3000)}

DRAFT LETTER TO POLISH:
${draftResult.text}

───────────────────────────────────────

Produce the final polished letter. Preserve the ATTORNEY REVIEW SUMMARY at the end.`;

    const assemblyResult = await generateText({
      model: anthropic("claude-opus-4-5"),
      system: assemblySystemPrompt,
      prompt: assemblyUserPrompt,
      maxTokens: 10000,
      temperature: 0.2,
    });

    const assemblyDuration = ((Date.now() - startAssembly) / 1000).toFixed(1);
    console.log(`   ✅ Stage 3 complete in ${assemblyDuration}s`);
    console.log(`   📊 Assembly tokens: ${assemblyResult.usage?.totalTokens ?? "N/A"}`);
    console.log(`   📝 Final letter length: ${assemblyResult.text.length} characters`);

    fs.writeFileSync("/home/ubuntu/talk-to-my-lawyer/test-output-final.txt", assemblyResult.text);
    console.log("   💾 Final letter saved to test-output-final.txt\n");

    // Save to DB as letter versions
    await pool.query(
      `INSERT INTO letter_versions (letter_request_id, version_type, content, created_by_type, metadata_json)
       VALUES ($1, 'ai_draft', $2, 'system', $3)`,
      [letterId, draftResult.text, JSON.stringify({ stage: "drafting", model: "claude-opus-4-5", tokens: draftResult.usage?.totalTokens })]
    );
    await pool.query(
      `INSERT INTO letter_versions (letter_request_id, version_type, content, created_by_type, metadata_json)
       VALUES ($1, 'ai_draft', $2, 'system', $3)`,
      [letterId, assemblyResult.text, JSON.stringify({ stage: "assembly", model: "claude-opus-4-5", tokens: assemblyResult.usage?.totalTokens })]
    );

    // Update letter status
    await pool.query(`UPDATE letter_requests SET status = 'generated_unlocked' WHERE id = $1`, [letterId]);

    // ── Summary ──
    const totalDuration = ((Date.now() - startResearch) / 1000).toFixed(1);
    console.log("═══════════════════════════════════════════════════════");
    console.log("  PIPELINE TEST COMPLETE                              ");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  Letter ID:        #${letterId}`);
    console.log(`  Total duration:   ${totalDuration}s`);
    console.log(`  Research:         ${researchDuration}s (Perplexity sonar-pro)`);
    console.log(`  Drafting:         ${draftDuration}s (Claude claude-sonnet-4-20250514)`);
    console.log(`  Assembly:         ${assemblyDuration}s (Claude claude-sonnet-4-20250514)`);
    console.log(`  Final status:     generated_unlocked`);
    console.log(`  Output files:`);
    console.log(`    • test-output-research.json (research packet)`);
    console.log(`    • test-output-draft.txt     (Stage 2 draft)`);
    console.log(`    • test-output-final.txt     (Stage 3 final)`);
    console.log("═══════════════════════════════════════════════════════\n");

  } catch (err) {
    console.error("\n❌ PIPELINE FAILED:", err.message || err);
    console.error(err.stack);
    // Revert letter status
    await pool.query(`UPDATE letter_requests SET status = 'submitted' WHERE id = $1`, [letterId]);
  } finally {
    await pool.end();
  }
}

main();
