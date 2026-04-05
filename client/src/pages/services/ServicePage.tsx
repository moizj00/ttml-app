import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Shield,
  Lock,
  Scale,
  Clock,
  DollarSign,
  Menu,
  X,
} from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";
import type { ServiceData } from "./serviceData";

function ServiceNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const goToLogin = () => { window.location.href = "/login"; };

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-[64px] md:h-[72px] flex items-center justify-between">
        <BrandLogo href="/" size="lg" hideWordmarkOnMobile />
        <div className="hidden md:flex items-center gap-7">
          <Link href="/" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-home">Home</Link>
          <Link href="/services" className="text-[13px] font-semibold text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-services">Services</Link>
          <Link href="/pricing" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-pricing">Pricing</Link>
          <Link href="/blog" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-blog">Blog</Link>
          <Link href="/analyze" className="text-[13px] font-semibold text-blue-600 hover:text-blue-800 tracking-wide uppercase transition-colors" data-testid="nav-analyze">Doc Analyzer</Link>
          <div className="w-px h-4 bg-slate-200" />
          <button onClick={goToLogin} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors" data-testid="nav-signin">Sign In</button>
          <button onClick={goToLogin} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20 inline-flex items-center gap-1.5" data-testid="nav-cta">
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          className="md:hidden p-2 text-slate-600 hover:text-slate-900"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          data-testid="nav-mobile-toggle"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 shadow-lg">
          <div className="flex flex-col gap-3">
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide" data-testid="mobile-home">Home</Link>
            <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-900 py-2 uppercase tracking-wide" data-testid="mobile-services">Services</Link>
            <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide" data-testid="mobile-pricing">Pricing</Link>
            <Link href="/blog" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide" data-testid="mobile-blog">Blog</Link>
            <div className="h-px bg-slate-100 my-1" />
            <button onClick={goToLogin} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold w-full text-center" data-testid="mobile-cta">Get Started</button>
          </div>
        </div>
      )}
    </nav>
  );
}

