/**
 * scripts/audit-citations.ts
 *
 * Measures how often AI answer engines cite talk-to-my-lawyer.com when
 * answering the queries our blog targets. Uses the OpenAI Responses API
 * with the web_search_preview tool, which returns structured URL annotations.
 *
 * Results are written to .claude/citation-scores.md so the daily content
 * agent reads them and refines strategy — doubling down on winning formats,
 * filling citation gaps.
 *
 * Run locally:
 *   OPENAI_API_KEY=... pnpm tsx scripts/audit-citations.ts
 *
 * Run in CI (weekly, see .github/workflows/citation-audit.yml):
 *   Commits .claude/citation-scores.md back to main automatically.
 */

import * as fs from "fs";
import * as path from "path";

const TTML_DOMAIN = "talk-to-my-lawyer.com";
const OPENAI_API = "https://api.openai.com/v1/responses";
const OUTPUT_FILE = path.join(import.meta.dirname, "../.claude/citation-scores.md");

// ─── Target Queries ───────────────────────────────────────────────────────────
const TARGET_QUERIES: { query: string; bucket: string; targetSlug?: string }[] = [
  // Ecommerce / IP
  { query: "someone is selling knockoffs of my product on amazon what can I do california", bucket: "intellectual-property", targetSlug: "someone-selling-knockoffs-amazon-california" },
  { query: "what is a trademark cease and desist letter and when does it work", bucket: "intellectual-property", targetSlug: "what-is-a-trademark-cease-and-desist-letter" },
  { query: "how to remove counterfeit listings from amazon seller", bucket: "intellectual-property" },
  { query: "dmca takedown vs cease and desist letter which is faster", bucket: "intellectual-property", targetSlug: "attorney-letter-vs-dmca-takedown-counterfeit-listings" },
  { query: "cease and desist letter for ecommerce counterfeit goods", bucket: "intellectual-property", targetSlug: "cease-and-desist-letters-ecommerce-sellers-counterfeit-goods" },

  // Demand letters
  { query: "how to write a demand letter for unpaid invoice california", bucket: "demand-letters" },
  { query: "what is a demand letter and how does it work", bucket: "demand-letters", targetSlug: "what-is-a-demand-letter" },
  { query: "demand letter vs lawsuit which is better california", bucket: "demand-letters", targetSlug: "demand-letter-vs-lawsuit" },
  { query: "freelancer not paid what to do california", bucket: "demand-letters" },

  // Cease and desist
  { query: "what is a cease and desist letter california", bucket: "cease-and-desist", targetSlug: "cease-and-desist-letters-explained" },
  { query: "how much does a cease and desist letter cost", bucket: "cease-and-desist" },
  { query: "common mistakes in legal demand letters", bucket: "cease-and-desist", targetSlug: "5-common-mistakes-legal-letters" },

  // Landlord / tenant
  { query: "can landlord keep security deposit california", bucket: "landlord-tenant" },
  { query: "how to evict a tenant california step by step", bucket: "eviction-notices" },
  { query: "california tenant habitability rights", bucket: "landlord-tenant" },

  // Employment
  { query: "wrongful termination california what to do", bucket: "employment-disputes" },
  { query: "how to recover unpaid wages california demand letter", bucket: "demand-letters" },

  // Consumer / contractor
  { query: "contractor didn't finish job california legal options", bucket: "contract-disputes" },
  { query: "how to get a refund for a service not rendered", bucket: "consumer-complaints" },

  // General
  { query: "how much does it cost to hire a lawyer in california", bucket: "pricing-and-roi" },
  { query: "when do you need a legal demand letter", bucket: "general" },
];

// ─── OpenAI Responses API ─────────────────────────────────────────────────────
interface UrlCitation {
  type: "url_citation";
  url: string;
  title?: string;
  start_index: number;
  end_index: number;
}

interface OpenAIResponse {
  output: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: UrlCitation[];
    }>;
  }>;
}

async function queryOpenAI(query: string): Promise<{
  responseText: string;
  citations: string[];
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const res = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      tool_choice: "required",
      input: query,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as OpenAIResponse;

  // Extract text and URL annotations from the response
  let responseText = "";
  const citations: string[] = [];

  for (const item of data.output ?? []) {
    if (item.type === "message" && item.content) {
      for (const block of item.content) {
        if (block.type === "output_text") {
          responseText += block.text ?? "";
          for (const ann of block.annotations ?? []) {
            if (ann.type === "url_citation" && ann.url) {
              citations.push(ann.url);
            }
          }
        }
      }
    }
  }

  return { responseText, citations };
}

// ─── Citation Check ───────────────────────────────────────────────────────────
function checkCitation(responseText: string, citations: string[], domain: string) {
  const domainLower = domain.toLowerCase();
  const citedUrls = [...new Set(citations.filter((u) => u.toLowerCase().includes(domainLower)))];
  const mentionedInText = responseText.toLowerCase().includes(domainLower);
  return { cited: citedUrls.length > 0 || mentionedInText, citedUrls, mentionedInText };
}

