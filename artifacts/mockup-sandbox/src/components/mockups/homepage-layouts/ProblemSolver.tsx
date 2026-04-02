import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Shield, 
  FileText, 
  Scale, 
  CheckCircle2, 
  ChevronRight,
  AlertCircle,
  Briefcase,
  Home,
  Users,
  ShoppingCart,
  HeartPulse,
  Banknote,
  Search,
  MessageSquare
} from 'lucide-react';
import { cn } from "@/lib/utils";

type IssueCategory = {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  context: {
    headline: string;
    body: string;
    processualSteps: string[];
    typicalOutcome: string;
  }
};

const CATEGORIES: IssueCategory[] = [
  {
    id: "demand",
    title: "Someone owes me money",
    icon: <Banknote className="w-5 h-5" />,
    description: "Demand for Payment",
    context: {
      headline: "Recover what is rightfully yours.",
      body: "A formal Demand for Payment letter drafted by a California attorney signals that you are serious. It is often the required first step before filing a lawsuit and can compel the debtor to settle immediately without court intervention.",
      processualSteps: [
        "Detail the exact amount owed and the origin of the debt.",
        "Set a firm, legally compliant deadline for payment.",
        "Outline the specific legal consequences of non-payment in California."
      ],
      typicalOutcome: "68% of commercial debts are resolved within 14 days of receiving an attorney-drafted demand letter."
    }
  },
  {
    id: "breach",
    title: "A contract was broken",
    icon: <Briefcase className="w-5 h-5" />,
    description: "Breach of Contract",
    context: {
      headline: "Hold them accountable to the agreement.",
      body: "When terms are violated, a Breach of Contract notice formally documents the failure to perform. It preserves your rights and establishes a clear timeline for the other party to cure the breach or face litigation.",
      processualSteps: [
        "Identify the specific clauses violated in your agreement.",
        "Demand a 'cure' (correction) within a legally sound timeframe.",
        "Establish the groundwork for potential damages recovery."
      ],
      typicalOutcome: "Prevents statute of limitations from expiring and forces the breaching party to respond formally."
    }
  },
  {
    id: "cease",
    title: "I need someone to stop doing something",
    icon: <Shield className="w-5 h-5" />,
    description: "Cease and Desist",
    context: {
      headline: "Enforce your boundaries legally.",
      body: "Whether it's harassment, intellectual property infringement, or defamation, a Cease and Desist letter from a law firm puts an immediate halt to unlawful behavior under threat of injunction and damages.",
      processualSteps: [
        "Clearly identify the unlawful or infringing activity.",
        "Cite relevant California statutes prohibiting the behavior.",
        "Demand immediate cessation and written confirmation of compliance."
      ],
      typicalOutcome: "Highly effective at stopping harassment, unauthorized use of IP, and defamatory statements quickly."
    }
  },
  {
    id: "landlord",
    title: "I have a property dispute",
    icon: <Home className="w-5 h-5" />,
    description: "Landlord/Tenant Issues",
    context: {
      headline: "Navigate California real estate law with authority.",
      body: "California tenant and landlord laws are complex and heavily regulated. Whether you need to enforce a lease, demand repairs, or dispute an unfair deduction from a deposit, the letter must be procedurally perfect.",
      processualSteps: [
        "Reference the specific lease provision and CA Civil Code.",
        "Demand immediate compliance, repair, or refund.",
        "State the intention to pursue remedies in small claims or civil court."
      ],
      typicalOutcome: "Creates the necessary paper trail for court and often resolves deposit disputes without litigation."
    }
  },
  {
    id: "employment",
    title: "I have an issue at work",
    icon: <Users className="w-5 h-5" />,
    description: "Employment Issues",
    context: {
      headline: "Protect your livelihood and workplace rights.",
      body: "Wage theft, wrongful termination, and workplace discrimination require a delicate but forceful approach. An attorney-drafted letter protects your rights while navigating the nuances of California labor law.",
      processualSteps: [
        "Document the exact nature of the workplace violation.",
        "Cite California Labor Code or DFEH regulations.",
        "Demand back wages, severance, or changes to workplace conditions."
      ],
      typicalOutcome: "Initiates settlement discussions with employers who want to avoid formal DLSE complaints."
    }
  },
  {
    id: "consumer",
    title: "I was scammed or sold a bad product",
    icon: <ShoppingCart className="w-5 h-5" />,
    description: "Consumer Protection",
    context: {
      headline: "Fight back against unfair business practices.",
      body: "California has some of the strongest consumer protection laws in the country. If a business has engaged in false advertising, bait-and-switch, or sold a defective product, a formal letter under the Consumer Legal Remedies Act (CLRA) is your first step.",
      processualSteps: [
        "Invoke specific California consumer protection statutes (CLRA, Song-Beverly).",
        "Detail the deceptive practice or product failure.",
        "Demand a refund, replacement, or compensation within 30 days."
      ],
      typicalOutcome: "Often results in swift refunds as businesses seek to avoid statutory damages and attorney fee awards."
    }
  },
  {
    id: "injury",
    title: "I was injured",
    icon: <HeartPulse className="w-5 h-5" />,
    description: "Personal Injury",
    context: {
      headline: "Establish your claim and demand compensation.",
      body: "Before filing a personal injury lawsuit, a comprehensive demand letter to the at-fault party's insurance company is standard practice. It outlines liability, damages, and sets the stage for settlement negotiations.",
      processualSteps: [
        "Establish facts demonstrating the other party's negligence.",
        "Detail all medical expenses, lost wages, and pain/suffering.",
        "Demand a specific settlement amount within policy limits."
      ],
      typicalOutcome: "Serves as the foundation for insurance settlements, often leading to compensation without trial."
    }
  }
];

