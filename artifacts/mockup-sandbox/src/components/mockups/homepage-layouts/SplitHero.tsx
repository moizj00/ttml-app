import { useState } from 'react';
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
  ChevronUp
} from 'lucide-react';

const letterTypes = [
  'Breach of Contract',
  'Demand for Payment',
  'Cease and Desist',
  'Pre-Litigation Settlement',
  'Debt Collection',
];

const features = [
  {
    icon: FileText,
    title: '7 Letter Types',
    desc: 'Demand letters, cease and desist notices, contract breach, eviction, employment disputes, consumer complaints, and general legal correspondence.',
  },
  {
    icon: Zap,
    title: 'Jurisdiction-Aware Research',
    desc: 'Our attorneys identify statutes, regulations, and case law specific to your state and situation — cited directly in your letter.',
  },
  {
    icon: Copy,
    title: 'Real-Time Status Tracking',
    desc: 'Follow your letter from submission through attorney drafting, review, and final approval with live status updates and email notifications.',
  },
  {
    icon: Share2,
    title: 'Attorney Review Center',
    desc: 'Licensed attorneys work in a dedicated Review Center — editing language, verifying citations, and ensuring professional quality.',
  },
  {
    icon: History,
    title: 'Full Audit Trail',
    desc: 'Every action is logged — from intake to attorney drafting, edits, and final approval. Complete transparency at every step.',
  },
  {
    icon: Shield,
    title: 'Encrypted & Confidential',
    desc: 'Your case details are encrypted in transit and at rest. Attorneys are bound by professional confidentiality obligations. Your data is never shared.',
  },
];

const faqs = [
  {
    q: 'What is Talk to My Lawyer?',
    a: 'We are a specialized legal technology service that helps you send professionally drafted, attorney-reviewed legal letters. You provide the facts, our attorneys do the research and drafting, and a licensed attorney reviews and signs off on every letter before delivery.',
  },
  {
    q: 'How does the free letter work?',
    a: 'Your first letter is completely free — including the attorney review. There is no credit card required to start. We do this so you can experience the quality and professionalism of our service before committing to a paid plan.',
  },
  {
    q: 'Are the letters actually reviewed by human attorneys?',
    a: 'Yes. Every single letter generated on our platform must pass through our Attorney Review Center, where a licensed attorney reads it, makes necessary edits, and officially approves it for delivery.',
  },
  {
    q: 'How long does it take?',
    a: 'Most letters are drafted, reviewed, and ready for you within 24–48 hours of submission. Complex matters requiring extensive jurisdiction-specific research may take slightly longer, but you can track the status in real-time.',
  },
  {
    q: 'Is my information confidential?',
    a: 'Absolutely. We employ enterprise-grade encryption for all data in transit and at rest. Furthermore, our attorneys are bound by strict professional confidentiality obligations.',
  },
  {
    q: 'Can I see a preview before it is finalized?',
    a: 'Yes. While the attorney makes the final professional judgment on legal language, you will have access to a draft preview and can communicate any factual corrections before final approval.',
  },
];