function extractDomain(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
interface QueryResult {
  query: string;
  bucket: string;
  targetSlug?: string;
  cited: boolean;
  citedUrls: string[];
  mentionedInText: boolean;
  topCitedDomains: string[];
  error?: string;
}

async function main() {
  console.log(`\nTTML Citation Audit — ${new Date().toISOString()}`);
  console.log(`Engine: OpenAI gpt-4o + web_search_preview`);
  console.log(`Queries: ${TARGET_QUERIES.length}\n`);

  const results: QueryResult[] = [];

  for (const { query, bucket, targetSlug } of TARGET_QUERIES) {
    process.stdout.write(`  [${bucket}] "${query.slice(0, 55)}..." → `);

    try {
      const { responseText, citations } = await queryOpenAI(query);
      const check = checkCitation(responseText, citations, TTML_DOMAIN);

      const topCitedDomains = citations
        .map(extractDomain)
        .filter((h): h is string => !!h && !h.includes(TTML_DOMAIN))
        .slice(0, 5);

      results.push({ query, bucket, targetSlug, ...check, topCitedDomains });
      console.log(check.cited ? `✓ CITED  ${check.citedUrls[0] ?? "(text mention)"}` : "✗ not cited");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ query, bucket, targetSlug, cited: false, citedUrls: [], mentionedInText: false, topCitedDomains: [], error });
      console.log(`⚠ ERROR: ${error.slice(0, 80)}`);
    }

    await sleep(1200); // stay within rate limits
  }

  // ─── Compute Summary ──────────────────────────────────────────────────────
  const totalQueries = results.length;
  const citedCount = results.filter((r) => r.cited).length;
  const citationRate = ((citedCount / totalQueries) * 100).toFixed(0);

  const byBucket: Record<string, { total: number; cited: number }> = {};
  for (const r of results) {
    if (!byBucket[r.bucket]) byBucket[r.bucket] = { total: 0, cited: 0 };
    byBucket[r.bucket].total++;
    if (r.cited) byBucket[r.bucket].cited++;
  }

  const winningQueries = results.filter((r) => r.cited);
  const losingQueries = results.filter((r) => !r.cited && !r.error);

  const competitorFreq: Record<string, number> = {};
  for (const r of losingQueries) {
    for (const d of r.topCitedDomains) {
      competitorFreq[d] = (competitorFreq[d] ?? 0) + 1;
    }
  }
  const topCompetitors = Object.entries(competitorFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([domain, count]) => `${domain} (${count} queries)`);

  // ─── Write Markdown Output ─────────────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  const md = `# TTML Citation Scores

Last audit: ${now.toUTCString()}
Engine: OpenAI gpt-4o + web_search_preview
Domain tracked: ${TTML_DOMAIN}

---

## Summary

| Metric | Value |
|---|---|
| Queries tested | ${totalQueries} |
| Queries where TTML is cited | ${citedCount} |
| Overall citation rate | ${citationRate}% |
| Audit date | ${dateStr} |

---

## Citation Rate by Category

| Category | Queries | Cited | Rate |
|---|---|---|---|
${Object.entries(byBucket)
    .sort(([, a], [, b]) => b.cited / b.total - a.cited / a.total)
    .map(([bucket, { total, cited }]) =>
      `| ${bucket} | ${total} | ${cited} | ${((cited / total) * 100).toFixed(0)}% |`
    )
    .join("\n")}

---

## Queries Where TTML Is Cited ✓

${winningQueries.length === 0
    ? "_None yet — keep publishing and wait 2–6 weeks for indexing._"
    : winningQueries.map((r) =>
      `- **"${r.query}"**\n  - Category: \`${r.bucket}\`${r.targetSlug ? `\n  - Slug: \`${r.targetSlug}\`` : ""}\n  - Cited URLs: ${r.citedUrls.join(", ") || "(mentioned in response text)"}`
    ).join("\n\n")}

---

## Content Gaps — Queries Where TTML Is NOT Cited ✗

Write posts targeting these exact queries. Use the query phrasing as the H1 title and answer it in ≤100 words.

${losingQueries.length === 0
    ? "_Cited on all tested queries — excellent._"
    : losingQueries.map((r) =>
      `- **"${r.query}"** [\`${r.bucket}\`]${r.targetSlug
        ? ` — post exists (\`${r.targetSlug}\`) but not being cited. Update: sharpen opening paragraph, add California statute, strengthen H2 questions.`
        : " — **no post yet. Write one.**"
      }`
    ).join("\n")}

---

## Who's Being Cited Instead (Competitors)

Domains winning the queries where TTML isn't cited:

${topCompetitors.length === 0
    ? "_No competitor data — all queries cited TTML._"
    : topCompetitors.map((d) => `- ${d}`).join("\n")}

---

## Agent Instructions

Read this file before writing any post.

1. **Priority order for this week's posts:**
   - First: queries marked "no post yet" above → write them
   - Second: posts marked "not being cited" → update them (sharper opening, more H2 questions, California statute)
   - Third: top-performing buckets → write deeper posts in those areas

2. **Format that gets cited:** direct answer ≤100 words → California statute citation → H2 sections as questions → comparison angle → disclaimer last.

3. **Citation lag is real.** New posts take 2–6 weeks to appear in AI citations. Don't re-write a post that's <4 weeks old. Check \`published-topics.md\` for dates.

4. **Competitor gap:** study the domains listed above. Find their top-cited post on each losing query. Write a better, more California-specific version.

---

## Raw Results

| Query | Bucket | Cited | Notes |
|---|---|---|---|
${results.map((r) =>
    `| ${r.query.slice(0, 55)}${r.query.length > 55 ? "…" : ""} | ${r.bucket} | ${r.error ? "⚠ err" : r.cited ? "✓" : "✗"} | ${r.error ? r.error.slice(0, 60) : r.citedUrls[0] ?? (r.mentionedInText ? "text mention" : "—")} |`
  ).join("\n")}
`;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, md, "utf-8");

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Citation rate: ${citedCount}/${totalQueries} (${citationRate}%)`);
  console.log(`Top competitors: ${topCompetitors.slice(0, 3).join(", ") || "none"}`);
  console.log(`Results written → .claude/citation-scores.md`);
  console.log(`─────────────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("\n✗ audit-citations failed:", err);
  process.exit(1);
});
