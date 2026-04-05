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
    metaDescription: "Get a professional demand letter drafted and reviewed by a licensed attorney. Starting at $299. Delivered in minutes, not weeks.",
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
      { q: "How much does a demand letter cost?", a: "Our demand letter service starts at $299 for a single letter, which includes attorney review and approval. Compare this to traditional attorneys who charge $300–$500+ per hour." },
      { q: "How long does it take to receive my demand letter?", a: "Most demand letters are drafted within minutes of submission. Attorney review typically completes within 24 hours during business days." },
      { q: "Is a demand letter legally binding?", a: "A demand letter itself is not legally binding, but it creates a formal paper trail and demonstrates that you made a good-faith effort to resolve the dispute. Courts look favorably on parties who attempted resolution before filing suit." },
      { q: "What happens if the other party ignores my demand letter?", a: "If the other party does not respond or comply, the demand letter serves as evidence of your attempt to resolve the matter. You may then choose to escalate to small claims court or formal litigation with the support of a licensed attorney." },
    ],
    relatedArticles: [
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
      { slug: "how-much-does-a-demand-letter-cost", title: "How Much Does a Demand Letter Cost?", description: "Compare demand letter costs across DIY, online services, and traditional attorneys." },
      { slug: "demand-letter-vs-lawsuit", title: "Demand Letter vs. Lawsuit", description: "When a letter is enough and when you need to go to court." },
      { slug: "how-to-collect-unpaid-invoices-california", title: "How to Collect Unpaid Invoices in California", description: "Step-by-step guide to recovering unpaid invoices using demand letters and small claims court." },
    ],
    blogCategory: "demand-letters",
  },
  {
    slug: "cease-and-desist",
    title: "Cease and Desist Letter Service",
    h1: "Cease and Desist Letter Service — Stop Harmful Activity",
    keyword: "cease and desist letter service",
    metaTitle: "Cease & Desist Letter Service | Talk to My Lawyer",
    metaDescription: "Send a professional cease and desist letter to stop harassment, IP theft, or defamation. Attorney-reviewed, starting at $299.",
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
      { slug: "how-to-stop-online-harassment-legally", title: "How to Stop Online Harassment Legally", description: "Legal options for dealing with cyberbullying, defamation, and online stalking in California." },
      { slug: "trademark-infringement-cease-desist-guide", title: "Trademark Infringement: Cease & Desist Guide", description: "How to protect your brand with a cease and desist letter for trademark violations." },
    ],
    blogCategory: "cease-and-desist",
  },
  {
    slug: "security-deposit-letter",
    title: "Security Deposit Demand Letter",
    h1: "Security Deposit Demand Letter — Get Your Deposit Back",
    keyword: "security deposit demand letter",
    metaTitle: "Security Deposit Demand Letter | Talk to My Lawyer",
    metaDescription: "Get your security deposit back with a professional demand letter. Attorney-reviewed, California-focused. Starting at $299.",
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
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
      { slug: "california-landlord-tenant-rights-guide", title: "California Landlord-Tenant Rights Guide", description: "Comprehensive guide to tenant protections and landlord obligations under California law." },
    ],
    blogCategory: "landlord-tenant",
  },
  {
    slug: "breach-of-contract-letter",
    title: "Breach of Contract Letter",
    h1: "Breach of Contract Letter — Enforce Your Agreement",
    keyword: "breach of contract letter",
    metaTitle: "Breach of Contract Letter | Talk to My Lawyer",
    metaDescription: "Enforce your agreement with a professional breach of contract letter. Attorney-reviewed, California-focused. Starting at $299.",
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
      { slug: "how-to-write-breach-of-contract-letter", title: "How to Write a Breach of Contract Letter", description: "Step-by-step guide to writing an effective breach of contract letter." },
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
      { slug: "non-compete-agreement-california-guide", title: "Non-Compete Agreements in California", description: "What you need to know about non-compete enforceability under California law." },
    ],
    blogCategory: "contract-disputes",
  },
  {
    slug: "employment-dispute-letter",
    title: "Employment Dispute Letter",
    h1: "Employment Dispute Letter — Protect Your Workplace Rights",
    keyword: "employment dispute letter",
    metaTitle: "Employment Dispute Letter | Talk to My Lawyer",
    metaDescription: "Protect your workplace rights with a professional employment dispute letter. Attorney-reviewed, California-focused. Starting at $299.",
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
      { slug: "california-employment-rights-guide", title: "California Employment Rights Guide", description: "An overview of employee protections under California labor law." },
      { slug: "wrongful-termination-california-what-to-know", title: "Wrongful Termination in California", description: "Understanding your rights when you've been unlawfully fired." },
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
    ],
    blogCategory: "employment-disputes",
  },
  {
    slug: "personal-injury-demand-letter",
    title: "Personal Injury Demand Letter",
    h1: "Personal Injury Demand Letter — Recover Your Damages",
    keyword: "personal injury demand letter",
    metaTitle: "Personal Injury Demand Letter | Talk to My Lawyer",
    metaDescription: "Send a professional personal injury demand letter to recover damages for medical bills, lost wages, and pain and suffering. Attorney-reviewed, California-focused.",
    heroDescription: "If you've been injured due to someone else's negligence — whether in a car accident, slip and fall, or workplace incident — a formal demand letter to the at-fault party or their insurer is the critical first step toward fair compensation.",
    useCases: [
      { title: "Car Accident Claims", description: "Demand compensation from the at-fault driver's insurance company for medical bills, lost wages, and vehicle damage." },
      { title: "Slip and Fall Injuries", description: "Hold property owners accountable for injuries caused by unsafe conditions on their premises." },
      { title: "Dog Bite Claims", description: "California imposes strict liability on dog owners — recover medical costs and damages from a dog bite incident." },
      { title: "Medical Bill Recovery", description: "Demand reimbursement for out-of-pocket medical expenses resulting from another party's negligence." },
      { title: "Insurance Claim Disputes", description: "Push back against lowball settlement offers or claim denials from insurance adjusters." },
    ],
    faqs: [
      { q: "What is a personal injury demand letter?", a: "A personal injury demand letter is a formal written document sent to the at-fault party or their insurance company that outlines your injuries, medical expenses, lost wages, and other damages, and demands a specific amount of compensation." },
      { q: "When should I send a personal injury demand letter?", a: "You should send a demand letter once you have completed medical treatment (or reached maximum medical improvement), gathered all medical records and bills, and calculated your total damages including future expenses." },
      { q: "How much should I demand in a personal injury letter?", a: "Your demand amount should include all medical expenses, lost wages, future medical costs, pain and suffering, and any other damages. Many attorneys recommend demanding 1.5 to 3 times your total economic damages to account for non-economic losses." },
      { q: "What if the insurance company rejects my demand?", a: "If the insurer rejects or undervalues your claim, the demand letter creates a documented record of your good-faith attempt to settle. You can then escalate to mediation, arbitration, or file a personal injury lawsuit." },
      { q: "Do I need a lawyer for a personal injury demand letter?", a: "While you can send a demand letter yourself, having it reviewed by an attorney significantly increases its effectiveness. Insurance companies take attorney-reviewed correspondence more seriously and are more likely to offer a fair settlement." },
    ],
    relatedArticles: [
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
      { slug: "demand-letter-vs-lawsuit", title: "Demand Letter vs. Lawsuit", description: "When a letter is enough and when you need to go to court." },
      { slug: "how-much-does-a-demand-letter-cost", title: "How Much Does a Demand Letter Cost?", description: "Compare demand letter costs across DIY, online services, and traditional attorneys." },
    ],
    blogCategory: "personal-injury",
  },
  {
    slug: "landlord-harassment-cease-desist",
    title: "Landlord Harassment Cease & Desist",
    h1: "Landlord Harassment Cease & Desist Letter — Protect Your Tenant Rights",
    keyword: "landlord harassment cease and desist letter",
    metaTitle: "Landlord Harassment Cease & Desist Letter | Talk to My Lawyer",
    metaDescription: "Stop landlord harassment with a professional cease and desist letter. Attorney-reviewed, citing California tenant protection laws. Starting at $299.",
    heroDescription: "California tenants have strong legal protections against landlord harassment. If your landlord is engaging in illegal behavior to force you out — entering without notice, shutting off utilities, or threatening you — a formal cease and desist letter puts them on notice and creates evidence for legal action.",
    useCases: [
      { title: "Illegal Entry", description: "Your landlord enters your unit without providing the required 24-hour written notice or without a legitimate reason." },
      { title: "Utility Shutoffs", description: "Your landlord has intentionally shut off water, electricity, gas, or other essential services to force you to move." },
      { title: "Verbal Threats or Intimidation", description: "Your landlord threatens you, your family, or your guests to pressure you into leaving the property." },
      { title: "Constructive Eviction", description: "Your landlord is making the property uninhabitable through neglect or deliberate action to force you out without a formal eviction process." },
      { title: "Retaliatory Actions", description: "Your landlord is raising rent, reducing services, or threatening eviction in retaliation for you exercising your legal rights." },
    ],
    faqs: [
      { q: "What constitutes landlord harassment in California?", a: "Under California Civil Code § 1940.2, landlord harassment includes using force, threats, or menacing conduct, interrupting utilities, removing doors or windows, entering without notice, and any actions intended to pressure a tenant to vacate." },
      { q: "Can I sue my landlord for harassment?", a: "Yes. California tenants can sue landlords for harassment and may recover actual damages, statutory damages of up to $2,000 per violation, and attorney's fees. A cease and desist letter creates critical evidence for such a lawsuit." },
      { q: "What should I document if my landlord is harassing me?", a: "Keep detailed records of every incident including dates, times, descriptions of what happened, photos or videos, text messages, emails, and names of any witnesses. This documentation strengthens your legal position." },
      { q: "Will a cease and desist letter stop my landlord?", a: "In many cases, yes. A professionally drafted, attorney-reviewed letter citing specific California statutes puts the landlord on formal notice that their behavior is illegal and that you are prepared to take legal action if it continues." },
      { q: "Can my landlord evict me for sending a cease and desist letter?", a: "No. Retaliatory eviction is illegal in California under Civil Code § 1942.5. If your landlord attempts to evict you within 180 days of you exercising your legal rights, it is presumed retaliatory and can be challenged in court." },
    ],
    relatedArticles: [
      { slug: "california-landlord-tenant-rights-guide", title: "California Landlord-Tenant Rights Guide", description: "Comprehensive guide to tenant protections and landlord obligations under California law." },
      { slug: "cease-and-desist-letters-explained", title: "Cease and Desist Letters Explained", description: "Understanding when and how to use cease and desist letters to protect your rights." },
      { slug: "how-to-get-your-security-deposit-back", title: "How to Get Your Security Deposit Back", description: "Learn about California tenant rights and the process for recovering your security deposit." },
    ],
    blogCategory: "landlord-tenant",
  },
  {
    slug: "non-compete-dispute-letter",
    title: "Non-Compete Dispute Letter",
    h1: "Non-Compete Dispute Letter — Challenge Restrictive Covenants",
    keyword: "non-compete dispute letter",
    metaTitle: "Non-Compete Dispute Letter | Talk to My Lawyer",
    metaDescription: "Challenge an unfair non-compete agreement with a professional dispute letter. California generally voids non-competes — know your rights. Attorney-reviewed.",
    heroDescription: "California Business and Professions Code § 16600 makes most non-compete agreements void and unenforceable. If a former employer is threatening you over a non-compete clause, a formal dispute letter citing California law can shut it down quickly.",
    useCases: [
      { title: "Former Employer Threats", description: "Your previous employer is threatening legal action over a non-compete clause that may not be enforceable under California law." },
      { title: "New Job Interference", description: "A former employer has contacted your new employer to claim you are violating a non-compete, putting your new position at risk." },
      { title: "Out-of-State Non-Competes", description: "You signed a non-compete in another state but now work in California, where such agreements are generally void." },
      { title: "Overly Broad Restrictions", description: "The non-compete clause is unreasonably broad in scope, geography, or duration, making it potentially unenforceable even outside California." },
      { title: "Trade Secret Confusion", description: "Your former employer is conflating non-compete restrictions with legitimate trade secret protections — a dispute letter can clarify the distinction." },
    ],
    faqs: [
      { q: "Are non-compete agreements enforceable in California?", a: "Generally, no. California Business and Professions Code § 16600 voids non-compete agreements that restrain anyone from engaging in a lawful profession, trade, or business. There are very narrow exceptions for the sale of a business." },
      { q: "What if I signed a non-compete in another state?", a: "If you now work in California, California law typically applies regardless of where the non-compete was signed. Under Labor Code § 925 and recent legislation (AB 1076), California courts will generally refuse to enforce out-of-state non-competes against California employees." },
      { q: "Can my former employer sue me for violating a non-compete?", a: "They can file a lawsuit, but California courts routinely decline to enforce non-compete agreements. A dispute letter citing California law often prevents litigation by demonstrating the agreement is void." },
      { q: "What about non-solicitation agreements?", a: "California courts have also struck down non-solicitation agreements that effectively function as non-competes. However, agreements protecting actual trade secrets may still be enforceable." },
      { q: "Should I respond to a non-compete threat letter?", a: "Yes. Ignoring a threat letter can lead to a default judgment if the employer files suit. A formal response citing California's strong anti-non-compete laws puts the employer on notice that you understand your rights." },
    ],
    relatedArticles: [
      { slug: "non-compete-agreement-california-guide", title: "Non-Compete Agreements in California", description: "What you need to know about non-compete enforceability under California law." },
      { slug: "how-to-write-breach-of-contract-letter", title: "How to Write a Breach of Contract Letter", description: "Step-by-step guide to writing an effective breach of contract letter." },
      { slug: "cease-and-desist-letters-explained", title: "Cease and Desist Letters Explained", description: "Understanding when and how to use cease and desist letters to protect your rights." },
    ],
    blogCategory: "contract-disputes",
  },
  {
    slug: "intellectual-property-infringement-letter",
    title: "Intellectual Property Infringement Letter",
    h1: "Intellectual Property Infringement Letter — Protect Your IP Rights",
    keyword: "intellectual property infringement letter",
    metaTitle: "IP Infringement Letter — Protect Your Intellectual Property | Talk to My Lawyer",
    metaDescription: "Protect your intellectual property with a professional infringement letter. Stop copyright theft, trademark misuse, and trade secret violations. Attorney-reviewed.",
    heroDescription: "When someone copies your creative work, uses your trademark, or misappropriates your trade secrets, a formal IP infringement letter is often the fastest and most cost-effective way to stop the violation and demand compensation.",
    useCases: [
      { title: "Copyright Infringement", description: "Someone is copying, distributing, or using your original creative work — photos, articles, software, music, or designs — without your permission." },
      { title: "Trademark Violations", description: "A competitor or other business is using a name, logo, or branding that is confusingly similar to your registered trademark." },
      { title: "Trade Secret Theft", description: "A former employee or business partner has taken proprietary information, customer lists, or trade secrets to a competing business." },
      { title: "DMCA Takedown Support", description: "You need to send a formal notice to a website or platform to remove infringing content under the Digital Millennium Copyright Act." },
      { title: "Patent Infringement Notices", description: "Another company is making, using, or selling a product that infringes on your patent — a formal notice letter is the first step." },
    ],
    faqs: [
      { q: "What is an IP infringement letter?", a: "An IP infringement letter is a formal written demand sent to a party that is violating your intellectual property rights. It identifies the infringed IP, describes the unauthorized use, demands the infringing activity stop, and outlines consequences of non-compliance." },
      { q: "Do I need a registered trademark or copyright to send an infringement letter?", a: "No. Copyright protection exists automatically when you create an original work. However, registration strengthens your legal position and may entitle you to statutory damages and attorney's fees in a lawsuit." },
      { q: "What is a DMCA takedown notice?", a: "A DMCA takedown notice is a formal request to an online service provider (like Google, YouTube, or a web host) to remove content that infringes your copyright. The provider must act on valid notices under the Digital Millennium Copyright Act." },
      { q: "What damages can I recover for IP infringement?", a: "Depending on the type of IP and whether it is registered, you may recover actual damages, lost profits, statutory damages (up to $150,000 per work for willful copyright infringement), and attorney's fees." },
      { q: "How quickly should I act on IP infringement?", a: "As quickly as possible. Delay can be interpreted as acquiescence to the infringement and may weaken your legal position. Additionally, statutes of limitations apply — typically 3 years for copyright and varies for trademark claims." },
    ],
    relatedArticles: [
      { slug: "trademark-infringement-cease-desist-guide", title: "Trademark Infringement: Cease & Desist Guide", description: "How to protect your brand with a cease and desist letter for trademark violations." },
      { slug: "cease-and-desist-letters-explained", title: "Cease and Desist Letters Explained", description: "Understanding when and how to use cease and desist letters to protect your rights." },
      { slug: "how-to-stop-online-harassment-legally", title: "How to Stop Online Harassment Legally", description: "Legal options for dealing with cyberbullying, defamation, and online stalking in California." },
    ],
    blogCategory: "intellectual-property",
  },
  {
    slug: "small-claims-demand-letter",
    title: "Small Claims Demand Letter",
    h1: "Small Claims Demand Letter — Resolve Disputes Before Court",
    keyword: "small claims demand letter",
    metaTitle: "Small Claims Demand Letter | Talk to My Lawyer",
    metaDescription: "Send a professional demand letter before filing in California Small Claims Court. Attorney-reviewed, citing California CCP § 116.320. Starting at $299.",
    heroDescription: "Before filing in California Small Claims Court, sending a formal demand letter is not just smart — many judges expect it. A professionally drafted demand letter demonstrates good faith and often resolves the dispute entirely, saving you the time and stress of a court appearance.",
    useCases: [
      { title: "Pre-Filing Requirement", description: "Many California small claims judges look favorably on parties who attempted resolution before filing. A demand letter creates evidence of your good-faith effort." },
      { title: "Disputes Under $12,500", description: "California Small Claims Court handles disputes up to $12,500 for individuals. A demand letter often resolves these smaller claims without the need to file." },
      { title: "Neighbor Disputes", description: "Property damage, noise complaints, fence disputes, and other neighbor conflicts that haven't been resolved through informal communication." },
      { title: "Consumer Complaints", description: "Defective products, failed services, or deceptive business practices where the amount in dispute falls within small claims limits." },
      { title: "Vehicle Damage Claims", description: "Fender benders, parking lot damage, or other vehicle incidents where insurance won't cover the full cost of repairs." },
    ],
    faqs: [
      { q: "Do I need a demand letter before filing in California Small Claims Court?", a: "While not legally required in most cases, sending a demand letter before filing is strongly recommended. Judges look favorably on parties who demonstrate they tried to resolve the matter first, and many disputes settle at the demand letter stage." },
      { q: "What is the limit for California Small Claims Court?", a: "Individuals can sue for up to $12,500 in California Small Claims Court. Businesses and other entities are limited to $6,250. For claims above these limits, you would need to file in a higher court." },
      { q: "How long should I wait after sending a demand letter before filing?", a: "Give the other party 15 to 30 days to respond to your demand letter. If they do not respond or refuse to comply, you can then file your small claims case with the court." },
      { q: "Can I include attorney's fees in my small claims demand?", a: "Generally, attorneys cannot represent parties in California Small Claims Court. However, the cost of a demand letter service is a legitimate expense that may be recoverable as part of your damages." },
      { q: "What happens if the other party pays after receiving my demand letter?", a: "If the other party pays the demanded amount within the specified deadline, the dispute is resolved. You should provide a written acknowledgment of receipt and release of the claim. No court filing is needed." },
    ],
    relatedArticles: [
      { slug: "what-is-a-demand-letter", title: "What Is a Demand Letter?", description: "Learn what demand letters are, when to use them, and how they can help resolve disputes." },
      { slug: "demand-letter-vs-lawsuit", title: "Demand Letter vs. Lawsuit", description: "When a letter is enough and when you need to go to court." },
      { slug: "how-much-does-a-demand-letter-cost", title: "How Much Does a Demand Letter Cost?", description: "Compare demand letter costs across DIY, online services, and traditional attorneys." },
      { slug: "how-to-collect-unpaid-invoices-california", title: "How to Collect Unpaid Invoices in California", description: "Step-by-step guide to recovering unpaid invoices using demand letters and small claims court." },
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
  if (!CATEGORY_TO_SERVICE[s.blogCategory]) {
    CATEGORY_TO_SERVICE[s.blogCategory] = s;
  }
}

export const CATEGORY_TO_SERVICES: Record<string, ServiceData[]> = {};
for (const s of SERVICES) {
  if (!CATEGORY_TO_SERVICES[s.blogCategory]) {
    CATEGORY_TO_SERVICES[s.blogCategory] = [];
  }
  CATEGORY_TO_SERVICES[s.blogCategory].push(s);
}
