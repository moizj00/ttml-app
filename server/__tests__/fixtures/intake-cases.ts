/**
 * Realistic structured intake test cases for pipeline testing.
 * All cases are California-specific with detailed, lifelike facts.
 */
import type { IntakeJson } from "../../../shared/types/pipeline";

/** Case 1: Demand Letter — Unpaid contractor invoice for home renovation */
export const demandLetterUnpaidContractor: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "demand-letter",
  sender: {
    name: "Daniel Reyes",
    address: "1847 Magnolia Avenue, Unit B, Long Beach, CA 90806",
    email: "daniel.reyes.builds@gmail.com",
    phone: "(562) 429-8173",
  },
  recipient: {
    name: "Karen Whitfield",
    address: "3205 Pacific Coast Highway, Huntington Beach, CA 92648",
    email: "karenwhitfield@outlook.com",
    phone: "(714) 960-3320",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "Huntington Beach",
  },
  matter: {
    category: "demand-letter",
    subject:
      "Unpaid balance of $14,750 for completed kitchen and bathroom renovation at 3205 Pacific Coast Highway",
    description:
      "I am a licensed general contractor (CSLB License #1087432) who entered into a written Home Improvement Contract with Karen Whitfield on January 8, 2026 for a full kitchen and guest bathroom renovation at her residence. The total contract price was $38,500, payable in three installments: $11,550 deposit (paid January 10), $12,200 at rough-in completion (paid February 22), and $14,750 final payment upon project completion. I completed all work on March 15, 2026, including cabinet installation, quartz countertop fabrication, tile backsplash, plumbing fixtures, guest bath remodel, and final city inspection sign-off (permit #BLD-2026-04821, passed March 18, 2026). Ms. Whitfield performed a walkthrough on March 16 and signed the Certificate of Completion without noting any deficiencies. Despite the signed completion certificate and passed final inspection, she has refused to pay the remaining $14,750, claiming via text message on March 25 that she 'changed her mind about the backsplash color' and wants it redone before paying. The backsplash tile (Emser Tile, Borigni Series in Argento) was the exact tile she selected in writing on the design specification sheet dated January 15, 2026.",
    incidentDate: "2026-03-15",
  },
  financials: {
    amountOwed: 14750,
    currency: "USD",
  },
  desiredOutcome:
    "Full payment of the outstanding $14,750 within 10 business days. If payment is not received, I intend to file a mechanic's lien on the property pursuant to California Civil Code §8400 et seq. and pursue the balance in Orange County Superior Court, including statutory penalties, prejudgment interest at 10% per annum (Cal. Civ. Code §3289), and reasonable attorney's fees as provided in the contract.",
  deadlineDate: "2026-05-02",
  additionalContext:
    "The written contract includes an attorney's fees clause (Section 12) and a 30-day cure period before lien filing. The 90-day mechanic's lien deadline from completion is June 13, 2026. I have documented all work with timestamped photographs, the signed design spec sheet, and the signed Certificate of Completion.",
  communications: {
    summary:
      "Sent polite payment reminder email on March 20, 2026. Called on March 23 — no answer. Received text on March 25 claiming dissatisfaction with backsplash color. Responded by text with photo of signed design spec showing her tile selection. Sent formal payment demand via email on April 1, 2026. No response to any communication since March 25.",
    lastContactDate: "2026-04-01",
    method: "email",
  },
  toneAndDelivery: {
    tone: "firm",
    deliveryMethod: "certified-mail",
  },
  exhibits: [
    {
      label: "Exhibit A",
      description: "Signed Home Improvement Contract dated January 8, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description:
        "Design Specification Sheet with tile selection signed by Karen Whitfield, January 15, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description: "Certificate of Completion signed by Karen Whitfield, March 16, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "City of Huntington Beach Final Inspection Report, Permit #BLD-2026-04821, passed March 18, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit E",
      description: "Text message exchange dated March 25, 2026",
      hasAttachment: true,
    },
  ],
  situationFields: {
    paymentDueDate: "2026-03-15",
    invoiceReference: "DRB-2026-038",
    debtorRelationship: "Client — homeowner under Home Improvement Contract",
  },
};

