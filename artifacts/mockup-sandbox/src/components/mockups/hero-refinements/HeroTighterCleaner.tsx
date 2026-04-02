import { useState } from 'react';
import {
  CheckCircle2,
  ArrowRight,
  Play,
  Scale,
  Menu,
  X,
} from 'lucide-react';

const letterTypes = [
  'California Landlord-Tenant Letters',
  'California Employment Dispute Letters',
  'California Demand Letters',
  'California Collections / Debt Response Letters',
  'California Business Dispute Letters',
];

export default function HeroTighterCleaner() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-['Inter'] text-slate-900 overflow-x-hidden">
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-[72px] flex items-center justify-between">
          <a href="/" className="flex-shrink-0 inline-flex items-center gap-3">
            <img
              src="/__mockup/images/logo-icon-badge.png"
              alt="Talk to My Lawyer"
              className="h-12 w-12 object-contain"
            />
            <span className="hidden md:flex flex-col leading-tight select-none">
              <span className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#1e1b4b]">
                TALK TO MY
              </span>
              <span className="text-[18px] font-bold leading-none text-[#312e81]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
                Lawyer
              </span>
            </span>
          </a>

          <div className="hidden md:flex items-center gap-7">
            <a href="#features" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Features</a>
            <a href="#pricing" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Pricing</a>
            <a href="#faq" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">FAQ</a>
            <a href="/analyze" className="text-[13px] font-semibold text-blue-600 hover:text-blue-800 tracking-wide uppercase transition-colors">Doc Analyzer</a>
            <a href="/blog" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Blog</a>
            <div className="w-px h-4 bg-slate-200" />
            <a href="/login" className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors">Sign In</a>
            <a href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20 inline-flex items-center gap-1.5">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <button
            className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 shadow-lg">
            <div className="flex flex-col gap-3">
              <a href="#features" className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide">Features</a>
              <a href="#pricing" className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide">Pricing</a>
              <a href="#faq" className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide">FAQ</a>
              <a href="/analyze" className="text-sm font-semibold text-blue-600 py-2 uppercase tracking-wide">Doc Analyzer</a>
              <div className="h-px bg-slate-100 my-1" />
              <a href="/login" className="text-sm font-semibold text-slate-700 py-2">Sign In</a>
              <a href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold w-full block text-center">
                Get Started
              </a>
            </div>
          </div>
        )}
      </nav>

      <section className="relative min-h-screen flex flex-col lg:flex-row pt-[72px]">
        <div className="w-full lg:w-[58%] flex flex-col justify-center px-6 lg:px-20 xl:px-24 py-12 lg:py-0">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-2 mb-10 text-sm text-blue-700 font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
              View Your First Draft For Free
            </div>

            <h1 className="text-[2.75rem] lg:text-[3.25rem] xl:text-[3.75rem] font-extrabold leading-[1.1] tracking-tight mb-6">
              California-focused{" "}
              <span className="text-blue-600 relative inline-block">
                legal letter drafting
                <svg
                  className="absolute w-full h-[6px] -bottom-1.5 left-0 text-blue-200/80"
                  viewBox="0 0 100 6"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 3 Q 25 6 50 3 Q 75 0 100 3"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    fill="transparent"
                  />
                </svg>
              </span>
              {", built for speed."}
            </h1>

            <p className="text-lg lg:text-xl text-slate-500 mb-10 max-w-xl leading-[1.7]">
              Turn your facts into structured legal-letter drafts using a system
              designed around California legal language and repeatable letter
              workflows.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <a
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-3.5 rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-200"
              >
                <Play className="w-4.5 h-4.5 fill-current" />
                Generate your first draft
              </a>
              <a
                href="#pricing"
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-7 py-3.5 rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:border-slate-300"
              >
                View Pricing <ArrowRight className="w-4.5 h-4.5" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-10">
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                California-focused workflows
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                Structured drafting, not blank-page guessing
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                Built for attorney review or self-organized first drafts
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {letterTypes.map((type) => (
                <a
                  key={type}
                  href="/login"
                  className="bg-white border border-slate-200 text-slate-600 text-sm font-medium px-4 py-1.5 rounded-full shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {type}
                </a>
              ))}
              <span className="bg-slate-50 border border-slate-200 text-slate-400 text-sm font-medium px-4 py-1.5 rounded-full cursor-default">
                And more
              </span>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[42%] relative overflow-hidden hidden lg:flex items-center justify-center p-12"
          style={{
            background: 'linear-gradient(145deg, #4f8ef7 0%, #2563eb 35%, #1d4ed8 70%, #1e3a8a 100%)',
          }}
        >
          <div className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/[0.06] rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-blue-400/[0.08] rounded-full blur-2xl" />

          <div className="relative w-full max-w-[420px]">
            <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 overflow-hidden flex flex-col">
              <div className="h-11 border-b border-slate-100 flex items-center px-4 gap-2 bg-slate-50/80">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
                <div className="flex-1 mx-8">
                  <div className="bg-slate-100 rounded-md h-5 flex items-center justify-center">
                    <span className="text-[10px] text-slate-400 font-medium">talk-to-my-lawyer.com</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white">
                <div className="flex items-center gap-3 pb-5 border-b border-slate-100 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Scale className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-slate-800">Demand for Payment</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">California Civil Code § 1946.2</div>
                  </div>
                  <div className="px-2 py-0.5 bg-blue-50 rounded text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Draft</div>
                </div>

                <div className="space-y-[10px] mb-5">
                  <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-2">Letter Content</div>
                  <div className="flex gap-2 items-start">
                    <div className="w-0.5 h-8 bg-blue-200 rounded-full mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 bg-slate-100 rounded-full w-full" />
                      <div className="h-2 bg-slate-100 rounded-full w-[92%]" />
                    </div>
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="w-0.5 h-8 bg-blue-200 rounded-full mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 bg-slate-100 rounded-full w-[95%]" />
                      <div className="h-2 bg-slate-100 rounded-full w-[88%]" />
                    </div>
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="w-0.5 h-amber-200 bg-amber-200 rounded-full mt-0.5 flex-shrink-0" style={{height: '2rem'}} />
                    <div className="flex-1 p-2 bg-amber-50 rounded border border-amber-100">
                      <div className="h-2 bg-amber-200/60 rounded-full w-full mb-1.5" />
                      <div className="h-2 bg-amber-200/60 rounded-full w-[75%]" />
                    </div>
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="w-0.5 h-8 bg-blue-200 rounded-full mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 bg-slate-100 rounded-full w-[90%]" />
                      <div className="h-2 bg-slate-100 rounded-full w-[82%]" />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-green-50 border border-green-100 rounded-xl flex items-start gap-2.5 mb-4">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-green-900 mb-0.5">Attorney Approved</div>
                    <div className="text-[10px] text-green-700 leading-relaxed">Reviewed by J. Smith, Esq.</div>
                  </div>
                </div>

                <div className="px-1">
                  <svg
                    viewBox="0 0 220 44"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-32 h-8 opacity-80"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 32 C20 10, 36 8, 44 22 C52 36, 48 40, 56 28 C62 18, 70 14, 78 20 C86 26, 82 36, 90 28 C98 22, 106 12, 116 18 C126 24, 120 36, 130 30 C138 24, 144 16, 154 22 C162 26, 160 36, 170 30 C178 24, 184 20, 194 24 C202 28, 206 34, 212 32"
                      stroke="#1e3a5f"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ fill: 'none' }}
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
