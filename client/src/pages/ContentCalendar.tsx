import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Calendar, Target, LinkIcon, ArrowRight, FileText, Megaphone, Mail, Twitter, Linkedin } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";
import Footer from "@/components/shared/Footer";

const CONTENT_BRIEFS = [
  {
    month: "Month 1",
    posts: [
      {
        title: "Why Demand Letters Have a 60% Settlement Rate (And How to Get One Right)",
        targetKeyword: "demand letter settlement rate",
        searchIntent: "Informational — people researching whether demand letters work",
        outline: [
          "What the Research Says: 60% vs. 36% Settlement Rates",
          "What Makes a Demand Letter Effective",
          "The Role of Attorney Review in Demand Letter Success",
          "Common Mistakes That Weaken Your Demand Letter",
          "How to Get a Professional Demand Letter for $200",
        ],
        internalLinks: ["/services/demand-letter", "/pricing"],
        cta: "Get your attorney-reviewed demand letter today",
        repurpose: {
          linkedin: "Did you know demand letters settle disputes 60% of the time? Here's why — and the 3 mistakes that tank your chances.",
          twitter: "THREAD: Demand letters have a 60% settlement rate. But only if you avoid these 3 common mistakes. Here's what the data shows →",
          newsletter: "This week's insight: The single most effective tool for resolving disputes before court — and it costs less than you think.",
        },
      },
      {
        title: "Cease and Desist Letter: When You Need One and What It Should Say",
        targetKeyword: "cease and desist letter",
        searchIntent: "Transactional — people who need to send a cease and desist",
        outline: [
          "What Is a Cease and Desist Letter?",
          "5 Situations That Require a Cease and Desist",
          "What Your Cease and Desist Letter Must Include",
          "Free Templates vs. Professional Drafting: What's the Difference?",
          "How to Get an Attorney-Reviewed Cease and Desist in 24 Hours",
        ],
        internalLinks: ["/services/cease-and-desist", "/faq"],
        cta: "Send a professional cease and desist letter",
        repurpose: {
          linkedin: "Someone's infringing on your rights? A well-crafted cease and desist letter resolves 60%+ of disputes before they reach court. Here's what yours needs to include.",
          twitter: "If someone is harassing, defaming, or infringing on your rights — a cease and desist letter is your first line of defense. Here's what it needs to include 🧵",
          newsletter: "Featured service: Cease and desist letters — when you need one, and how to make yours legally effective.",
        },
      },
      {
        title: "How Much Does a Legal Letter Cost? A Pricing Guide for 2025",
        targetKeyword: "legal letter cost",
        searchIntent: "Commercial — comparing prices for legal letter services",
        outline: [
          "Traditional Attorney Fees for Legal Letters ($500–$2,000+)",
          "Online Legal Services: Pricing Comparison",
          "What You Should Expect to Pay in 2025",
          "Hidden Costs to Watch Out For",
          "The $200 Attorney-Reviewed Alternative",
        ],
        internalLinks: ["/pricing", "/services/demand-letter"],
        cta: "Get your first letter free — no credit card required",
        repurpose: {
          linkedin: "I surveyed legal letter costs across 10 services. Traditional attorneys: $500–$2,000. Online templates: free but risky. There's a third option most people don't know about.",
          twitter: "How much should a legal letter cost? I compared 10 services. Here's the honest breakdown 🧵",
          newsletter: "Stat of the week: The average attorney charges $500–$2,000 for a single demand letter. Here's how to get the same quality for $200.",
        },
      },
      {
        title: "Security Deposit Demand Letter: How to Get Your Money Back in California",
        targetKeyword: "security deposit demand letter California",
        searchIntent: "Transactional — California tenants who want their deposit back",
        outline: [
          "California Security Deposit Laws: Your Rights as a Tenant",
          "When to Send a Security Deposit Demand Letter",
          "What Your Demand Letter Must Include Under CA Civil Code §1950.5",
          "Timeline: How Long Your Landlord Has to Respond",
          "What to Do If Your Landlord Ignores Your Letter",
        ],
        internalLinks: ["/services/security-deposit-letter", "/services/demand-letter"],
        cta: "Get your security deposit demand letter drafted today",
        repurpose: {
          linkedin: "California landlords must return your security deposit within 21 days. If they don't, here's exactly what to do — step by step.",
          twitter: "Your California landlord owes you your security deposit within 21 days. Here's the legal process to get it back (and the letter that makes it happen) 🧵",
          newsletter: "Know your rights: California security deposit laws and how to enforce them with a professional demand letter.",
        },
      },
    ],
  },
  {
    month: "Month 2",
    posts: [
      {
        title: "Breach of Contract Letter: A Step-by-Step Guide for Small Business Owners",
        targetKeyword: "breach of contract letter",
        searchIntent: "Transactional — business owners dealing with a contract breach",
        outline: [
          "What Constitutes a Breach of Contract?",
          "Why a Formal Letter Is Your Best First Step",
          "Essential Elements of a Breach of Contract Letter",
          "Sample Language and Legal Framework",
          "When to Escalate Beyond a Letter",
        ],
        internalLinks: ["/services/breach-of-contract-letter", "/pricing"],
        cta: "Draft your breach of contract letter with attorney review",
        repurpose: {
          linkedin: "A contractor didn't deliver. A vendor broke their agreement. Before you call a lawyer, here's the letter that resolves 60% of contract disputes.",
          twitter: "Someone broke a contract with you? Don't panic. Here's the step-by-step process to protect yourself (most people skip step 1) 🧵",
          newsletter: "This week: How to handle a breach of contract — the letter that resolves most disputes before they become lawsuits.",
        },
      },
      {
        title: "Employment Dispute Letter: How to Protect Your Rights at Work",
        targetKeyword: "employment dispute letter",
        searchIntent: "Transactional — employees facing workplace disputes",
        outline: [
          "Types of Employment Disputes That Warrant a Legal Letter",
          "Wrongful Termination: What Qualifies and What Doesn't",
          "Wage Theft and Unpaid Overtime: Your Legal Options",
          "How to Document Your Employment Dispute",
          "The Power of a Formal Employment Dispute Letter",
        ],
        internalLinks: ["/services/employment-dispute-letter", "/faq"],
        cta: "Get your employment dispute letter drafted today",
        repurpose: {
          linkedin: "Workplace dispute? Before hiring an attorney for $5,000+, there's a step most people skip that resolves the majority of employment disputes.",
          twitter: "Wrongful termination? Unpaid wages? Here's the step most employees skip — and it resolves the majority of disputes 🧵",
          newsletter: "Featured topic: Employment disputes and the formal letter that protects your rights.",
        },
      },
      {
        title: "Personal Injury Demand Letter: How to Maximize Your Settlement",
        targetKeyword: "personal injury demand letter",
        searchIntent: "Transactional — people injured who want to pursue a claim",
        outline: [
          "What Is a Personal Injury Demand Letter?",
          "Why Insurance Companies Take Demand Letters Seriously",
          "How to Calculate Your Demand Amount",
          "What to Include: Medical Records, Lost Wages, Pain and Suffering",
          "Common Mistakes That Reduce Your Settlement",
        ],
        internalLinks: ["/services/personal-injury-demand-letter", "/pricing"],
        cta: "Get your personal injury demand letter drafted with attorney review",
        repurpose: {
          linkedin: "Insurance companies lowball claims without formal demand letters. Here's how a properly drafted letter can increase your settlement by 2-3x.",
          twitter: "Insurance company offered you a lowball settlement? A formal demand letter changes the entire dynamic. Here's how 🧵",
          newsletter: "Stat of the week: Personal injury demand letters increase average settlement offers significantly. Here's what yours needs to include.",
        },
      },
      {
        title: "Do Demand Letters Actually Work? What the Data Says",
        targetKeyword: "do demand letters work",
        searchIntent: "Informational — people evaluating whether to send a demand letter",
        outline: [
          "The Settlement Rate Data: 60% vs. 36%",
          "Why Recipients Take Demand Letters Seriously",
          "Types of Disputes Where Demand Letters Are Most Effective",
          "When a Demand Letter Won't Work",
          "How to Maximize Your Demand Letter's Impact",
        ],
        internalLinks: ["/services/demand-letter", "/blog"],
        cta: "Start your free demand letter today",
        repurpose: {
          linkedin: "\"Do demand letters actually work?\" I get asked this a lot. Here's what the data says — and it might surprise you.",
          twitter: "\"Do demand letters actually work?\" Short answer: yes, 60% of the time. Long answer: it depends on these 4 factors 🧵",
          newsletter: "This week's deep dive: The research behind demand letter effectiveness and when they work best.",
        },
      },
    ],
  },
  {
    month: "Month 3",
    posts: [
      {
        title: "Small Claims Court vs. Demand Letter: Which Should You Choose?",
        targetKeyword: "small claims court vs demand letter",
        searchIntent: "Informational — people weighing their legal options",
        outline: [
          "Small Claims Court: Costs, Timeline, and Process",
          "Demand Letters: Costs, Timeline, and Success Rate",
          "When to Send a Demand Letter First",
          "When to Go Straight to Small Claims Court",
          "How a Demand Letter Strengthens Your Court Case",
        ],
        internalLinks: ["/services/small-claims-demand-letter", "/services/demand-letter"],
        cta: "Start with a demand letter — it strengthens your case either way",
        repurpose: {
          linkedin: "Small claims court costs $75+ in filing fees and takes months. A demand letter costs $200, takes 24 hours, and resolves 60% of disputes. Here's when to use each.",
          twitter: "Small claims court vs. demand letter — which should you choose? Here's the decision framework I recommend 🧵",
          newsletter: "This week: Small claims court vs. demand letters — a cost and timeline comparison.",
        },
      },
      {
        title: "Intellectual Property Infringement: How to Protect Your Work",
        targetKeyword: "intellectual property infringement letter",
        searchIntent: "Transactional — creators and businesses dealing with IP theft",
        outline: [
          "Types of Intellectual Property Infringement",
          "Why a Formal Letter Is Your First Line of Defense",
          "What to Include in an IP Infringement Letter",
          "DMCA Takedown vs. IP Infringement Letter",
          "Escalation: When to Involve an IP Attorney",
        ],
        internalLinks: ["/services/intellectual-property-infringement-letter", "/services/cease-and-desist"],
        cta: "Protect your intellectual property with a professional letter",
        repurpose: {
          linkedin: "Someone stole your content, design, or trademark? Before spending $10,000 on an IP attorney, here's the letter that stops infringement 80% of the time.",
          twitter: "Found someone using your work without permission? Here's the step-by-step process to stop IP infringement (most people start at step 3 — don't) 🧵",
          newsletter: "Featured topic: Protecting your intellectual property with a formal infringement letter.",
        },
      },
      {
        title: "How Technology Is Changing Legal Services for Individuals",
        targetKeyword: "affordable legal services",
        searchIntent: "Informational — people curious about modern legal tools",
        outline: [
          "The Problem: Legal Services Are Too Expensive for Most People",
          "How Technology Is Making Legal Help Accessible",
          "Structured Drafting + Attorney Review: The Best of Both Worlds",
          "What Automated Drafting Can and Can't Do in Legal Services",
          "The Future of Affordable Legal Assistance",
        ],
        internalLinks: ["/", "/pricing", "/faq"],
        cta: "Experience structured legal letter drafting with attorney review",
        repurpose: {
          linkedin: "Traditional legal letters cost $500–$2,000 and take weeks. Structured drafting + attorney review delivers the same quality in 24 hours for $200. Here's how.",
          twitter: "Technology is making legal services accessible to everyone. Here's how the industry is changing — and what it means for you 🧵",
          newsletter: "The future of legal services: How structured drafting + attorney review is making professional legal letters affordable for everyone.",
        },
      },
      {
        title: "The Complete Guide to Writing an Effective Demand Letter",
        targetKeyword: "how to write a demand letter",
        searchIntent: "Informational — people wanting to understand demand letter structure",
        outline: [
          "What Is a Demand Letter and Why Does It Matter?",
          "The 7 Essential Elements of an Effective Demand Letter",
          "Tone and Language: Professional vs. Aggressive",
          "Common Demand Letter Mistakes to Avoid",
          "DIY vs. Professional: Making the Right Choice",
        ],
        internalLinks: ["/services/demand-letter", "/blog"],
        cta: "Get a professionally drafted demand letter for $200",
        repurpose: {
          linkedin: "I've reviewed hundreds of demand letters. The effective ones all have these 7 elements in common. The ineffective ones usually miss #3.",
          twitter: "Writing a demand letter? It needs these 7 elements to be effective. Most DIY letters miss at least 2 of them 🧵",
          newsletter: "This week: The 7 elements every effective demand letter must include — and the mistakes that weaken your case.",
        },
      },
    ],
  },
];

