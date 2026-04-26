# Talk to My Lawyer — Intelligence Roadmap

> **Last updated:** April 26, 2026  
> **Status:** Canonical — strategic intelligence roadmap

> Making this the most intelligent letter generation application of all time.

**Created:** April 4, 2026  
**Research basis:** Competitive analysis (DocDraft, DoNotPay, Harvey AI, AI Lawyer, LawChatGPT, Spellbook, PettyLawsuit), deep research on legal tech AI features, content marketing frameworks, and legal contract intelligence patterns.

---

## Competitive Landscape Summary

| Competitor | Model | Price | Attorney Review | Research Pipeline | Document Analyzer | Case Scoring |
|---|---|---|---|---|---|---|
| **Talk to My Lawyer** | AI + Attorney Review | $299/letter | Yes | Yes (Perplexity + citation verification) | Yes (emotional intelligence) | No (planned) |
| DocDraft | AI + Attorney Review | $209.99 | Yes | No | No | No |
| DoNotPay | AI only (no attorney) | $36/yr subscription | No | No | No | No |
| AI Lawyer | AI + templates | Free + paid tiers | No | No | No | No |
| Harvey AI | Enterprise AI | Custom (enterprise) | Firm-internal | Yes (Westlaw-grade) | Yes | No |
| PettyLawsuit | Court filing assistant | $29/filing | No | No | No | No |

**Our unique position:** Only platform combining AI drafting + live attorney review + web-grounded legal research + emotional intelligence document analysis at an accessible price point. No competitor has all four.

---

## Positioning Statement (April Dunford Framework)

**For** individuals and small businesses **who** need a professional legal letter but can't afford $300–500/hour attorneys,
**Talk to My Lawyer** is an **AI-powered legal letter service**
**that** delivers attorney-reviewed, jurisdiction-specific letters in hours — not weeks — starting at $299.
**Unlike** template services (which offer no legal review), DIY tools (which offer no research), and Big Law (which costs 10x more),
**we** combine AI drafting with web-grounded legal research, citation verification, and human attorney sign-off in a single automated pipeline.

---

## Tier 1: Conversational Smart Intake & Case Strength Scoring (Task #144)

### Why this matters
- Conversational AI intake increases conversion by up to 40% (legal tech industry data, 2025)
- Follow-up within 5 minutes makes prospects 21x more likely to convert
- DocDraft uses a static form — this leapfrogs them
- Case strength scoring builds trust before payment

### What to build
1. **Conversational intake engine** — AI-powered endpoint that accepts natural-language descriptions and returns targeted follow-up questions. Uses GPT-4o with a system prompt covering all 10 letter types. Extracts entities (names, dates, amounts, addresses) from free text.
2. **Conversational intake UI** — Chat-like interface replacing the static 6-step form. User types their situation, AI asks follow-ups, intake fields auto-populate. "Switch to form view" toggle for users who prefer traditional.
3. **Case strength scoring engine** — Endpoint returning a 1–10 score with factor breakdown: evidence completeness, legal basis clarity, jurisdiction-specific requirements, statute of limitations, amount documentation.
4. **Pre-payment score display** — Visual gauge on review/payment page with plain-English explanation. Improvement suggestions: "Upload your contract to strengthen your case from 6 to 8."
5. **Document Analyzer → intake bridge** — "Draft Response" button carries all extracted metadata (parties, jurisdiction, dates, emotional analysis) into conversational intake.

### Key files
- `client/src/pages/subscriber/SubmitLetter.tsx`
- `client/src/pages/subscriber/intake-steps/`
- `client/src/pages/DocumentAnalyzer.tsx`
- `server/routers/documents.ts`
- `server/intake-normalizer.ts`
- `shared/types.ts`

---

## Tier 2: Counter-Argument Anticipation & Evidence Intelligence (Task #145)

**Depends on:** Tier 1 (smart intake)

### Why this matters
- Anticipating counter-arguments is what separates amateur letters from professional legal strategy
- No competitor currently offers this — it's a differentiator
- Evidence intelligence connects the Document Analyzer to the pipeline seamlessly

### What to build
1. **Counter-argument generation in Stage 2 (Drafting)** — Modify the drafting system prompt to produce a "Counter-Argument Analysis" section: 3–5 likely opposing arguments and how the letter addresses each. Stored in draft metadata.
2. **Counter-argument validation in Stage 4 (Vetting)** — Vetting checks whether the draft addresses the top counter-arguments. Unaddressed arguments flagged as medium-risk.
3. **Attorney review panel update** — New "Counter-Argument Analysis" tab showing anticipated arguments and how the draft handles them. Attorneys can add notes.
4. **Evidence extraction pipeline** — Document Analyzer extracts and structures: dates, monetary amounts, party names, key clauses, deadlines, obligations. Stored as "evidence items" linked to user account.
5. **Evidence → intake connection** — Attach previously analyzed documents to letter submissions. Auto-populate intake fields from evidence. Include evidence summaries in research packet.

