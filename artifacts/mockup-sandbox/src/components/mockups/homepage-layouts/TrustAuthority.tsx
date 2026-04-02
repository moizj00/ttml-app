import React, { useState } from "react";

import {
  Shield,
  Scale,
  Award,
  CheckCircle,
  ChevronRight,
  Menu,
  X,
  FileText,
  Clock,
  Landmark,
  Phone,
  Mail,
  MapPin,
  Star
} from "lucide-react";

export default function TrustAuthority() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans text-slate-900 selection:bg-[#1a2b4c] selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <a href="/" className="flex-shrink-0 flex items-center gap-3">
              <img src="/__mockup/images/logo-icon-badge.png" alt="Talk to My Lawyer" className="h-10 w-10 object-contain" />
              <div className="flex flex-col">
                <span className="font-['Playfair_Display'] text-xl font-bold tracking-tight text-[#1a2b4c] leading-tight">
                  TALK TO MY LAWYER
                </span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
                  California Legal Counsel
                </span>
              </div>
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#services" className="text-sm font-semibold text-slate-600 hover:text-[#1a2b4c] tracking-wide uppercase transition-colors">
                Practice Areas
              </a>
              <a href="#attorneys" className="text-sm font-semibold text-slate-600 hover:text-[#1a2b4c] tracking-wide uppercase transition-colors">
                Our Attorneys
              </a>
              <a href="#pricing" className="text-sm font-semibold text-slate-600 hover:text-[#1a2b4c] tracking-wide uppercase transition-colors">
                Fees
              </a>
              <a href="#results" className="text-sm font-semibold text-slate-600 hover:text-[#1a2b4c] tracking-wide uppercase transition-colors">
                Case Results
              </a>
              <div className="w-px h-5 bg-slate-300"></div>
              <a href="/login" className="text-sm font-semibold text-[#1a2b4c] hover:text-[#d4af37] transition-colors">
                Client Portal
              </a>
              <button className="bg-[#1a2b4c] hover:bg-[#111c33] text-white px-6 py-2.5 rounded-sm text-sm font-semibold tracking-wide transition-all shadow-md">
                Retain Counsel
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-[#1a2b4c] hover:text-[#d4af37] transition-colors"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 shadow-xl absolute w-full">
            <div className="px-4 pt-2 pb-6 space-y-2">
              <a href="#services" className="block px-3 py-3 text-base font-medium text-slate-800 border-b border-slate-100">Practice Areas</a>
              <a href="#attorneys" className="block px-3 py-3 text-base font-medium text-slate-800 border-b border-slate-100">Our Attorneys</a>
              <a href="#pricing" className="block px-3 py-3 text-base font-medium text-slate-800 border-b border-slate-100">Fees</a>
              <a href="#results" className="block px-3 py-3 text-base font-medium text-slate-800 border-b border-slate-100">Case Results</a>
              <a href="/login" className="block px-3 py-3 text-base font-medium text-[#1a2b4c] border-b border-slate-100">Client Portal</a>
              <div className="pt-4 px-3">
                <button className="w-full bg-[#1a2b4c] text-white px-6 py-3 rounded-sm text-sm font-semibold tracking-wide shadow-md">
                  Retain Counsel
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-40 overflow-hidden min-h-[90vh] flex items-center">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/__mockup/images/lobby.jpg" 
            alt="Prestigious law firm lobby" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d172a] via-[#1a2b4c]/90 to-[#1a2b4c]/40"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#d4af37]/30 bg-[#1a2b4c]/50 backdrop-blur-sm rounded-sm mb-8">
              <Award className="w-4 h-4 text-[#d4af37]" />
              <span className="text-xs uppercase tracking-widest text-[#d4af37] font-semibold">
                California Bar Licensed Attorneys
              </span>
            </div>
            
            <h1 className="font-['Playfair_Display'] text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-[1.1] mb-6">
              Legal Authority.<br />
              <span className="text-[#d4af37] italic">Delivered on Demand.</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-slate-300 mb-10 max-w-2xl leading-relaxed font-light border-l-2 border-[#d4af37] pl-4">
              Serious legal matters require serious legal representation. Have a licensed California attorney draft, review, and issue your formal legal demands, starting at $200.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="bg-[#d4af37] hover:bg-[#c5a133] text-[#0d172a] px-8 py-4 rounded-sm text-base font-bold tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 group">
                Draft Your Demand
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="bg-transparent border border-white/30 text-white hover:bg-white/10 px-8 py-4 rounded-sm text-base font-semibold tracking-wide transition-all flex items-center justify-center gap-2">
                <Phone className="w-5 h-5" />
                (800) 555-0199
              </button>
            </div>

            {/* Trust Badges */}
            <div className="mt-16 pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-['Playfair_Display'] font-bold text-white">4,200+</span>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Demands Issued</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-['Playfair_Display'] font-bold text-white">98%</span>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Favorable Outcomes</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-['Playfair_Display'] font-bold text-white">$45M+</span>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Recovered</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-[#d4af37] mt-1 mb-1">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Client Satisfaction</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Credibility */}
      <section className="py-12 bg-[#1a2b4c] border-b border-[#2a3f6c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <p className="text-slate-400 uppercase tracking-widest text-xs font-semibold text-center md:text-left min-w-[200px]">
              Trusted By Clients From
            </p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
              {/* Abstract corporate logos */}
              <div className="font-['Playfair_Display'] text-xl font-bold text-white">Fortune 500</div>
              <div className="font-serif text-xl font-bold text-white italic">Silicon Valley Tech</div>
              <div className="font-sans text-xl font-bold text-white tracking-tighter">REAL ESTATE TRUST</div>
              <div className="font-['Playfair_Display'] text-xl font-bold text-white tracking-widest">MEDICAL GR.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Practice Areas / Services */}
      <section id="services" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#d4af37] text-sm uppercase tracking-widest font-bold mb-4">Areas of Practice</h2>
            <h3 className="font-['Playfair_Display'] text-4xl lg:text-5xl text-[#1a2b4c] font-bold mb-6">
              Specialized Legal Correspondence
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              We do not rely on automated templates. Every demand letter is individually researched, drafted, and signed by a licensed attorney.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Breach of Contract",
                desc: "Formal notices of default compelling performance or outlining damages prior to litigation.",
                icon: FileText
              },
              {
                title: "Cease & Desist",
                desc: "Aggressive, court-admissible demands to immediately halt infringement, harassment, or defamation.",
                icon: Shield
              },
              {
                title: "Debt Collection",
                desc: "Firm escalation of unpaid invoices bearing the weight of formal legal action.",
                icon: Landmark
              }
            ].map((service, idx) => (
              <div key={idx} className="group border border-slate-200 p-10 hover:border-[#1a2b4c] transition-colors bg-[#fafafa]">
                <service.icon className="w-10 h-10 text-[#d4af37] mb-6 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                <h4 className="font-['Playfair_Display'] text-2xl text-[#1a2b4c] font-bold mb-4">{service.title}</h4>
                <p className="text-slate-600 leading-relaxed">
                  {service.desc}
                </p>
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-bold text-[#1a2b4c] uppercase tracking-wider group-hover:text-[#d4af37] transition-colors">
                    Learn More <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Attorney Profiles */}
      <section id="attorneys" className="py-24 bg-[#f0f2f5] border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-[#d4af37] text-sm uppercase tracking-widest font-bold mb-4">Our Legal Team</h2>
              <h3 className="font-['Playfair_Display'] text-4xl lg:text-5xl text-[#1a2b4c] font-bold mb-6">
                Uncompromising Caliber
              </h3>
              <p className="text-slate-600 text-lg">
                Your correspondence is managed exclusively by attorneys licensed to practice in the State of California, each with extensive litigation and negotiation experience.
              </p>
            </div>
            <button className="hidden md:inline-flex border border-[#1a2b4c] text-[#1a2b4c] hover:bg-[#1a2b4c] hover:text-white px-6 py-3 rounded-sm text-sm font-semibold tracking-wide transition-colors">
              View All Partners
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Attorney 1 */}
            <div className="bg-white group cursor-pointer shadow-sm hover:shadow-xl transition-shadow">
              <div className="aspect-[3/4] overflow-hidden relative">
                <div className="absolute inset-0 bg-[#1a2b4c]/20 group-hover:bg-transparent transition-colors z-10"></div>
                <img 
                  src="/__mockup/images/attorney-1.jpg" 
                  alt="Robert Harrison, Esq." 
                  className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-8 text-center border border-t-0 border-slate-100">
                <h4 className="font-['Playfair_Display'] text-2xl text-[#1a2b4c] font-bold mb-1">Robert Harrison, Esq.</h4>
                <p className="text-[#d4af37] font-semibold text-sm tracking-widest uppercase mb-4">Senior Partner</p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Award className="w-4 h-4" />
                  <span>California Bar #214983</span>
                </div>
              </div>
            </div>

            {/* Attorney 2 */}
            <div className="bg-white group cursor-pointer shadow-sm hover:shadow-xl transition-shadow">
              <div className="aspect-[3/4] overflow-hidden relative">
                <div className="absolute inset-0 bg-[#1a2b4c]/20 group-hover:bg-transparent transition-colors z-10"></div>
                <img 
                  src="/__mockup/images/attorney-2.jpg" 
                  alt="Sarah Jenkins, Esq." 
                  className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-8 text-center border border-t-0 border-slate-100">
                <h4 className="font-['Playfair_Display'] text-2xl text-[#1a2b4c] font-bold mb-1">Sarah Jenkins, Esq.</h4>
                <p className="text-[#d4af37] font-semibold text-sm tracking-widest uppercase mb-4">Managing Attorney</p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Award className="w-4 h-4" />
                  <span>California Bar #302144</span>
                </div>
              </div>
            </div>

            {/* Attorney 3 */}
            <div className="bg-white group cursor-pointer shadow-sm hover:shadow-xl transition-shadow">
              <div className="aspect-[3/4] overflow-hidden relative">
                <div className="absolute inset-0 bg-[#1a2b4c]/20 group-hover:bg-transparent transition-colors z-10"></div>
                <img 
                  src="/__mockup/images/attorney-3.jpg" 
                  alt="Michael Chen, Esq." 
                  className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-8 text-center border border-t-0 border-slate-100">
                <h4 className="font-['Playfair_Display'] text-2xl text-[#1a2b4c] font-bold mb-1">Michael Chen, Esq.</h4>
                <p className="text-[#d4af37] font-semibold text-sm tracking-widest uppercase mb-4">Litigation Counsel</p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Award className="w-4 h-4" />
                  <span>California Bar #341882</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-12 text-center md:hidden">
            <button className="border border-[#1a2b4c] text-[#1a2b4c] hover:bg-[#1a2b4c] hover:text-white px-6 py-3 rounded-sm text-sm font-semibold tracking-wide transition-colors w-full">
              View All Partners
            </button>
          </div>
        </div>
      </section>

      {/* The Process */}
      <section className="py-24 bg-[#1a2b4c] text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-5 pointer-events-none">
          <Scale className="w-full h-full" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#d4af37] text-sm uppercase tracking-widest font-bold mb-4">The Methodology</h2>
            <h3 className="font-['Playfair_Display'] text-4xl lg:text-5xl font-bold mb-6">
              Strategic Escalation
            </h3>
            <p className="text-slate-300 text-lg">
              A letter on law firm letterhead signals that you are prepared to litigate. Our streamlined process ensures rapid, forceful intervention.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-8 left-12 right-12 h-px bg-[#2a3f6c]"></div>

            {[
              { num: "01", title: "Intake", desc: "Submit your case details securely through our encrypted client portal." },
              { num: "02", title: "Analysis", desc: "A licensed attorney reviews your facts and researches applicable statutes." },
              { num: "03", title: "Drafting", desc: "We author a formal, legally-binding demand bearing our firm's signature." },
              { num: "04", title: "Execution", desc: "The letter is dispatched via certified mail and tracked for compliance." }
            ].map((step, idx) => (
              <div key={idx} className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#1a2b4c] border-2 border-[#d4af37] rounded-full flex items-center justify-center font-['Playfair_Display'] text-2xl text-[#d4af37] font-bold mb-6 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                  {step.num}
                </div>
                <h4 className="text-xl font-bold mb-3">{step.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Fees */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="flex-1">
              <h2 className="text-[#d4af37] text-sm uppercase tracking-widest font-bold mb-4">Transparent Fees</h2>
              <h3 className="font-['Playfair_Display'] text-4xl lg:text-5xl text-[#1a2b4c] font-bold mb-6">
                Premium Counsel.<br />Predictable Cost.
              </h3>
              <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                Traditional retainers require thousands of dollars upfront. We provide targeted legal intervention with flat, predictable fees — allowing you to protect your rights without financial uncertainty.
              </p>
              
              <ul className="space-y-4 mb-10">
                {[
                  "Drafted exclusively by California-licensed attorneys",
                  "Comprehensive legal research included",
                  "Issued on official firm letterhead",
                  "Sent via USPS Certified Mail with Return Receipt",
                  "Includes one round of attorney revisions"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-[#1a2b4c] flex-shrink-0" />
                    <span className="text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
              
              <button className="bg-[#1a2b4c] hover:bg-[#111c33] text-white px-8 py-4 rounded-sm text-base font-bold tracking-wide transition-all shadow-xl flex items-center justify-center gap-2 group w-full sm:w-auto">
                Initiate Representation
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            
            <div className="w-full lg:w-[450px]">
              <div className="bg-white border-2 border-[#1a2b4c] p-10 relative shadow-2xl">
                <div className="absolute top-0 right-0 bg-[#1a2b4c] text-white text-xs font-bold px-4 py-1 uppercase tracking-wider">
                  Flat Fee Structure
                </div>
                
                <h4 className="font-['Playfair_Display'] text-2xl text-[#1a2b4c] font-bold mb-2">Standard Demand</h4>
                <p className="text-slate-500 mb-8 pb-8 border-b border-slate-200">Complete review, drafting, and dispatch.</p>
                
                <div className="flex items-end gap-2 mb-8">
                  <span className="text-6xl font-['Playfair_Display'] font-bold text-[#1a2b4c]">$200</span>
                  <span className="text-slate-500 pb-2">/ single letter</span>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-sm border border-slate-200 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-[#d4af37] flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-bold text-[#1a2b4c]">48-Hour Turnaround</h5>
                    <p className="text-xs text-slate-500 mt-1">Expedited 24-hour service available for an additional fee during intake.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Outcomes / Testimonials */}
      <section id="results" className="py-24 bg-[#f8f9fa] border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-[#d4af37] text-sm uppercase tracking-widest font-bold mb-4">Verdicts & Testimonials</h2>
            <h3 className="font-['Playfair_Display'] text-4xl lg:text-5xl text-[#1a2b4c] font-bold mb-6">
              Proven Results
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-10 shadow-sm border border-slate-100 relative">
              <Award className="absolute top-10 right-10 w-12 h-12 text-slate-100" />
              <div className="flex items-center gap-1 text-[#d4af37] mb-6">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-5 h-5 fill-current" />)}
              </div>
              <p className="font-['Playfair_Display'] text-xl text-slate-800 italic mb-8 relative z-10 leading-relaxed">
                "We had a contractor walk away with a $15,000 deposit. Emails did nothing. 48 hours after Talk to My Lawyer sent a formal breach of contract demand, the contractor refunded the entire amount to avoid litigation. Exceptional authority."
              </p>
              <div>
                <p className="font-bold text-[#1a2b4c]">Jonathan M.</p>
                <p className="text-sm text-slate-500 uppercase tracking-wider">Business Owner • Orange County, CA</p>
              </div>
            </div>

            <div className="bg-white p-10 shadow-sm border border-slate-100 relative">
              <Award className="absolute top-10 right-10 w-12 h-12 text-slate-100" />
              <div className="flex items-center gap-1 text-[#d4af37] mb-6">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-5 h-5 fill-current" />)}
              </div>
              <p className="font-['Playfair_Display'] text-xl text-slate-800 italic mb-8 relative z-10 leading-relaxed">
                "The cease and desist letter drafted by Sarah Jenkins was incredibly forceful and legally precise. It immediately stopped the intellectual property theft we were dealing with. Worth ten times what we paid."
              </p>
              <div>
                <p className="font-bold text-[#1a2b4c]">Elena R.</p>
                <p className="text-sm text-slate-500 uppercase tracking-wider">E-Commerce Director • San Francisco, CA</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Section */}
      <section className="bg-[#0a1122] py-20 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Scale className="w-12 h-12 text-[#d4af37] mx-auto mb-6" />
          <h2 className="font-['Playfair_Display'] text-3xl md:text-5xl font-bold text-white mb-6">
            Secure Your Legal Rights Today
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Do not let disputes escalate unprotected. Engage California legal counsel instantly.
          </p>
          <button className="bg-[#d4af37] hover:bg-[#c5a133] text-[#0d172a] px-10 py-4 rounded-sm text-lg font-bold tracking-wide transition-all shadow-lg inline-flex items-center justify-center gap-2 group">
            Begin Case Intake
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Formal Footer */}
      <footer className="bg-[#0a1122] text-slate-400 py-12 text-sm font-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <img src="/__mockup/images/logo-full.png" alt="Talk to My Lawyer" className="h-8 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
              </div>
              <p className="mb-6 max-w-sm">
                Premier legal correspondence and dispute resolution services, serving individuals and enterprises across the State of California.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-[#d4af37]" />
                  <span>100 Legal Way, Suite 400, San Francisco, CA 94105</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#d4af37]" />
                  <span>(800) 555-0199</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-[#d4af37]" />
                  <span>counsel@talktomylawyer.com</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-white font-semibold uppercase tracking-wider mb-6">Services</h4>
              <ul className="space-y-3">
                <li><a href="#" className="hover:text-white transition-colors">Demand Letters</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cease & Desist</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Breach of Contract</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Debt Collection</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Settlement Offers</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold uppercase tracking-wider mb-6">Firm</h4>
              <ul className="space-y-3">
                <li><a href="#" className="hover:text-white transition-colors">Our Attorneys</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Case Results</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Fees & Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="/login" className="hover:text-white transition-colors">Client Portal</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
            <p>&copy; {new Date().getFullYear()} Talk to My Lawyer, PC. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Legal Disclaimer</a>
            </div>
          </div>
          <div className="mt-8 text-xs text-slate-500 text-center md:text-left leading-relaxed">
            Disclaimer: The information provided on this website does not, and is not intended to, constitute legal advice; instead, all information, content, and materials available on this site are for general informational purposes only. Use of, and access to, this website or any of the links or resources contained within the site do not create an attorney-client relationship between the reader, user, or browser and website authors, contributors, contributing law firms, or committee members and their respective employers.
          </div>
        </div>
      </footer>
    </div>
  );
}
