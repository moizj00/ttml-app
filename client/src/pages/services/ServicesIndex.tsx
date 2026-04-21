import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import {
  ArrowRight,
  FileText,
  ShieldAlert,
  Home as HomeIcon,
  Briefcase,
  UserCheck,
  Scale,
  Gavel,
  ShieldCheck,
  Copyright,
  AlertTriangle,
} from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";
import PublicNav from "@/components/shared/PublicNav";
import PublicBreadcrumb from "@/components/shared/PublicBreadcrumb";
import { SERVICES } from "./serviceData";

const SERVICE_ICONS: Record<string, typeof FileText> = {
  "demand-letter": FileText,
  "cease-and-desist": ShieldAlert,
  "security-deposit-letter": HomeIcon,
  "breach-of-contract-letter": Briefcase,
  "employment-dispute-letter": UserCheck,
  "personal-injury-demand-letter": AlertTriangle,
  "landlord-harassment-cease-desist": ShieldCheck,
  "non-compete-dispute-letter": Scale,
  "intellectual-property-infringement-letter": Copyright,
  "small-claims-demand-letter": Gavel,
};

export default function ServicesIndex() {
  const goToSignup = () => { window.location.href = "/signup"; };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Legal Letter Services",
    description: "Professional attorney-reviewed legal letter services for demand letters, cease and desist, security deposit recovery, breach of contract, and employment disputes.",
    url: "https://www.talk-to-my-lawyer.com/services",
    numberOfItems: SERVICES.length,
    itemListElement: SERVICES.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.title,
      url: `https://www.talk-to-my-lawyer.com/services/${s.slug}`,
    })),
  };

  return (
    <>
      <Helmet>
        <title>Legal Letter Services — Attorney-Reviewed | Talk to My Lawyer</title>
        <meta name="description" content="Professional attorney-reviewed legal letters: demand letters, cease and desist, security deposit recovery, breach of contract, and employment disputes. Starting at $299." />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/services" />
        <meta property="og:title" content="Legal Letter Services — Talk to My Lawyer" />
        <meta property="og:description" content="Professional attorney-reviewed legal letters starting at $299. Demand letters, cease and desist, and more." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/services" />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Legal Letter Services — Talk to My Lawyer" />
        <meta name="twitter:description" content="Professional attorney-reviewed legal letters starting at $299." />
        <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="min-h-screen bg-white font-['Inter'] text-slate-900">
        <PublicNav activeLink="/services" />
        <PublicBreadcrumb items={[{ label: "Services" }]} />

        <main>
          {/* Hero */}
          <section className="pb-16 pt-8 px-4 sm:px-6 lg:px-12 bg-gradient-to-b from-slate-50 to-white" data-testid="services-hero">
            <div className="max-w-7xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-6 text-sm text-blue-700 font-medium">
                <Scale className="w-4 h-4" />
                Professional Legal Letters
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.12] tracking-tight mb-6" data-testid="services-h1">
                Attorney-Reviewed Legal Letters<br className="hidden sm:block" />
                <span className="text-blue-600">For Every Situation</span>
              </h1>
              <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                Choose the letter type that fits your situation. Every letter is drafted using California-focused legal language and reviewed by a licensed attorney before delivery.
              </p>
            </div>
          </section>

          {/* Service Cards */}
          <section className="pb-20 px-4 sm:px-6 lg:px-12" data-testid="services-grid">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SERVICES.map((service) => {
                const Icon = SERVICE_ICONS[service.slug] || FileText;
                return (
                  <Link
                    key={service.slug}
                    href={`/services/${service.slug}`}
                    className="group bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-200 hover:shadow-xl transition-all duration-200 hover:-translate-y-1 flex flex-col"
                    data-testid={`service-card-${service.slug}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">{service.title}</h2>
                    <p className="text-sm text-slate-600 mb-4 flex-1 leading-relaxed">{service.heroDescription.slice(0, 150)}...</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-600">Starting at $299</span>
                      <ArrowRight className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="py-16 px-4 sm:px-6 lg:px-12 bg-gradient-to-r from-blue-600 to-blue-700" data-testid="services-cta">
            <div className="max-w-3xl mx-auto text-center text-white">
              <h2 className="text-3xl font-bold mb-4">Not Sure Which Letter You Need?</h2>
              <p className="text-blue-100 text-lg mb-8">
                Start for free — describe your situation and we will help you determine the right letter type.
              </p>
              <button
                onClick={goToSignup}
                className="bg-white text-blue-700 hover:bg-blue-50 px-8 py-3 rounded-lg font-bold text-lg transition-colors shadow-lg inline-flex items-center gap-2"
                data-testid="bottom-cta"
              >
                Get Started Free <ArrowRight className="w-5 h-5" />
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
