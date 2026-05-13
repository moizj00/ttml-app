/**
 * scripts/audit-citations.ts
 *
 * Measures how often AI answer engines (Perplexity) cite talk-to-my-lawyer.com
 * when answering the queries our blog targets. Results are written to
 * .claude/citation-scores.md so the daily content agent can read them and
 * refine its strategy — doubling down on winning formats and filling gaps.
 *
 * Run locally:
 *   PERPLEXITY_API_KEY=... pnpm tsx scripts/audit-citations.ts
 *
 * Run in CI (weekly, see .github/workflows/citation-audit.yml):
 *   Commits .claude/citation-scores.md back to main automatically.
 *
 * Requires: PERPLEXITY_API_KEY env var
 */

import * as fs from "fs";
import * as path from "path";

const TTML_DOMAIN = "talk-to-my-lawyer.com";
const PERPLEXITY_API = "https://api.perplexity.ai/chat/completions";
const OUTPUT_FILE = path.join(__dirname, "../.claude/citation-scores.md");

// ─── Target Queries ───────────────────────────────────────────────────────────
// Organised by content bucket. Add new queries whenever a new post cluster is written.
const TARGET_QUERIES: { query: string; bucket: string; targetSlug?: string }[] = [
  // Ecommerce / IP
  { query: "someone is selling knockoffs of my product on amazon what can I do california", bucket: "intellectual-property", targetSlug: "someone-selling-knockoffs-amazon-california" },
  { query: "what is a trademark cease and desist letter and when does it work", bucket: "intellectual-property", targetSlug: "what-is-a-trademark-cease-and-desist-letter" },
  { query: "how to remove counterfeit listings from amazon", bucket: "intellectual-property" },
  { query: "dmca takedown vs cease and desist letter which is faster", bucket: "intellectual-property", targetSlug: "attorney-letter-vs-dmca-takedown-counterfeit-listings" },
  { query: "cease and desist letter for ecommerce counterfeit goods", bucket: "intellectual-property", targetSlug: "cease-and-desist-letters-ecommerce-sellers-counterfeit-goods" },

  // Demand letters
  { query: "how to write a demand letter for unpaid invoice california", bucket: "demand-letters" },
  { query: "what is a demand letter and how does it work", bucket: "demand-letters", targetSlug: "what-is-a-demand-letter" },
  { query: "demand letter vs lawsuit which is better california", bucket: "demand-letters", targetSlug: "demand-letter-vs-lawsuit" },
  { query: "freelancer unpaid invoice what to do california", bucket: "demand-letters" },

  // Cease and desist
  { query: "what is a cease and desist letter california", bucket: "cease-and-desist", targetSlug: "cease-and-desist-letters-explained" },
  { query: "how to send a cease and desist letter cost", bucket: "cease-and-desist" },
  { query: "common mistakes in legal letters", bucket: "cease-and-desist", targetSlug: "5-common-mistakes-legal-letters" },

  // Landlord / tenant
  { query: "can landlord keep security deposit california", bucket: "landlord-tenant" },
  { query: "how to evict a tenant california step by step", bucket: "eviction-notices" },
  { query: "tenant habitability rights california", bucket: "landlord-tenant" },

  // Employment
  { query: "wrongful termination california what to do", bucket: "employment-disputes" },
  { query: "unpaid wages demand letter california", bucket: "demand-letters" },

  // Consumer / contractor
  { query: "contractor didn't finish job california legal options", bucket: "contract-disputes" },
  { query: "how to get refund for service not rendered", bucket: "consumer-complaints" },

  // General
  { query: "how much does it cost to hire a lawyer in california 2025", bucket: "pricing-and-roi" },
  { query: "legal letters explained when do you need one", bucket: "general" },
];

// ─── Perplexity API Call ──────────────────────────────────────────────────────
async function queryPerplexity(query: string): Promise<{
  responseText: string;
  citations: string[];
  rawResponse: unknown;
}> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is required");

  const res = await fetch(PERPLEXITY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "Answer the user's legal question clearly and concisely. Include specific sources where possible.",
        },
        { role: "user", content: query },
      ],
      return_citations: true,
      search_recency_filter: "month",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    citations?: string[];
  };

  const responseText = data.choices?.[0]?.message?.content ?? "";
  const citations: string[] = data.citations ?? [];

  return { responseText, citations, rawResponse: data };
}

