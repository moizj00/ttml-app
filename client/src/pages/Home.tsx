import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  CheckCircle2,
  ArrowRight,
  Shield,
  FileText,
  Play,
  HelpCircle,
  Menu,
  X,
  Scale,
  Lock,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";
import HowItWorks from "@/components/HowItWorks";
import FeaturesSection from "@/components/FeaturesSection";
import FirstVisitPopup from "@/components/FirstVisitPopup";
import CategoryPicker from "@/components/CategoryPicker";


const faqs = [
  {
    q: "What is Talk to My Lawyer?",
    a: "We are a specialized legal technology service that helps you send professionally drafted, attorney-reviewed legal letters. You provide the facts, our attorneys do the research and drafting, and a licensed attorney reviews and signs off on every letter before delivery.",
  },
  {
    q: "How does the free letter work?",
    a: "Your first letter is completely free — including the attorney review. There is no credit card required to start. We do this so you can experience the quality and professionalism of our service before committing to a paid plan.",
  },
  {
    q: "Are the letters actually reviewed by human attorneys?",
    a: "Yes. Every single letter generated on our platform must pass through our Attorney Review Center, where a licensed attorney reads it, makes necessary edits, and officially approves it for delivery.",
  },
  {
    q: "How long does it take?",
    a: "Most letters are drafted, reviewed, and ready for you within 24–48 hours of submission. Complex matters requiring extensive jurisdiction-specific research may take slightly longer, but you can track the status in real-time.",
  },
  {
    q: "Is my information confidential?",
    a: "Absolutely. We employ enterprise-grade encryption for all data in transit and at rest. Furthermore, our attorneys are bound by strict professional confidentiality obligations.",
  },
  {
    q: "Can I see a preview before it is finalized?",
    a: "Yes. While the attorney makes the final professional judgment on legal language, you will have access to a draft preview and can communicate any factual corrections before final approval.",
  },
];

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);


  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === "admin") navigate("/admin");
      else if (user.role === "employee") navigate("/review");
      else navigate("/dashboard");
    }
  }, [loading, isAuthenticated, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const goToLogin = () => {
    navigate("/login");
  };

  const goToLoginWithCategory = (categoryId: string) => {
    const submitPath = `/submit?type=${encodeURIComponent(categoryId)}`;
    if (isAuthenticated) {
      navigate(submitPath);
    } else {
      navigate(`/login?redirect=${encodeURIComponent(submitPath)}`);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const homeJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Talk to My Lawyer",
      url: "https://www.talk-to-my-lawyer.com",
      logo: "https://www.talk-to-my-lawyer.com/logo-main.png",
      description: "Professional attorney-reviewed legal letters drafted in minutes. Demand letters, cease and desist, breach of contract, and more.",
      contactPoint: {
        "@type": "ContactPoint",
        email: "support@talk-to-my-lawyer.com",
        contactType: "customer support",
      },
      sameAs: [],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Talk to My Lawyer",
      url: "https://www.talk-to-my-lawyer.com",
      applicationCategory: "LegalService",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "First letter free, no credit card required",
      },
      description: "Get professional, attorney-reviewed legal letters in minutes. Demand letters, cease and desist, breach of contract, and more.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Talk to My Lawyer",
      url: "https://www.talk-to-my-lawyer.com",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://www.talk-to-my-lawyer.com/?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <>
    <Helmet>
      <title>Talk to My Lawyer — Professional Attorney-Reviewed Legal Letters</title>
      <meta name="description" content="Get professional, attorney-reviewed legal letters in minutes. Demand letters, cease and desist, breach of contract, and more — your first letter is completely free." />
      <link rel="canonical" href="https://www.talk-to-my-lawyer.com/" />
      <meta property="og:title" content="Talk to My Lawyer — Professional Attorney-Reviewed Legal Letters" />
      <meta property="og:description" content="Get professional, attorney-reviewed legal letters in minutes. Demand letters, cease and desist, breach of contract, and more — your first letter is free." />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://www.talk-to-my-lawyer.com/" />
      <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Talk to My Lawyer — Professional Attorney-Reviewed Legal Letters" />
      <meta name="twitter:description" content="Professional attorney-reviewed legal letters in minutes. Demand letters, cease and desist, breach of contract — your first letter is free." />
      <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
      <script type="application/ld+json">{JSON.stringify(homeJsonLd)}</script>
    </Helmet>
    <FirstVisitPopup />
    <div className="min-h-screen bg-white font-['Inter'] text-slate-900 overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-[64px] md:h-[72px] flex items-center justify-between">
          <BrandLogo href="/" size="lg" hideWordmarkOnMobile />

          <div className="hidden md:flex items-center gap-7">
            <button
              onClick={() => scrollTo("features")}
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
              data-testid="nav-features"
            >
              Features
            </button>
            <Link
              href="/services"
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
              data-testid="nav-services"
            >
              Services
            </Link>
            <button
              onClick={() => scrollTo("pricing")}
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
              data-testid="nav-pricing"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollTo("faq")}
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
              data-testid="nav-faq"
            >
              FAQ
            </button>
            <Link
              href="/analyze"
              className="text-[13px] font-semibold text-blue-600 hover:text-blue-800 tracking-wide uppercase transition-colors"
              data-testid="nav-analyze"
            >
              Doc Analyzer
            </Link>
            <Link
              href="/blog"
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
              data-testid="nav-blog"
            >
              Blog
            </Link>
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={goToLogin}
              className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              data-testid="nav-signin"
            >
              Sign In
            </button>
            <button
              onClick={goToLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20 inline-flex items-center gap-1.5"
              data-testid="nav-cta"
            >
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            data-testid="nav-mobile-toggle"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 shadow-lg">
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  scrollTo("features");
                  setMobileMenuOpen(false);
                }}
                className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide text-left"
                data-testid="mobile-features"
              >
                Features
              </button>
              <Link
                href="/services"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide text-left"
                data-testid="mobile-services"
              >
                Services
              </Link>
              <button
                onClick={() => {
                  scrollTo("pricing");
                  setMobileMenuOpen(false);
                }}
                className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide text-left"
                data-testid="mobile-pricing"
              >
                Pricing
              </button>
              <button
                onClick={() => {
                  scrollTo("faq");
                  setMobileMenuOpen(false);
                }}
                className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide text-left"
                data-testid="mobile-faq"
              >
                FAQ
              </button>
              <Link
                href="/analyze"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-blue-600 py-2 uppercase tracking-wide text-left"
                data-testid="mobile-analyze"
              >
                Doc Analyzer
              </Link>
              <div className="h-px bg-slate-100 my-1" />
              <button
                onClick={goToLogin}
                className="text-sm font-semibold text-slate-700 py-2 text-left"
                data-testid="mobile-signin"
              >
                Sign In
              </button>
              <button
                onClick={goToLogin}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold w-full text-center"
                data-testid="mobile-cta"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      <main>
      {/* Split Hero */}
      <section className="relative min-h-screen flex flex-col lg:flex-row pt-[64px] md:pt-[72px]">
        <div className="w-full lg:w-[60%] flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24 py-8 sm:py-12 lg:py-0">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-6 sm:mb-8 text-xs sm:text-sm text-blue-700 font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse flex-shrink-0"></span>
              View Your First Draft For Free
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-[2.8rem] lg:text-[3.2rem] xl:text-[3.6rem] font-extrabold leading-[1.12] tracking-tight mb-6 sm:mb-8">
              California-focused{" "}
              <span className="text-blue-600 relative inline-block">
                legal letter drafting
                <svg
                  className="absolute w-full h-3 -bottom-1 left-0 text-blue-200"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 5 Q 50 10 100 5"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="transparent"
                  />
                </svg>
              </span>
              {", built for speed."}
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-slate-600 mb-8 sm:mb-10 max-w-xl leading-relaxed">
              Turn your facts into structured legal-letter drafts using a system
              designed around California legal language and repeatable letter
              workflows.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 sm:mb-8">
              <button
                onClick={goToLogin}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all"
                data-testid="hero-cta"
              >
                <Play className="w-5 h-5 fill-current" />
                Generate your first draft
              </button>
              <button
                onClick={() => scrollTo("pricing")}
                className="bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 px-6 py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 transition-all"
                data-testid="hero-pricing"
              >
                View Pricing <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-8 sm:mb-10">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0"></span>
                California-focused workflows
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0"></span>
                Structured drafting, not blank-page guessing
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0"></span>
                Built for attorney review or self-organized first drafts
              </div>
            </div>

            <CategoryPicker onCategorySelect={goToLoginWithCategory} />
          </div>
        </div>

        <div className="w-full lg:w-[40%] bg-blue-600 relative overflow-hidden hidden lg:flex items-center justify-center p-12">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 opacity-50"></div>
          <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0,transparent_100%)]"></div>

          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col hero-card-float">
            <div className="h-12 border-b border-slate-100 flex items-center px-4 gap-2 bg-slate-50">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
            </div>
            <div className="p-8 flex-1 bg-white flex flex-col gap-6">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Scale className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="h-4 w-32 bg-slate-200 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-slate-100 rounded"></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="hero-doc-line hero-doc-line-1"></div>
                <div className="hero-doc-line hero-doc-line-2"></div>
                <div className="hero-doc-line hero-doc-line-3"></div>
                <div className="hero-doc-line hero-doc-line-4"></div>
              </div>
              <div className="hero-doc-badge mt-4 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3">
                <div className="mt-0.5">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-green-900 mb-1">
                    Attorney Approved
                  </div>
                  <div className="text-xs text-green-700">
                    Reviewed by J. Smith, Esq. on{" "}
                    {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="px-2">
                <svg
                  viewBox="0 0 220 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-40 h-10"
                  aria-hidden="true"
                >
                  <path
                    d="M8 36 C20 10, 36 8, 44 24 C52 40, 48 44, 56 30 C62 18, 70 14, 78 22 C86 30, 82 40, 90 32 C98 24, 106 12, 116 20 C126 28, 120 40, 130 34 C138 28, 144 16, 154 24 C162 30, 160 40, 170 34 C178 28, 184 22, 194 28 C202 33, 206 38, 212 36"
                    stroke="#1e3a5f"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="520"
                    strokeDashoffset="520"
                    className="hero-doc-signature"
                    style={{ fill: "none" }}
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Horizontal Timeline "How it Works" */}
      <HowItWorks />

      {/* Alternating Layout Features */}
      <FeaturesSection />

      {/* Pricing - Horizontal Stacked Cards */}
      <section
        id="pricing"
        className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-slate-900 text-white"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white">
              Reduce drafting time for repetitive letters
            </h2>
            <p className="text-lg text-slate-400">
              Get a polished draft before attorney review. All plans include California-focused drafting and PDF delivery.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-6 max-w-5xl mx-auto">
            <div
              className="flex flex-col md:flex-row items-center justify-between p-5 sm:p-8 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
              data-testid="pricing-single-letter"
            >
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Single Letter</h3>
                <p className="text-slate-400 text-sm">
                  Best for a one-time legal need
                </p>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$200</span>
                  <span className="text-slate-400"> one-time</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <button
                  onClick={goToLogin}
                  className="w-full md:w-auto px-6 py-2.5 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-lg transition-colors text-center"
                  data-testid="pricing-cta-single-letter"
                >
                  Get Started
                </button>
              </div>
            </div>

            <div
              className="flex flex-col md:flex-row items-center justify-between p-5 sm:p-8 rounded-2xl bg-blue-600 border border-blue-500 shadow-2xl shadow-blue-900/50 relative transform md:scale-105 z-10"
              data-testid="pricing-monthly"
            >
              <div className="absolute -top-3 left-8 bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Most Popular
              </div>
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Yearly</h3>
                <p className="text-blue-200 text-sm">
                  Best for ongoing legal matters
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-700/50 px-3 py-1 rounded-md text-xs font-medium text-blue-100">
                  <FileText className="w-3 h-3" /> 4 letters per month included
                </div>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$200</span>
                  <span className="text-blue-200">/mo</span>
                </div>
                <p className="text-blue-200 text-xs mt-1">$50 per letter</p>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <button
                  onClick={goToLogin}
                  className="w-full md:w-auto px-6 py-2.5 bg-white text-blue-700 hover:bg-slate-50 font-bold rounded-lg transition-colors shadow-lg text-center"
                  data-testid="pricing-cta-monthly"
                >
                  Subscribe Now
                </button>
              </div>
            </div>

            <div
              className="flex flex-col md:flex-row items-center justify-between p-5 sm:p-8 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors relative"
              data-testid="pricing-yearly"
            >
              <div className="absolute -top-3 left-8 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                2 Months Free
              </div>
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Yearly</h3>
                <p className="text-slate-400 text-sm">
                  Best value — save 2 months
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 bg-slate-700/50 px-3 py-1 rounded-md text-xs font-medium text-slate-300">
                  <FileText className="w-3 h-3" /> 4 letters per month included
                </div>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$2,000</span>
                  <span className="text-slate-400">/yr</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <button
                  onClick={goToLogin}
                  className="w-full md:w-auto px-6 py-2.5 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-lg transition-colors text-center"
                  data-testid="pricing-cta-yearly"
                >
                  Subscribe Yearly
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Column FAQ */}
      <section id="faq" className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 sm:gap-12 lg:gap-16">
          <div className="w-full lg:w-1/3">
            <div className="sticky top-32">
              <div className="inline-flex items-center gap-2 text-blue-600 font-semibold mb-4 text-sm tracking-wide uppercase">
                <HelpCircle className="w-4 h-4" /> FAQ
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 text-slate-900">
                Common Questions
              </h2>
              <p className="text-lg text-slate-600 mb-8">
                Everything you need to know about our legal letter service, how
                it works, and our attorney review process.
              </p>
              <Link
                href="/faq"
                className="text-blue-600 font-semibold flex items-center gap-2 hover:gap-3 transition-all"
                data-testid="faq-view-all"
              >
                View All FAQs <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <div className="divide-y divide-slate-200">
              {faqs.map((faq, i) => (
                <div key={i} className="py-6" data-testid={`faq-item-${i}`}>
                  <button
                    className="w-full flex items-center justify-between text-left focus:outline-none group"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    data-testid={`faq-toggle-${i}`}
                  >
                    <span
                      className={`text-base sm:text-lg md:text-xl font-semibold pr-4 sm:pr-8 transition-colors ${openFaq === i ? "text-blue-600" : "text-slate-900 group-hover:text-blue-600"}`}
                    >
                      {faq.q}
                    </span>
                    <span
                      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${openFaq === i ? "bg-blue-50 border-blue-200 text-blue-600" : "border-slate-200 text-slate-400 group-hover:border-blue-200 group-hover:text-blue-600"}`}
                    >
                      {openFaq === i ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? "max-h-96 opacity-100 mt-4" : "max-h-0 opacity-0"}`}
                  >
                    <p className="text-slate-600 leading-relaxed text-lg">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-blue-600 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 sm:mb-6">
            Ready to send your first legal letter?
          </h2>
          <p className="text-blue-100 text-base sm:text-lg md:text-xl mb-8 sm:mb-10 max-w-2xl mx-auto">
            Get professional legal representation in your correspondence today.
            Your first letter is completely free.
          </p>
          <button
            onClick={goToLogin}
            className="bg-white text-blue-600 hover:bg-slate-50 px-6 py-3 rounded-lg text-base font-bold shadow-2xl transition-transform hover:-translate-y-1 inline-block"
            data-testid="final-cta"
          >
            Start Your Free Letter Now
          </button>

          <div className="mt-16 flex flex-wrap justify-center items-center gap-8 lg:gap-16 opacity-75">
            <div className="flex items-center gap-2 text-white font-medium">
              <Lock className="w-5 h-5" /> SOC 2 Compliant
            </div>
            <div className="flex items-center gap-2 text-white font-medium">
              <Shield className="w-5 h-5" /> Enterprise Security
            </div>
            <div className="flex items-center gap-2 text-white font-medium">
              <CheckCircle2 className="w-5 h-5" /> End-to-End Encrypted
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-8 sm:py-12 px-4 sm:px-6 lg:px-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
          <BrandLogo href="/" variant="dark" size="sm" loading="lazy" />

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm font-medium">
            <button
              onClick={() => scrollTo("pricing")}
              className="hover:text-white transition-colors"
              data-testid="footer-pricing"
            >
              Pricing
            </button>
            <Link
              href="/faq"
              className="hover:text-white transition-colors"
              data-testid="footer-faq"
            >
              FAQ
            </Link>
            <Link
              href="/blog"
              className="hover:text-white transition-colors"
              data-testid="footer-blog"
            >
              Blog
            </Link>
            <Link
              href="/terms"
              className="hover:text-white transition-colors"
              data-testid="footer-terms"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
              data-testid="footer-privacy"
            >
              Privacy
            </Link>
            <button
              onClick={goToLogin}
              className="hover:text-white transition-colors"
              data-testid="footer-signin"
            >
              Sign In
            </button>
          </div>

          <div className="text-sm">
            &copy; {new Date().getFullYear()} Talk to My Lawyer. All rights
            reserved.
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}
