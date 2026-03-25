import { createBlogPost, getBlogPostBySlug } from "../server/db";

const samplePosts = [
  {
    slug: "what-is-a-demand-letter",
    title: "What Is a Demand Letter and When Should You Send One?",
    excerpt:
      "A demand letter is a formal written document that outlines your grievance and requests specific action from the recipient. Learn when and how to use one effectively.",
    content: `## What Is a Demand Letter?

A demand letter is a formal written document sent to another party that outlines a complaint, describes the harm or issue, and makes a specific demand for resolution — usually payment, action, or cessation of behavior.

## When Should You Send a Demand Letter?

Demand letters are appropriate in several situations:

- **Unpaid debts or invoices** — When someone owes you money and has not responded to informal requests.
- **Property damage** — When someone has damaged your property and you want compensation.
- **Breach of contract** — When the other party has failed to fulfill their contractual obligations.
- **Security deposit disputes** — When a landlord has failed to return your security deposit.

## Why Are Demand Letters Effective?

Demand letters work because they:

1. Create a formal paper trail
2. Show the recipient you are serious
3. Can be used as evidence in court if needed
4. Often resolve disputes without litigation

## Should You Have an Attorney Review Your Demand Letter?

While you can write a demand letter yourself, having an attorney review it significantly increases its effectiveness. An attorney-reviewed letter:

- Ensures proper legal terminology is used
- Cites relevant laws and statutes
- Sets appropriate deadlines
- Demonstrates you have legal support

## The Bottom Line

A demand letter is often the first step in resolving a legal dispute. It is far less expensive than hiring an attorney for litigation, and it shows the other party that you are serious about pursuing your claim.`,
    category: "demand-letters" as const,
    metaDescription:
      "Learn what a demand letter is, when to send one, and why attorney-reviewed demand letters are more effective. Free guide from Talk to My Lawyer.",
    status: "published" as const,
  },
  {
    slug: "cease-and-desist-letters-explained",
    title:
      "Cease and Desist Letters Explained: What They Are, When to Use Them, and What Happens After",
    excerpt:
      "A cease and desist letter formally demands that someone stop engaging in specific harmful activity. Here is everything you need to know about sending one.",
    content: `## What Is a Cease and Desist Letter?

A cease and desist letter is a formal written notice demanding that a person or organization stop (cease) a specific activity and refrain from doing it again (desist). Unlike a lawsuit, it is not a legal filing — but it often serves as the precursor to one.

## Common Reasons to Send a Cease and Desist

- **Harassment** — Repeated unwanted contact or threatening behavior
- **Copyright infringement** — Someone is using your creative work without permission
- **Trademark infringement** — Another business is using a confusingly similar name or logo
- **Defamation** — Someone is making false statements that damage your reputation
- **Contract violations** — Ongoing breach of a contractual agreement

## What Happens After You Send One?

After sending a cease and desist letter, several things may happen:

1. **The recipient complies** — They stop the behavior as requested
2. **The recipient responds** — They may dispute your claims or offer a compromise
3. **The recipient ignores it** — You may need to escalate to legal action
4. **The recipient retaliates** — In rare cases, they may file a counter-claim

## Do You Need a Lawyer?

You do not need a lawyer to send a cease and desist letter, but having one reviewed by an attorney adds significant weight. An attorney-reviewed letter demonstrates that you have legal counsel and are prepared to take further action if necessary.`,
    category: "cease-and-desist" as const,
    metaDescription:
      "Everything you need to know about cease and desist letters: what they are, when to use them, and what happens after you send one.",
    status: "published" as const,
  },
  {
    slug: "how-to-write-breach-of-contract-letter",
    title:
      "How to Write a Breach of Contract Letter (And Why You Should Have an Attorney Review It)",
    excerpt:
      "A breach of contract letter formally notifies the other party that they have violated the terms of your agreement. Learn how to write an effective one.",
    content: `## What Is a Breach of Contract Letter?

A breach of contract letter is a formal notification sent to a party who has failed to fulfill their obligations under a written or verbal agreement. It documents the breach, demands remediation, and sets a deadline for compliance.

## Key Elements of an Effective Breach of Contract Letter

Every breach of contract letter should include:

- **Identification of the contract** — Reference the specific agreement, including dates and parties involved
- **Description of the breach** — Clearly explain how the other party has violated the contract
- **Evidence** — Reference specific clauses, communications, or documents that support your claim
- **Demanded remedy** — State what you want: performance, payment, or termination
- **Deadline** — Set a reasonable timeframe for compliance (typically 10-30 days)
- **Consequences** — Outline what will happen if the breach is not remediated

## Why Attorney Review Matters

A breach of contract letter reviewed by an attorney is significantly more effective because:

1. It correctly identifies the legal basis for your claim
2. It references the appropriate remedies under your jurisdiction
3. It sets enforceable deadlines
4. It demonstrates legal preparedness

## Common Mistakes to Avoid

- Being too emotional or threatening
- Failing to reference specific contract terms
- Not setting a clear deadline
- Making claims you cannot support with evidence`,
    category: "contract-disputes" as const,
    metaDescription:
      "Step-by-step guide to writing a breach of contract letter. Learn key elements, common mistakes, and why attorney review is critical.",
    status: "draft" as const,
  },
];

async function seedBlogPosts() {
  for (const post of samplePosts) {
    const existing = await getBlogPostBySlug(post.slug);
    if (existing) {
      console.log(`Skipped (already exists): ${post.slug}`);
      continue;
    }
    await createBlogPost(post);
    console.log(`Seeded: ${post.slug} (${post.status})`);
  }
  console.log("Blog seed complete.");
  process.exit(0);
}

seedBlogPosts().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