export default function ProblemSolver() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const selectedCategory = CATEGORIES.find(c => c.id === selectedId);
  const filteredCategories = CATEGORIES.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] font-sans text-slate-900 selection:bg-blue-100 scroll-smooth">
      {/* Navigation */}
      <header 
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out border-b",
          isScrolled || selectedId
            ? "bg-white/95 backdrop-blur-md border-slate-200 py-3 shadow-sm" 
            : "bg-transparent border-transparent py-5"
        )}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedId(null)}>
            <img src="/__mockup/images/logo-icon-badge.png" alt="Talk to My Lawyer" className="h-9 w-9 object-contain" />
            <span className="font-bold text-lg tracking-tight text-slate-900">Talk to My Lawyer</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <button onClick={() => {
              setSelectedId(null);
              document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
            }} className="hover:text-blue-900 transition-colors">How it Works</button>
            <button onClick={() => {
              setSelectedId(null);
              document.getElementById('authority')?.scrollIntoView({ behavior: 'smooth' });
            }} className="hover:text-blue-900 transition-colors">Authority</button>
            <button onClick={() => {
              setSelectedId(null);
              document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
            }} className="hover:text-blue-900 transition-colors">Pricing</button>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">Log in</button>
            <button className="bg-blue-900 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-blue-800 transition-colors shadow-sm">
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero & Problem Solver Section */}
      <section className={cn(
        "relative transition-all duration-700 ease-in-out",
        selectedId ? "pt-24 pb-12 min-h-0" : "pt-32 pb-20 min-h-[85vh] flex flex-col items-center justify-center"
      )}>
        <div className="max-w-5xl w-full mx-auto px-6">
          
          {!selectedId ? (
            <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-100 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-8 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                California-Licensed Attorneys
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.05]">
                Stop worrying.<br />
                <span className="text-blue-900">Start resolving.</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-10">
                Attorney-drafted legal correspondence that gets results. Choose your situation below to begin the intake process.
              </p>
              
              <div className="max-w-md mx-auto relative mb-12">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-11 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent shadow-sm transition-shadow text-base"
                  placeholder="e.g. Someone owes me money..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in fade-in duration-500 pt-6">
              <div>
                <button 
                  onClick={() => setSelectedId(null)}
                  className="text-sm text-slate-500 hover:text-blue-900 font-medium mb-3 flex items-center gap-1 transition-colors group"
                >
                  <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" /> 
                  Back to all situations
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 text-blue-900 rounded-xl flex items-center justify-center shrink-0">
                    {selectedCategory?.icon}
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                    {selectedCategory?.description}
                  </h1>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm inline-flex items-center gap-4 self-start md:self-auto">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Flat Fee</div>
                  <div className="text-lg font-bold text-slate-900">$200</div>
                </div>
                <div className="w-px h-8 bg-slate-200"></div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Turnaround</div>
                  <div className="text-lg font-bold text-slate-900">24-48h</div>
                </div>
              </div>
            </div>
          )}

          {/* Grid or Selected Context */}
          <div className="relative">
            {!selectedId ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCategories.map((cat, idx) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedId(cat.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="group bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-900/30 transition-all text-left flex flex-col h-full animate-in fade-in slide-in-from-bottom-8 relative overflow-hidden"
                    style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300 text-blue-900">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                    <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-50 group-hover:text-blue-900 transition-colors">
                      {cat.icon}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2 leading-tight group-hover:text-blue-900 transition-colors">{cat.title}</h3>
                    <p className="text-sm text-slate-500 mt-auto font-medium">{cat.description}</p>
                  </button>
                ))}
                
                {filteredCategories.length > 0 && (
                  <button
                    className="bg-slate-50 border border-dashed border-slate-300 p-6 rounded-2xl text-left flex flex-col h-full hover:bg-slate-100 hover:border-slate-400 transition-colors animate-in fade-in slide-in-from-bottom-8 group"
                    style={{ animationDelay: `${filteredCategories.length * 50}ms`, animationFillMode: 'both' }}
                  >
                    <div className="w-12 h-12 bg-white text-slate-400 border border-slate-200 rounded-xl flex items-center justify-center mb-5 group-hover:text-slate-600 transition-colors">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2 leading-tight">Something else</h3>
                    <p className="text-sm text-slate-500 mt-auto font-medium">Custom legal correspondence</p>
                  </button>
                )}
                
                {filteredCategories.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    No matching situations found. Try a different search term or select "Something else".
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-in zoom-in-[0.98] fade-in duration-500">
                <div className="grid md:grid-cols-5 gap-6 lg:gap-8 items-start">
                  
                  {/* Left Column: Context & Education */}
                  <div className="md:col-span-3 space-y-6">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-8 sm:p-10">
                        <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-900 mb-4 leading-tight">
                          {selectedCategory?.context.headline}
                        </h3>
                        <p className="text-slate-600 text-lg leading-relaxed mb-8">
                          {selectedCategory?.context.body}
                        </p>
                        
                        <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100">
                          <h4 className="font-bold text-slate-900 mb-5 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-blue-600" />
                            How the attorney handles this:
                          </h4>
                          <ul className="space-y-4">
                            {selectedCategory?.context.processualSteps.map((step, i) => (
                              <li key={i} className="flex items-start gap-4 text-slate-700">
                                <span className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <span className="leading-relaxed">{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="bg-blue-900 text-white p-8">
                        <div className="flex items-start gap-4">
                          <div className="bg-blue-800 p-3 rounded-xl shrink-0">
                            <Scale className="w-6 h-6 text-blue-200" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-blue-300 uppercase tracking-wider mb-1">Why this approach works</div>
                            <div className="text-lg font-medium leading-snug">
                              {selectedCategory?.context.typicalOutcome}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Sticky Action Form */}
                  <div className="md:col-span-2 sticky top-24">
                    <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-slate-200 p-6 sm:p-8">
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Begin your intake</h3>
                        <p className="text-sm text-slate-500">Answer a few questions. Our attorneys handle the rest.</p>
                      </div>

                      <div className="space-y-4 mb-8">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex gap-4 items-center">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-blue-900" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">Step 1: The Facts</div>
                            <div className="text-xs text-slate-500">Takes ~5 minutes</div>
                          </div>
                        </div>
                        <div className="p-4 border border-slate-100 rounded-xl flex gap-4 items-center opacity-50">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <Scale className="w-5 h-5 text-slate-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">Step 2: Attorney Drafts</div>
                            <div className="text-xs text-slate-500">24-48 hours</div>
                          </div>
                        </div>
                        <div className="p-4 border border-slate-100 rounded-xl flex gap-4 items-center opacity-50">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-slate-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">Step 3: You Approve</div>
                            <div className="text-xs text-slate-500">Sent on law firm letterhead</div>
                          </div>
                        </div>
                      </div>

                      <button className="w-full bg-blue-900 hover:bg-blue-800 text-white px-6 py-4 rounded-xl text-base font-bold transition-all shadow-md flex items-center justify-center gap-2 group">
                        Start Now — First Letter Free
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                      <div className="mt-4 text-center text-xs text-slate-500 flex items-center justify-center gap-1">
                        <Shield className="w-3.5 h-3.5" /> Secure, confidential, and privileged
                      </div>
                    </div>
                  </div>
                  
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Trust & Authority Section */}
      <section id="authority" className="py-24 bg-slate-900 text-white px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6">
                The Difference
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-6 tracking-tight leading-[1.1]">
                Not a template.<br />
                <span className="text-blue-400">Real legal weight.</span>
              </h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                When you send a template downloaded from the internet, the recipient knows. It lacks jurisdiction-specific citations and the weight of a law firm's letterhead. We change that.
              </p>
              
              <ul className="space-y-5">
                {[
                  { title: "Custom Drafted", desc: "Written specifically for your exact factual scenario." },
                  { title: "California Specific", desc: "Cites relevant California statutes and recent case law." },
                  { title: "Law Firm Letterhead", desc: "Sent with the authority of a licensed legal practice." },
                  { title: "Attorney Signed", desc: "Reviewed and signed by an active State Bar member." }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="mt-1 bg-blue-900/50 p-1 rounded-full">
                      <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-100">{item.title}</div>
                      <div className="text-sm text-slate-400">{item.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="relative lg:translate-x-8">
              <div className="absolute -inset-4 bg-gradient-to-tr from-blue-600/30 to-slate-800/50 rounded-3xl blur-2xl"></div>
              <div className="relative bg-[#FAFAFA] text-slate-900 p-8 sm:p-10 rounded-2xl shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500 border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-slate-300 pb-6 mb-8 gap-4">
                  <div>
                    <div className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">SMITH & ASSOCIATES</div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Attorneys at Law</div>
                  </div>
                  <div className="text-left sm:text-right text-xs text-slate-500 font-medium">
                    123 Legal Way, Suite 400<br />
                    Los Angeles, CA 90001<br />
                    State Bar No. #284751
                  </div>
                </div>
                
                <div className="space-y-4 opacity-30 select-none">
                  <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-800 rounded w-1/4"></div>
                  <div className="space-y-3 pt-6">
                    <div className="h-3 bg-slate-800 rounded w-full"></div>
                    <div className="h-3 bg-slate-800 rounded w-full"></div>
                    <div className="h-3 bg-slate-800 rounded w-5/6"></div>
                  </div>
                  <div className="space-y-3 pt-4">
                    <div className="h-3 bg-slate-800 rounded w-full"></div>
                    <div className="h-3 bg-slate-800 rounded w-4/5"></div>
                  </div>
                </div>
                
                <div className="mt-12 pt-6 border-t border-slate-300 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-blue-900" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Attorney Approved</div>
                      <div className="text-xs text-slate-500">Ready for delivery</div>
                    </div>
                  </div>
                  <div className="w-32 h-12 flex items-center justify-center opacity-60 italic font-serif text-slate-700 text-lg tracking-wide">J. Harrison, Esq.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 bg-white px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">Simple process. Powerful results.</h2>
            <p className="text-lg text-slate-600">We've streamlined legal action so you can focus on moving forward.</p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-12 relative">
            <div className="hidden sm:block absolute top-8 left-[16.66%] right-[16.66%] h-0.5 bg-slate-100 -z-10"></div>
            
            {[
              {
                step: "1",
                title: "Complete Intake",
                desc: "Answer plain-English questions about what happened. No legal jargon required."
              },
              {
                step: "2",
                title: "Attorney Drafts",
                desc: "We research the law, draft the letter, and an attorney reviews every word."
              },
              {
                step: "3",
                title: "Approve & Send",
                desc: "You review the draft. Once approved, it's sent on official firm letterhead."
              }
            ].map((s, i) => (
              <div key={i} className="bg-white text-center relative group">
                <div className="w-16 h-16 mx-auto bg-slate-50 border-4 border-white shadow-md rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-900 group-hover:text-white transition-colors duration-300">
                  <span className="text-xl font-black">{s.step}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{s.title}</h3>
                <p className="text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-[#F8FAFC] px-6 border-t border-slate-200">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">Transparent pricing</h2>
          <p className="text-lg text-slate-600 mb-12">No hourly billing. No expensive retainers. Just high-quality legal letters.</p>
          
          <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col sm:flex-row text-left">
            <div className="p-8 sm:p-12 sm:w-[60%] border-b sm:border-b-0 sm:border-r border-slate-100">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
                Single Letter
              </div>
              <h3 className="text-3xl font-extrabold text-slate-900 mb-2">Flat Rate Action</h3>
              <p className="text-slate-500 mb-8 font-medium">Perfect for resolving a specific, isolated issue quickly.</p>
              
              <ul className="space-y-4 mb-8">
                {[
                  "Drafted by legal professionals",
                  "Reviewed & signed by licensed attorney",
                  "California-specific legal citations",
                  "PDF delivery ready to send",
                  "1 free revision for factual accuracy"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8 sm:p-12 sm:w-[40%] bg-slate-50 flex flex-col justify-center items-center text-center">
              <div className="text-slate-500 font-semibold uppercase tracking-wider text-sm mb-2">Pay once</div>
              <div className="text-6xl font-black text-slate-900 mb-6 tracking-tight">$200</div>
              <button onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }} className="w-full bg-blue-900 hover:bg-blue-800 text-white py-4 rounded-xl font-bold shadow-md transition-colors text-lg">
                Start Intake
              </button>
              <div className="text-xs text-slate-500 mt-5 font-medium flex items-center justify-center gap-1">
                <Shield className="w-3.5 h-3.5" /> 100% Satisfaction Guarantee
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-800/50">
            <a href="/" className="flex items-center gap-2">
              <img src="/__mockup/images/logo-full.png" alt="Talk to My Lawyer" className="h-8 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
            </a>
            <div className="flex gap-6 text-sm font-medium">
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Attorney Guidelines</a>
            </div>
          </div>
          <div className="mt-8 text-xs text-slate-600 leading-relaxed max-w-4xl">
            <p className="mb-4">
              © {new Date().getFullYear()} Talk to My Lawyer. A Legal Technology Service.
            </p>
            <p>
              Disclaimer: Talk to My Lawyer provides a platform for legal information and self-help. The information provided by Talk to My Lawyer along with the content on our website related to legal matters ("Legal Information") is provided for your private use and does not constitute legal advice. We do not review any information you provide us for legal accuracy or sufficiency, draw legal conclusions, provide opinions about your selection of forms, or apply the law to the facts of your situation. If you need legal advice for your specific problem, you should consult with a licensed attorney in your area.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
