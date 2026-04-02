import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Shield, Scale, FileText, CheckCircle2, AlertCircle, Landmark } from "lucide-react";

const FadeIn = ({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 1, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    className={className}
  >
    {children}
  </motion.div>
);

export default function NarrativeArc() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, 150]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);

  return (
    <div className="bg-[#020617] text-slate-300 min-h-screen font-sans selection:bg-blue-900 selection:text-white overflow-x-hidden">
      {/* Minimal Navbar */}
      <nav className="fixed top-0 w-full z-50 mix-blend-difference transition-all duration-300 border-b border-transparent">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img src="/__mockup/images/logo-icon-badge.png" alt="Talk to My Lawyer" className="h-10 w-10 object-contain" />
            <span className="font-serif font-semibold text-xl tracking-wide text-white">Talk to My Lawyer</span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <button className="text-slate-300 hover:text-white transition-colors">Sign In</button>
            <button className="bg-white text-slate-950 px-6 py-3 rounded-full hover:bg-slate-200 transition-colors shadow-lg shadow-white/10">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* 1. Hero Section - The Pain */}
      <section className="relative min-h-screen flex flex-col justify-center px-6 pt-24 pb-12 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          {/* Deep dramatic background gradients */}
          <div className="absolute top-[-20%] right-[-10%] w-[80vw] h-[80vw] rounded-full bg-blue-900/20 blur-[120px]" />
          <div className="absolute bottom-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-slate-800/40 blur-[150px]" />
          <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%)', backgroundSize: '4px 4px' }}></div>
        </div>

        <motion.div 
          className="max-w-5xl mx-auto w-full relative z-10"
          style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
        >
          <motion.div
            initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/50 text-slate-400 text-sm font-medium mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              You have been wronged.
            </div>
            <h1 className="font-serif text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-medium leading-[1] tracking-tight text-white mb-10">
              They think you'll <br/>
              <span className="text-slate-500 italic block mt-2">just go away.</span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <p className="text-xl md:text-3xl text-slate-400 leading-relaxed font-light mb-12">
              A landlord illegally holding your deposit. A client ignoring your invoices. A contractor who walked off the job. 
              <span className="text-white block mt-4 font-medium">They are banking on your silence.</span>
            </p>

            <button className="group relative inline-flex items-center justify-center px-10 py-5 text-lg font-medium text-white bg-blue-700 hover:bg-blue-600 rounded-full overflow-hidden transition-all duration-500 shadow-[0_0_40px_rgba(29,78,216,0.4)] hover:shadow-[0_0_60px_rgba(29,78,216,0.6)]">
              <span className="relative z-10 flex items-center gap-3">
                Change the Equation <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </motion.div>
        </motion.div>
        
        <motion.div 
          className="absolute bottom-12 left-1/2 -translate-x-1/2 text-slate-500 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-slate-500 to-transparent"></div>
        </motion.div>
      </section>

      {/* 2. The Cost of Inaction */}
      <section className="py-32 md:py-48 px-6 relative border-t border-slate-800/50 bg-[#040a1f]">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <h2 className="font-serif text-4xl md:text-6xl text-white mb-12">Silence is expensive.</h2>
          </FadeIn>
          
          <div className="grid md:grid-cols-2 gap-12 md:gap-24">
            <FadeIn delay={0.2}>
              <p className="text-xl md:text-2xl leading-relaxed font-light text-slate-300">
                Every day you wait, they win. They rely on the assumption that hiring a lawyer is too complex, too expensive, and too intimidating.
              </p>
              <p className="text-xl md:text-2xl leading-relaxed font-light text-slate-300 mt-8">
                They expect angry emails. They expect frustrated texts. <span className="text-white font-medium">They know those carry no legal weight.</span>
              </p>
            </FadeIn>
            <FadeIn delay={0.4} className="border-l border-slate-800 pl-8 md:pl-12">
              <blockquote className="text-2xl md:text-3xl font-serif text-slate-400 italic leading-snug">
                "People ignore texts. People ignore emails. Nobody ignores a letter on law firm letterhead sent via certified mail."
              </blockquote>
              <div className="mt-8 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                  <Shield className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-white font-medium text-lg">California Bar Licensed</div>
                  <div className="text-slate-500 text-sm">Attorney Network</div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* 3. The Turning Point / Solution */}
      <section className="py-32 md:py-48 px-6 relative bg-blue-950/20 overflow-hidden">
        {/* Abstract background element */}
        <div className="absolute top-0 right-0 w-[50vw] h-full bg-gradient-to-l from-blue-900/10 to-transparent pointer-events-none" />
        
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="relative z-10 order-2 lg:order-1">
              <FadeIn>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/50 text-sm font-medium mb-8">
                  <AlertCircle className="w-4 h-4" /> The Turning Point
                </div>
                <h2 className="font-serif text-5xl md:text-7xl text-white mb-8 leading-[1.1]">
                  A letter changes everything.
                </h2>
              </FadeIn>
              
              <FadeIn delay={0.2}>
                <p className="text-xl md:text-2xl text-slate-300 leading-relaxed font-light mb-8">
                  When formal correspondence arrives on a law firm's letterhead, drafted and signed by a licensed California attorney, the games stop. The power dynamic shifts instantly.
                </p>
                <p className="text-xl md:text-2xl text-slate-300 leading-relaxed font-light mb-12">
                  Suddenly, ignoring you is no longer a viable business strategy. It becomes a legal liability.
                </p>
              </FadeIn>

              <FadeIn delay={0.4}>
                <div className="flex flex-col sm:flex-row gap-6 border-t border-slate-800 pt-10">
                  <div className="flex flex-col gap-2">
                    <CheckCircle2 className="w-8 h-8 text-blue-500 mb-2" />
                    <span className="text-white font-medium text-lg">Attorney Drafted</span>
                    <span className="text-slate-500 text-sm">Precision legal language</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <CheckCircle2 className="w-8 h-8 text-blue-500 mb-2" />
                    <span className="text-white font-medium text-lg">Attorney Reviewed</span>
                    <span className="text-slate-500 text-sm">Quality guaranteed</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <CheckCircle2 className="w-8 h-8 text-blue-500 mb-2" />
                    <span className="text-white font-medium text-lg">California Focused</span>
                    <span className="text-slate-500 text-sm">Jurisdiction specific</span>
                  </div>
                </div>
              </FadeIn>
            </div>

            {/* Visual element representing the letter */}
            <FadeIn delay={0.3} className="relative order-1 lg:order-2">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 to-transparent blur-3xl rounded-full" />
              <div className="relative bg-[#f8fafc] border-8 border-white p-10 md:p-14 rounded-xl shadow-2xl shadow-black/80 rotate-3 hover:rotate-0 transition-transform duration-700 max-w-lg mx-auto transform-gpu">
                <div className="flex items-center justify-between border-b-2 border-slate-300 pb-8 mb-8">
                  <div className="flex items-center gap-3 text-slate-900">
                    <Landmark className="w-8 h-8 text-blue-900" />
                    <div>
                      <div className="font-serif font-bold text-2xl tracking-tight text-slate-900">Law Offices</div>
                      <div className="text-[10px] tracking-widest text-slate-500 uppercase mt-1">California Licensed</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-red-700 border border-red-700 px-2 py-1 uppercase tracking-wider inline-block">
                      Urgent
                    </div>
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="h-3 w-1/3 bg-slate-300 rounded" />
                    <div className="h-3 w-1/4 bg-slate-300 rounded" />
                    <div className="h-3 w-1/2 bg-slate-300 rounded" />
                  </div>
                  
                  <div className="h-4 w-3/4 bg-slate-800 rounded mt-8" />
                  
                  <div className="space-y-3 mt-6">
                    <div className="h-3 w-full bg-slate-300 rounded" />
                    <div className="h-3 w-full bg-slate-300 rounded" />
                    <div className="h-3 w-full bg-slate-300 rounded" />
                    <div className="h-3 w-5/6 bg-slate-300 rounded" />
                  </div>

                  <div className="space-y-3 mt-6">
                    <div className="h-3 w-full bg-slate-300 rounded" />
                    <div className="h-3 w-11/12 bg-slate-300 rounded" />
                  </div>
                </div>
                
                <div className="mt-16 pt-8 border-t-2 border-slate-200">
                  <div className="font-serif text-3xl text-slate-900 italic opacity-80 mb-2">Jane Doe, Esq.</div>
                  <div className="h-3 w-40 bg-slate-400 rounded" />
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* 4. The Authority (Why Us) */}
      <section className="py-24 px-6 bg-blue-700">
        <div className="max-w-5xl mx-auto text-center">
          <FadeIn>
            <h2 className="font-serif text-4xl md:text-5xl text-white mb-6">Built for California.</h2>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              California law is uniquely protective of tenants, employees, and consumers. Generic templates from national websites miss the critical nuances that actually scare bad actors into compliance. 
            </p>
          </FadeIn>
        </div>
      </section>

      {/* 5. How it Works */}
      <section className="py-32 md:py-48 px-6 border-t border-slate-800/50 bg-[#020617]">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <h2 className="font-serif text-5xl md:text-6xl text-center text-white mb-24">The path to resolution.</h2>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-16 relative">
            <div className="hidden md:block absolute top-16 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            
            <FadeIn delay={0.1} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-32 h-32 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10 relative">
                <div className="absolute inset-0 rounded-full border border-blue-500/30 scale-110"></div>
                <FileText className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">1. State the Facts</h3>
              <p className="text-slate-400 leading-relaxed text-lg font-light">
                Answer a few targeted questions about your situation. No legal jargon required. Just tell us exactly what happened.
              </p>
            </FadeIn>

            <FadeIn delay={0.3} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-32 h-32 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10 relative">
                <div className="absolute inset-0 rounded-full border border-blue-500/30 scale-110"></div>
                <Scale className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">2. Attorney Drafting</h3>
              <p className="text-slate-400 leading-relaxed text-lg font-light">
                Our system assists, but a licensed California attorney reviews your facts, researches the law, and perfects the draft.
              </p>
            </FadeIn>

            <FadeIn delay={0.5} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-32 h-32 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10 relative">
                <div className="absolute inset-0 rounded-full border border-blue-500/30 scale-110 bg-blue-600/10 animate-pulse"></div>
                <Shield className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">3. Review & Delivery</h3>
              <p className="text-slate-400 leading-relaxed text-lg font-light">
                An attorney signs off on the final letter. We deliver the authoritative PDF to you, ready to send and demand action.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* 6. Types of Letters / Cases */}
      <section className="py-24 px-6 border-t border-slate-800/50 bg-[#040a1f]">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="mb-16">
              <h2 className="font-serif text-4xl md:text-5xl text-white mb-6">What we handle.</h2>
              <p className="text-xl text-slate-400 font-light max-w-2xl">We focus on the most common disputes where a formal legal letter dramatically changes the outcome.</p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Breach of Contract", desc: "When a vendor, contractor, or business partner fails to deliver what was agreed upon." },
              { title: "Demand for Payment", desc: "For unpaid invoices, personal loans, or missing paychecks." },
              { title: "Cease & Desist", desc: "Stop harassment, defamation, intellectual property theft, or nuisance." },
              { title: "Security Deposit", desc: "Force a landlord to return your illegally withheld security deposit." },
              { title: "Pre-Litigation", desc: "A final warning and settlement offer before filing a lawsuit." },
              { title: "Custom Legal Notice", desc: "Other formal notifications requiring a licensed attorney's authority." }
            ].map((item, i) => (
              <FadeIn key={i} delay={0.1 * i}>
                <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 transition-colors h-full flex flex-col">
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-slate-400 font-light flex-1">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Pricing */}
      <section className="py-32 md:py-48 px-6 bg-gradient-to-b from-[#040a1f] to-[#0a0f24] relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] bg-blue-900/10 blur-[150px] rounded-full" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <FadeIn>
            <div className="text-center mb-20">
              <h2 className="font-serif text-5xl md:text-7xl text-white mb-6">Justice, accessible.</h2>
              <p className="text-2xl text-slate-400 font-light">No hourly billing. No opaque retainers. Just decisive action.</p>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700 p-8 md:p-16 rounded-3xl relative overflow-hidden shadow-2xl shadow-black/50">
              
              <div className="flex flex-col lg:flex-row items-center justify-between gap-16 relative z-10">
                <div className="flex-1">
                  <div className="inline-block px-4 py-1.5 rounded-full bg-blue-900/40 text-blue-300 text-sm font-semibold tracking-wider uppercase mb-6 border border-blue-800/50">
                    Transparent Pricing
                  </div>
                  <h3 className="text-4xl text-white font-serif mb-4">Single Legal Letter</h3>
                  <p className="text-xl text-slate-400 mb-10 font-light leading-relaxed">
                    Complete attorney drafting, review, and final signed PDF delivery for your specific dispute.
                  </p>
                  
                  <ul className="space-y-5">
                    {[
                      "Drafted based on your specific facts",
                      "Reviewed by a licensed CA attorney",
                      "Formal law firm letterhead",
                      "Delivered as an authoritative PDF",
                      "100% confidential and secure"
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-4 text-slate-300 text-lg">
                        <CheckCircle2 className="w-6 h-6 text-blue-500 shrink-0" />
                        <span className="font-light">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="w-full lg:w-[400px] bg-slate-950 border border-slate-800 p-10 rounded-2xl text-center shadow-2xl relative">
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 rounded-t-2xl"></div>
                  
                  <div className="text-slate-400 font-medium mb-4 uppercase tracking-widest text-sm">Flat Rate</div>
                  <div className="flex items-baseline justify-center gap-2 mb-8">
                    <span className="text-7xl font-serif text-white">$200</span>
                  </div>
                  
                  <button className="w-full bg-white text-slate-950 py-5 rounded-xl text-xl font-semibold hover:bg-slate-200 transition-colors shadow-lg mb-6">
                    Draft My Letter
                  </button>
                  
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                    <p className="text-sm text-slate-300 font-medium mb-1">
                      <span className="text-blue-400">Risk Free:</span> First letter review is free.
                    </p>
                    <p className="text-xs text-slate-500">
                      You don't pay until you're ready to finalize.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* 8. Final CTA / Resolution */}
      <section className="py-40 px-6 relative overflow-hidden flex flex-col items-center justify-center text-center bg-[#020617]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[100vw] h-[60vh] bg-blue-900/20 blur-[150px]" />
        </div>

        <FadeIn className="relative z-10 max-w-4xl mx-auto">
          <Landmark className="w-16 h-16 text-blue-600 mx-auto mb-10 opacity-80" />
          <h2 className="font-serif text-6xl md:text-8xl text-white mb-10 leading-[1.05]">
            Take back your power.
          </h2>
          <p className="text-2xl text-slate-400 mb-16 font-light max-w-2xl mx-auto leading-relaxed">
            Stop waiting. Stop wondering. Send a formal legal message that commands immediate attention.
          </p>
          <button className="bg-blue-600 text-white px-12 py-6 rounded-full text-xl font-medium hover:bg-blue-500 transition-all shadow-[0_0_50px_rgba(37,99,235,0.4)] hover:shadow-[0_0_80px_rgba(37,99,235,0.6)] transform hover:-translate-y-1 inline-flex items-center gap-3">
            Start Your First Letter Free <ArrowRight className="w-6 h-6" />
          </button>
        </FadeIn>
      </section>
      
      {/* Footer */}
      <footer className="py-12 px-6 text-center border-t border-slate-800 bg-[#020617]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <a href="/" className="flex items-center gap-2">
            <img src="/__mockup/images/logo-full.png" alt="Talk to My Lawyer" className="h-8 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
          </a>
          
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-300">Terms</a>
            <a href="#" className="hover:text-slate-300">Privacy</a>
            <a href="#" className="hover:text-slate-300">Contact</a>
          </div>
          
          <div className="text-slate-600 text-xs text-right">
            <p>© {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.</p>
            <p className="mt-1">Attorney-drafted legal letters for California residents and businesses.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}