/** Case 2: Employment Dispute — Wage theft and missed meal/rest breaks */
export const employmentWageTheft: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "employment-dispute",
  sender: {
    name: "Sofia Mendoza-Garcia",
    address: "4412 East Cesar Chavez Avenue, Apt 7, Los Angeles, CA 90022",
    email: "sofia.m.garcia92@gmail.com",
    phone: "(323) 268-4451",
  },
  recipient: {
    name: "Pacific Rim Hospitality Group, LLC, Attn: Richard Fong, Director of Human Resources",
    address: "8899 Beverly Boulevard, Suite 300, West Hollywood, CA 90048",
    email: "hr@pacificrimhospitality.com",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "West Hollywood",
  },
  matter: {
    category: "employment-dispute",
    subject:
      "Wage theft, unpaid overtime, and systematic denial of meal and rest breaks — Line Cook, The Orchid Room restaurant",
    description:
      "I worked as a line cook at The Orchid Room restaurant (operated by Pacific Rim Hospitality Group, LLC) from June 3, 2024 through February 28, 2026. My hourly rate was $21.00. Throughout my employment, I was regularly required to work 10–12 hour shifts without receiving a 30-minute uninterrupted meal break as required by California Labor Code §512. On at least 150 occasions, my meal breaks were either skipped entirely or cut short to under 15 minutes because management insisted I continue working during service. I was also routinely denied my second 10-minute rest break on shifts exceeding 10 hours, in violation of California Labor Code §226.7. Additionally, my employer regularly altered my time records to show 8-hour shifts when I actually worked 10–12 hours, resulting in approximately 480 hours of unpaid overtime over my 21-month employment. I reported these issues to the kitchen manager, Carlos Vega, on November 12, 2025, and to HR Director Richard Fong via email on December 3, 2025. Two weeks after my HR complaint, I was moved to the least desirable shift (Monday/Tuesday lunch) and had my hours cut from 45 to 28 per week. I resigned on February 28, 2026 because the reduced hours made it financially impossible to continue.",
    incidentDate: "2026-02-28",
  },
  financials: {
    amountOwed: 47520,
    currency: "USD",
  },
  desiredOutcome:
    "Full payment of all owed wages and penalties within 21 days: (1) $10,080 in unpaid overtime (480 hours × $10.50 OT premium), (2) $15,750 in meal break premiums (150 violations × $21/hr × 5 additional hours per Cal. Lab. Code §226.7), (3) $6,300 in rest break premiums, (4) $15,390 in waiting time penalties (30 days × $21 × 8 hrs per Cal. Lab. Code §203). If not resolved, I will file a wage claim with the California Division of Labor Standards Enforcement and a retaliation complaint under Cal. Lab. Code §1102.5.",
  deadlineDate: "2026-05-09",
  priorCommunication:
    "Internal complaint to kitchen manager Carlos Vega on November 12, 2025. Written email complaint to HR Director Richard Fong on December 3, 2025. Exit interview on February 28, 2026 where I again raised these issues with Fong — he said he would 'look into it' but nothing happened.",
  communications: {
    summary:
      "Verbal complaint to kitchen manager November 2025. Written email to HR December 3, 2025. Raised concerns at exit interview February 28, 2026. No substantive response received to any communication.",
    lastContactDate: "2026-02-28",
    method: "email",
  },
  toneAndDelivery: {
    tone: "aggressive",
    deliveryMethod: "certified-mail",
  },
  exhibits: [
    {
      label: "Exhibit A",
      description: "Personal shift log with actual hours worked, June 2024 – February 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description:
        "Email to Richard Fong dated December 3, 2025 reporting wage and break violations",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description:
        "Pay stubs showing altered hours vs. personal log discrepancies (sample months: August 2025, November 2025, January 2026)",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "Text messages from kitchen manager Carlos Vega directing staff to skip meal breaks during service",
      hasAttachment: true,
    },
  ],
  situationFields: {
    employerName: "Pacific Rim Hospitality Group, LLC",
    positionTitle: "Line Cook",
    employmentStartDate: "2024-06-03",
    hrContact: "Richard Fong, Director of Human Resources",
    disputeType: "Wage/Hour Violation",
  },
};

