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

const FAQ_CATEGORIES = [
  {
    category: "About the Service",
    items: [
      {
        q: "What is Talk to My Lawyer?",
        a: "Talk to My Lawyer is a professional legal letter service with mandatory attorney review. You submit your legal matter through a structured intake form, our attorneys research applicable laws and draft a professional letter, and then a licensed attorney reviews, edits, and approves the final document before you receive it.",
      },
      {
        q: "Is this a substitute for hiring a lawyer?",
        a: "No. Talk to My Lawyer provides attorney-reviewed legal correspondence — not full legal representation. Every letter is reviewed and approved by a licensed attorney, but this service does not create an attorney-client relationship. For complex litigation, criminal matters, or ongoing legal representation, you should retain a licensed attorney in your jurisdiction.",
      },
      {
        q: "What types of legal letters can I get?",
        a: "We currently support: Demand Letters, Cease and Desist Notices, Contract Breach Letters, Eviction Notices, Employment Dispute Letters, Consumer Complaint Letters, and General Legal Correspondence. More letter types are added regularly.",
      },
      {
        q: "Who reviews my letter?",
        a: "Every letter is reviewed by a licensed attorney before delivery. Attorneys review the draft, make any necessary edits, and either approve, reject, or request changes. You only receive a letter that has been explicitly approved by a licensed attorney.",
      },
    ],
  },
  {
    category: "Pricing & Payment",
    items: [
      {
        q: "How much does a letter cost?",
        a: "A single attorney-reviewed letter costs $200 (one-time), or you can subscribe for $200/month (4 letters) or $2,000/year (4 letters/month, 2 months free) with attorney review included.",
      },
      {
        q: "What is included with each letter?",
        a: "Every letter includes professional legal research, an attorney-drafted letter, licensed attorney review and approval, and a downloadable PDF of the final approved letter. The $200 single-letter fee covers the complete service.",
      },
      {
        q: "Do you offer subscription plans?",
        a: "Yes. We offer two subscription plans: Monthly at $200/month (4 letters with attorney review included) and Yearly at $2,000/year (4 letters/month, equivalent to 2 months free). Subscribers bypass the per-letter paywall entirely. Visit our Pricing page for full details.",
      },
      {
        q: "What payment methods do you accept?",
        a: "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) through our secure Stripe payment processor. We do not store your card details — all payments are handled securely by Stripe.",
      },
      {
        q: "Can I get a refund?",
        a: "If your letter is rejected by our attorney review team and cannot be revised, you are entitled to a full refund. If you are unsatisfied with an approved letter, please contact our support team within 7 days of delivery and we will work to resolve the issue.",
      },
    ],
  },
  {
    category: "The Process",
    items: [
      {
        q: "How long does it take to receive my letter?",
        a: "Most letters are delivered within 24\u201348 hours of payment. The drafting stage typically completes within 2\u20135 minutes. Attorney review is the primary variable \u2014 attorneys aim to complete reviews within 24 hours during business days.",
      },
      {
        q: "What happens after I submit my request?",
        a: "After submission: (1) Our legal team researches applicable laws and statutes for your jurisdiction, (2) A professional letter is drafted based on your intake details and research findings, (3) The draft is queued for attorney review, (4) A licensed attorney reviews, edits if necessary, and approves or requests changes, (5) You receive an email notification and can download the approved PDF.",
      },
      {
        q: "Can I see the draft before paying?",
        a: "Yes. For letters without a subscription, the draft is partially blurred until you pay the $200 per-letter fee or subscribe to a monthly or yearly plan.",
      },
      {
        q: "What if the attorney requests changes?",
        a: "If the reviewing attorney needs additional information or clarification, your letter status will change to 'Needs Changes' and you will receive an email with the attorney's notes. You can then respond with the requested information through your dashboard, and the letter will be re-queued for review.",
      },
      {
        q: "Can I edit the letter after attorney approval?",
        a: "The approved letter is the final, attorney-certified version. If you need modifications after approval, you would need to submit a new letter request. We recommend providing as much detail as possible in your initial intake form to minimize the need for revisions.",
      },
    ],
  },
  {
    category: "Legal Validity & Use",
    items: [
      {
        q: "Are these letters legally valid?",
        a: "Yes. All letters are reviewed and approved by licensed attorneys. The letters are professionally drafted legal correspondence that you can use in real-world situations. However, a legal letter is not a court filing or legal judgment — it is a formal written communication that asserts your legal position.",
      },
      {
        q: "Can I use the letter in court?",
        a: "A demand letter or cease and desist notice can be referenced in legal proceedings as evidence of prior notice. However, if your matter escalates to litigation, you should retain a licensed attorney for full legal representation. Our letters are designed to resolve disputes before court involvement.",
      },
      {
        q: "What jurisdictions do you cover?",
        a: "We currently cover all 50 U.S. states. Our legal team identifies and applies jurisdiction-specific laws, statutes, and regulations relevant to your letter type and location. International coverage is planned for future releases.",
      },
      {
        q: "Is my information confidential?",
        a: "Yes. All information you provide is treated as confidential. We use industry-standard encryption for data in transit and at rest. Attorneys who review your letters are bound by professional confidentiality obligations. We do not sell or share your personal information with third parties.",
      },
    ],
  },
  {
    category: "Account & Technical",
    items: [
      {
        q: "Do I need to create an account?",
        a: "Yes, you need a free account to submit letter requests, track your letter status, and download approved letters. Creating an account takes less than a minute — just an email address and password.",
      },
      {
        q: "How do I track my letter's progress?",
        a: "Your subscriber dashboard shows real-time status updates for all your letters. You can see exactly which stage your letter is in \u2014 from research through attorney review to final approval. You also receive email notifications at key milestones.",
      },
      {
        q: "Can I download my approved letter?",
        a: "Yes. Once your letter is approved by an attorney, a download button appears on your letter detail page. The letter is delivered as a professionally formatted PDF with letterhead.",
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

      {/* Footer */}
      <footer className="bg-slate-900 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo href="/" variant="dark" size="sm" loading="lazy" />
          <div className="flex items-center gap-6 text-slate-400 text-sm">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link
              href="/pricing"
              className="hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/faq"
              className="hover:text-white transition-colors text-white"
            >
              FAQ
            </Link>
          </div>
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} Talk to My Lawyer.
          </p>
        </div>
      </footer>

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