export function SplitHero() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-white font-['Inter'] text-slate-900 overflow-x-hidden">
      {/* Fixed Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-[72px] flex items-center justify-between">
          {/* Logo */}
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

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-7">
            <a href="#features" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Features</a>
            <a href="#pricing" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Pricing</a>
            <a href="#faq" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">FAQ</a>
            <div className="w-px h-4 bg-slate-200" />
            <a href="/login" className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors" data-testid="nav-signin">Sign In</a>
            <a href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20 inline-flex items-center gap-1.5" data-testid="nav-cta">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 shadow-lg">
            <div className="flex flex-col gap-3">
              <a href="#features" className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide">Features</a>
              <a href="#pricing" className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide">Pricing</a>
              <a href="#faq" className="text-sm font-semibold text-slate-700 py-2 uppercase tracking-wide">FAQ</a>
              <div className="h-px bg-slate-100 my-1" />
              <a href="/login" className="text-sm font-semibold text-slate-700 py-2">Sign In</a>
              <a href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold w-full block text-center">
                Get Started
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Split Hero */}
      <section className="relative min-h-screen flex flex-col lg:flex-row pt-[72px]">
        {/* Left Content (60%) */}
        <div className="w-full lg:w-[60%] flex flex-col justify-center px-6 lg:px-20 xl:px-24 py-12 lg:py-0">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-2 mb-8 text-sm text-blue-700 font-medium">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
              Your First Letter Is Free — Attorney Review Included
            </div>
            
            <h1 className="text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.1] tracking-tight mb-8">
              Professional <span className="text-blue-600 relative">Legal Letters<svg className="absolute w-full h-3 -bottom-1 left-0 text-blue-200" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="3" fill="transparent"/></svg></span><br/>
              drafted and approved by attorneys
            </h1>

            <p className="text-lg lg:text-xl text-slate-600 mb-10 max-w-xl leading-relaxed">
              Describe your legal situation. Our attorneys research applicable laws, draft a professional letter, and review every word before delivery.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <a href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 transition-all" data-testid="hero-cta">
                <Play className="w-5 h-5 fill-current" />
                Start Your Free Letter
              </a>
              <button className="bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 px-8 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-all">
                View Pricing <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {letterTypes.map(type => (
                <a
                  key={type}
                  href="/login"
                  className="bg-white border border-slate-200 text-slate-700 text-sm font-medium px-4 py-1.5 rounded-full shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
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

        {/* Right Visual (40%) */}
        <div className="w-full lg:w-[40%] bg-blue-600 relative overflow-hidden hidden lg:flex items-center justify-center p-12">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 opacity-50"></div>
          <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0,transparent_100%)]"></div>
          
          {/* Abstract Interface / Letter Graphic */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col transform rotate-2 hover:rotate-0 transition-transform duration-500">
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
                <div className="mt-0.5"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                <div>
                  <div className="text-sm font-semibold text-green-900 mb-1">Attorney Approved</div>
                  <div className="text-xs text-green-700">Reviewed by J. Smith, Esq. on {new Date().toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Horizontal Timeline "How it Works" */}
      <section className="py-24 px-6 lg:px-12 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Three Steps to a Professional Legal Letter</h2>
            <p className="text-lg text-slate-600">From intake to attorney-approved PDF in as little as 24 hours</p>
          </div>

          <div className="relative">
            {/* Horizontal Line connecting steps (visible on md+) */}
            <div className="hidden md:block absolute top-12 left-0 w-full h-1 bg-slate-200 rounded-full">
              <div className="h-full w-1/3 bg-blue-600 rounded-full"></div>
            </div>

            <div className="grid md:grid-cols-3 gap-12 relative z-10">
              {[
                { step: '01', icon: FileText, title: 'Describe Your Situation', desc: 'Complete a guided intake form with the facts of your case. No legal expertise required.' },
                { step: '02', icon: Search, title: 'Attorneys Research & Draft', desc: 'Our legal team researches applicable statutes for your jurisdiction and drafts your letter.' },
                { step: '03', icon: CheckCircle2, title: 'Attorney Reviews & Approves', desc: 'A licensed attorney makes final edits and signs off before delivery. Human oversight guaranteed.' }
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 shadow-xl relative bg-white border-4 ${i === 0 ? 'border-blue-600' : 'border-slate-100'}`}>
                    <item.icon className={`w-10 h-10 ${i === 0 ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
                      {item.step}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed max-w-xs">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Alternating Layout Features */}
      <section id="features" className="py-24 px-6 lg:px-12 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-24">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for Real Legal Situations</h2>
            <p className="text-lg text-slate-600">Every feature exists to get you a stronger letter, faster</p>
          </div>

          <div className="space-y-32">
            {/* Feature Row 1 */}
            <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
              <div className="w-full lg:w-1/2">
                <div className="aspect-square max-h-[500px] w-full bg-blue-50 rounded-3xl p-12 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-blue-600/5 rounded-3xl" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(37, 99, 235, 0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                  
                  {/* Abstract Representation of Jurisdiction Research */}
                  <div className="relative w-full h-full bg-white rounded-2xl shadow-xl p-8 flex flex-col justify-between border border-blue-100">
                    <div className="flex justify-between items-start mb-8">
                      <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-bold">CALIFORNIA</div>
                      <Shield className="text-blue-600 w-6 h-6" />
                    </div>
                    <div className="space-y-4 flex-1">
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="h-2 w-20 bg-blue-200 rounded mb-2"></div>
                        <div className="h-2 w-full bg-slate-200 rounded"></div>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 relative">
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">✓</div>
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
                <h3 className="text-3xl font-bold mb-4">Jurisdiction-Aware Research</h3>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  Our attorneys identify statutes, regulations, and case law specific to your state and situation — cited directly in your letter. We don't just use generic templates; we provide real legal authority.
                </p>
                <ul className="space-y-4">
                  {[
                    "State-specific legal codes applied",
                    "Relevant case law citations included",
                    "Statute of limitations checked",
                    "Local regulatory compliance verified"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      <span className="text-slate-700 font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Feature Row 2 (Reversed) */}
            <div className="flex flex-col lg:flex-row-reverse items-center gap-16 lg:gap-24">
              <div className="w-full lg:w-1/2">
                <div className="aspect-square max-h-[500px] w-full bg-slate-100 rounded-3xl p-12 relative flex items-center justify-center">
                  
                  {/* Abstract Representation of Attorney Review Center */}
                  <div className="relative w-full h-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                      <span className="text-white font-medium text-sm">Attorney Review Portal</span>
                      <div className="flex gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                      </div>
                    </div>
                    <div className="flex-1 p-6 bg-slate-50 flex gap-4">
                      {/* Sidebar */}
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
                      {/* Main editor area */}
                      <div className="w-2/3 bg-white rounded shadow-sm border border-slate-200 p-6 flex flex-col">
                        <div className="space-y-4 mb-auto">
                          <div className="h-2 w-full bg-slate-100 rounded"></div>
                          <div className="h-2 w-full bg-slate-100 rounded"></div>
                          <div className="p-2 bg-yellow-50 rounded border border-yellow-200 relative">
                             <div className="h-2 w-full bg-yellow-200 rounded mb-2"></div>
                             <div className="h-2 w-4/5 bg-yellow-200 rounded"></div>
                             {/* Comment tooltip */}
                             <div className="absolute top-1/2 -right-12 translate-x-full -translate-y-1/2 bg-white shadow-lg rounded p-2 text-[10px] text-slate-500 border border-slate-100 w-24">
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
                <h3 className="text-3xl font-bold mb-4">Attorney Review Center</h3>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  Licensed attorneys work in a dedicated Review Center — editing language, verifying citations, and ensuring professional quality. No letter is delivered without human legal oversight.
                </p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">100%</div>
                    <div className="text-sm text-slate-600 font-medium">Human reviewed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">24-48h</div>
                    <div className="text-sm text-slate-600 font-medium">Average turnaround</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">50+</div>
                    <div className="text-sm text-slate-600 font-medium">Jurisdictions covered</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">Inline</div>
                    <div className="text-sm text-slate-600 font-medium">Draft feedback</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Grid for remaining features */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 pt-12 border-t border-slate-100">
              {[features[0], features[2], features[4], features[5]].map((f, i) => (
                 <div key={i} className="p-8 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors">
                   <f.icon className="w-8 h-8 text-blue-600 mb-6" />
                   <h4 className="text-xl font-bold mb-3">{f.title}</h4>
                   <p className="text-slate-600 leading-relaxed">{f.desc}</p>
                 </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Flat Horizontal Cards */}
      <section id="pricing" className="py-24 px-6 lg:px-12 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Simple, Transparent Pricing</h2>
            <p className="text-lg text-slate-400">Your first letter is completely free — including attorney review. After that, choose the plan that fits.</p>
          </div>

          <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            {/* Pay Per Letter */}
            <div className="flex flex-col md:flex-row items-center justify-between p-8 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors">
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Pay Per Letter</h3>
                <p className="text-slate-400 text-sm">Best for a one-time legal need</p>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$200</span>
                  <span className="text-slate-400">/letter</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <a href="/login" className="w-full md:w-auto px-8 py-3 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-xl transition-colors inline-block text-center">
                  Get Started
                </a>
              </div>
            </div>

            {/* Monthly (Most Popular) */}
            <div className="flex flex-col md:flex-row items-center justify-between p-8 rounded-2xl bg-blue-600 border border-blue-500 shadow-2xl shadow-blue-900/50 relative transform md:scale-105 z-10">
              <div className="absolute -top-3 left-8 bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Most Popular
              </div>
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Monthly</h3>
                <p className="text-blue-200 text-sm">Best for ongoing legal matters</p>
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
                <a href="/login" className="w-full md:w-auto px-8 py-3 bg-white text-blue-700 hover:bg-slate-50 font-bold rounded-xl transition-colors shadow-lg inline-block text-center">
                  Subscribe Now
                </a>
              </div>
            </div>

            {/* Monthly Pro */}
            <div className="flex flex-col md:flex-row items-center justify-between p-8 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors">
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Monthly Pro</h3>
                <p className="text-slate-400 text-sm">Best value for high-volume users</p>
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
                <a href="/login" className="w-full md:w-auto px-8 py-3 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-xl transition-colors inline-block text-center">
                  Subscribe Pro
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Column FAQ */}
      <section id="faq" className="py-24 px-6 lg:px-12 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16">
          <div className="w-full lg:w-1/3">
            <div className="sticky top-32">
              <div className="inline-flex items-center gap-2 text-blue-600 font-semibold mb-4 text-sm tracking-wide uppercase">
                <HelpCircle className="w-4 h-4" /> FAQ
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-slate-900">
                Common Questions
              </h2>
              <p className="text-lg text-slate-600 mb-8">
                Everything you need to know about our legal letter service, how it works, and our attorney review process.
              </p>
              <button className="text-blue-600 font-semibold flex items-center gap-2 hover:gap-3 transition-all">
                Contact Support <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="w-full lg:w-2/3">
            <div className="divide-y divide-slate-200">
              {faqs.map((faq, i) => (
                <div key={i} className="py-6">
                  <button 
                    className="w-full flex items-center justify-between text-left focus:outline-none group"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span className={`text-xl font-semibold pr-8 transition-colors ${openFaq === i ? 'text-blue-600' : 'text-slate-900 group-hover:text-blue-600'}`}>
                      {faq.q}
                    </span>
                    <span className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${openFaq === i ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-400 group-hover:border-blue-200 group-hover:text-blue-600'}`}>
                      {openFaq === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}
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

      {/* Trust / Security Footer Area & Final CTA */}
      <section className="py-24 px-6 lg:px-12 bg-blue-600 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to send your first legal letter?</h2>
          <p className="text-blue-100 text-xl mb-10 max-w-2xl mx-auto">
            Get professional legal representation in your correspondence today. Your first letter is completely free.
          </p>
          <a href="/login" className="bg-white text-blue-600 hover:bg-slate-50 px-10 py-5 rounded-xl text-lg font-bold shadow-2xl transition-transform hover:-translate-y-1 inline-block">
            Start Your Free Letter Now
          </a>
          
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

      {/* Minimal Footer */}
      <footer className="bg-slate-950 text-slate-400 py-12 px-6 lg:px-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <a href="/">
            <img
              src="/__mockup/images/logo-full.png"
              alt="Talk to My Lawyer"
              className="h-10 w-auto object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </a>
          
          <div className="flex gap-6 text-sm font-medium">
            <a href="#" className="hover:text-white transition-colors">Pricing</a>
            <a href="#" className="hover:text-white transition-colors">FAQ</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="/login" className="hover:text-white transition-colors">Sign In</a>
          </div>
          
          <div className="text-sm">
            © {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