/** Case 3: Landlord-Tenant — Habitability violations and retaliation */
export const landlordHabitability: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "landlord-tenant",
  sender: {
    name: "Aisha Johnson",
    address: "762 South Berendo Street, Apt 4, Los Angeles, CA 90005",
    email: "aisha.j.legal@protonmail.com",
    phone: "(213) 384-6712",
  },
  recipient: {
    name: "Westlake Property Management, Inc., Attn: Victor Petrosian, Property Manager",
    address: "2100 Wilshire Boulevard, Suite 1450, Los Angeles, CA 90057",
    email: "vpetrosian@westlakeprop.com",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "Los Angeles",
  },
  matter: {
    category: "landlord-tenant",
    subject:
      "Severe habitability violations including black mold, persistent water intrusion, and retaliatory rent increase after complaint to LAHD",
    description:
      "I have been a tenant at 762 S. Berendo St., Apt 4, Los Angeles, CA 90005 since March 1, 2023, paying $1,850/month under a written lease (renewed annually). Beginning in October 2025, I noticed water stains on the bedroom ceiling that progressively worsened. By December 2025, visible black mold had formed across approximately 8 square feet of the bedroom ceiling and the adjacent wall behind the closet. I submitted a written maintenance request on December 10, 2025 (request #MR-4821). The property manager, Victor Petrosian, sent a handyman on December 22 who painted over the mold with Kilz primer without addressing the underlying water leak from the unit above. The mold returned within three weeks. I submitted a second request on January 15, 2026 (request #MR-4903) and received no response. On February 3, 2026, I reported the conditions to the Los Angeles Housing Department (LAHD), which conducted an inspection on February 18, 2026. LAHD Inspector M. Torres issued a Notice of Violation (Case #LAHD-2026-0028471) citing California Civil Code §1941.1 habitability violations for water intrusion and mold. Within five days of receiving the LAHD notice, on February 24, 2026, Westlake Property Management served me a rent increase notice raising my rent to $2,350/month — a 27% increase that I believe violates the LA Rent Stabilization Ordinance (LARSO) and constitutes retaliation under Cal. Civ. Code §1942.5. My unit is covered by LARSO as the building was constructed in 1972 (pre-1978). My daughter (age 6) has developed respiratory symptoms including persistent coughing and wheezing since the mold appeared. Her pediatrician, Dr. Nadia Osman at Children's Hospital Los Angeles, has documented the symptoms and stated they are consistent with mold exposure.",
    incidentDate: "2025-12-10",
  },
  financials: {
    amountOwed: 5550,
    currency: "USD",
  },
  desiredOutcome:
    "Within 14 days: (1) Complete professional mold remediation by a licensed contractor per Cal. Health & Safety Code §26147, (2) repair the water intrusion source from the unit above, (3) rescind the retaliatory rent increase, (4) reimburse $5,550 for three months of rent abatement ($1,850 × 3) for living in uninhabitable conditions from December 2025 through February 2026. Failure to comply will result in a lawsuit for breach of the implied warranty of habitability, violation of Cal. Civ. Code §1942.5 (anti-retaliation), and a complaint to the LA City Attorney's office.",
  deadlineDate: "2026-05-02",
  communications: {
    summary:
      "Written maintenance request #MR-4821 on December 10, 2025. Cosmetic-only repair on December 22. Second request #MR-4903 on January 15, 2026 — no response. LAHD complaint filed February 3, 2026. LAHD inspection and violation notice February 18. Retaliatory rent increase notice served February 24. I sent a written objection to the rent increase on March 1, 2026 — no response.",
    lastContactDate: "2026-03-01",
    method: "letter",
  },
  toneAndDelivery: {
    tone: "aggressive",
    deliveryMethod: "certified-mail",
  },
  exhibits: [
    {
      label: "Exhibit A",
      description: "Current lease agreement dated March 1, 2023 (renewed March 1, 2025)",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description:
        "Maintenance requests #MR-4821 (Dec 10, 2025) and #MR-4903 (Jan 15, 2026)",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description:
        "Photographs of black mold on bedroom ceiling and closet wall, dated January 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "LAHD Notice of Violation, Case #LAHD-2026-0028471, dated February 18, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit E",
      description: "Rent increase notice dated February 24, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit F",
      description:
        "Letter from Dr. Nadia Osman, CHLA, documenting daughter's respiratory symptoms consistent with mold exposure",
      hasAttachment: true,
    },
  ],
  situationFields: {
    propertyAddress: "762 South Berendo Street, Apt 4, Los Angeles, CA 90005",
    leaseStartDate: "2023-03-01",
    monthlyRent: 1850,
    landlordName: "Westlake Property Management, Inc.",
    issueType: "Habitability / Mold / Retaliation",
  },
};

