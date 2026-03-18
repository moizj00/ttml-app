import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ArrowRight,
  Shield,
  FileText,
  Play,
  Zap,
  Copy,
  Share2,
  History,
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
import FirstVisitPopup from "@/components/FirstVisitPopup";

const letterTypes = [
  "Breach of Contract",
  "Demand for Payment",
  "Cease and Desist",
  "Pre-Litigation Settlement",
  "Debt Collection",
];

const supportingFeatures = [
  {
    icon: FileText,
    title: "7 Letter Types",
    desc: "Demand letters, cease and desist notices, contract breach, eviction, employment disputes, consumer complaints, and general legal correspondence.",
  },
  {
    icon: Copy,
    title: "Real-Time Status Tracking",
    desc: "Follow your letter from submission through attorney drafting, review, and final approval with live status updates and email notifications.",
  },
  {
    icon: History,
    title: "Full Audit Trail",
    desc: "Every action is logged — from intake to attorney drafting, edits, and final approval. Complete transparency at every step.",
  },
  {
    icon: Shield,
    title: "Encrypted & Confidential",
    desc: "Your case details are encrypted in transit and at rest. Attorneys are bound by professional confidentiality obligations. Your data is never shared.",
  },
];

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
    document.title = "Talk to My Lawyer — Professional Legal Letters";
  }, []);

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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
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

      {/* Split Hero */}
      <section className="relative min-h-screen flex flex-col lg:flex-row pt-[64px] md:pt-[72px]">
        <div className="w-full lg:w-[60%] flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24 py-8 sm:py-12 lg:py-0">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-6 sm:mb-8 text-xs sm:text-sm text-blue-700 font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse flex-shrink-0"></span>
              View Your First Letter For Free
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-[2.8rem] lg:text-[3.2rem] xl:text-[3.6rem] font-extrabold leading-[1.12] tracking-tight mb-6 sm:mb-8">
              Professional{" "}
              <span className="text-blue-600 relative inline-block">
                Legal Letters
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
              </span>{" "}
              Drafted & Approved by Attorneys
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-slate-600 mb-8 sm:mb-10 max-w-xl leading-relaxed">
              Describe your legal situation. Our attorneys research applicable
              laws, draft a professional letter, and review every word before
              delivery.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 sm:mb-12">
              <button
                onClick={goToLogin}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all"
                data-testid="hero-cta"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Your Free Letter
              </button>
              <button
                onClick={() => scrollTo("pricing")}
                className="bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 px-6 py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 transition-all"
                data-testid="hero-pricing"
              >
                View Pricing <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
              {letterTypes.map((type) => (
                <button
                  key={type}
                  onClick={goToLogin}
                  className="bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-full shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  data-testid={`pill-${type.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {type}
                </button>
              ))}
              <span className="bg-slate-50 border border-slate-200 text-slate-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-full cursor-default">
                And more
              </span>
            </div>
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
                <div className="h-3 w-full bg-slate-100 rounded"></div>
                <div className="h-3 w-[90%] bg-slate-100 rounded"></div>
                <div className="h-3 w-[95%] bg-slate-100 rounded"></div>
                <div className="h-3 w-[85%] bg-slate-100 rounded"></div>
              </div>
              <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3">
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
            </div>
          </div>
        </div>
      </section>

      {/* Horizontal Timeline "How it Works" */}
      <HowItWorks />

      {/* Alternating Layout Features */}
      <section
        id="features"
        className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-white overflow-hidden"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12 md:mb-24">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Built for Real Legal Situations
            </h2>
            <p className="text-lg text-slate-600">
              Every feature exists to get you a stronger letter, faster
            </p>
          </div>

          <div className="space-y-16 sm:space-y-24 md:space-y-32">
            {/* Feature Row 1: Jurisdiction Research */}
            <div className="flex flex-col lg:flex-row items-center gap-8 sm:gap-12 lg:gap-24">
              <div className="w-full lg:w-1/2">
                <div
                  className="aspect-square max-h-[400px] sm:max-h-[500px] w-full bg-blue-50 rounded-2xl sm:rounded-3xl p-6 sm:p-12 relative flex items-center justify-center"
                >
                  <div
                    className="absolute inset-0 bg-blue-600/5 rounded-3xl"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 2px 2px, rgba(37, 99, 235, 0.15) 1px, transparent 0)",
                      backgroundSize: "24px 24px",
                    }}
                  ></div>

                  <div className="relative w-full h-full bg-white rounded-2xl shadow-xl p-8 flex flex-col justify-between border border-blue-100">
                    <div className="flex justify-between items-start mb-8">
                      <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-bold">
                        CALIFORNIA
                      </div>
                      <Shield className="text-blue-600 w-6 h-6" />
                    </div>
                    <div className="space-y-4 flex-1">
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="h-2 w-20 bg-blue-200 rounded mb-2"></div>
                        <div className="h-2 w-full bg-slate-200 rounded"></div>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 relative">
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">
                          ✓
                        </div>
                        <div className="h-2 w-32 bg-blue-300 rounded mb-2 ml-4"></div>
                        <div className="h-2 w-full bg-blue-200 rounded ml-4"></div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="h-2 w-24 bg-blue-200 rounded mb-2"></div>
                        <div className="h-2 w-full bg-slate-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full lg:w-1/2 flex flex-col justify-center">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <Zap className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-3xl font-bold mb-4">
                  Jurisdiction-Aware Research
                </h3>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  Our attorneys identify statutes, regulations, and case law
                  specific to your state and situation — cited directly in your
                  letter. We don't just use generic templates; we provide real
                  legal authority.
                </p>
                <ul className="space-y-4">
                  {[
                    "State-specific legal codes applied",
                    "Relevant case law citations included",
                    "Statute of limitations checked",
                    "Local regulatory compliance verified",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      <span className="text-slate-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Feature Row 2: Attorney Review Center (Reversed) */}
            <div className="flex flex-col lg:flex-row-reverse items-center gap-8 sm:gap-12 lg:gap-24">
              <div className="w-full lg:w-1/2">
                <div className="aspect-square max-h-[400px] sm:max-h-[500px] w-full bg-slate-100 rounded-2xl sm:rounded-3xl p-6 sm:p-12 relative flex items-center justify-center">
                  <div className="relative w-full h-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                      <span className="text-white font-medium text-sm">
                        Attorney Review Portal
                      </span>
                      <div className="flex gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                      </div>
                    </div>
                    <div className="flex-1 p-6 bg-slate-50 flex gap-4">
                      <div className="w-1/3 space-y-3">
                        <div className="p-3 bg-white rounded shadow-sm border-l-4 border-blue-600">
                          <div className="h-2 w-full bg-slate-200 rounded mb-2"></div>
                          <div className="h-2 w-1/2 bg-slate-200 rounded"></div>
                        </div>
                        <div className="p-3 bg-white/50 rounded shadow-sm">
                          <div className="h-2 w-full bg-slate-200 rounded mb-2"></div>
                          <div className="h-2 w-2/3 bg-slate-200 rounded"></div>
                        </div>
                        <div className="p-3 bg-white/50 rounded shadow-sm">
                          <div className="h-2 w-full bg-slate-200 rounded mb-2"></div>
                          <div className="h-2 w-3/4 bg-slate-200 rounded"></div>
                        </div>
                      </div>
                      <div className="w-2/3 bg-white rounded shadow-sm border border-slate-200 p-6 flex flex-col">
                        <div className="space-y-4 mb-auto">
                          <div className="h-2 w-full bg-slate-100 rounded"></div>
                          <div className="h-2 w-full bg-slate-100 rounded"></div>
                          <div className="p-2 bg-yellow-50 rounded border border-yellow-200 relative">
                            <div className="h-2 w-full bg-yellow-200 rounded mb-2"></div>
                            <div className="h-2 w-4/5 bg-yellow-200 rounded"></div>
                            <div className="absolute top-1/2 -right-12 translate-x-full -translate-y-1/2 bg-white shadow-lg rounded p-2 text-[10px] text-slate-500 border border-slate-100 w-24 hidden sm:block">
                              Strengthened claim here.
                            </div>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded"></div>
                        </div>
                        <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-4">
                          <div className="h-6 w-16 bg-slate-100 rounded"></div>
                          <div className="h-6 w-20 bg-blue-600 rounded"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full lg:w-1/2 flex flex-col justify-center">
                <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mb-6">
                  <Share2 className="w-7 h-7 text-indigo-600" />
                </div>
                <h3 className="text-3xl font-bold mb-4">
                  Attorney Review Center
                </h3>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  Licensed attorneys work in a dedicated Review Center — editing
                  language, verifying citations, and ensuring professional
                  quality. No letter is delivered without human legal oversight.
                </p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      100%
                    </div>
                    <div className="text-sm text-slate-600 font-medium">
                      Human reviewed
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      24-48h
                    </div>
                    <div className="text-sm text-slate-600 font-medium">
                      Average turnaround
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      50+
                    </div>
                    <div className="text-sm text-slate-600 font-medium">
                      Jurisdictions covered
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">
                      Inline
                    </div>
                    <div className="text-sm text-slate-600 font-medium">
                      Draft feedback
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Supporting Feature Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 pt-12 border-t border-slate-100">
              {supportingFeatures.map((f, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors"
                  data-testid={`feature-card-${i}`}
                >
                  <f.icon className="w-8 h-8 text-blue-600 mb-6" />
                  <h4 className="text-xl font-bold mb-3">{f.title}</h4>
                  <p className="text-slate-600 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Horizontal Stacked Cards */}
      <section
        id="pricing"
        className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-slate-900 text-white"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white">
              Resolve your dispute faster with lawyer-drafted letters and negotiations
            </h2>
            <p className="text-lg text-slate-400">
              Your first letter is completely free. After that, choose the plan
              that fits.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-6 max-w-5xl mx-auto">
            <div
              className="flex flex-col md:flex-row items-center justify-between p-5 sm:p-8 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
              data-testid="pricing-pay-per-letter"
            >
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Pay Per Letter</h3>
                <p className="text-slate-400 text-sm">
                  Best for a one-time legal need
                </p>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$200</span>
                  <span className="text-slate-400">/letter</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <button
                  onClick={goToLogin}
                  className="w-full md:w-auto px-6 py-2.5 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-lg transition-colors text-center"
                  data-testid="pricing-cta-pay-per-letter"
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
                  <span className="text-4xl font-bold">$499</span>
                  <span className="text-blue-200">/mo</span>
                </div>
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
              className="flex flex-col md:flex-row items-center justify-between p-5 sm:p-8 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
              data-testid="pricing-monthly-pro"
            >
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Yearly Pro</h3>
                <p className="text-slate-400 text-sm">
                  Best value for high-volume users
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 bg-slate-700/50 px-3 py-1 rounded-md text-xs font-medium text-slate-300">
                  <FileText className="w-3 h-3" /> 8 letters per month included
                </div>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$699</span>
                  <span className="text-slate-400">/mo</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <button
                  onClick={goToLogin}
                  className="w-full md:w-auto px-6 py-2.5 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-lg transition-colors text-center"
                  data-testid="pricing-cta-monthly-pro"
                >
                  Subscribe Pro
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

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-8 sm:py-12 px-4 sm:px-6 lg:px-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
          <BrandLogo href="/" variant="dark" size="sm" />

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
