# Repo Conventions for Blog Posts

Last inspected: 2026-05-13
Re-inspect: monthly, or when new config files appear at repo root.

---

## How Agent-Written Posts Reach the Live Site

```
Agent writes blog/YYYY-MM-DD-slug.md
        ↓
Git push to main
        ↓
GitHub Actions: .github/workflows/sync-blog.yml
        ↓
scripts/sync-blog.ts  ← reads blog/*.md, upserts to Postgres
        ↓
blog_posts table (live DB)
        ↓
tRPC blogRouter.list / getBySlug
        ↓
BlogIndex.tsx / BlogPost.tsx (live site)
```

**Important:** Do NOT write posts to any other location.
Writing to `blog/` and pushing is the only path to publication.

---

## Blog Content Directory

`blog/` at the repo root.

---

## Filename Convention

```
YYYY-MM-DD-slug.md
```

Examples:
- `2026-05-13-someone-selling-knockoffs-amazon-california.md`
- `2026-05-14-what-is-a-demand-letter.md`

Rules:
- Date prefix is today's local date (YYYY-MM-DD).
- Slug is the focused search query in kebab-case.
- All lowercase, hyphens only, no underscores.
- Each filename must be globally unique (date prefix guarantees this).

---

## Frontmatter Schema

```yaml
---
title: "Specific, search-intent title here"
slug: specific-search-intent-title-here
description: "≤155 char meta description that includes the focused query."
excerpt: "2–3 sentence plain-English summary of the post (used as card teaser on /blog)."
date: YYYY-MM-DD
author: "Talk to My Lawyer Team"
category: intellectual-property
tags: ["cease and desist", "ecommerce", "trademark", "california"]
status: published
---
```

### Required fields
| Field | Notes |
|---|---|
| `title` | Full sentence, ≤300 chars |
| `slug` | Kebab-case, matches focused query, ≤300 chars |
| `description` | ≤155 chars — this becomes the `<meta name="description">` |
| `excerpt` | 2–3 sentences. If omitted, sync script auto-generates from body. |
| `date` | YYYY-MM-DD local date |
| `category` | **Must be one of the BLOG_CATEGORIES enum values (see below).** |
| `status` | `published` to go live. `draft` to hold. Default: `published`. |

### Optional fields
| Field | Notes |
|---|---|
| `author` | Defaults to `"Talk to My Lawyer Team"` |
| `tags` | Free-form array; used for internal tracking only, not displayed |

---

## BLOG_CATEGORIES Enum

The `category` field must be exactly one of these values:

| Value | Use for |
|---|---|
| `demand-letters` | Demand letters, unpaid invoices, money owed |
| `cease-and-desist` | C&D letters, stopping harmful behavior |
| `contract-disputes` | Breach of contract, contractor disputes |
| `eviction-notices` | Eviction, unlawful detainer |
| `employment-disputes` | Wrongful termination, unpaid wages, harassment |
| `consumer-complaints` | Refunds, deposits, consumer rights |
| `pre-litigation-settlement` | Pre-suit negotiation, settlement letters |
| `debt-collection` | Debt collection rights, FDCPA |
| `estate-probate` | Estate disputes, probate |
| `landlord-tenant` | Rent, security deposits, habitability |
| `insurance-disputes` | Insurance claim denials |
| `personal-injury` | Personal injury demand letters |
| `intellectual-property` | Trademark, copyright, counterfeit, DMCA, ecommerce IP |
| `family-law` | Divorce, custody, support |
| `neighbor-hoa` | HOA disputes, neighbor issues |
| `document-analysis` | Document review tool content |
| `pricing-and-roi` | Cost comparisons, flat-fee vs. hourly |
| `general` | Catch-all; avoid if a more specific category fits |

**Weekday theme → category guidance:**
- Mon (landlord/tenant) → `landlord-tenant` or `eviction-notices`
- Tue (contractor/construction) → `contract-disputes`
- Wed (ecommerce/IP) → `intellectual-property`
- Thu (freelancer/unpaid invoices) → `demand-letters`
- Fri (consumer) → `consumer-complaints`
- Sat (letter deep dives) → match to specific letter type category
- Sun (comparison/process) → `pricing-and-roi` or `general`

---

## Heading Style

- H1 at top of body (matches or closely mirrors the title)
- H2 for major sections (rendered as `text-2xl font-bold` in BlogPost.tsx)
- H3 for sub-sections
- Bold (`**text**`) for inline emphasis
- No raw HTML in content — the server `renderMarkdown` function handles conversion

---

## Internal Link Convention

Link to prior posts using the slug path:
```markdown
[cease and desist letters](/blog/new-02-cease-and-desist-letters-explained)
```
or, for new-format files:
```markdown
[demand letters](/blog/2026-05-13-what-is-a-demand-letter)
```

---

## AI Citation Optimisation (new — 2026-05-13)

Structure every post so AI agents (ChatGPT, Perplexity, Claude) can extract
and cite it easily:

1. **Direct answer in the first 100 words** — answer the search query before
   explaining context. The sync script uses these opening paragraphs as the
   `excerpt`.

2. **Short Answer paragraph** — start the body with a 2–3 sentence plain-English
   answer. The `BlogPost.tsx` renderer surfaces this as a styled callout when
   the first paragraph is ≤300 chars.

3. **H2 sections as discrete questions** — phrase H2s as questions or clear
   topics so the JSON-LD FAQ schema (injected by `BlogPost.tsx`) can lift them
   into structured data.

4. **Disclaimer always last** — the `*This article is general information...*`
   line must appear at the very end, not in the middle of content.

---

## Sync Script Reference

```bash
# Sync all blog/ markdown to the live database
DATABASE_URL=... pnpm tsx scripts/sync-blog.ts

# Triggered automatically in CI on every push that touches blog/*.md
# See .github/workflows/sync-blog.yml
```

The sync script:
- Upserts by `slug` (insert on conflict → update)
- Auto-generates `excerpt` from body if not in frontmatter
- Auto-calculates `readingTimeMinutes` (word count ÷ 200)
- Maps `tags` → `category` if explicit `category` field is absent
- Sets `publishedAt` to the frontmatter `date` for published posts

---

## State Files (inside repo)

| File | Purpose |
|---|---|
| `.claude/repo-conventions.md` | This file. Agent reads at the start of every run. |
| `.claude/published-topics.md` | Running log of published titles by date. Agent checks this to avoid duplicates. |