/** Case 4: Personal Injury Demand — Rideshare accident */
export const personalInjuryRideshare: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "personal-injury-demand",
  sender: {
    name: "Trevor Nguyen",
    address: "1535 North Laurel Avenue, Apt 210, West Hollywood, CA 90046",
    email: "trevor.nguyen.claims@gmail.com",
    phone: "(323) 656-0893",
  },
  recipient: {
    name: "Allstate Insurance Company, Claims Division, Attn: Claims Adjuster for Policy #092-ALP-7741",
    address: "2775 Sanders Road, Northbrook, IL 60062",
    email: "claims@allstate.com",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "Los Angeles",
  },
  matter: {
    category: "personal-injury-demand",
    subject:
      "Third-party bodily injury claim arising from rear-end collision at Sunset Blvd & Fairfax Ave on January 11, 2026 — Insured: David Kowalski, Policy #092-ALP-7741",
    description:
      "On January 11, 2026 at approximately 7:45 PM, I was a passenger in a Lyft vehicle (2023 Toyota Camry, CA plate 8XYZ432, driver: Miguel Santos) stopped at a red light at the intersection of Sunset Boulevard and Fairfax Avenue in Los Angeles. Your insured, David Kowalski, operating a 2021 Ford F-150 (CA plate 4ABC789), rear-ended the Lyft vehicle at an estimated speed of 30–35 mph. The LAPD responded and Officer J. Martinez filed Traffic Collision Report #26-01-04831, finding Mr. Kowalski at fault. Mr. Kowalski stated to the officer that he was 'looking at his phone.' I was transported by LAFD Ambulance to Cedars-Sinai Medical Center where I was diagnosed with a cervical disc herniation at C5-C6 and a right shoulder labral tear. I underwent 16 weeks of physical therapy at ProSport Physical Therapy (Dr. Alan Park, DPT) from January 20 through May 10, 2026. An MRI on February 5, 2026 confirmed the C5-C6 herniation. My orthopedic surgeon, Dr. Rebecca Stern at Cedars-Sinai, has recommended an anterior cervical discectomy and fusion (ACDF) surgery which is scheduled for June 15, 2026, with an estimated 12-week recovery period. I was unable to work at my position as a senior graphic designer at Firefly Creative Agency from January 12 through March 31, 2026 (11.5 weeks). I returned to work part-time on April 1 and expect to miss an additional 12 weeks post-surgery.",
    incidentDate: "2026-01-11",
  },
  financials: {
    amountOwed: 287450,
    currency: "USD",
  },
  desiredOutcome:
    "Settlement demand of $287,450 itemized as follows: (1) Past medical expenses: $48,200 (ER $12,400, MRI $3,800, physical therapy $14,000, orthopedic consultations $6,000, medications $2,000, future ACDF surgery estimate $10,000); (2) Future medical expenses: $35,000 (surgery balance, post-op PT, follow-up care); (3) Past lost wages: $34,250 (11.5 weeks × $2,978/week); (4) Future lost wages: $35,736 (12 weeks post-surgery × $2,978/week); (5) Loss of earning capacity: $25,000; (6) Pain and suffering: $109,264. This demand is open for 30 days. If not resolved, I will file a complaint in Los Angeles County Superior Court.",
  deadlineDate: "2026-05-18",
  additionalContext:
    "California is a pure comparative negligence state (Li v. Yellow Cab Co., 13 Cal.3d 804 (1975)). Liability here is clear — your insured admitted to distracted driving (phone use) and was cited under CVC §23123.5. The police report corroborates 100% fault on Mr. Kowalski. Pre-accident, I had no cervical spine or shoulder issues. My medical records from Kaiser Permanente (2019–2025) confirm no prior complaints.",
  communications: {
    summary:
      "Initial claim filed with Allstate on January 15, 2026, Claim #ALS-2026-CA-08831. Acknowledgment received January 22. Adjuster Sarah Bloom requested medical records on February 1 — records sent February 15. Follow-up call March 10 — Ms. Bloom said claim was 'under review.' No substantive offer has been made.",
    lastContactDate: "2026-03-10",
    method: "phone",
  },
  toneAndDelivery: {
    tone: "firm",
    deliveryMethod: "certified-mail",
  },
  evidenceSummary:
    "LAPD Traffic Collision Report #26-01-04831, Cedars-Sinai ER records (Jan 11, 2026), MRI report (Feb 5, 2026), physical therapy records from ProSport PT (Jan–May 2026), orthopedic evaluation and surgical recommendation from Dr. Rebecca Stern, employment verification and wage statement from Firefly Creative Agency, photographs of vehicle damage, Lyft ride receipt confirming passenger status.",
  exhibits: [
    {
      label: "Exhibit A",
      description: "LAPD Traffic Collision Report #26-01-04831",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description: "Cedars-Sinai Emergency Department records, January 11, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description: "MRI report confirming C5-C6 disc herniation, February 5, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "Dr. Rebecca Stern surgical recommendation letter and cost estimate for ACDF",
      hasAttachment: true,
    },
    {
      label: "Exhibit E",
      description:
        "ProSport Physical Therapy treatment summary and billing (16 weeks)",
      hasAttachment: true,
    },
    {
      label: "Exhibit F",
      description: "Firefly Creative Agency employment verification and wage statement",
      hasAttachment: true,
    },
    {
      label: "Exhibit G",
      description: "Itemized medical billing summary",
      hasAttachment: true,
    },
  ],
  situationFields: {
    injuryDescription:
      "Cervical disc herniation at C5-C6 and right shoulder labral tear from rear-end collision while passenger in Lyft",
    medicalProvider: "Cedars-Sinai Medical Center; ProSport Physical Therapy; Dr. Rebecca Stern (orthopedic surgery)",
    medicalCosts: 48200,
    lostWages: 34250,
  },
};

