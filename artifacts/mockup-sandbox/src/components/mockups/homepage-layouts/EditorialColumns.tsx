import { CheckCircle2, ArrowRight, Shield, FileText, Zap, Copy, Share2, History } from "lucide-react";

export function EditorialColumns() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-slate-900 font-sans selection:bg-blue-200">
      {/* Navigation */}
      <nav className="border-b border-slate-300 bg-[#FAFAF7]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="font-['Playfair_Display'] text-2xl font-bold tracking-tight text-slate-900">
            Talk to My Lawyer
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href.replace("#", ""))}
                className="text-slate-600 hover:text-slate-900 transition-colors"
                data-testid={`nav-${link.label.toLowerCase()}`}
              >
                {link.label}
              </button>
            ))}
            <div className="h-4 w-px bg-slate-300" />
            <a href="/login" className="text-slate-600 hover:text-slate-900 transition-colors" data-testid="nav-signin">
              Sign In
            </a>
            <a href="/login" className="bg-slate-900 text-[#FAFAF7] px-4 py-2 text-sm font-medium hover:bg-blue-600 transition-colors inline-flex items-center" data-testid="nav-get-started">
              Get Started
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6">
        {/* Hero Section */}
        <section className="py-24 md:py-32 grid md:grid-cols-12 gap-12 items-start border-b border-slate-300">
          <div className="md:col-span-8">
            <div className="inline-block border border-slate-300 px-3 py-1 text-xs font-semibold tracking-widest uppercase text-slate-500 mb-8">
              Your First Letter Is Free — Attorney Review Included
            </div>
            <h1 className="font-['Playfair_Display'] text-5xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tight text-slate-900 mb-8">
              Professional <br />
              <span className="text-blue-600 italic">Legal Letters,</span><br />
              drafted & approved.
            </h1>
          </div>
          <div className="md:col-span-4 md:pt-16">
            <p className="text-lg leading-relaxed text-slate-700 mb-8">
              Describe your legal situation. Our attorneys research applicable laws, draft a professional letter, and review every word before delivery. No more uncertainty.
            </p>
            <div className="space-y-4">
              <a href="/login" className="w-full bg-blue-600 text-white px-6 py-4 text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-between group" data-testid="hero-cta">
                <span>Start Your Free Letter</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <div className="text-xs text-slate-500 space-y-2 font-medium leading-relaxed">
                <p>Common cases:</p>
                <div className="flex flex-wrap gap-2">
                  {["Breach of Contract", "Demand for Payment", "Cease and Desist", "Pre-Litigation Settlement", "Debt Collection"].map(type => (
                    <span key={type} className="border border-slate-300 px-2 py-1 rounded-none bg-white/50">{type}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-24 border-b border-slate-300 grid md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <h2 className="font-['Playfair_Display'] text-3xl font-bold mb-4">The Process</h2>
            <p className="text-sm text-slate-500 uppercase tracking-widest">How it works</p>
          </div>
          <div className="md:col-span-6 space-y-12">
            {[
              {
                step: "01",
                title: "Describe Your Situation",
                desc: "Complete a guided intake form with the facts of your case — parties involved, key dates, desired outcome, and supporting details. No legal expertise required.",
              },
              {
                step: "02",
                title: "Attorneys Research & Draft",
                desc: "Our legal team researches applicable statutes and case law for your jurisdiction, then drafts a tailored legal letter grounded in real legal authority.",
              },
              {
                step: "03",
                title: "Attorney Reviews & Approves",
                desc: "A licensed attorney reads every draft, makes edits where needed, and signs off before delivery. No letter reaches you without human legal oversight.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-6 items-start group">
                <div className="font-['Playfair_Display'] text-3xl text-slate-300 group-hover:text-blue-600 transition-colors">
                  {item.step}.
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 border-b border-slate-300">
          <div className="mb-16 md:w-1/2">
            <h2 className="font-['Playfair_Display'] text-4xl font-bold mb-4">Built for Real Legal Situations</h2>
            <p className="text-slate-600 text-lg">Every feature exists to get you a stronger letter, faster.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-slate-300 border border-slate-300">
            <div className="bg-[#FAFAF7] p-8 md:col-span-2 md:row-span-2 flex flex-col justify-between min-h-[300px]">
              <div>
                <Shield className="w-8 h-8 text-blue-600 mb-6" />
                <h3 className="font-['Playfair_Display'] text-3xl font-bold mb-4">Encrypted & Confidential</h3>
                <p className="text-slate-600 leading-relaxed max-w-md">Your case details are encrypted in transit and at rest. Attorneys are bound by professional confidentiality obligations. Your data is never shared.</p>
              </div>
            </div>
            
            <div className="bg-[#FAFAF7] p-8">
              <FileText className="w-6 h-6 text-slate-900 mb-4" />
              <h3 className="font-bold mb-2">7 Letter Types</h3>
              <p className="text-sm text-slate-600">Demand letters, cease and desist notices, contract breach, eviction, employment disputes, consumer complaints, and general legal correspondence.</p>
            </div>
            
            <div className="bg-[#FAFAF7] p-8">
              <Zap className="w-6 h-6 text-slate-900 mb-4" />
              <h3 className="font-bold mb-2">Jurisdiction-Aware Research</h3>
              <p className="text-sm text-slate-600">Our attorneys identify statutes, regulations, and case law specific to your state and situation.</p>
            </div>

            <div className="bg-[#FAFAF7] p-8 md:col-span-1">
              <Copy className="w-6 h-6 text-slate-900 mb-4" />
              <h3 className="font-bold mb-2">Real-Time Status Tracking</h3>
              <p className="text-sm text-slate-600">Follow your letter from submission through attorney drafting, review, and final approval.</p>
            </div>

            <div className="bg-[#FAFAF7] p-8 md:col-span-2 flex items-center justify-between">
              <div className="pr-8">
                <Share2 className="w-6 h-6 text-slate-900 mb-4" />
                <h3 className="font-bold mb-2">Attorney Review Center</h3>
                <p className="text-sm text-slate-600">Licensed attorneys work in a dedicated Review Center — editing language, verifying citations, and ensuring professional quality.</p>
              </div>
              <div className="hidden md:block">
                <History className="w-12 h-12 text-slate-300" />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section (Comparison Table) */}
        <section id="pricing" className="py-24 border-b border-slate-300">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-['Playfair_Display'] text-4xl font-bold mb-4">Pricing & Plans</h2>
            <p className="text-slate-600">Your first letter is completely free — including attorney review. After that, choose the plan that fits your needs.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 border-b-2 border-slate-900 font-['Playfair_Display'] text-xl w-1/4">Features</th>
                  <th className="p-4 border-b-2 border-slate-900 w-1/4 align-bottom">
                    <div className="text-sm font-normal text-slate-500 mb-1">One-time</div>
                    <div className="font-bold text-xl text-slate-900">Pay Per Letter</div>
                    <div className="text-blue-600 font-semibold">$200</div>
                  </th>
                  <th className="p-4 border-b-2 border-slate-900 w-1/4 align-bottom bg-slate-100">
                    <div className="text-xs font-bold tracking-widest uppercase text-blue-600 mb-1">Most Popular</div>
                    <div className="text-sm font-normal text-slate-500 mb-1">Monthly</div>
                    <div className="font-bold text-xl text-slate-900">Standard Plan</div>
                    <div className="text-blue-600 font-semibold">$499/mo</div>
                  </th>
                  <th className="p-4 border-b-2 border-slate-900 w-1/4 align-bottom">
                    <div className="text-sm font-normal text-slate-500 mb-1">Monthly</div>
                    <div className="font-bold text-xl text-slate-900">Pro Plan</div>
                    <div className="text-blue-600 font-semibold">$699/mo</div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[
                  { feature: "Letters Included", basic: "1 letter", pro: "4 letters/mo", premium: "8 letters/mo" },
                  { feature: "Attorney Review", basic: true, pro: true, premium: true },
                  { feature: "Legal Research", basic: true, pro: true, premium: true },
                  { feature: "Downloadable PDF", basic: true, pro: true, premium: true },
                  { feature: "Full Audit Trail", basic: true, pro: true, premium: true },
                  { feature: "Priority Support", basic: false, pro: false, premium: true },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-200 hover:bg-white/50 transition-colors">
                    <td className="p-4 font-medium text-slate-900">{row.feature}</td>
                    <td className="p-4 text-slate-600">
                      {typeof row.basic === "boolean" ? (row.basic ? <CheckCircle2 className="w-5 h-5 text-slate-900" /> : <span className="text-slate-300">—</span>) : row.basic}
                    </td>
                    <td className="p-4 text-slate-600 bg-slate-100">
                      {typeof row.pro === "boolean" ? (row.pro ? <CheckCircle2 className="w-5 h-5 text-blue-600" /> : <span className="text-slate-300">—</span>) : <span className="font-semibold text-blue-900">{row.pro}</span>}
                    </td>
                    <td className="p-4 text-slate-600">
                      {typeof row.premium === "boolean" ? (row.premium ? <CheckCircle2 className="w-5 h-5 text-slate-900" /> : <span className="text-slate-300">—</span>) : row.premium}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="p-4"></td>
                  <td className="p-4">
                    <a href="/login" className="text-sm font-bold border-b border-slate-900 pb-1 hover:text-blue-600 hover:border-blue-600 transition-colors">Get Started</a>
                  </td>
                  <td className="p-4 bg-slate-100">
                    <a href="/login" className="text-sm font-bold border-b border-blue-600 text-blue-600 pb-1 hover:text-blue-800 hover:border-blue-800 transition-colors">Subscribe Now</a>
                  </td>
                  <td className="p-4">
                    <a href="/login" className="text-sm font-bold border-b border-slate-900 pb-1 hover:text-blue-600 hover:border-blue-600 transition-colors">Subscribe Now</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Our Standards (Trust & Attorney Review Combined) */}
        <section className="py-24 border-b border-slate-300">
          <h2 className="font-['Playfair_Display'] text-4xl font-bold mb-12 text-center">Our Standards</h2>
          <div className="grid md:grid-cols-2 gap-16 text-lg leading-relaxed text-slate-700">
            <div>
              <h3 className="font-bold text-slate-900 mb-4 uppercase tracking-widest text-sm">Security & Trust</h3>
              <p className="mb-4">
                We operate with enterprise-grade security and end-to-end encryption. Our platform ensures role-based access and maintains a rigorous audit trail of every action taken on your matter.
              </p>
              <p>
                Compliance is paramount. We adhere to SOC 2 standards, ensuring your confidential legal information remains secure, private, and protected from unauthorized access at all times.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-4 uppercase tracking-widest text-sm">Attorney Oversight</h3>
              <p className="mb-4">
                Technology assists, but human legal oversight governs. Every draft undergoes inline editing and citation verification by a licensed attorney.
              </p>
              <p>
                Our strict approve/reject workflow guarantees that no correspondence is delivered to you or opposing parties without passing our internal standard of legal excellence and professional rigor.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 border-b border-slate-300 max-w-3xl mx-auto">
          <div className="mb-16">
            <h2 className="font-['Playfair_Display'] text-4xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>
          
          <div className="space-y-12">
            {[
              { q: "What is Talk to My Lawyer?", a: "We are a legal letter service that combines guided intake with attorney research, drafting, and final review to produce professional legal correspondence." },
              { q: "Is the first letter really free?", a: "Yes. Your first letter is completely free and includes full attorney review. No credit card is required to start." },
              { q: "What happens after I submit my situation?", a: "Our team reviews the facts, researches the law in your jurisdiction, drafts the letter, and a licensed attorney reviews and approves the final PDF." },
              { q: "How long does it take?", a: "Most letters are drafted, reviewed, and ready for you to download within 24 to 48 hours of submission." },
              { q: "Are these letters legally valid?", a: "Yes. They are professional legal documents drafted based on the facts you provide and applicable law, reviewed by licensed attorneys." },
              { q: "What types of letters do you handle?", a: "We handle a wide range of standard legal correspondence including demand for payment, breach of contract, cease and desist, and pre-litigation settlement." },
              { q: "Who reviews my letter?", a: "A licensed attorney reviews every letter to verify citations, edit language, and ensure the document meets professional legal standards." },
              { q: "Can I review the draft before it's finalized?", a: "The final product delivered to you is a polished, attorney-approved PDF ready for your use." },
              { q: "Is my information confidential?", a: "Absolutely. All information you provide is encrypted, and our attorneys are bound by strict professional rules of confidentiality." }
            ].map((faq, index) => (
              <div key={index} className="border-l-2 border-slate-900 pl-6">
                <h3 className="font-bold text-lg mb-2 text-slate-900">{faq.q}</h3>
                <p className="text-slate-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Minimal Footer */}
        <footer className="py-12 text-sm text-slate-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="font-['Playfair_Display'] font-bold text-slate-900 text-lg">Talk to My Lawyer</div>
          <div className="flex flex-wrap justify-center gap-6">
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
            <a href="#" className="hover:text-slate-900">Terms</a>
            <a href="#" className="hover:text-slate-900">Privacy</a>
            <a href="/login" className="hover:text-slate-900">Sign In</a>
          </div>
          <div>© {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.</div>
        </footer>
      </main>
    </div>
  );
}

export default EditorialColumns;