### Key files
- `server/pipeline/drafting.ts`
- `server/pipeline/vetting.ts`
- `server/pipeline/assembly.ts`
- `server/routers/documents.ts`
- `client/src/pages/attorney/LetterReview.tsx`

---

## Tier 3: Escalation Path Engine & Smart Follow-Up System (Task #146)

**Depends on:** Tier 1 (smart intake)

### Why this matters
- 90% of cases settle before trial — the post-letter period is critical
- Currently, the platform stops after the letter is sent — customers are on their own
- PettyLawsuit ($29/filing) handles small claims prep — we should own the full pre-litigation funnel
- Creates recurring revenue: follow-up letters and escalation services

### Key stats
- 60% of people who send a demand letter receive a settlement vs. 36% who don't
- 90% of cases settle pre-lawsuit filing
- Effective deadline window: 2–4 weeks

### What to build
1. **Deadline tracking system** — Track deadline dates on sent letters. Background job checks for passed deadlines daily, triggers notifications (email + dashboard).
2. **Escalation options UI** — When deadline passes or subscriber marks "no response," show escalation panel: follow-up letter, small claims prep, mediation info, attorney consultation upgrade.
3. **One-click follow-up letter generation** — Pre-fills context from original letter, escalates tone, references original letter date, sets shorter deadline. Goes through same 4-stage pipeline with original letter as additional context.
4. **Jurisdiction-specific small claims court guides** — Data-driven guide starting with California: filing fees, monetary limits ($12,500 individual / $6,250 business), court locations, required forms, timeline. Step-by-step checklist.
5. **Resolution tracking** — Subscribers mark outcomes: "Payment received," "Agreement reached," "No response — escalating," "Going to court." Feeds into recursive learning system for future outcome prediction.

### Key files
- `client/src/pages/subscriber/Dashboard.tsx`
- `client/src/pages/subscriber/LetterDetail.tsx`
- `server/pipeline/orchestrator.ts` (+ `server/pipeline/orchestration/`, `server/pipeline/research/`, `server/pipeline/vetting/`)
- `server/worker.ts`
- `server/learning.ts`
- `drizzle/schema.ts`

---

## Tier 4: Content Marketing Engine & Competitive Positioning (Task #147)

**Independent** — can run in parallel with any tier.

### Why this matters
- We have unique positioning but aren't communicating it clearly
- The 60% settlement rate stat is a powerful marketing tool
- Blog content exists but needs a repurposing waterfall for social channels
- Newsletter infrastructure exists but needs templates and content strategy

### What to build
1. **Competitive positioning on homepage** — Integrate positioning statement into hero section. Add "Why Talk to My Lawyer" comparison section.
2. **Stat-driven trust section** — "By the Numbers" section: "60% settlement rate," "Attorney-reviewed in 24 hours," "Starting at $299," "10 types of legal letters." Source citations included.
3. **Competitive comparison FAQ entries** — 5 new entries: "Why not use a free template?" "Why is attorney review important?" "How is this different from a form-based service?" "What makes AI-drafted letters effective?" "Why jurisdiction-specific research?"
4. **3-month content calendar** — 12 topic briefs targeting high-intent keywords. Each: target keyword, search intent, outline, internal linking targets, CTA. Repurposing waterfall: blog → LinkedIn → X thread → newsletter.
5. **Newsletter template** — Reusable template: hook headline, key insight from blog, stat of the week, featured service spotlight, CTA. Connects to existing newsletter system.

### Key files
- `client/src/pages/Home.tsx`
- `client/src/pages/Pricing.tsx`
- `client/src/pages/FAQ.tsx`
- `client/src/pages/Blog.tsx`
- `server/newsletterRoute.ts`

---

## Implementation Priority

```
Tier 1 (Smart Intake + Case Scoring)    ←── Highest impact on conversion
  ├── Tier 2 (Counter-Arguments + Evidence)  ←── Deepens letter quality
  └── Tier 3 (Escalation + Follow-Up)        ←── Creates recurring revenue
Tier 4 (Content Marketing)               ←── Runs in parallel, drives traffic
```

### Recommended execution order
1. **Tier 4** first (can run immediately, independent, drives traffic now)
2. **Tier 1** next (highest impact on conversion and intelligence)
3. **Tiers 2 & 3** in parallel after Tier 1 completes

---

## Research Sources

- Legal AI market: ~$3.1B in 2025, projected $10.8B by 2030 (28.3% CAGR)
- Demand letter settlement rates: AfterMeToo U.S. survey (60% with letter vs. 36% without)
- 90% pre-trial settlement rate: LetterDash / General Legal Data
- Conversational intake conversion uplift: up to 40% increase (legal tech industry data)
- 5-minute follow-up: 100x more likely to reach prospect, 21x more likely to convert
- Pre/Dicta case prediction: 85% accuracy, 6M+ federal cases analyzed
- DocDraft pricing: $209.99 with attorney review, $9.99/mo AI-only
- DoNotPay: $36/year subscription, no attorney review
- PettyLawsuit: $29 flat fee for small claims prep
- AI in legal: 79% of law firm professionals use AI tools in daily work (2025)