/** Case 5: Cease and Desist — Online defamation by former business partner */
export const ceaseDesistDefamation: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "cease-and-desist",
  sender: {
    name: "Rachel Kim",
    address: "540 Howard Street, Suite 2, San Francisco, CA 94105",
    email: "rachel@bloomstudiodesign.com",
    phone: "(415) 543-2290",
  },
  recipient: {
    name: "Jason Mercer",
    address: "1288 Columbus Avenue, Apt 6A, San Francisco, CA 94133",
    email: "jmercer.sf@gmail.com",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "San Francisco",
  },
  matter: {
    category: "cease-and-desist",
    subject:
      "Defamatory statements posted on Yelp, Google Reviews, and Instagram regarding Bloom Studio Design",
    description:
      "Jason Mercer is my former business partner in Bloom Studio Design LLC. We dissolved our partnership amicably on November 30, 2025, per a written Dissolution Agreement that included mutual non-disparagement and confidentiality clauses (Section 7.2 and Section 8.1). Beginning on February 1, 2026, Mr. Mercer began posting false and defamatory statements about me and Bloom Studio Design across multiple platforms. On Yelp (posted February 1, username 'JasonM_SF'), he wrote: 'Rachel Kim stole $40,000 from the business account and lied to clients about project timelines. DO NOT hire this company.' On Google Reviews (posted February 3, username 'Jason M.'), he wrote: 'The owner Rachel Kim has been investigated for fraud and was nearly sued by three clients for stealing deposits.' On Instagram (@jmercer_designs, posted February 5, story and permanent post), he wrote: 'PSA — Bloom Studio Design is a scam. Rachel Kim takes your money and ghosts you. I left because I couldn't be part of her con anymore.' All of these statements are demonstrably false. There was no theft — all distributions were made per the operating agreement and documented in our jointly reviewed QuickBooks ledger. I have never been investigated for fraud or sued by any client. Since these posts went live, two prospective clients (Marina Del Rey Hotel renovation, $85,000 contract; Noe Valley residential project, $42,000 contract) have explicitly cited the reviews in canceling their signed Letters of Intent.",
    incidentDate: "2026-02-01",
  },
  desiredOutcome:
    "Within 7 days: (1) Permanently remove all defamatory posts from Yelp, Google Reviews, and Instagram, (2) post a public retraction on each platform acknowledging the statements were false, (3) cease all further disparaging communications about me or Bloom Studio Design. Failure to comply will result in a lawsuit for defamation per se (Cal. Civ. Code §44-48), intentional interference with prospective economic advantage, and breach of the non-disparagement clause of the Dissolution Agreement. I will seek actual damages exceeding $127,000 in lost contracts, general damages, and punitive damages under Cal. Civ. Code §3294.",
  deadlineDate: "2026-04-25",
  communications: {
    summary:
      "I texted Jason on February 2 asking him to remove the Yelp review. He responded: 'People deserve to know the truth.' I emailed him on February 6 asking him to remove all posts and referencing the non-disparagement clause. He did not respond. My attorney sent a cease-and-desist email on February 20 — no response.",
    lastContactDate: "2026-02-20",
    method: "email",
  },
  toneAndDelivery: {
    tone: "aggressive",
    deliveryMethod: "certified-mail",
  },
  exhibits: [
    {
      label: "Exhibit A",
      description:
        "Dissolution Agreement dated November 30, 2025, with Sections 7.2 (Non-Disparagement) and 8.1 (Confidentiality) highlighted",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description: "Screenshots of Yelp review by 'JasonM_SF' posted February 1, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description: "Screenshots of Google Review by 'Jason M.' posted February 3, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "Screenshots of Instagram post and story by @jmercer_designs, February 5, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit E",
      description:
        "Emails from Marina Del Rey Hotel and Noe Valley client canceling Letters of Intent, citing online reviews",
      hasAttachment: true,
    },
    {
      label: "Exhibit F",
      description: "QuickBooks profit-and-loss ledger showing all distributions to both partners",
      hasAttachment: true,
    },
  ],
  situationFields: {
    conductType: "Defamation",
    conductStartDate: "2026-02-01",
    harmDescription:
      "Loss of two signed client contracts ($127,000 combined), reputational damage to a 6-year-old design business, emotional distress, and ongoing harm from posts still visible to the public",
  },
};

