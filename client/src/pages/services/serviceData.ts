export interface ServiceFAQ {
  q: string;
  a: string;
}

export interface ServiceUseCase {
  title: string;
  description: string;
}

export interface RelatedArticle {
  slug: string;
  title: string;
  description: string;
}

export interface ServiceData {
  slug: string;
  title: string;
  h1: string;
  keyword: string;
  metaTitle: string;
  metaDescription: string;
  heroDescription: string;
  useCases: ServiceUseCase[];
  faqs: ServiceFAQ[];
  relatedArticles: RelatedArticle[];
  blogCategory: string;
}

export const SERVICES: ServiceData[] = [
  {
    slug: "demand-letter",
    title: "Demand Letter Service",
    h1: "Professional Demand Letter Service — Attorney-Reviewed",
    keyword: "demand letter service",
    metaTitle: "Demand Letter Service — Attorney-Reviewed | Talk to My Lawyer",
    metaDescription: "Get a professional demand letter drafted and reviewed by a licensed attorney. Starting at $200. Delivered in minutes, not weeks.",
    heroDescription: "Stop chasing payments with phone calls and emails. A professionally drafted, attorney-reviewed demand letter puts the other party on formal notice — and creates a clear paper trail if you need to escalate.",
    useCases: [
      { title: "Unpaid Debts", description: "Recover money owed to you from individuals or businesses who have failed to pay on time." },
      { title: "Contractor Disputes", description: "Address contractors who failed to complete work, delivered substandard results, or overcharged." },
      { title: "Security Deposits", description: "Demand the return of a wrongfully withheld security deposit from a landlord." },
      { title: "Unpaid Invoices", description: "Collect on outstanding invoices from clients or customers who are past due." },
      { title: "Personal Loans", description: "Formally demand repayment of money lent to friends, family, or acquaintances." },
    ],
    faqs: [
      { q: "What is a demand letter?", a: "A demand letter is a formal written notice sent to another party requesting specific action — usually payment of a debt or resolution of a dispute. It serves as a clear, documented record that you attempted to resolve the issue before pursuing legal action." },
      { q: "How much does a demand letter cost?", a: "Our demand letter service starts at $200 for a single letter, which includes attorney review and approval. Compare this to traditional attorneys who charge $300–$500+ per hour." },
      { q: "How long does it take to receive my demand letter?", a: "Most demand letters are drafted within minutes of submission. Attorney review typically completes within 24 hours during business days." },
      { q: "Is a demand letter legally binding?", a: "A demand letter itself is not legally binding, but it creates a formal paper trail and demonstrates that you made a good-faith effort to resolve the dispute. Courts look favorably on parties who attempted resolution before filing suit." },
      { q: "What happens if the other party ignores my demand letter?", a: "If the other party does not respond or comply, the demand letter serves as evidence of your attempt to resolve the matter. You may then choose to escalate to small claims court or formal litigation with the support of a licensed attorney." },
    ],
    relatedArticles: [
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
    ],
    blogCategory: "demand-letters",
  },
  {
    slug: "cease-and-desist",
    title: "Cease and Desist Letter Service",
    h1: "Cease and Desist Letter Service — Stop Harmful Activity",
    keyword: "cease and desist letter service",
    metaTitle: "Cease & Desist Letter Service | Talk to My Lawyer",
    metaDescription: "Send a professional cease and desist letter to stop harassment, IP theft, or defamation. Attorney-reviewed, starting at $200.",
    heroDescription: "When someone is infringing on your rights, harassing you, or engaging in harmful activity, a formal cease and desist letter puts them on notice. Our attorney-reviewed letters carry weight and create a documented record.",
    useCases: [
      { title: "IP Theft", description: "Stop unauthorized use of your intellectual property, including copyrighted content, trade secrets, or proprietary materials." },
      { title: "Harassment", description: "Formally demand that an individual or entity cease harassing behavior, whether online or offline." },
      { title: "Defamation", description: "Address false statements being made about you or your business that damage your reputation." },
      { title: "Unauthorized Content Use", description: "Stop websites, social media accounts, or businesses from using your content without permission." },
      { title: "Trademark Infringement", description: "Protect your brand by demanding that others stop using confusingly similar names, logos, or branding." },
    ],
    faqs: [
      { q: "What is a cease and desist letter?", a: "A cease and desist letter is a formal document demanding that a person or entity stop a specific activity that violates your rights. It serves as a first step before potential legal action." },
      { q: "Is a cease and desist letter legally enforceable?", a: "While a cease and desist letter is not a court order, it creates a documented record of your demand and demonstrates that you put the other party on formal notice. This can strengthen your position if you need to pursue legal action." },
      { q: "How quickly can I get a cease and desist letter?", a: "Our drafting system generates your letter within minutes. Attorney review typically completes within 24 hours during business days." },
      { q: "What if the person ignores my cease and desist letter?", a: "If the harmful activity continues after sending the letter, you have a documented record that you attempted resolution. This can support further legal action such as filing for an injunction or pursuing damages in court." },
      { q: "Can I send a cease and desist for online harassment?", a: "Yes. Our cease and desist letters can address online harassment, cyberbullying, defamatory social media posts, and unauthorized use of your content or likeness online." },
    ],
    relatedArticles: [
      { slug: "cease-and-desist-letters-explained", title: "Cease and Desist Letters Explained", description: "Understanding when and how to use cease and desist letters to protect your rights." },
    ],
    blogCategory: "cease-and-desist",
  },
  {
    slug: "security-deposit-letter",
    title: "Security Deposit Demand Letter",
    h1: "Security Deposit Demand Letter — Get Your Deposit Back",
    keyword: "security deposit demand letter",
    metaTitle: "Security Deposit Demand Letter | Talk to My Lawyer",
    metaDescription: "Get your security deposit back with a professional demand letter. Attorney-reviewed, California-focused. Starting at $200.",
    heroDescription: "California law requires landlords to return security deposits within 21 days of move-out. If your landlord is withholding your deposit without proper justification, a formal demand letter is often the fastest way to get your money back.",
    useCases: [
      { title: "Landlord Won't Return Deposit", description: "Your landlord has not returned your security deposit within the legally required timeframe after you moved out." },
      { title: "Wrongful Deductions", description: "Your landlord made deductions for normal wear and tear, pre-existing damage, or charges not supported by documentation." },
      { title: "Missed Return Deadline", description: "California requires landlords to return deposits within 21 days — if they missed this deadline, you have strong grounds for recovery." },
      { title: "Excessive Cleaning Charges", description: "Your landlord charged unreasonable cleaning fees that exceed the actual cost of returning the unit to its original condition." },
      { title: "No Itemized Statement", description: "California law requires landlords to provide an itemized statement of deductions. Failure to provide one can entitle you to the full deposit amount." },
    ],
    faqs: [
      { q: "How long does a landlord have to return my security deposit in California?", a: "Under California Civil Code § 1950.5, landlords must return the security deposit — or provide an itemized statement of deductions — within 21 calendar days after the tenant vacates the property." },
      { q: "What can a landlord legally deduct from my security deposit?", a: "Landlords may only deduct for unpaid rent, cleaning the unit to the condition it was in at move-in (beyond normal wear and tear), and repair of damages caused by the tenant beyond normal wear and tear." },
      { q: "Can I recover more than my deposit amount?", a: "Yes. Under California law, if a landlord acts in bad faith by wrongfully withholding a security deposit, the tenant may be awarded up to twice the amount of the security deposit in addition to actual damages." },
      { q: "Do I need a lawyer to get my security deposit back?", a: "Not necessarily. A professionally drafted demand letter is often enough to prompt a landlord to return the deposit. Our service provides an attorney-reviewed letter that cites relevant California law, which adds significant weight to your demand." },
      { q: "What if my landlord still won't return my deposit after the letter?", a: "If the landlord does not comply, you can file a claim in California Small Claims Court for amounts up to $10,000. Your demand letter serves as evidence that you attempted to resolve the matter before going to court." },
    ],
    relatedArticles: [
      { slug: "how-to-get-your-security-deposit-back", title: "How to Get Your Security Deposit Back", description: "Learn about California tenant rights and the process for recovering your security deposit." },
    ],
    blogCategory: "demand-letters",
  },
  {
    slug: "breach-of-contract-letter",
    title: "Breach of Contract Letter",
    h1: "Breach of Contract Letter — Enforce Your Agreement",
    keyword: "breach of contract letter",
    metaTitle: "Breach of Contract Letter | Talk to My Lawyer",
    metaDescription: "Enforce your agreement with a professional breach of contract letter. Attorney-reviewed, California-focused. Starting at $200.",
    heroDescription: "When the other party fails to uphold their end of a contract, a formal breach of contract letter puts them on notice and demands compliance. Our attorney-reviewed letters cite relevant California contract law and clearly outline the breach and demanded remedy.",
    useCases: [
      { title: "Vendor Non-Performance", description: "A vendor or supplier failed to deliver goods or services as agreed upon in your contract." },
      { title: "Service Agreement Violations", description: "A service provider is not meeting the terms, quality standards, or timelines specified in your agreement." },
      { title: "Partnership Breaches", description: "A business partner is violating the terms of your partnership agreement, operating agreement, or joint venture." },
      { title: "Non-Compete Violations", description: "A former employee or business partner is violating a non-compete or non-solicitation clause." },
      { title: "Payment Terms Violations", description: "The other party is not adhering to the payment schedule or terms outlined in your contract." },
    ],
    faqs: [
      { q: "What constitutes a breach of contract in California?", a: "A breach of contract occurs when one party fails to perform any term of a contract — written or oral — without a legitimate legal excuse. This can include failing to deliver goods, not completing services, or missing payment deadlines." },
      { q: "Do I need a written contract to send a breach of contract letter?", a: "While written contracts are easier to enforce, California recognizes oral contracts for most purposes. However, certain agreements (such as those involving real estate or agreements lasting more than one year) must be in writing under the Statute of Frauds." },
      { q: "What should a breach of contract letter include?", a: "An effective breach of contract letter should identify the contract, describe the specific breach, cite relevant legal provisions, state the demanded remedy (performance or damages), and set a reasonable deadline for compliance." },
      { q: "What remedies can I demand for a breach of contract?", a: "Common remedies include specific performance (demanding the other party fulfill their obligations), compensatory damages (monetary compensation for losses), and in some cases, consequential damages for foreseeable losses resulting from the breach." },
      { q: "How is a breach of contract letter different from a demand letter?", a: "A breach of contract letter specifically addresses the violation of contractual terms and demands compliance or remedy. A demand letter is broader and can address any dispute. Our service tailors the letter type to your specific situation." },
    ],
    relatedArticles: [
      { slug: "breach-of-contract-what-to-do", title: "Breach of Contract: What to Do Next", description: "A step-by-step guide to handling a breach of contract in California." },
    ],
    blogCategory: "contract-disputes",
  },
  {
    slug: "employment-dispute-letter",
    title: "Employment Dispute Letter",
    h1: "Employment Dispute Letter — Protect Your Workplace Rights",
    keyword: "employment dispute letter",
    metaTitle: "Employment Dispute Letter | Talk to My Lawyer",
    metaDescription: "Protect your workplace rights with a professional employment dispute letter. Attorney-reviewed, California-focused. Starting at $200.",
    heroDescription: "California has some of the strongest employee protections in the country. If your employer has violated your rights — whether through unpaid wages, wrongful termination, or workplace harassment — a formal letter puts them on notice and creates a critical paper trail.",
    useCases: [
      { title: "Unpaid Wages", description: "Your employer owes you wages, overtime pay, commissions, or final paychecks that have not been paid as required by California law." },
      { title: "Wrongful Termination", description: "You were fired in violation of your employment contract, public policy, or California's anti-discrimination laws." },
      { title: "Hostile Work Environment", description: "You are experiencing workplace harassment, bullying, or discriminatory conduct that creates a hostile work environment." },
      { title: "Retaliation", description: "Your employer took adverse action against you for reporting violations, filing complaints, or exercising your legal rights." },
      { title: "Meal and Rest Break Violations", description: "Your employer is not providing the meal and rest breaks required by California Labor Code." },
    ],
    faqs: [
      { q: "What are my rights as an employee in California?", a: "California employees are protected by extensive labor laws covering minimum wage, overtime pay, meal and rest breaks, anti-discrimination protections, whistleblower protections, and more. The California Labor Code and Fair Employment and Housing Act (FEHA) provide strong safeguards." },
      { q: "Can I send my employer a formal letter about unpaid wages?", a: "Yes. A formal demand letter for unpaid wages puts your employer on notice and creates a documented record. California law requires employers to pay all wages earned, and penalties can be significant for non-compliance." },
      { q: "What is wrongful termination in California?", a: "Wrongful termination occurs when an employer fires an employee in violation of state or federal law. This includes termination based on discrimination, retaliation for reporting violations, breach of an employment contract, or violation of public policy." },
      { q: "Do I need to file a complaint with a government agency first?", a: "It depends on the type of claim. For discrimination and harassment claims, you typically need to file with the California Civil Rights Department (CRD) or the EEOC first. For wage claims, you can file with the Labor Commissioner or pursue direct legal action. A demand letter can be sent at any time." },
      { q: "How can a demand letter help with an employment dispute?", a: "A demand letter formally notifies your employer of the violation, creates a documented paper trail, and often prompts resolution without the need for costly litigation. Many employers take formal legal correspondence seriously and prefer to settle rather than face a lawsuit." },
    ],
    relatedArticles: [
      { slug: "california-employment-rights", title: "California Employment Rights: What You Need to Know", description: "An overview of employee protections under California labor law." },
    ],
    blogCategory: "demand-letters",
  },
];

export const SERVICE_SLUGS = SERVICES.map(s => s.slug);

export function getServiceBySlug(slug: string): ServiceData | undefined {
  return SERVICES.find(s => s.slug === slug);
}

export const CATEGORY_TO_SERVICE: Record<string, ServiceData> = {};
for (const s of SERVICES) {
  CATEGORY_TO_SERVICE[s.blogCategory] = s;
}
