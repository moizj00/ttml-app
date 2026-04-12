import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Mail, ArrowRight, BookOpen, TrendingUp, Star, FileText, ExternalLink } from "lucide-react";
import Footer from "@/components/shared/Footer";
import PublicNav from "@/components/shared/PublicNav";
import PublicBreadcrumb from "@/components/shared/PublicBreadcrumb";

const SAMPLE_NEWSLETTER = {
  hookHeadline: "Demand Letters Settle 60% of Disputes — Here's How to Make Yours Work",
  keyInsight: {
    title: "This Week's Key Insight",
    content: "A well-drafted demand letter is the single most cost-effective legal tool available to individuals. Research shows a 60% settlement rate for disputes where a formal demand letter is sent, compared to just 36% without one. The difference? Professional language, correct legal citations, and a clear statement of facts — all elements that our structured drafting + attorney review process delivers automatically.",
    blogLink: "/blog",
    blogTitle: "Read the full article: Why Demand Letters Have a 60% Settlement Rate",
  },
  statOfTheWeek: {
    stat: "$500–$2,000+",
    label: "Average cost of a traditional attorney-drafted demand letter",
    comparison: "Talk to My Lawyer delivers the same quality, attorney-reviewed letter for $299 — that's up to 85% less.",
  },
  serviceSpotlight: {
    title: "Service Spotlight: Security Deposit Demand Letters",
    description: "Did your California landlord withhold your security deposit? Under CA Civil Code §1950.5, landlords must return your deposit within 21 days of move-out. Our security deposit demand letter is specifically drafted around California tenant protection laws and includes the correct statutory citations, demand amount calculation, and response deadline.",
    link: "/services/security-deposit-letter",
    cta: "Get Your Security Deposit Back",
  },
  cta: {
    headline: "Your First Letter Is Free",
    description: "Experience professionally drafted, attorney-reviewed legal letters — no credit card required.",
    buttonText: "Start Your Free Letter",
    link: "/login",
  },
};