/** Case 6: Insurance Dispute — Denied homeowner's claim after pipe burst */
export const insuranceDeniedClaim: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "insurance-dispute",
  sender: {
    name: "Robert and Linda Chen",
    address: "2841 Lakeshore Drive, Sacramento, CA 95822",
    email: "rlchen.sac@gmail.com",
    phone: "(916) 422-5580",
  },
  recipient: {
    name: "State Farm Insurance, Claims Department, Attn: Senior Claims Examiner, Claim #42-SF-8829-2026",
    address: "One State Farm Plaza, Bloomington, IL 61710",
    email: "claims@statefarm.com",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "Sacramento",
  },
  matter: {
    category: "insurance-dispute",
    subject:
      "Wrongful denial of homeowner's insurance claim #42-SF-8829-2026 for water damage from burst pipe — Policy #HO-25-9940173",
    description:
      "On January 28, 2026, during a period of freezing temperatures in Sacramento (overnight low of 27°F per NWS records), a copper water supply pipe in the attic crawl space of our home at 2841 Lakeshore Drive burst, causing extensive water damage to the second floor and first floor ceiling. We discovered the damage on the morning of January 29 when we noticed water dripping through the first-floor kitchen ceiling. We immediately shut off the main water supply, called a licensed plumber (Ace Plumbing, Invoice #AP-5591, $1,800 emergency repair), and filed a claim with State Farm that same day. State Farm assigned adjuster Mark Sullivan, who inspected on February 5, 2026. On February 25, 2026, we received a denial letter stating the damage was caused by 'gradual seepage and lack of maintenance' — an exclusion under Section I, Exclusion 2(d) of our HO-3 policy. This denial is incorrect. The pipe burst was a sudden and accidental event caused by freezing temperatures, which is a covered peril under our policy (Coverage A — Dwelling, Section I Perils Insured Against). Our licensed plumber's report (Ace Plumbing, dated February 2, 2026) confirms the failure was a freeze-related burst at a soldered joint, not gradual corrosion or seepage. We obtained an independent inspection from SafeGuard Home Inspections on March 3, 2026, which also confirmed sudden freeze damage with no evidence of pre-existing leaks or deferred maintenance. The damage includes: destroyed drywall and insulation in the attic and second-floor bedroom ($8,200), warped hardwood flooring on the first floor ($12,400), damaged kitchen cabinetry ($6,500), personal property damage to clothing and electronics ($4,800), and mold remediation ($7,300). Total documented loss: $41,000.",
    incidentDate: "2026-01-29",
  },
  financials: {
    amountOwed: 41000,
    currency: "USD",
  },
  desiredOutcome:
    "Reverse the claim denial and pay the full documented loss of $41,000 (less our $1,000 deductible = $40,000 net) within 30 days. If State Farm does not reverse its decision, we will file a complaint with the California Department of Insurance under Cal. Ins. Code §790.03 (unfair claims settlement practices) and pursue a bad faith lawsuit under Brandt v. Superior Court (1985) 37 Cal.3d 813, seeking the policy benefits, consequential damages, emotional distress damages, and punitive damages under Cal. Civ. Code §3294.",
  deadlineDate: "2026-05-18",
  additionalContext:
    "Under California Insurance Code §790.03(h), an insurer's failure to conduct a reasonable investigation before denying a claim constitutes an unfair claims practice. State Farm's adjuster spent less than 30 minutes at the property and did not enter the attic crawl space where the burst occurred. The denial letter referenced 'gradual seepage' without any physical evidence supporting that characterization. We have maintained this home since 2018 with annual plumbing inspections (records available). Our policy has been in force continuously since 2018 with no prior claims.",
  communications: {
    summary:
      "Claim filed January 29, 2026. Adjuster Mark Sullivan inspected February 5. Denial letter received February 25. We sent a written appeal with the independent inspection report on March 10. State Farm responded March 28 reaffirming the denial without addressing the independent report. Called the claims department April 5 — representative said the file was 'closed.'",
    lastContactDate: "2026-04-05",
    method: "phone",
  },
  toneAndDelivery: {
    tone: "firm",
    deliveryMethod: "certified-mail",
  },
  exhibits: [
    {
      label: "Exhibit A",
      description: "State Farm HO-3 Policy #HO-25-9940173, relevant coverage pages",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description: "State Farm denial letter dated February 25, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description:
        "Ace Plumbing emergency repair invoice #AP-5591 and plumber's report confirming freeze-related burst",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "SafeGuard Home Inspections independent report dated March 3, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit E",
      description:
        "Contractor repair estimates: drywall/insulation ($8,200), hardwood flooring ($12,400), kitchen cabinetry ($6,500), mold remediation ($7,300)",
      hasAttachment: true,
    },
    {
      label: "Exhibit F",
      description:
        "National Weather Service records showing Sacramento temperatures below freezing on January 27–28, 2026",
      hasAttachment: true,
    },
    {
      label: "Exhibit G",
      description: "Annual plumbing inspection records, 2018–2025",
      hasAttachment: true,
    },
  ],
  situationFields: {
    policyNumber: "HO-25-9940173",
    claimNumber: "42-SF-8829-2026",
    denialDate: "2026-02-25",
    denialReason: "Gradual seepage and lack of maintenance — Section I, Exclusion 2(d)",
    claimAmount: 41000,
  },
};