export default function ContentCalendar() {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Content Calendar — 3-Month Blog Strategy | Talk to My Lawyer</title>
        <meta name="description" content="12-topic content calendar with keyword targets, outlines, internal linking strategy, and social media repurposing for Talk to My Lawyer blog." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between">
          <BrandLogo href="/" size="sm" hideWordmarkOnMobile />
          <div className="flex items-center gap-3">
            <Link href="/blog" className="text-sm font-medium text-slate-600 hover:text-slate-900" data-testid="link-blog">Blog</Link>
            <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800" data-testid="link-home">Home</Link>
          </div>
        </div>
      </nav>

      <section className="pt-24 pb-12 px-4" style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 40%, #dbeafe 100%)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <Calendar className="w-4 h-4" />
            Content Strategy
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 leading-tight" data-testid="text-calendar-title">
            3-Month Content Calendar
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            12 high-intent blog topics with keyword targets, outlines, internal linking strategy, and a content repurposing waterfall for social media and newsletter.
          </p>
        </div>
      </section>

      <main className="py-12 px-4">
        <div className="max-w-5xl mx-auto space-y-16">
          {CONTENT_BRIEFS.map((month) => (
            <section key={month.month}>
              <h2 className="text-2xl font-bold text-slate-900 mb-8 pb-3 border-b-2 border-blue-200 flex items-center gap-3" data-testid={`text-month-${month.month.replace(" ", "-").toLowerCase()}`}>
                <Calendar className="w-6 h-6 text-blue-600" />
                {month.month}
              </h2>
              <div className="space-y-8">
                {month.posts.map((post, idx) => (
                  <article key={idx} className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 hover:border-blue-200 hover:shadow-md transition-all" data-testid={`card-brief-${month.month.replace(" ", "-").toLowerCase()}-${idx}`}>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">{post.title}</h3>

                    <div className="flex flex-wrap gap-3 mb-4">
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">
                        <Target className="w-3 h-3" />
                        {post.targetKeyword}
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1 rounded-full">
                        <FileText className="w-3 h-3" />
                        {post.searchIntent}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Article Outline (H2s)
                        </h4>
                        <ol className="space-y-1.5">
                          {post.outline.map((h2, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-blue-500 font-bold text-xs mt-0.5">{i + 1}.</span>
                              {h2}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                          <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                          Internal Links
                        </h4>
                        <ul className="space-y-1">
                          {post.internalLinks.map((link, i) => (
                            <li key={i} className="text-sm text-blue-600">{link}</li>
                          ))}
                        </ul>

                        <h4 className="text-sm font-semibold text-slate-700 mb-2 mt-4 flex items-center gap-1.5">
                          <Megaphone className="w-3.5 h-3.5 text-blue-600" />
                          CTA
                        </h4>
                        <p className="text-sm text-slate-600">{post.cta}</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Content Repurposing Waterfall</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 mb-1.5">
                            <Linkedin className="w-3 h-3" /> LinkedIn
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{post.repurpose.linkedin}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                            <Twitter className="w-3 h-3" /> X / Twitter
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{post.repurpose.twitter}</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1.5">
                            <Mail className="w-3 h-3" /> Newsletter
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{post.repurpose.newsletter}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <section className="py-16 px-4 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-2xl mx-auto text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Execute This Strategy?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Start creating content that drives high-intent traffic and converts readers into customers.
          </p>
          <Link href="/blog" className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-8 py-3 rounded-xl font-semibold transition-colors" data-testid="link-view-blog">
            View Blog <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
