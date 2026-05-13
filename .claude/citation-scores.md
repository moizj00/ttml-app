# TTML Citation Scores

Last audit: not yet run — add OPENAI_API_KEY to GitHub Secrets and trigger the citation-audit workflow.
Engine: OpenAI gpt-4o + web_search_preview
Domain tracked: talk-to-my-lawyer.com

---

## Summary

| Metric | Value |
|---|---|
| Queries tested | 0 |
| Queries where TTML is cited | 0 |
| Overall citation rate | —% |
| Audit date | pending first run |

---

## Agent Instructions (read before writing)

Until the first audit runs, use these default priorities:

1. **California-specific angle beats generic** — every post should cite at least one California statute (B&P Code §17200, CCP, Labor Code, etc.). AI engines prefer jurisdictionally specific answers.

2. **Direct answer in ≤100 words** — the Quick Answer callout only fires when the first paragraph is ≤300 chars. Keep it punchy. Answer the search query before explaining context.

3. **H2s as questions** — phrase every H2 as a question or a clear decision point. This is what feeds the FAQ JSON-LD schema and gets lifted into AI answer boxes.

4. **Comparison posts win citations** — "X vs Y" and "which is faster/cheaper/better" framing gets cited because AI engines love giving definitive answers. Write at least one comparison post per weekly batch.

5. **Update this file** — after the first audit runs (Sunday night), this file will contain real citation data. Read the "Content Gaps" section before writing each batch to avoid topics we're already losing on and haven't fixed.

---

## Setup Required

To activate the feedback loop:

1. Go to github.com/moizj00/ttml-app → Settings → Secrets → Actions
2. Add secret: `OPENAI_API_KEY` = your key from platform.openai.com/api-keys
3. Go to Actions → "Weekly Citation Audit" → Run workflow (to trigger immediately)
4. After ~5 minutes, this file will be updated with real citation data