/** Case 7: Consumer Complaint — Auto dealer bait-and-switch financing */
export const consumerAutoDealer: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "consumer-complaint",
  sender: {
    name: "Marcus Williams",
    address: "1920 West Adams Boulevard, Los Angeles, CA 90018",
    email: "marcus.d.williams@gmail.com",
    phone: "(323) 731-4462",
  },
  recipient: {
    name: "AutoNation Honda of South Bay, Attn: General Manager",
    address: "20900 Hawthorne Boulevard, Torrance, CA 90503",
  },
  jurisdiction: {
    country: "US",
    state: "CA",
    city: "Torrance",
  },
  matter: {
    category: "consumer-complaint",
    subject:
      "Bait-and-switch financing terms and undisclosed dealer add-ons on 2026 Honda Accord purchase — violated California Auto Buyer's Bill of Rights",
    description:
      "On March 8, 2026, I purchased a 2026 Honda Accord Sport (VIN: 1HGCV2F34RA012847) from AutoNation Honda of South Bay. The negotiated out-the-door price was $33,400 with an agreed interest rate of 4.9% APR based on a credit pre-approval from Capital One Auto Finance. During the F&I (Finance and Insurance) process, Finance Manager Tony Reeves presented me with a stack of documents to sign, telling me they 'just confirm what we agreed to.' After signing, I was given the documents in an envelope and left the dealership. Upon reviewing the paperwork at home on March 9, I discovered: (1) the interest rate on the contract is 7.2% APR — not the 4.9% we agreed to — generating an additional $3,840 in interest over the 60-month loan, (2) three undisclosed add-ons were included: 'LoJack Recovery System' ($895), 'Fabric Protection Package' ($495), and 'VIN Etching' ($299) — totaling $1,689 in charges I never agreed to and was never told about, (3) the total financed amount is $35,089, not the $33,400 agreed upon. I returned to the dealership on March 10 and spoke with Tony Reeves, who said the add-ons are 'standard on all vehicles' and the rate change was because 'Capital One came back with a different number.' When I asked to cancel the add-ons, he said they were 'already installed and non-refundable.' Under California Vehicle Code §11713.18(a)(1) (Rees-Levering Act amendments), all optional add-ons must be separately itemized and the buyer must provide affirmative consent. I did not consent.",
    incidentDate: "2026-03-08",
  },
  financials: {
    amountOwed: 5529,
    currency: "USD",
  },
  desiredOutcome:
    "Within 14 days: (1) Refund of $1,689 for the three unauthorized dealer add-ons, (2) rewrite the financing contract at the agreed 4.9% APR or provide documentation of the Capital One denial, (3) if the rate cannot be restored, provide the $3,840 interest differential as a principal reduction. Failure to resolve will result in a complaint to the California Department of Motor Vehicles and the California Attorney General's Office, and a lawsuit under the Rees-Levering Motor Vehicle Sales Finance Act (Cal. Civ. Code §2981 et seq.) and the California Consumer Legal Remedies Act (CLRA, Cal. Civ. Code §1750 et seq.), which provides for actual damages, statutory penalties, and attorney's fees.",
  deadlineDate: "2026-05-02",
  communications: {
    summary:
      "Visited dealership in person March 10 — Tony Reeves refused to remove add-ons or adjust rate. Called General Manager's office March 14 — was told he was 'unavailable' and would call back. No callback received. Sent written complaint via email to the dealership's customer service address on March 20. Received generic reply on March 22 stating 'all sales are final.'",
    lastContactDate: "2026-03-22",
    method: "email",
  },
  toneAndDelivery: {
    tone: "firm",
    deliveryMethod: "certified-mail",
  },
  exhibits: [
    {
      label: "Exhibit A",
      description:
        "Retail Installment Sale Contract dated March 8, 2026, showing 7.2% APR and $35,089 financed amount",
      hasAttachment: true,
    },
    {
      label: "Exhibit B",
      description: "Capital One Auto Finance pre-approval letter showing 4.9% APR",
      hasAttachment: true,
    },
    {
      label: "Exhibit C",
      description:
        "Buyer's Order / negotiation worksheet showing agreed $33,400 out-the-door price",
      hasAttachment: true,
    },
    {
      label: "Exhibit D",
      description:
        "Email exchange with dealership customer service, March 20–22, 2026",
      hasAttachment: true,
    },
  ],
  situationFields: {
    businessName: "AutoNation Honda of South Bay",
    purchaseDate: "2026-03-08",
    productOrService: "2026 Honda Accord Sport, VIN: 1HGCV2F34RA012847",
    complaintCategory: "Bait-and-switch financing / undisclosed dealer add-ons",
  },
};

/** All test cases as an array for iteration */
export const ALL_INTAKE_CASES = [
  { name: "Demand Letter — Unpaid Contractor", intake: demandLetterUnpaidContractor },
  { name: "Employment — Wage Theft & Missed Breaks", intake: employmentWageTheft },
  { name: "Landlord-Tenant — Mold & Retaliation", intake: landlordHabitability },
  { name: "Personal Injury — Rideshare Accident", intake: personalInjuryRideshare },
  { name: "Cease & Desist — Online Defamation", intake: ceaseDesistDefamation },
  { name: "Insurance Dispute — Wrongful Denial", intake: insuranceDeniedClaim },
  { name: "Consumer Complaint — Auto Dealer Fraud", intake: consumerAutoDealer },
] as const;
