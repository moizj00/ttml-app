import { ChatOpenAI } from "@langchain/openai";
import { generateText } from "./langchain";
import type { ResearchPacket, CitationRegistryEntry, CitationAuditReport, CitationAuditEntry, TokenUsage } from "../../shared/types";
import { accumulateTokens } from "./providers";
import { captureServerException } from "../sentry";
import { logger } from "../logger";

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

function parseCitationRevalidationResponse(
  text: string,
  registry: CitationRegistryEntry[]
): CitationRegistryEntry[] {
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
  return updatedRegistry;
}

function buildCitationRevalidationPrompt(
  registry: CitationRegistryEntry[],
  jurisdiction: string
): string {
  const citationList = registry
    .map(r => `${r.registryNumber}. "${r.citationText}" (${r.ruleType})`)
    .join("\n");

  return `You are a legal citation verification engine. Verify whether each of the following legal citations is real and currently valid in ${jurisdiction}. For each citation, respond with the number and either "VALID" or "INVALID" and a brief reason.

Citations to verify:
${citationList}

Respond in this exact format, one per line:
1. VALID - [brief reason]
2. INVALID - [brief reason]
...`;
}

export type CitationRevalidationResult = {
  registry: CitationRegistryEntry[];
  modelKey: string;
};

export async function revalidateCitationsWithPerplexity(
  registry: CitationRegistryEntry[],
  jurisdiction: string,
  letterId: number,
  tokenAcc?: TokenUsage
): Promise<CitationRevalidationResult> {
  const prompt = buildCitationRevalidationPrompt(registry, jurisdiction);

  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey || perplexityApiKey.trim().length === 0) {
    logger.warn(
      `[Pipeline] PERPLEXITY_API_KEY not set — skipping citation revalidation for letter #${letterId}`
    );
    return { registry, modelKey: "none" };
  }

  const perplexityModel = new ChatOpenAI({
    model: "sonar",
    apiKey: perplexityApiKey,
    configuration: { baseURL: "https://api.perplexity.ai" },
  });

  try {
    logger.info(
      `[Pipeline] Revalidating ${registry.length} citations with Perplexity sonar for letter #${letterId}`
    );
    const { text, usage: citationUsage } = await generateText({
      model: perplexityModel,
      system: "You are a legal citation verification assistant.",
      prompt,
      maxOutputTokens: 1000,
      abortSignal: AbortSignal.timeout(60_000),
    });
    if (tokenAcc) accumulateTokens(tokenAcc, citationUsage);

    const updatedRegistry = parseCitationRevalidationResponse(text, registry);
    logger.info(
      `[Pipeline] Citation revalidation complete (Perplexity) for letter #${letterId}: ${updatedRegistry.filter(r => r.revalidated).length}/${registry.length} checked`
    );
    return { registry: updatedRegistry, modelKey: "sonar" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[Pipeline] Citation revalidation failed for letter #${letterId}: ${msg}. Continuing with unvalidated registry.`
    );
    return { registry, modelKey: "none" };
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

export function normalizeCitation(text: string): string {
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
