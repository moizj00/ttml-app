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
  ChevronUp,
  Gavel,
  DollarSign,
  AlertOctagon,
  Handshake,
  Ban,
} from 'lucide-react';

const LOGO = '/__mockup/images/Lawyer.png';
const CORAL = '#2563eb';
const CORAL_LIGHT = '#3b82f6';
const NAVY = '#0d1117';

const letterCategories = [
  { icon: Gavel, label: 'Breach of Contract', desc: 'Enforce agreements that were broken' },
  { icon: DollarSign, label: 'Demand for Payment', desc: 'Collect what you are owed' },
  { icon: Ban, label: 'Cease and Desist', desc: 'Stop harmful actions immediately' },
  { icon: Handshake, label: 'Pre-Litigation Settlement', desc: 'Resolve disputes before court' },
  { icon: AlertOctagon, label: 'Debt Collection', desc: 'Recover outstanding debts' },
];

const features = [
  { icon: FileText, title: '7 Letter Types', desc: 'Demand letters, cease and desist notices, contract breach, eviction, employment disputes, consumer complaints, and general legal correspondence.' },
  { icon: Zap, title: 'Jurisdiction-Aware Research', desc: 'Our attorneys identify statutes, regulations, and case law specific to your state and situation — cited directly in your letter.' },
  { icon: Copy, title: 'Real-Time Status Tracking', desc: 'Follow your letter from submission through attorney drafting, review, and final approval with live status updates.' },
  { icon: Share2, title: 'Attorney Review Center', desc: 'Licensed attorneys work in a dedicated Review Center — editing language, verifying citations, and ensuring professional quality.' },
  { icon: History, title: 'Full Audit Trail', desc: 'Every action is logged — from intake to attorney drafting, edits, and final approval. Complete transparency at every step.' },
  { icon: Shield, title: 'Encrypted & Confidential', desc: 'Your case details are encrypted in transit and at rest. Attorneys are bound by professional confidentiality obligations.' },
];

const faqs = [
  { q: 'What is Talk to My Lawyer?', a: 'We are a specialized legal technology service that helps you send professionally drafted, attorney-reviewed legal letters. You provide the facts, our attorneys do the research and drafting, and a licensed attorney reviews and signs off on every letter before delivery.' },
  { q: 'How does the free letter work?', a: 'Your first letter is completely free — including the attorney review. There is no credit card required to start. We do this so you can experience the quality and professionalism of our service before committing to a paid plan.' },
  { q: 'Are the letters actually reviewed by human attorneys?', a: 'Yes. Every single letter generated on our platform must pass through our Attorney Review Center, where a licensed attorney reads it, makes necessary edits, and officially approves it for delivery.' },
  { q: 'How long does it take?', a: 'Most letters are drafted, reviewed, and ready for you within 24–48 hours of submission. Complex matters requiring extensive jurisdiction-specific research may take slightly longer, but you can track the status in real-time.' },
  { q: 'Is my information confidential?', a: 'Absolutely. We employ enterprise-grade encryption for all data in transit and at rest. Furthermore, our attorneys are bound by strict professional confidentiality obligations.' },
  { q: 'Can I see a preview before it is finalized?', a: 'Yes. While the attorney makes the final professional judgment on legal language, you will have access to a draft preview and can communicate any factual corrections before final approval.' },
];