// ─── Citation Check ───────────────────────────────────────────────────────────
function checkCitation(responseText: string, citations: string[], domain: string): {
  cited: boolean;
  citedUrls: string[];
  mentionedInText: boolean;
} {
  const domainLower = domain.toLowerCase();
  const citedUrls = citations.filter((url) => url.toLowerCase().includes(domainLower));
  const mentionedInText = responseText.toLowerCase().includes(domainLower);
  return {
    cited: citedUrls.length > 0 || mentionedInText,
    citedUrls,
    mentionedInText,
  };
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
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
  console.log(`Querying Perplexity with ${TARGET_QUERIES.length} target queries...\n`);

  const results: QueryResult[] = [];

  for (const { query, bucket, targetSlug } of TARGET_QUERIES) {
    process.stdout.write(`  [${bucket}] "${query.slice(0, 60)}..." → `);

    try {
      const { responseText, citations } = await queryPerplexity(query);
      const check = checkCitation(responseText, citations, TTML_DOMAIN);

      // Extract top cited domains for competitive intel
      const topCitedDomains = citations
        .map((url) => {
          try { return new URL(url).hostname.replace(/^www\./, ""); }
          catch { return null; }
        })
        .filter((h): h is string => !!h && !h.includes(TTML_DOMAIN))
        .slice(0, 5);

      results.push({ query, bucket, targetSlug, ...check, topCitedDomains });
      console.log(check.cited ? "✓ CITED" : "✗ not cited");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ query, bucket, targetSlug, cited: false, citedUrls: [], mentionedInText: false, topCitedDomains: [], error });
      console.log(`⚠ ERROR: ${error.slice(0, 80)}`);
    }

    // Respect rate limits — 1 req/sec
    await sleep(1100);
  }

  // ─── Compute Summary ────────────────────────────────────────────────────────
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

  // Aggregate competitor domains across all losing queries
  const competitorFreq: Record<string, number> = {};
  for (const r of losingQueries) {
    for (const d of r.topCitedDomains) {
      competitorFreq[d] = (competitorFreq[d] ?? 0) + 1;
    }
  }
  const topCompetitors = Object.entries(competitorFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([domain, count]) => `${domain} (${count})`);

  // ─── Write Output ──────────────────────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  const md = `# TTML Citation Scores

Last audit: ${now.toUTCString()}
Engine: Perplexity (sonar, web search enabled)
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

${winningQueries.length === 0 ? "_None yet — keep publishing._" : winningQueries.map((r) =>
  `- **"${r.query}"**\n  - Category: \`${r.bucket}\`${r.targetSlug ? `\n  - Slug: \`${r.targetSlug}\`` : ""}\n  - Cited URLs: ${r.citedUrls.join(", ") || "(mentioned in text)"}`
).join("\n\n")}

---

## Queries Where TTML Is NOT Cited — Content Gaps ✗

These are opportunities. Write posts targeting these exact queries using the structure of the winning posts above.

${losingQueries.length === 0 ? "_Excellent — cited on all tested queries._" : losingQueries.map((r) =>
  `- **"${r.query}"** [\`${r.bucket}\`]${r.targetSlug ? ` → post exists (\`${r.targetSlug}\`) but not being cited — consider updating it` : " → no post yet — write one"}`
).join("\n")}

---

## Who's Getting Cited Instead (Competitors)

These domains appear in AI answers for queries where TTML is not cited:

${topCompetitors.length === 0 ? "_No competitor data collected._" : topCompetitors.map((d) => `- ${d}`).join("\n")}

---

## Agent Instructions (read before writing)

**Strategy derived from this audit:**

1. **Double down on winning buckets** — categories with citation rate >50% are resonating. Write deeper posts in those areas.

2. **Target gap queries directly** — each uncited query in the list above is a post to write. Use the exact query phrasing as the H1 title and answer it in the first paragraph (≤300 chars for Quick Answer callout).

3. **Study winning post structure** — winning posts share these traits:
   - Direct answer in first 100 words
   - H2 sections phrased as questions (feeds FAQ JSON-LD)
   - California-specific law citations (B&P Code §17200, etc.)
   - Comparison angle ("X vs Y" posts perform well for citation)

4. **Competitor gap analysis** — domains listed above are winning the queries we're losing. Study their top-cited posts and write superior versions with more specific California context.

5. **Citation lag** — new posts take 2–6 weeks to appear in AI engine citations. Don't write duplicate posts; check \`published-topics.md\` first and wait for indexing before declaring a topic a gap.

---

## Raw Results

| Query | Bucket | Cited | Cited URLs |
|---|---|---|---|
${results.map((r) =>
  `| ${r.query.slice(0, 60)}${r.query.length > 60 ? "…" : ""} | ${r.bucket} | ${r.error ? "⚠ err" : r.cited ? "✓" : "✗"} | ${r.citedUrls.join(", ") || "-"} |`
).join("\n")}
`;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, md, "utf-8");

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Citation rate: ${citedCount}/${totalQueries} (${citationRate}%)`);
  console.log(`Results written to .claude/citation-scores.md`);
  console.log(`─────────────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("\n✗ audit-citations failed:", err);
  process.exit(1);
});