export default function NewsletterTemplate() {
  const [previewMode, setPreviewMode] = useState<"template" | "preview">("template");

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Newsletter Template — Content Marketing | Talk to My Lawyer</title>
        <meta name="description" content="Reusable newsletter template for Talk to My Lawyer subscriber list. Repurposes blog content into engaging email newsletters." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <PublicNav />
      <PublicBreadcrumb items={[{ label: "Newsletter Template" }]} />

      <section className="pb-12 px-4" style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 40%, #dbeafe 100%)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <Mail className="w-4 h-4" />
            Newsletter Template
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 leading-tight" data-testid="text-newsletter-title">
            Reusable Newsletter Template
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            A structured template for repurposing blog content into weekly newsletters. Each edition follows the content repurposing waterfall: blog post insights, stat of the week, service spotlight, and CTA.
          </p>
        </div>
      </section>

      <main className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-8 border-b border-slate-200 pb-4">
            <button
              onClick={() => setPreviewMode("template")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${previewMode === "template" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              data-testid="button-view-template"
            >
              Template Structure
            </button>
            <button
              onClick={() => setPreviewMode("preview")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${previewMode === "preview" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              data-testid="button-view-preview"
            >
              Sample Preview
            </button>
          </div>

          {previewMode === "template" ? (
            <div className="space-y-8">
              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">1</span>
                  Hook Headline
                </h2>
                <p className="text-slate-600 mb-3">A compelling, curiosity-driven headline that uses data or a contrarian angle. Should connect to the week's blog post content.</p>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm text-slate-500 italic">Format: "[Surprising stat or insight] — [Promise of value]"</p>
                  <p className="text-sm text-slate-500 italic mt-1">Example: "Demand Letters Settle 60% of Disputes — Here's How to Make Yours Work"</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">2</span>
                  Key Insight from Latest Blog
                </h2>
                <p className="text-slate-600 mb-3">2–3 paragraph summary of the week's blog post. Extract the most actionable insight and present it as a standalone value piece. Link to the full article.</p>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm text-slate-500 italic">Pull the most compelling data point or practical takeaway from the blog post. The reader should gain value even if they don't click through.</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">3</span>
                  Stat of the Week
                </h2>
                <p className="text-slate-600 mb-3">A single, attention-grabbing statistic with context. Should reinforce the value proposition and create urgency.</p>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm text-slate-500 italic">Format: Bold stat + label + comparison to our service</p>
                  <p className="text-sm text-slate-500 italic mt-1">Rotate between: cost comparisons, settlement rates, turnaround times, customer outcomes</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">4</span>
                  Featured Service Spotlight
                </h2>
                <p className="text-slate-600 mb-3">Highlight one specific service each week. Include a brief description, key legal context, and a direct CTA to that service page.</p>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm text-slate-500 italic">Rotate through all 10+ letter types over the quarter. Tie the spotlight to the blog topic when possible.</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">5</span>
                  Primary CTA
                </h2>
                <p className="text-slate-600 mb-3">Clear call-to-action driving to sign-up or service page. Reinforce the free first letter offer.</p>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm text-slate-500 italic">Always include: "Your first letter is free — no credit card required"</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg" data-testid="newsletter-preview">
                <div className="bg-[#0c2340] px-8 py-6 text-center">
                  <div className="text-white text-xl font-bold mb-1">Talk to My Lawyer</div>
                  <div className="text-blue-300 text-sm">Weekly Legal Insights</div>
                </div>

                <div className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6 leading-tight" data-testid="text-hook-headline">
                    {SAMPLE_NEWSLETTER.hookHeadline}
                  </h2>

                  <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 mb-3">
                      <BookOpen className="w-4 h-4" />
                      {SAMPLE_NEWSLETTER.keyInsight.title}
                    </div>
                    <p className="text-slate-600 leading-relaxed mb-3">
                      {SAMPLE_NEWSLETTER.keyInsight.content}
                    </p>
                    <a href={SAMPLE_NEWSLETTER.keyInsight.blogLink} className="text-blue-600 hover:underline text-sm font-medium inline-flex items-center gap-1">
                      {SAMPLE_NEWSLETTER.keyInsight.blogTitle} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-6 mb-8 text-center border border-blue-100">
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 mb-3">
                      <TrendingUp className="w-4 h-4" />
                      Stat of the Week
                    </div>
                    <div className="text-3xl font-extrabold text-blue-600 mb-1">{SAMPLE_NEWSLETTER.statOfTheWeek.stat}</div>
                    <div className="text-sm font-medium text-slate-700 mb-2">{SAMPLE_NEWSLETTER.statOfTheWeek.label}</div>
                    <p className="text-sm text-slate-500">{SAMPLE_NEWSLETTER.statOfTheWeek.comparison}</p>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-6 mb-8">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 mb-3">
                      <Star className="w-4 h-4" />
                      {SAMPLE_NEWSLETTER.serviceSpotlight.title}
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed mb-4">
                      {SAMPLE_NEWSLETTER.serviceSpotlight.description}
                    </p>
                    <a href={SAMPLE_NEWSLETTER.serviceSpotlight.link} className="inline-flex items-center gap-2 bg-[#0c2340] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#163a5f] transition-colors">
                      <FileText className="w-4 h-4" />
                      {SAMPLE_NEWSLETTER.serviceSpotlight.cta}
                    </a>
                  </div>

                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-center text-white">
                    <h3 className="text-xl font-bold mb-2">{SAMPLE_NEWSLETTER.cta.headline}</h3>
                    <p className="text-blue-100 text-sm mb-4">{SAMPLE_NEWSLETTER.cta.description}</p>
                    <a href={SAMPLE_NEWSLETTER.cta.link} className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm">
                      {SAMPLE_NEWSLETTER.cta.buttonText} <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div className="bg-slate-50 border-t border-slate-200 px-8 py-4 text-center">
                  <p className="text-xs text-slate-400">Talk to My Lawyer | Attorney-Reviewed Legal Letters</p>
                  <p className="text-xs text-slate-400 mt-1">This is a drafting tool — not legal advice. Review all drafts with a licensed attorney.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