export function KineticBold() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif", color: NAVY }}>

      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-[88px] flex items-center justify-between">
          <a href="/" className="flex-shrink-0">
            <img src={LOGO} alt="Talk to My Lawyer" className="h-16 w-auto object-contain" />
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="#how" className="text-[13px] font-bold text-slate-500 hover:text-slate-900 tracking-wider uppercase transition-colors">How it Works</a>
            <a href="#features" className="text-[13px] font-bold text-slate-500 hover:text-slate-900 tracking-wider uppercase transition-colors">Features</a>
            <a href="#pricing" className="text-[13px] font-bold text-slate-500 hover:text-slate-900 tracking-wider uppercase transition-colors">Pricing</a>
            <div className="w-px h-4 bg-slate-200" />
            <a href="/login" className="text-[13px] font-bold text-slate-600 hover:text-slate-900 transition-colors">Sign In</a>
            <a href="/login" className="px-6 py-2.5 rounded-full text-[13px] font-bold text-white transition-all inline-flex items-center gap-1.5 shadow-lg" style={{ background: CORAL, boxShadow: `0 4px 16px ${CORAL}40` }}>
              Start Free <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <button className="md:hidden p-2 text-slate-600 hover:text-slate-900" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 shadow-lg">
            <div className="flex flex-col gap-3">
              <a href="#how" className="text-sm font-bold text-slate-700 py-2 uppercase tracking-wide">How it Works</a>
              <a href="#features" className="text-sm font-bold text-slate-700 py-2 uppercase tracking-wide">Features</a>
              <a href="#pricing" className="text-sm font-bold text-slate-700 py-2 uppercase tracking-wide">Pricing</a>
              <div className="h-px bg-slate-100 my-1" />
              <a href="/login" className="text-sm font-bold text-slate-700 py-2">Sign In</a>
              <a href="/login" className="text-white px-6 py-3 rounded-xl text-sm font-bold w-full block text-center" style={{ background: CORAL }}>Start Free</a>
            </div>
          </div>
        )}
      </nav>

      <section className="pt-[88px] min-h-screen flex flex-col justify-center px-6 lg:px-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full" style={{ background: `linear-gradient(180deg, ${CORAL}06 0%, transparent 60%)` }} />
        <div className="max-w-7xl mx-auto w-full py-20 lg:py-0">
          <div className="max-w-5xl">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-8 text-sm font-bold border" style={{ background: `${CORAL}08`, borderColor: `${CORAL}20`, color: CORAL }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: CORAL }} />
              First Letter Free — No Catch
            </div>

            <h1 className="text-6xl md:text-7xl lg:text-[5.5rem] font-black leading-[1.05] tracking-tight mb-4" style={{ color: NAVY }}>
              They crossed the line.
            </h1>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight mb-8" style={{ color: CORAL }}>
              We'll handle it — in writing.
            </h2>

            <p className="text-xl text-slate-500 mb-12 max-w-2xl leading-relaxed font-medium">
              Attorney-drafted legal letters with real citations, real research, and real attorney sign-off. Describe your situation, and we handle the rest.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-14">
              {letterCategories.map((cat, i) => (
                <a key={i} href="/login" className="group p-4 rounded-2xl border-2 border-slate-100 bg-white hover:border-blue-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 text-center cursor-pointer" style={{ ['--tw-shadow-color' as string]: `${CORAL}15` }}>
                  <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center transition-colors" style={{ background: `${CORAL}08` }}>
                    <cat.icon className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <div className="text-xs font-bold text-slate-800 leading-tight">{cat.label}</div>
                </a>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <a href="/login" className="px-10 py-5 rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5" style={{ background: CORAL, boxShadow: `0 8px 32px ${CORAL}35` }}>
                <Play className="w-5 h-5 fill-current" />
                Start Your Free Letter
              </a>
              <a href="#how" className="px-10 py-5 rounded-2xl text-lg font-bold border-2 border-slate-200 text-slate-700 flex items-center justify-center gap-2 transition-all hover:bg-slate-50 bg-white">
                See How It Works <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="py-28 px-6 lg:px-12 bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <div className="mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ color: NAVY }}>How it works.</h2>
            <p className="text-xl text-slate-400 font-medium">Three steps. One powerful letter.</p>
          </div>

          <div className="space-y-0">
            {[
              { step: '01', title: 'Describe Your Situation', desc: 'Complete a guided intake form with the facts of your case — who did what, when, where. No legal jargon required. Just tell us what happened.' },
              { step: '02', title: 'Attorneys Research & Draft', desc: 'Our legal team researches applicable statutes and case law for your specific jurisdiction, then drafts a tailored legal letter with real legal citations.' },
              { step: '03', title: 'Attorney Reviews & Approves', desc: 'A licensed attorney reads every draft, makes edits where needed, and signs off before delivery. No letter reaches you without human legal oversight.' },
            ].map((item, i) => (
              <div key={i} className="flex gap-8 lg:gap-16 items-start py-12 border-b border-slate-100 group">
                <div className="flex-shrink-0">
                  <span className="text-[120px] lg:text-[160px] font-extralight leading-none select-none transition-colors" style={{ color: i === 0 ? `${CORAL}25` : '#f1f5f9', WebkitTextStroke: i === 0 ? `1px ${CORAL}40` : '1px #e2e8f0' }}>
                    {item.step}
                  </span>
                </div>
                <div className="pt-8 lg:pt-12 flex-1">
                  <h3 className="text-2xl lg:text-3xl font-black mb-4" style={{ color: NAVY }}>{item.title}</h3>
                  <p className="text-lg text-slate-500 leading-relaxed max-w-xl">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-28 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ color: NAVY }}>Built different.</h2>
            <p className="text-xl text-slate-400 font-medium">Every feature exists to get you a stronger letter, faster.</p>
          </div>

          <div className="space-y-0">
            {[
              {
                title: 'Jurisdiction-Aware Research',
                desc: 'Our attorneys identify statutes, regulations, and case law specific to your state and situation — cited directly in your letter. Not templates. Real legal authority.',
                icon: Zap,
                checks: ['State-specific legal codes applied', 'Relevant case law citations included', 'Statute of limitations checked', 'Local regulatory compliance verified'],
                bgColor: `${CORAL}05`,
                borderColor: `${CORAL}15`,
              },
              {
                title: 'Attorney Review Center',
                desc: 'Licensed attorneys work in a dedicated Review Center — editing language, verifying citations, and ensuring professional quality. No letter is delivered without human legal oversight.',
                icon: Share2,
                stats: [{ num: '100%', label: 'Human reviewed' }, { num: '24-48h', label: 'Avg. turnaround' }, { num: '50+', label: 'Jurisdictions' }, { num: 'Inline', label: 'Draft feedback' }],
                bgColor: '#f8fafc',
                borderColor: '#e2e8f0',
              },
            ].map((feat, i) => (
              <div key={i} className={`flex flex-col lg:flex-row ${i === 1 ? 'lg:flex-row-reverse' : ''} gap-12 lg:gap-20 py-20 ${i < 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-full lg:w-1/2 flex items-center">
                  <div className="w-full aspect-[4/3] rounded-3xl p-10 flex items-center justify-center border" style={{ background: feat.bgColor, borderColor: feat.borderColor }}>
                    <div className="w-full max-w-sm">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: i === 0 ? `${CORAL}12` : '#e2e8f0' }}>
                        <feat.icon className="w-8 h-8" style={{ color: i === 0 ? CORAL : '#64748b' }} />
                      </div>
                      {feat.checks && (
                        <div className="space-y-3">
                          {feat.checks.map((c, ci) => (
                            <div key={ci} className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                              <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: CORAL }} />
                              <span className="text-sm font-semibold text-slate-700">{c}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {feat.stats && (
                        <div className="grid grid-cols-2 gap-4">
                          {feat.stats.map((s, si) => (
                            <div key={si} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 text-center">
                              <div className="text-2xl font-black mb-1" style={{ color: NAVY }}>{s.num}</div>
                              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">{s.label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-full lg:w-1/2 flex flex-col justify-center">
                  <h3 className="text-3xl lg:text-4xl font-black mb-6" style={{ color: NAVY }}>{feat.title}</h3>
                  <p className="text-lg text-slate-500 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 pt-12 border-t border-slate-100">
              {features.map((f, i) => (
                <div key={i} className="p-6 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all bg-white group">
                  <f.icon className="w-7 h-7 mb-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                  <h4 className="text-sm font-black mb-2" style={{ color: NAVY }}>{f.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-28 px-6 lg:px-12 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ color: NAVY }}>Simple pricing.</h2>
            <p className="text-xl text-slate-400 font-medium">Your first letter is free. After that, choose what fits.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { plan: 'Pay Per Letter', price: '$200', period: '/letter', sub: 'Best for a one-time legal need', highlight: false, features: ['Single attorney-reviewed letter', 'Legal research included', 'Downloadable PDF', 'Full audit trail'] },
              { plan: 'Monthly', price: '$499', period: '/mo', sub: '4 letters per month included', highlight: true, features: ['4 letters per month', 'Attorney review included', 'Downloadable PDFs', 'Priority support', 'Cancel anytime'] },
              { plan: 'Monthly Pro', price: '$699', period: '/mo', sub: '8 letters per month included', highlight: false, features: ['8 letters per month', 'Attorney review included', 'Downloadable PDFs', 'Priority support', 'Cancel anytime'] },
            ].map((tier, i) => (
              <div key={i} className={`rounded-3xl p-8 border-2 relative ${tier.highlight ? 'transform md:-translate-y-2' : ''}`} style={{ borderColor: tier.highlight ? CORAL : '#e2e8f0', background: 'white', boxShadow: tier.highlight ? `0 20px 60px ${CORAL}15` : 'none' }}>
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider text-white" style={{ background: CORAL }}>
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-black mb-1" style={{ color: NAVY }}>{tier.plan}</h3>
                <p className="text-sm text-slate-400 mb-6">{tier.sub}</p>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-5xl font-black" style={{ color: tier.highlight ? CORAL : NAVY }}>{tier.price}</span>
                  <span className="text-slate-400 font-medium">{tier.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: tier.highlight ? CORAL : '#94a3b8' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="/login" className="block w-full text-center py-3.5 rounded-xl font-bold text-sm transition-all" style={tier.highlight ? { background: CORAL, color: 'white', boxShadow: `0 4px 16px ${CORAL}30` } : { background: '#f1f5f9', color: NAVY }}>
                  {tier.highlight ? 'Subscribe Now' : 'Get Started'}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-28 px-6 lg:px-12 border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16">
          <div className="w-full lg:w-1/3">
            <div className="sticky top-32">
              <h2 className="text-4xl font-black mb-6" style={{ color: NAVY }}>Got questions?</h2>
              <p className="text-lg text-slate-400 mb-8 font-medium">
                Everything you need to know about our legal letter service.
              </p>
              <button className="font-bold flex items-center gap-2 hover:gap-3 transition-all" style={{ color: CORAL }}>
                Contact Support <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="w-full lg:w-2/3">
            <div className="divide-y divide-slate-100">
              {faqs.map((faq, i) => (
                <div key={i} className="py-6">
                  <button className="w-full flex items-center justify-between text-left focus:outline-none group" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span className="text-lg font-bold pr-8 transition-colors" style={{ color: openFaq === i ? CORAL : NAVY }}>
                      {faq.q}
                    </span>
                    <span className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0" style={{ borderColor: openFaq === i ? CORAL : '#e2e8f0', background: openFaq === i ? `${CORAL}08` : 'transparent', color: openFaq === i ? CORAL : '#94a3b8' }}>
                      {openFaq === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                    <p className="text-slate-500 leading-relaxed text-base">{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 text-center text-white" style={{ background: CORAL }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            Ready to put it in writing?
          </h2>
          <p className="text-xl mb-10 max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Professional legal letters, drafted and approved by licensed attorneys. Your first one is free.
          </p>
          <a href="/login" className="bg-white px-10 py-5 rounded-2xl text-lg font-black transition-all hover:-translate-y-1 inline-block shadow-2xl" style={{ color: CORAL }}>
            Start Your Free Letter Now
          </a>
          <div className="mt-16 flex flex-wrap justify-center items-center gap-8 lg:gap-16" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {[
              { icon: Lock, label: 'SOC 2 Compliant' },
              { icon: Shield, label: 'Enterprise Security' },
              { icon: CheckCircle2, label: 'End-to-End Encrypted' },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-2 font-medium">
                <b.icon className="w-5 h-5" /> {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 lg:px-12 text-slate-400" style={{ background: NAVY }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <a href="/">
            <img src={LOGO} alt="Talk to My Lawyer" className="h-10 w-auto object-contain" style={{ filter: 'brightness(10)' }} />
          </a>
          <div className="flex gap-6 text-sm font-medium">
            <a href="#pricing" className="text-slate-500 hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="text-slate-500 hover:text-white transition-colors">FAQ</a>
            <a href="#" className="text-slate-500 hover:text-white transition-colors">Terms</a>
            <a href="#" className="text-slate-500 hover:text-white transition-colors">Privacy</a>
            <a href="/login" className="text-slate-500 hover:text-white transition-colors">Sign In</a>
          </div>
          <div className="text-sm text-slate-600">
            &copy; {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
