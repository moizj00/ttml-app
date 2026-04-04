import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight, HelpCircle } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";
import Footer from "@/components/shared/Footer";

const FAQ_CATEGORIES = [
  {
    category: "About the Service",
    items: [
      {
        q: "What is Talk to My Lawyer?",
        a: "Talk to My Lawyer is a California-focused legal letter drafting platform. You submit your facts through a structured intake form, and the system generates a structured legal-letter draft using California legal language and repeatable letter workflows. Drafts can be reviewed by a licensed attorney before you use them.",
      },
      {
        q: "Is this a substitute for hiring a lawyer?",
        a: "No. This is a drafting tool — it helps you create a structured first draft, not legal advice. This service does not create an attorney-client relationship and does not replace full legal representation. For complex litigation, criminal matters, or ongoing legal representation, you should retain a licensed attorney. We recommend reviewing all drafts with a licensed attorney before sending.",
      },
      {
        q: "What types of legal letters can I draft?",
        a: "We currently support California-focused letter types including: California Landlord-Tenant Letters, California Employment Dispute Letters, California Demand Letters, California Collections/Debt Response Letters, California Business Dispute Letters, and more. The drafting system is specifically designed around California legal language.",
      },
      {
        q: "Who reviews my draft?",
        a: "Drafts can be reviewed by a licensed attorney through our Review Center. Attorneys review the draft, make edits where needed, and either approve or request changes. You can also use the draft directly for self-organized first drafts — the choice is yours.",
      },
    ],
  },
  {
    category: "Pricing & Payment",
    items: [
      {
        q: "How much does a draft cost?",
        a: "A single drafted letter costs $200 (one-time), or you can subscribe for $200/month (4 drafts) or $2,000/year (4 drafts/month, 2 months free) with attorney review included.",
      },
      {
        q: "What is included with each draft?",
        a: "Every draft includes a structured California-focused legal-letter draft, built from curated legal-letter patterns, licensed attorney review and approval, and a PDF download. The $200 single-draft fee covers the complete service including attorney review.",
      },
      {
        q: "Do you offer subscription plans?",
        a: "Yes. We offer two subscription plans: Monthly at $200/month (4 drafts with attorney review included) and Yearly at $2,000/year (4 drafts/month, equivalent to 2 months free). Subscribers bypass the per-draft paywall entirely. Visit our Pricing page for full details.",
      },
      {
        q: "What payment methods do you accept?",
        a: "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) through our secure Stripe payment processor. We do not store your card details — all payments are handled securely by Stripe.",
      },
      {
        q: "Can I get a refund?",
        a: "If your draft is rejected by our review team and cannot be revised, you are entitled to a full refund. If you are unsatisfied with an approved draft, please contact our support team within 7 days of delivery and we will work to resolve the issue.",
      },
    ],
  },
  {
    category: "The Process",
    items: [
      {
        q: "How long does it take to receive my draft?",
        a: "Most drafts are generated within 2–5 minutes of submission. Attorney review is the primary variable — attorneys aim to complete reviews within 24 hours during business days, meaning most drafts are delivery-ready within 24–48 hours.",
      },
      {
        q: "What happens after I submit my request?",
        a: "After submission: (1) You fill in the structured intake form with your facts and situation, (2) The drafting system generates a California-focused legal-letter draft using curated letter patterns, (3) The draft is queued for attorney review, (4) A licensed attorney reviews and edits if necessary, and approves or requests changes, (5) You receive an email notification and can download the PDF.",
      },
      {
        q: "Can I see the draft before paying?",
        a: "Yes. For drafts without a subscription, the draft is partially blurred until you pay the $200 per-draft fee or subscribe to a monthly or yearly plan.",
      },
      {
        q: "What if the attorney requests changes?",
        a: "If the reviewing attorney needs additional information or clarification, your draft status will change to 'Needs Changes' and you will receive an email with the attorney's notes. You can then respond with the requested information through your dashboard, and the draft will be re-queued for review.",
      },
      {
        q: "Can I edit the draft after attorney approval?",
        a: "The approved version is the final attorney-reviewed draft. If you need modifications after approval, you can submit a new draft request. We recommend providing as much detail as possible in your initial intake form to get the strongest first draft.",
      },
    ],
  },
  {
    category: "Legal Validity & Use",
    items: [
      {
        q: "Does this service provide legal advice?",
        a: "No. This is a drafting tool — it helps organize your facts into a structured legal-style letter. It does not provide legal advice, legal strategy, or guaranteed outcomes. The drafts are built from curated legal-letter patterns structured around California legal language. Always review with a licensed attorney before sending any legal correspondence.",
      },
      {
        q: "Can I use the draft in court?",
        a: "A demand letter or other legal correspondence can be referenced in proceedings as evidence of prior notice. However, if your matter escalates to litigation, you should retain a licensed attorney for full legal representation. Our drafts are designed to help resolve disputes and organize your facts — not to serve as legal filings.",
      },
      {
        q: "What jurisdictions do you cover?",
        a: "Our drafting system is specifically focused on California legal language and workflows. While the platform accepts submissions from all U.S. states, the drafting patterns and letter workflows are built around California legal conventions.",
      },
      {
        q: "Is my information confidential?",
        a: "Yes. All information you provide is treated as confidential. We use industry-standard encryption for data in transit and at rest. Attorneys who review your drafts are bound by professional confidentiality obligations. We do not sell or share your personal information with third parties.",
      },
    ],
  },
  {
    category: "Why Talk to My Lawyer",
    items: [
      {
        q: "Why not use a free template?",
        a: "Free legal letter templates are generic and one-size-fits-all — they don't account for your specific facts, your jurisdiction's legal requirements, or the nuances of your situation. A generic template can actually weaken your position by using incorrect legal language or missing critical elements. Our drafting system creates each letter using structured legal patterns, incorporates jurisdiction-specific research, and then has a licensed attorney review every letter before it reaches you. The result is a letter that's tailored, legally sound, and far more effective than a fill-in-the-blank template.",
      },
      {
        q: "Why is attorney review important?",
        a: "Our system can draft quickly and accurately, but legal letters carry real consequences. An attorney review ensures your letter uses the correct legal standards, cites the right statutes, makes appropriate demands, and doesn't inadvertently harm your position. Without attorney review, you risk sending a letter that's legally inaccurate, overly aggressive, or missing key elements — any of which could undermine your case. Research shows that demand letters result in settlement approximately 60% of the time, but only when they're professionally crafted and legally sound.",
      },
      {
        q: "How is this different from a form-based legal service?",
        a: "Form-based services give you a questionnaire and plug your answers into a pre-written template. There's no legal research, no structured drafting that adapts to your specific situation, and typically no attorney review. Talk to My Lawyer uses our drafting engine to create a custom letter based on your unique facts, conducts web-grounded legal research relevant to your jurisdiction, and then routes every letter through a licensed attorney for review and approval. It's the difference between a form letter and a professionally crafted legal document.",
      },
      {
        q: "What makes our drafted letters effective?",
        a: "Our letters combine the speed of technology with the structure of professional legal writing. Our drafting engine is built on thousands of successful legal letter patterns and can quickly identify the most effective approach for your situation. It structures your facts into a compelling narrative, includes appropriate legal citations, and produces a polished draft in minutes — not days. Combined with attorney review, this means you get a letter that's both professionally written and legally vetted, at a fraction of the cost and time of traditional legal services.",
      },
      {
        q: "Why do I need jurisdiction-specific research?",
        a: "Legal requirements vary dramatically from state to state. A demand letter that's effective in California may be missing critical elements required in New York, or may cite statutes that don't apply in Texas. Our platform conducts web-grounded research specific to your jurisdiction, ensuring your letter references the correct laws, follows the appropriate procedures, and meets all local requirements. This jurisdiction-specific approach is what separates a truly effective legal letter from a generic one.",
      },
    ],
  },
  {
    category: "Account & Technical",
    items: [
      {
        q: "Do I need to create an account?",
        a: "Yes, you need a free account to submit draft requests, track your draft status, and download completed drafts. Creating an account takes less than a minute — just an email address and password.",
      },
      {
        q: "How do I track my draft's progress?",
        a: "Your dashboard shows real-time status updates for all your drafts. You can see exactly which stage your draft is in — from intake through the drafting workflow and attorney review to final approval. You also receive email notifications at key milestones.",
      },
      {
        q: "Can I download my approved draft?",
        a: "Yes. Once your draft is approved, a download button appears on your draft detail page. The draft is delivered as a professionally formatted PDF.",
      },
      {
        q: "What if I have a question not answered here?",
        a: "Contact our support team through the dashboard or email support@talk-to-my-lawyer.com. We typically respond within one business day.",
      },
    ],
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Frequently Asked Questions — Legal Letter Service | Talk to My Lawyer</title>
        <meta name="description" content="Get answers to common questions about our attorney-reviewed legal letter service. Pricing, process, legal validity, attorney review, and more — everything you need to know." />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/faq" />
        <meta property="og:title" content="FAQ — Legal Letter Service | Talk to My Lawyer" />
        <meta property="og:description" content="Answers to common questions about attorney-reviewed legal letters, pricing, turnaround times, and how our legal letter service works." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/faq" />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FAQ — Legal Letter Service | Talk to My Lawyer" />
        <meta name="twitter:description" content="Answers to common questions about attorney-reviewed legal letters, pricing, and how our service works." />
        <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
      </Helmet>

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between">
          <BrandLogo href="/" size="sm" hideWordmarkOnMobile />
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-slate-600"
            >
              <Link href="/login">Sign In</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section
        className="pt-24 pb-12 px-4"
        style={{
          background:
            "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 40%, #dbeafe 100%)",
        }}
      >
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <HelpCircle className="w-4 h-4" />
            Frequently Asked Questions
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 leading-tight">
            Everything You Need to Know
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Find answers to common questions about our professional legal letter
            service, pricing, the attorney review process, and more.
          </p>
        </div>
      </section>

      {/* FAQ Content */}
      <main>
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-10">
          {FAQ_CATEGORIES.map(cat => (
            <article key={cat.category}>
              <h2 className="text-xl font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
                {cat.category}
              </h2>
              <Accordion type="single" collapsible className="space-y-2">
                {cat.items.map((item, idx) => (
                  <AccordionItem
                    key={idx}
                    value={`${cat.category}-${idx}`}
                    className="border border-slate-200 rounded-lg px-4 data-[state=open]:border-blue-200 data-[state=open]:bg-blue-50/30 transition-colors"
                  >
                    <AccordionTrigger className="text-left text-sm font-semibold text-slate-900 hover:no-underline py-4">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed pb-4">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </article>
          ))}
        </div>
      </section>
      </main>

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-2xl mx-auto text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Submit your first legal matter and get a professionally drafted,
            attorney-approved letter in as little as 24 hours.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 px-8 h-12 font-semibold rounded-xl"
            >
              <Link href="/signup">
                Create Free Account <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 text-white hover:bg-white/10 px-8 h-12 font-semibold rounded-xl"
            >
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />

      {/* JSON-LD structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_CATEGORIES.flatMap(cat =>
              cat.items.map(item => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: item.a,
                },
              }))
            ),
          }),
        }}
      />
    </div>
  );
}
