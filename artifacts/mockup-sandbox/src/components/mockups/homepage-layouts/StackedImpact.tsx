import { useState } from "react";
import {
  Menu,
  X,
  ArrowRight,
  Shield,
  FileText,
  Zap,
  Copy,
  Share2,
  History,
  CheckCircle2,
  ChevronDown
} from "lucide-react";

export function StackedImpact() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    if (openFaq === index) {
      setOpenFaq(null);
    } else {
      setOpenFaq(index);
    }
  };

  const faqs = [
    {
      q: "What is Talk to My Lawyer?",
      a: "Talk to My Lawyer is a professional legal letter service where licensed attorneys research, draft, and review correspondence tailored to your specific situation."
    },
    {
      q: "How does the free letter work?",
      a: "Your first letter is completely free. You describe your situation, and our attorneys draft and review the letter. There is no credit card required to start."
    },
    {
      q: "How much does it cost after the free letter?",
      a: "After your free letter, you can pay $200 per letter or subscribe to a monthly plan starting at $499/mo for up to 4 letters."
    },
    {
      q: "How long does it take?",
      a: "Most letters are drafted, reviewed, and ready for you to download within 24 to 48 hours."
    },
    {
      q: "Will this letter hold up in court?",
      a: "Our letters are drafted by licensed attorneys based on the applicable laws in your jurisdiction. While a letter is not a guarantee of a specific legal outcome, it carries the weight of professional legal preparation."
    },
    {
      q: "What types of letters do you write?",
      a: "We write demand letters, cease and desist notices, breach of contract claims, eviction notices, debt collection letters, and more."
    },
    {
      q: "Are the letters really reviewed by attorneys?",
      a: "Yes. Every single letter goes through our Attorney Review Center where a licensed attorney verifies citations, edits language, and approves the final draft."
    },
    {
      q: "Can I review the letter before sending?",
      a: "Absolutely. You will receive a downloadable PDF of the final approved letter for your review and records."
    },
    {
      q: "Is my information confidential?",
      a: "Yes. All data is end-to-end encrypted, and our attorneys are bound by strict professional confidentiality obligations."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-900 font-['Inter'] selection:bg-blue-500 selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-slate-900/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white text-xl font-bold tracking-tight font-['Space_Grotesk']">
              Talk to My Lawyer
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">Features</a>
            <a href="#pricing" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">Pricing</a>
            <a href="#faq" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">FAQ</a>
            <a href="/login" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">Sign In</a>
            <a href="/login" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded text-sm font-semibold transition-colors inline-flex items-center" data-testid="nav-cta">
              Get Started
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden text-white p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-800 border-t border-white/10 p-4 space-y-4">
            <a href="#features" className="block text-slate-300 hover:text-white font-medium p-2">Features</a>
            <a href="#pricing" className="block text-slate-300 hover:text-white font-medium p-2">Pricing</a>
            <a href="#faq" className="block text-slate-300 hover:text-white font-medium p-2">FAQ</a>
            <div className="h-px bg-white/10 my-2"></div>
            <a href="/login" className="block w-full text-left text-slate-300 hover:text-white font-medium p-2">Sign In</a>
            <a href="/login" className="block w-full bg-blue-600 text-white font-semibold p-3 rounded mt-2 text-center">Get Started</a>
          </div>
        )}
      </nav>

      {/* Hero Section - 100vh */}
      <section className="h-screen flex flex-col items-center justify-center text-center px-4 pt-20 relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.15)_0,rgba(15,23,42,1)_100%)]"></div>
        
        <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-8 text-sm text-blue-400 font-medium">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            Your First Letter Is Free — Attorney Review Included
          </div>
          
          <h1 className="text-6xl md:text-8xl lg:text-[7rem] font-bold text-white leading-[1.05] tracking-tight mb-12 font-['Space_Grotesk']">
            Legal Letters.<br />
            <span className="text-blue-500">Done Right.</span>
          </h1>
          
          <a 
            href="/login"
            className="group bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold py-5 px-10 rounded-full transition-all duration-300 flex items-center gap-3 shadow-[0_0_40px_rgba(37,99,235,0.4)] hover:shadow-[0_0_60px_rgba(37,99,235,0.6)] hover:-translate-y-1"
            data-testid="hero-cta"
          >
            Start Your Free Letter
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      </section>

      {/* Trust Stats Band */}
      <section className="bg-black py-16 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/10 text-center">
          <div className="px-4">
            <div className="text-3xl md:text-5xl font-bold text-white mb-2 font-['Space_Grotesk']">100%</div>
            <div className="text-slate-400 text-sm tracking-wide uppercase font-semibold">Attorney Reviewed</div>
          </div>
          <div className="px-4">
            <div className="text-3xl md:text-5xl font-bold text-white mb-2 font-['Space_Grotesk']">24<span className="text-2xl text-slate-500">hr</span></div>
            <div className="text-slate-400 text-sm tracking-wide uppercase font-semibold">Turnaround</div>
          </div>
          <div className="px-4">
            <div className="text-3xl md:text-5xl font-bold text-white mb-2 font-['Space_Grotesk']">256<span className="text-2xl text-slate-500">bit</span></div>
            <div className="text-slate-400 text-sm tracking-wide uppercase font-semibold">Encryption</div>
          </div>
          <div className="px-4">
            <div className="text-3xl md:text-5xl font-bold text-white mb-2 font-['Space_Grotesk']">SOC 2</div>
            <div className="text-slate-400 text-sm tracking-wide uppercase font-semibold">Compliant</div>
          </div>
        </div>
      </section>

      {/* How it Works - Stacked Bands */}
      <section id="how-it-works">
        {/* Step 1 */}
        <div className="py-24 md:py-32 bg-slate-50 px-6 border-b border-slate-200">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-24">
            <div className="md:w-1/3">
              <div className="text-8xl md:text-[12rem] font-black text-slate-200 leading-none tracking-tighter font-['Space_Grotesk']">01</div>
            </div>
            <div className="md:w-2/3">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 font-['Space_Grotesk']">Describe Your Situation</h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                Complete a guided intake form with the facts of your case — parties involved, key dates, desired outcome, and supporting details. No legal expertise required.
              </p>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="py-24 md:py-32 bg-slate-100 px-6 border-b border-slate-200">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row-reverse items-center gap-12 md:gap-24">
            <div className="md:w-1/3 flex md:justify-end">
              <div className="text-8xl md:text-[12rem] font-black text-slate-300 leading-none tracking-tighter font-['Space_Grotesk']">02</div>
            </div>
            <div className="md:w-2/3">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 font-['Space_Grotesk']">Attorneys Research & Draft</h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                Our legal team researches applicable statutes and case law for your jurisdiction, then drafts a tailored legal letter grounded in real legal authority.
              </p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="py-24 md:py-32 bg-slate-200 px-6 border-b border-slate-300">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-24">
            <div className="md:w-1/3">
              <div className="text-8xl md:text-[12rem] font-black text-slate-400 leading-none tracking-tighter font-['Space_Grotesk']">03</div>
            </div>
            <div className="md:w-2/3">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 font-['Space_Grotesk']">Attorney Reviews & Approves</h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                A licensed attorney reads every draft, makes edits where needed, and signs off before delivery. No letter reaches you without human legal oversight.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features - Bento Grid */}
      <section id="features" className="py-32 px-6 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-5xl font-bold text-white mb-16 text-center font-['Space_Grotesk']">Features that matter.</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-6">
            {/* Large Card 1 */}
            <div className="md:col-span-2 md:row-span-1 bg-slate-800 rounded-3xl p-10 border border-white/5 hover:border-white/20 transition-colors group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
              <Shield className="w-12 h-12 text-blue-500 mb-6" />
              <h3 className="text-2xl font-bold text-white mb-4">Attorney Review Center</h3>
              <p className="text-slate-400 text-lg max-w-md">
                Licensed attorneys work in a dedicated Review Center — editing language, verifying citations, and ensuring professional quality. Human legal oversight on every document.
              </p>
            </div>

            {/* Small Card 1 */}
            <div className="md:col-span-1 md:row-span-1 bg-slate-800 rounded-3xl p-10 border border-white/5 hover:border-white/20 transition-colors">
              <FileText className="w-10 h-10 text-white mb-6" />
              <h3 className="text-xl font-bold text-white mb-3">7 Letter Types</h3>
              <p className="text-slate-400">
                Breach of contract, demand for payment, cease and desist, pre-litigation settlement, debt collection, and more.
              </p>
            </div>

            {/* Small Card 2 */}
            <div className="md:col-span-1 md:row-span-1 bg-slate-800 rounded-3xl p-10 border border-white/5 hover:border-white/20 transition-colors">
              <Zap className="w-10 h-10 text-white mb-6" />
              <h3 className="text-xl font-bold text-white mb-3">Jurisdiction-Aware</h3>
              <p className="text-slate-400">
                Our attorneys identify statutes, regulations, and case law specific to your state.
              </p>
            </div>

            {/* Large Card 2 */}
            <div className="md:col-span-2 md:row-span-1 bg-slate-800 rounded-3xl p-10 border border-white/5 hover:border-white/20 transition-colors group relative overflow-hidden">
              <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-32 -mb-32"></div>
              <div className="flex gap-4 mb-6">
                <Copy className="w-10 h-10 text-slate-300" />
                <History className="w-10 h-10 text-slate-300" />
                <Share2 className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Complete Transparency</h3>
              <p className="text-slate-400 text-lg max-w-md">
                Full audit trail of every action. Real-time status tracking from submission to final approval. Encrypted & confidential end-to-end.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Floating Cards on Dark */}
      <section id="pricing" className="py-32 px-6 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl font-bold text-white mb-6 font-['Space_Grotesk']">Clear Pricing. No Surprises.</h2>
            <p className="text-xl text-slate-400">Your first letter is free. After that, choose what works for you.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Tier 1 */}
            <div className="bg-white rounded-3xl p-10 shadow-2xl flex flex-col">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Pay Per Letter</h3>
                <p className="text-slate-500 text-sm h-10">Best for a one-time legal need</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-black text-slate-900 tracking-tight">$200</span>
                  <span className="text-slate-500 font-medium">/letter</span>
                </div>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {['Single attorney-reviewed letter', 'Legal research included', 'Downloadable PDF', 'Full audit trail'].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-slate-900 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="/login" className="w-full py-4 rounded-xl font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors block text-center">
                Choose Plan
              </a>
            </div>

            {/* Tier 2 (Highlighted) */}
            <div className="bg-blue-600 rounded-3xl p-10 shadow-2xl shadow-blue-900/50 flex flex-col md:-translate-y-4 border border-blue-500 relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-400 via-white to-blue-400 opacity-50"></div>
              <div className="inline-flex absolute top-6 right-6 bg-black/20 px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-wider">
                Most Popular
              </div>
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">Monthly</h3>
                <p className="text-blue-100 text-sm h-10">Best for ongoing legal matters</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-black text-white tracking-tight">$499</span>
                  <span className="text-blue-200 font-medium">/mo</span>
                </div>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {['4 letters per month', 'Attorney review included', 'Downloadable PDFs', 'Cancel anytime'].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-white">
                    <CheckCircle2 className="w-5 h-5 text-blue-200 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="/login" className="w-full py-4 rounded-xl font-bold text-blue-900 bg-white hover:bg-slate-50 transition-colors block text-center">
                Choose Monthly
              </a>
            </div>

            {/* Tier 3 */}
            <div className="bg-white rounded-3xl p-10 shadow-2xl flex flex-col">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Monthly Pro</h3>
                <p className="text-slate-500 text-sm h-10">Best value for high-volume users</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-black text-slate-900 tracking-tight">$699</span>
                  <span className="text-slate-500 font-medium">/mo</span>
                </div>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {['8 letters per month', 'Attorney review included', 'Downloadable PDFs', 'Priority support'].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-slate-900 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="/login" className="w-full py-4 rounded-xl font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors block text-center">
                Choose Pro
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ - Centered Single Column Light */}
      <section id="faq" className="py-32 px-6 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-5xl font-bold text-slate-900 mb-16 text-center font-['Space_Grotesk']">FAQ</h2>
          
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all duration-200"
              >
                <button 
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-6 flex items-center justify-between text-left focus:outline-none"
                >
                  <span className="text-lg font-bold text-slate-900">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                <div 
                  className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${openFaq === idx ? 'max-h-96 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 bg-blue-600 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-bold text-white mb-10 font-['Space_Grotesk'] tracking-tight">
            Ready to get started?
          </h2>
          <a href="/login" className="bg-white text-blue-900 hover:bg-slate-100 text-xl font-bold py-5 px-12 rounded-full transition-colors shadow-2xl inline-block">
            Start Your Free Letter
          </a>
        </div>
      </section>

      {/* Footer Minimal Dark */}
      <footer className="bg-black py-12 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-white font-bold text-xl tracking-tight font-['Space_Grotesk']">
            Talk to My Lawyer
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <a href="#features" className="text-slate-400 hover:text-white text-sm">Features</a>
            <a href="#pricing" className="text-slate-400 hover:text-white text-sm">Pricing</a>
            <a href="#faq" className="text-slate-400 hover:text-white text-sm">FAQ</a>
            <a href="#" className="text-slate-400 hover:text-white text-sm">Terms</a>
            <a href="#" className="text-slate-400 hover:text-white text-sm">Privacy</a>
            <a href="/login" className="text-slate-400 hover:text-white text-sm">Sign In</a>
          </div>
          <div className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default StackedImpact;
