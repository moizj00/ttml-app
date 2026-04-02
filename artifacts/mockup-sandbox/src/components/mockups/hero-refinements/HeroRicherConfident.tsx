import { useState } from 'react';
import {
  CheckCircle2,
  ArrowRight,
  Play,
  Scale,
  Zap,
  Shield,
  FileCheck,
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

export default function HeroRicherConfident() {
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
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-2 mb-8 text-sm text-blue-700 font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
              View Your First Draft For Free
            </div>

            <h1 className="text-[2.85rem] lg:text-[3.4rem] xl:text-[3.9rem] font-black leading-[1.08] tracking-[-0.02em] mb-5">
              California-focused{" "}
              <span className="text-blue-600 relative inline-block">
                legal letter drafting
                <svg
                  className="absolute w-full h-[7px] -bottom-1 left-0"
                  viewBox="0 0 100 7"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 4 Q 25 7 50 4 Q 75 1 100 4"
                    stroke="#93bbfd"
                    strokeWidth="3"
                    fill="transparent"
                  />
                </svg>
              </span>
              {", built for speed."}
            </h1>

            <p className="text-lg lg:text-[19px] text-slate-500 mb-7 max-w-xl leading-[1.7]">
              Turn your facts into structured legal-letter drafts using a system
              designed around California legal language and repeatable letter
              workflows.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <a
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-3.5 rounded-lg text-[15px] font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 hover:shadow-2xl hover:shadow-blue-600/30 transition-all duration-200 ring-1 ring-blue-700/10"
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

            <div className="flex items-center gap-4 mb-8 py-3 px-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex -space-x-2">
                {['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500'].map((c, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full ${c} border-2 border-white flex items-center justify-center`}>
                    <span className="text-[9px] font-bold text-white">{['J','A','M','K'][i]}</span>
                  </div>
                ))}
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">500+</span> letters drafted this month
              </div>
              <div className="ml-auto flex items-center gap-1">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className="w-3.5 h-3.5 text-amber-400 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="flex items-start gap-2.5 text-sm text-slate-600">
                <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="leading-snug">California-focused workflows</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-slate-600">
                <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="leading-snug">Structured drafting, not guessing</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-slate-600">
                <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="leading-snug">Built for attorney review</span>
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

        <div className="w-full lg:w-[42%] relative overflow-hidden hidden lg:flex items-center justify-center p-10"
          style={{
            background: 'linear-gradient(150deg, #5b93f5 0%, #2563eb 30%, #1d4ed8 65%, #1e3a8a 100%)',
          }}
        >
          <div className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/[0.06] rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-blue-400/[0.08] rounded-full blur-2xl" />

          <div className="relative w-full max-w-[440px]">
            <div className="absolute -top-4 -left-4 w-[calc(100%+32px)] h-[calc(100%+32px)] bg-white/[0.06] rounded-3xl border border-white/[0.08]" />
            <div className="absolute -top-2 -left-2 w-[calc(100%+16px)] h-[calc(100%+16px)] bg-white/[0.04] rounded-[22px] border border-white/[0.06]" />

            <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/25 overflow-hidden flex flex-col">
              <div className="h-10 border-b border-slate-100 flex items-center px-3.5 gap-1.5 bg-slate-50/80">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
                <div className="flex-1 mx-6">
                  <div className="bg-slate-100 rounded-md h-5 flex items-center justify-center">
                    <span className="text-[10px] text-slate-400 font-medium">talk-to-my-lawyer.com</span>
                  </div>
                </div>
              </div>

              <div className="bg-white">
                <div className="flex border-b border-slate-100">
                  <div className="px-4 py-2.5 text-[11px] font-semibold text-blue-600 border-b-2 border-blue-600">Letter Draft</div>
                  <div className="px-4 py-2.5 text-[11px] font-medium text-slate-400">Research</div>
                  <div className="px-4 py-2.5 text-[11px] font-medium text-slate-400">Status</div>
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                      <Scale className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-slate-800">Demand for Payment</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Cal. Civ. Code § 1946.2 · Filed Mar 2026</div>
                    </div>
                  </div>

                  <div className="space-y-2.5 mb-4">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Document Preview</div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1">RE: Notice of Breach & Demand</div>
                      <div className="space-y-1.5">
                        <div className="h-[5px] bg-slate-200/70 rounded-full w-full" />
                        <div className="h-[5px] bg-slate-200/70 rounded-full w-[94%]" />
                        <div className="h-[5px] bg-slate-200/70 rounded-full w-[88%]" />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 space-y-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-3 h-3 rounded bg-blue-200 flex items-center justify-center">
                          <span className="text-[7px] font-bold text-blue-700">§</span>
                        </div>
                        <span className="text-[10px] font-semibold text-blue-700">Legal Authority</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-[5px] bg-blue-200/50 rounded-full w-[92%]" />
                        <div className="h-[5px] bg-blue-200/50 rounded-full w-[80%]" />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1">Demand & Deadline</div>
                      <div className="space-y-1.5">
                        <div className="h-[5px] bg-slate-200/70 rounded-full w-full" />
                        <div className="h-[5px] bg-slate-200/70 rounded-full w-[72%]" />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex items-start gap-2.5 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-[11px] font-semibold text-green-900 mb-0.5">Attorney Approved</div>
                      <div className="text-[10px] text-green-700">Reviewed by J. Smith, Esq.</div>
                    </div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <div className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center">
                        <CheckCircle2 className="w-2.5 h-2.5 text-green-700" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <svg
                      viewBox="0 0 180 36"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-24 h-6 opacity-70"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 26 C16 8, 28 6, 34 18 C40 30, 38 32, 44 24 C48 16, 54 12, 60 18 C66 22, 64 30, 70 26 C76 20, 82 10, 90 16 C98 22, 94 32, 102 28 C108 22, 112 14, 120 18 C126 22, 124 30, 132 26 C138 22, 142 18, 150 22 C156 24, 160 28, 166 26"
                        stroke="#1e3a5f"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ fill: 'none' }}
                      />
                    </svg>
                    <div className="flex gap-1.5">
                      <div className="h-7 px-3 bg-slate-100 rounded-md flex items-center text-[10px] font-medium text-slate-500">Download PDF</div>
                      <div className="h-7 px-3 bg-blue-600 rounded-md flex items-center text-[10px] font-semibold text-white">Send Letter</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
