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
  Star,
  Award,
} from 'lucide-react';

const LOGO = '/__mockup/images/Lawyer.png';
const GOLD = '#C9A84C';
const GOLD_LIGHT = '#F0D070';
const DARK = '#07080f';
const DARK_CARD = '#0e1019';
const DARK_BORDER = '#1a1c2a';

const letterTypes = [
  'Breach of Contract',
  'Demand for Payment',
  'Cease and Desist',
  'Pre-Litigation Settlement',
  'Debt Collection',
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

export function DarkPrestige() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: DARK, fontFamily: "'Inter', system-ui, sans-serif" }}>

      <nav className="fixed top-0 w-full z-50 border-b" style={{ background: 'rgba(7,8,15,0.92)', backdropFilter: 'blur(20px)', borderColor: DARK_BORDER }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-[92px] flex items-center justify-between">
          <a href="/" className="flex-shrink-0">
            <img src={LOGO} alt="Talk to My Lawyer" className="h-[72px] w-auto object-contain" />
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-[13px] font-medium text-slate-400 hover:text-white tracking-wider uppercase transition-colors">Features</a>
            <a href="#pricing" className="text-[13px] font-medium text-slate-400 hover:text-white tracking-wider uppercase transition-colors">Pricing</a>
            <a href="#faq" className="text-[13px] font-medium text-slate-400 hover:text-white tracking-wider uppercase transition-colors">FAQ</a>
            <div className="w-px h-4" style={{ background: DARK_BORDER }} />
            <a href="/login" className="text-[13px] font-medium text-slate-400 hover:text-white transition-colors">Sign In</a>
            <a href="/login" className="px-6 py-2.5 rounded-full text-[13px] font-bold transition-all inline-flex items-center gap-1.5 shadow-lg" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK, boxShadow: `0 4px 20px ${GOLD}40` }}>
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <button className="md:hidden p-2 text-slate-400 hover:text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden px-6 py-4 border-t" style={{ background: DARK_CARD, borderColor: DARK_BORDER }}>
            <div className="flex flex-col gap-3">
              <a href="#features" className="text-sm font-medium text-slate-300 py-2 uppercase tracking-wide">Features</a>
              <a href="#pricing" className="text-sm font-medium text-slate-300 py-2 uppercase tracking-wide">Pricing</a>
              <a href="#faq" className="text-sm font-medium text-slate-300 py-2 uppercase tracking-wide">FAQ</a>
              <div className="h-px my-1" style={{ background: DARK_BORDER }} />
              <a href="/login" className="text-sm font-medium text-slate-300 py-2">Sign In</a>
              <a href="/login" className="px-6 py-3 rounded-xl text-sm font-bold w-full block text-center" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK }}>Get Started</a>
            </div>
          </div>
        )}
      </nav>

      <section className="relative min-h-screen flex flex-col lg:flex-row pt-[92px]">
        <div className="w-full lg:w-[58%] flex flex-col justify-center px-6 lg:px-20 xl:px-24 py-16 lg:py-0 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-10 text-sm font-medium border" style={{ background: `${GOLD}10`, borderColor: `${GOLD}30`, color: GOLD }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD }} />
              Your First Letter Is Free — Attorney Review Included
            </div>

            <h1 className="text-5xl lg:text-6xl xl:text-[4.5rem] font-extrabold leading-[1.08] tracking-tight mb-8" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
              Professional{' '}
              <span className="relative" style={{ color: GOLD }}>
                Legal Muscle
                <svg className="absolute w-full h-3 -bottom-1 left-0" style={{ color: `${GOLD}40` }} viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="3" fill="transparent" />
                </svg>
              </span>
              <br />
              <span className="text-slate-300">Without The Retainer.</span>
            </h1>

            <p className="text-lg lg:text-xl text-slate-400 mb-10 max-w-xl leading-relaxed">
              Describe your legal situation. Our attorneys research applicable laws, draft a professional letter, and review every word before delivery.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-14">
              <a href="/login" className="px-8 py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK, boxShadow: `0 8px 32px ${GOLD}30` }}>
                <Play className="w-5 h-5 fill-current" />
                Start Your Free Letter
              </a>
              <button className="border-2 px-8 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-all hover:bg-white/5" style={{ borderColor: DARK_BORDER, color: 'white' }}>
                View Pricing <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {letterTypes.map(type => (
                <a key={type} href="/login" className="text-sm font-medium px-4 py-1.5 rounded-full border transition-all hover:border-amber-400/60 hover:bg-amber-400/10" style={{ borderColor: DARK_BORDER, color: 'rgba(255,255,255,0.7)', background: `${DARK_CARD}` }}>
                  {type}
                </a>
              ))}
              <span className="text-sm font-medium px-4 py-1.5 rounded-full cursor-default" style={{ borderColor: DARK_BORDER, color: 'rgba(255,255,255,0.3)', background: DARK_CARD, border: `1px solid ${DARK_BORDER}` }}>
                And more
              </span>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[42%] relative overflow-hidden hidden lg:flex items-center justify-center p-12" style={{ background: `linear-gradient(160deg, #0c0d18 0%, #12101f 50%, #0a0716 100%)` }}>
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(201,168,76,0.06) 1px, transparent 0)', backgroundSize: '30px 30px' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full" style={{ background: `radial-gradient(circle, ${GOLD}08 0%, transparent 70%)` }} />

          <div className="relative w-full max-w-sm transform rotate-2 hover:rotate-0 transition-transform duration-700">
            <div className="rounded-2xl overflow-hidden flex flex-col border" style={{ background: DARK_CARD, borderColor: `${GOLD}25`, boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 40px ${GOLD}10` }}>
              <div className="h-12 border-b flex items-center px-5 gap-2" style={{ borderColor: DARK_BORDER, background: '#0a0b14' }}>
                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-green-400/80" />
                <span className="ml-3 text-xs text-slate-500 font-medium">Legal Letter Draft</span>
              </div>
              <div className="p-8 flex-1 flex flex-col gap-6">
                <div className="flex items-center gap-4 pb-6 border-b" style={{ borderColor: DARK_BORDER }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${GOLD}15` }}>
                    <Scale className="w-6 h-6" style={{ color: GOLD }} />
                  </div>
                  <div>
                    <div className="h-4 w-32 rounded mb-2" style={{ background: `${GOLD}20` }} />
                    <div className="h-3 w-24 rounded" style={{ background: DARK_BORDER }} />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-3 w-full rounded" style={{ background: DARK_BORDER }} />
                  <div className="h-3 w-[90%] rounded" style={{ background: DARK_BORDER }} />
                  <div className="h-3 w-[95%] rounded" style={{ background: DARK_BORDER }} />
                  <div className="h-3 w-[85%] rounded" style={{ background: DARK_BORDER }} />
                </div>
                <div className="mt-4 p-4 rounded-xl flex items-start gap-3 border" style={{ background: `${GOLD}08`, borderColor: `${GOLD}20` }}>
                  <div className="mt-0.5"><Award className="w-5 h-5" style={{ color: GOLD }} /></div>
                  <div>
                    <div className="text-sm font-semibold mb-1" style={{ color: GOLD }}>Attorney Approved</div>
                    <div className="text-xs text-slate-500">Reviewed by J. Smith, Esq.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full border-2 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderColor: `${GOLD}60`, boxShadow: `0 8px 30px ${GOLD}40` }}>
              <div className="text-center" style={{ color: DARK }}>
                <CheckCircle2 className="w-6 h-6 mx-auto mb-0.5" />
                <div className="text-[8px] font-extrabold uppercase tracking-wider leading-tight">Attorney<br />Approved</div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full h-32" style={{ background: `linear-gradient(to bottom, transparent, ${DARK})` }} />
      </section>

      <section className="py-16 px-6 lg:px-12 border-y" style={{ background: DARK_CARD, borderColor: DARK_BORDER }}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { num: '100%', label: 'Human Reviewed' },
            { num: '24-48h', label: 'Avg. Turnaround' },
            { num: 'Free', label: 'First Letter' },
            { num: '50+', label: 'Jurisdictions' },
          ].map((s, i) => (
            <div key={i}>
              <div className="text-3xl md:text-4xl font-bold mb-2" style={{ color: GOLD, fontFamily: "'Georgia', serif" }}>{s.num}</div>
              <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: "'Georgia', serif" }}>
              Three Steps to a <span style={{ color: GOLD }}>Professional Legal Letter</span>
            </h2>
            <p className="text-lg text-slate-400">From intake to attorney-approved PDF in as little as 24 hours</p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute top-12 left-0 w-full h-px" style={{ background: DARK_BORDER }}>
              <div className="h-full w-1/3 rounded-full" style={{ background: `linear-gradient(to right, ${GOLD}, ${GOLD}40)` }} />
            </div>
            <div className="grid md:grid-cols-3 gap-12 relative z-10">
              {[
                { step: '01', icon: FileText, title: 'Describe Your Situation', desc: 'Complete a guided intake form with the facts of your case. No legal expertise required.' },
                { step: '02', icon: Search, title: 'Attorneys Research & Draft', desc: 'Our legal team researches applicable statutes for your jurisdiction and drafts your letter.' },
                { step: '03', icon: CheckCircle2, title: 'Attorney Reviews & Approves', desc: 'A licensed attorney makes final edits and signs off before delivery.' },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8 relative border-2" style={{ background: DARK_CARD, borderColor: i === 0 ? GOLD : DARK_BORDER, boxShadow: i === 0 ? `0 0 30px ${GOLD}20` : 'none' }}>
                    <item.icon className="w-10 h-10" style={{ color: i === 0 ? GOLD : '#64748b' }} />
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK }}>
                      {item.step}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white">{item.title}</h3>
                  <p className="text-slate-400 leading-relaxed max-w-xs">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: "'Georgia', serif" }}>
              Built for <span style={{ color: GOLD }}>Real Legal Situations</span>
            </h2>
            <p className="text-lg text-slate-400">Every feature exists to get you a stronger letter, faster</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="group p-8 rounded-2xl border transition-all duration-300 hover:border-amber-400/40" style={{ background: `${DARK_CARD}`, borderColor: DARK_BORDER, backdropFilter: 'blur(10px)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all group-hover:scale-110" style={{ background: `${GOLD}12` }}>
                  <f.icon className="w-6 h-6" style={{ color: GOLD }} />
                </div>
                <h4 className="text-lg font-bold text-white mb-3">{f.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: "'Georgia', serif" }}>
              Simple, <span style={{ color: GOLD }}>Transparent Pricing</span>
            </h2>
            <p className="text-lg text-slate-400">Your first letter is completely free — including attorney review.</p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row items-center justify-between p-8 rounded-2xl border transition-all hover:border-slate-600" style={{ background: DARK_CARD, borderColor: DARK_BORDER }}>
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Pay Per Letter</h3>
                <p className="text-slate-500 text-sm">Best for a one-time legal need</p>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold" style={{ color: GOLD }}>$200</span>
                  <span className="text-slate-500">/letter</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <a href="/login" className="w-full md:w-auto px-8 py-3 font-semibold rounded-xl transition-all inline-block text-center border" style={{ borderColor: DARK_BORDER, color: 'white' }}>Get Started</a>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between p-8 rounded-2xl relative transform md:scale-[1.02] z-10 border" style={{ background: `linear-gradient(135deg, ${GOLD}12, ${GOLD}06)`, borderColor: `${GOLD}50`, boxShadow: `0 0 40px ${GOLD}10, 0 20px 60px rgba(0,0,0,0.3)` }}>
              <div className="absolute -top-3 left-8 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK }}>
                <Star className="w-3 h-3" /> Most Popular
              </div>
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Monthly</h3>
                <p className="text-slate-400 text-sm">Best for ongoing legal matters</p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium" style={{ background: `${GOLD}15`, color: GOLD }}>
                  <FileText className="w-3 h-3" /> 4 letters per month included
                </div>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold" style={{ color: GOLD }}>$499</span>
                  <span className="text-slate-400">/mo</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <a href="/login" className="w-full md:w-auto px-8 py-3 font-bold rounded-xl transition-all inline-block text-center" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK, boxShadow: `0 4px 20px ${GOLD}30` }}>Subscribe Now</a>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between p-8 rounded-2xl border transition-all hover:border-slate-600" style={{ background: DARK_CARD, borderColor: DARK_BORDER }}>
              <div className="w-full md:w-1/3 mb-6 md:mb-0">
                <h3 className="text-2xl font-bold mb-1">Monthly Pro</h3>
                <p className="text-slate-500 text-sm">Best value for high-volume users</p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium" style={{ background: `rgba(255,255,255,0.05)`, color: 'rgba(255,255,255,0.5)' }}>
                  <FileText className="w-3 h-3" /> 8 letters per month included
                </div>
              </div>
              <div className="w-full md:w-1/3 flex flex-col items-start md:items-center mb-6 md:mb-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold" style={{ color: GOLD }}>$699</span>
                  <span className="text-slate-500">/mo</span>
                </div>
              </div>
              <div className="w-full md:w-1/3 flex justify-start md:justify-end">
                <a href="/login" className="w-full md:w-auto px-8 py-3 font-semibold rounded-xl transition-all inline-block text-center border" style={{ borderColor: DARK_BORDER, color: 'white' }}>Subscribe Pro</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="py-24 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16">
          <div className="w-full lg:w-1/3">
            <div className="sticky top-32">
              <div className="inline-flex items-center gap-2 font-semibold mb-4 text-sm tracking-wider uppercase" style={{ color: GOLD }}>
                <HelpCircle className="w-4 h-4" /> FAQ
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white" style={{ fontFamily: "'Georgia', serif" }}>
                Common Questions
              </h2>
              <p className="text-lg text-slate-400 mb-8">
                Everything you need to know about our legal letter service and our attorney review process.
              </p>
              <button className="font-semibold flex items-center gap-2 hover:gap-3 transition-all" style={{ color: GOLD }}>
                Contact Support <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="w-full lg:w-2/3">
            <div className="divide-y" style={{ borderColor: DARK_BORDER }}>
              {faqs.map((faq, i) => (
                <div key={i} className="py-6" style={{ borderColor: DARK_BORDER }}>
                  <button className="w-full flex items-center justify-between text-left focus:outline-none group" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span className={`text-lg font-semibold pr-8 transition-colors ${openFaq === i ? '' : 'text-slate-300 group-hover:text-white'}`} style={openFaq === i ? { color: GOLD } : {}}>
                      {faq.q}
                    </span>
                    <span className="w-8 h-8 rounded-full border flex items-center justify-center transition-all flex-shrink-0" style={{ borderColor: openFaq === i ? `${GOLD}50` : DARK_BORDER, background: openFaq === i ? `${GOLD}10` : 'transparent', color: openFaq === i ? GOLD : '#64748b' }}>
                      {openFaq === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                    <p className="text-slate-400 leading-relaxed text-base">{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 text-center" style={{ background: `linear-gradient(135deg, #0c0a1a, #14102a)` }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-6" style={{ fontFamily: "'Georgia', serif" }}>
            Ready to send your first <span style={{ color: GOLD }}>legal letter?</span>
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Get professional legal representation in your correspondence today. Your first letter is completely free.
          </p>
          <a href="/login" className="px-10 py-5 rounded-xl text-lg font-bold transition-all hover:-translate-y-1 inline-block" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, color: DARK, boxShadow: `0 8px 40px ${GOLD}30` }}>
            Start Your Free Letter Now
          </a>
          <div className="mt-16 flex flex-wrap justify-center items-center gap-8 lg:gap-16 opacity-70">
            {[
              { icon: Lock, label: 'SOC 2 Compliant' },
              { icon: Shield, label: 'Enterprise Security' },
              { icon: CheckCircle2, label: 'End-to-End Encrypted' },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-300 font-medium">
                <b.icon className="w-5 h-5" style={{ color: GOLD }} /> {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 lg:px-12 border-t" style={{ background: '#050508', borderColor: DARK_BORDER }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <a href="/">
            <img src={LOGO} alt="Talk to My Lawyer" className="h-10 w-auto object-contain" style={{ filter: 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.1)' }} />
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