export default function ServicePage({ service }: { service: ServiceData }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const goToLogin = () => { window.location.href = "/login"; };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "LegalService",
      name: service.title,
      description: service.metaDescription,
      url: `https://www.talk-to-my-lawyer.com/services/${service.slug}`,
      provider: { "@type": "Organization", name: "Talk to My Lawyer" },
      areaServed: "US",
      serviceType: "Legal Letter Drafting",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: service.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.talk-to-my-lawyer.com" },
        { "@type": "ListItem", position: 2, name: "Services", item: "https://www.talk-to-my-lawyer.com/services" },
        { "@type": "ListItem", position: 3, name: service.title },
      ],
    },
  ];

  return (
    <>
      <Helmet>
        <title>{service.metaTitle}</title>
        <meta name="description" content={service.metaDescription} />
        <link rel="canonical" href={`https://www.talk-to-my-lawyer.com/services/${service.slug}`} />
        <meta property="og:title" content={service.metaTitle} />
        <meta property="og:description" content={service.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://www.talk-to-my-lawyer.com/services/${service.slug}`} />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={service.metaTitle} />
        <meta name="twitter:description" content={service.metaDescription} />
        <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="min-h-screen bg-white font-['Inter'] text-slate-900">
        <ServiceNav />

        <main>
          {/* Breadcrumbs */}
          <div className="pt-[80px] md:pt-[88px] bg-gradient-to-b from-slate-50 to-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
              <nav className="flex items-center gap-2 text-sm text-slate-400 py-4" aria-label="Breadcrumb" data-testid="breadcrumbs">
                <Link href="/" className="hover:text-slate-600 transition-colors" data-testid="breadcrumb-home">Home</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <Link href="/services" className="hover:text-slate-600 transition-colors" data-testid="breadcrumb-services">Services</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-slate-700 font-medium" data-testid="breadcrumb-current">{service.title}</span>
              </nav>
            </div>
          </div>

          {/* Hero */}
          <section className="pb-16 pt-8 px-4 sm:px-6 lg:px-12 bg-gradient-to-b from-slate-50 to-white" data-testid="service-hero">
            <div className="max-w-7xl mx-auto">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-6 text-sm text-blue-700 font-medium">
                  <Scale className="w-4 h-4" />
                  Attorney-Reviewed Legal Letters
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.12] tracking-tight mb-6" data-testid="service-h1">
                  {service.h1}
                </h1>
                <p className="text-lg text-slate-600 mb-8 max-w-2xl leading-relaxed">
                  {service.heroDescription}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={goToLogin}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all"
                    data-testid="hero-cta"
                  >
                    <FileText className="w-5 h-5" />
                    Get Started — $299
                  </button>
                  <Link
                    href="/pricing"
                    className="bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 px-6 py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 transition-all"
                    data-testid="hero-pricing"
                  >
                    View All Plans <ArrowRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* 3-Step Process */}
          <section className="py-16 px-4 sm:px-6 lg:px-12" data-testid="service-process">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How It Works</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { step: "1", icon: FileText, title: "Submit Your Details", desc: "Fill out a guided intake form with the facts of your situation. No legal jargon required — just tell us what happened." },
                  { step: "2", icon: Scale, title: "Attorney Reviews", desc: "A licensed attorney reviews, edits, and approves your letter using California-specific legal language and workflows." },
                  { step: "3", icon: CheckCircle2, title: "Letter Delivered", desc: "Download your professionally formatted, attorney-reviewed letter as a PDF — ready to send." },
                ].map((item) => (
                  <div key={item.step} className="relative text-center p-6 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-lg transition-all" data-testid={`process-step-${item.step}`}>
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white text-lg font-bold mb-4">
                      {item.step}
                    </div>
                    <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Use Cases */}
          <section className="py-16 px-4 sm:px-6 lg:px-12 bg-slate-50" data-testid="service-use-cases">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">Common Situations We Help With</h2>
              <p className="text-slate-600 text-center mb-12 max-w-2xl mx-auto">Our {service.keyword} covers a wide range of situations. Here are the most common use cases:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {service.useCases.map((uc, i) => (
                  <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all" data-testid={`use-case-${i}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <h3 className="font-bold text-slate-900">{uc.title}</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed pl-8">{uc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Pricing Comparison */}
          <section className="py-16 px-4 sm:px-6 lg:px-12" data-testid="service-pricing">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">Save Thousands Compared to Traditional Attorneys</h2>
              <p className="text-slate-600 text-center mb-12 max-w-2xl mx-auto">Get the same quality of legal correspondence at a fraction of the cost.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-8 rounded-2xl border-2 border-blue-200 bg-blue-50/50 relative">
                  <div className="absolute -top-3 left-6 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Talk to My Lawyer
                  </div>
                  <div className="flex items-baseline gap-2 mb-4 mt-2">
                    <span className="text-4xl font-bold text-blue-600">$299</span>
                    <span className="text-slate-500">per letter</span>
                  </div>
                  <ul className="space-y-3">
                    {[
                      "Attorney-reviewed and approved",
                      "Delivered in 24–48 hours",
                      "California-specific legal language",
                      "Professional PDF format",
                      "Unlimited revisions during review",
                      "No hourly billing surprises",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={goToLogin}
                    className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors"
                    data-testid="pricing-cta-ttml"
                  >
                    Get Started
                  </button>
                </div>

                <div className="p-8 rounded-2xl border border-slate-200 bg-white">
                  <div className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 mt-2">Traditional Attorney</div>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl font-bold text-slate-400">$500+</span>
                    <span className="text-slate-400">per hour</span>
                  </div>
                  <ul className="space-y-3">
                    {[
                      "Hourly billing (2–5 hours typical)",
                      "Takes 1–2 weeks",
                      "Schedule consultations required",
                      "Retainer fees often required",
                      "Total cost: $1,000–$2,500+",
                      "Additional fees for revisions",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                        <DollarSign className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Trust Badges */}
          <section className="py-12 px-4 sm:px-6 lg:px-12 bg-slate-50">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { icon: Shield, title: "SOC 2 Compliant", desc: "Enterprise-grade security for all your data" },
                  { icon: Lock, title: "End-to-End Encrypted", desc: "Your information is protected at every step" },
                  { icon: Clock, title: "24-Hour Review", desc: "Attorney review completed within one business day" },
                ].map((badge, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200" data-testid={`trust-badge-${i}`}>
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <badge.icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-900">{badge.title}</div>
                      <div className="text-xs text-slate-500">{badge.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 px-4 sm:px-6 lg:px-12" data-testid="service-faq">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
              <div className="space-y-3">
                {service.faqs.map((faq, i) => (
                  <div
                    key={i}
                    className={`border rounded-xl transition-colors ${openFaq === i ? "border-blue-200 bg-blue-50/30" : "border-slate-200"}`}
                    data-testid={`faq-item-${i}`}
                  >
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left"
                      data-testid={`faq-toggle-${i}`}
                    >
                      <span className="font-semibold text-sm text-slate-900 pr-4">{faq.q}</span>
                      {openFaq === i ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    </button>
                    {openFaq === i && (
                      <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Related Articles */}
          {service.relatedArticles.length > 0 && (
            <section className="py-16 px-4 sm:px-6 lg:px-12 bg-slate-50" data-testid="service-related-articles">
              <div className="max-w-5xl mx-auto">
                <h2 className="text-2xl font-bold text-center mb-8">Related Articles</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {service.relatedArticles.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/blog/${article.slug}`}
                      className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-lg transition-all group"
                      data-testid={`related-article-${article.slug}`}
                    >
                      <h3 className="font-bold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">{article.title}</h3>
                      <p className="text-sm text-slate-600 mb-3">{article.description}</p>
                      <span className="text-sm text-blue-600 font-medium inline-flex items-center gap-1">
                        Read article <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Bottom CTA */}
          <section className="py-16 px-4 sm:px-6 lg:px-12 bg-gradient-to-r from-blue-600 to-blue-700" data-testid="service-cta">
            <div className="max-w-3xl mx-auto text-center text-white">
              <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
              <p className="text-blue-100 text-lg mb-8">
                Your first attorney-reviewed letter is free — no credit card required.
              </p>
              <button
                onClick={goToLogin}
                className="bg-white text-blue-700 hover:bg-blue-50 px-8 py-3 rounded-lg font-bold text-lg transition-colors shadow-lg inline-flex items-center gap-2"
                data-testid="bottom-cta"
              >
                Get Your Free Letter <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="bg-slate-950 text-slate-400 py-10 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
            <BrandLogo href="/" variant="dark" size="sm" loading="lazy" />
            <div className="flex flex-wrap gap-6 text-sm">
              <Link href="/services" className="hover:text-white transition-colors" data-testid="footer-services">Services</Link>
              <Link href="/pricing" className="hover:text-white transition-colors" data-testid="footer-pricing">Pricing</Link>
              <Link href="/faq" className="hover:text-white transition-colors" data-testid="footer-faq">FAQ</Link>
              <Link href="/blog" className="hover:text-white transition-colors" data-testid="footer-blog">Blog</Link>
              <Link href="/terms" className="hover:text-white transition-colors" data-testid="footer-terms">Terms</Link>
              <Link href="/privacy" className="hover:text-white transition-colors" data-testid="footer-privacy">Privacy</Link>
            </div>
            <div className="text-sm">&copy; {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </>
  );
}
