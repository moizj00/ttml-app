/**
 * Seed Approved Letters Script
 *
 * Inserts 15 realistic approved letter requests with full content for the
 * test-subscriber (user_id 1612) assigned to test-attorney (user_id 1614).
 *
 * For each letter:
 *   - 1 letter_request row (status: approved)
 *   - 2 letter_versions: ai_draft + final_approved (400-600 words each)
 *   - 1 review_actions row (attorney approved)
 *   - Embedding generated for final_approved version via embedAndStoreLetterVersion
 *
 * Also inserts/updates the subscription for user_id 1612.
 *
 * Usage:
 *   npx tsx scripts/seed-letters.ts
 *
 * Idempotent:
 *   - Skips letter_requests with matching subject for user 1612
 *   - On re-run, embeds any final_approved versions still missing embeddings
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  letterRequests,
  letterVersions,
  reviewActions,
  subscriptions,
  type InsertLetterRequest,
  type InsertLetterVersion,
  type InsertReviewAction,
  type InsertSubscription,
} from "../drizzle/schema";
import type { IntakeJson } from "../shared/types";
import { generateEmbedding } from "../server/pipeline/embeddings";

config({ path: ".env.local" });
config();

const DATABASE_URL =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!DATABASE_URL) {
  console.error("Missing required env var: DATABASE_URL or SUPABASE_DATABASE_URL");
  process.exit(1);
}

const pgClient = postgres(DATABASE_URL, { ssl: "require", max: 3 });
const db = drizzle(pgClient);

const SUBSCRIBER_USER_ID = 1612;
const ATTORNEY_USER_ID = 1614;

interface LetterSeed {
  letterType: InsertLetterRequest["letterType"];
  subject: string;
  jurisdictionState: string;
  jurisdictionCity: string;
  intakeJson: IntakeJson;
  aiDraft: string;
  finalApproved: string;
  reviewNote: string;
  createdDaysAgo: number;
}

const LETTERS: LetterSeed[] = [
  // ─── 1. Demand Letter — CA — Unpaid Freelance Invoice ───
  {
    letterType: "demand-letter",
    subject: "Demand for Payment — Unpaid Web Development Invoice #1042 ($8,400)",
    jurisdictionState: "CA",
    jurisdictionCity: "San Francisco",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "demand-letter",
      sender: {
        name: "Marcus T. Holloway",
        address: "482 Brannan Street, Apt 3C, San Francisco, CA 94107",
        email: "marcus.holloway.dev@gmail.com",
        phone: "(415) 832-9047",
      },
      recipient: {
        name: "Priya Nair, CEO",
        address: "NovaSpark Technologies, Inc., 1200 Market Street, Suite 400, San Francisco, CA 94102",
        email: "priya@novasparktec.com",
      },
      jurisdiction: { country: "US", state: "CA", city: "San Francisco" },
      matter: {
        category: "demand-letter",
        subject: "Unpaid freelance web development invoice #1042 for $8,400",
        description:
          "I completed a full-stack web application for NovaSpark Technologies per our signed contract dated August 14, 2024. The final deliverables were accepted on October 3, 2024. Invoice #1042 for $8,400 was due October 17, 2024. Despite three follow-up emails and two phone calls, payment has not been received as of the date of this letter.",
        incidentDate: "2024-10-17",
      },
      financials: { amountOwed: 8400, currency: "USD" },
      desiredOutcome:
        "Full payment of $8,400 within 14 days of receipt of this letter, or I will initiate legal proceedings in San Francisco County Superior Court.",
      deadlineDate: "2024-12-01",
      communications: {
        summary:
          "Three follow-up emails sent October 18, October 25, and November 8. Two phone calls on November 2 and November 14 went to voicemail. No response received.",
        lastContactDate: "2024-11-14",
        method: "email",
      },
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Marcus T. Holloway
482 Brannan Street, Apt 3C
San Francisco, CA 94107
(415) 832-9047
marcus.holloway.dev@gmail.com

November 18, 2024

Priya Nair, CEO
NovaSpark Technologies, Inc.
1200 Market Street, Suite 400
San Francisco, CA 94102

RE: DEMAND FOR PAYMENT — Invoice #1042 — $8,400 Past Due

Dear Ms. Nair:

I write to formally demand payment of $8,400 representing the outstanding balance owed to me for web development services rendered to NovaSpark Technologies, Inc. pursuant to our signed services agreement dated August 14, 2024. Despite repeated good-faith efforts to resolve this matter informally, the balance remains unpaid and I am now compelled to put this demand in writing.

Under the terms of our contract, I agreed to design, develop, and deploy a complete full-stack web application for NovaSpark Technologies. My scope of work encompassed the front-end user interface, back-end API layer, database schema and integration, third-party service integrations, deployment configuration, and post-launch support documentation. I delivered all required deliverables on schedule, and you confirmed acceptance of the completed application by email on October 3, 2024. Invoice #1042 was issued that same day establishing a payment due date of October 17, 2024. That deadline has now passed by more than thirty days without any payment, explanation, or acknowledgment from your company.

I made multiple good-faith attempts to resolve this before resorting to a formal demand. On October 18, 2024, I sent a written follow-up email referencing Invoice #1042 and requesting payment status. Receiving no reply, I followed up again on October 25 and November 8, 2024. I also left voicemail messages on November 2 and November 14. None of these communications produced any response whatsoever — no payment, no dispute, no timeline, and no explanation.

The legal basis for this demand is straightforward. Under California Civil Code Section 3300 et seq., I am entitled to recover the full contract price for services rendered and accepted under a valid written agreement. California Business and Professions Code Section 6450 et seq. further protects independent contractors from nonpayment for completed work product. Your acceptance of the deliverables on October 3, 2024 constitutes acknowledgment that the work was completed to specification and that payment is due. Your failure to remit payment within the agreed timeframe constitutes a breach of our contract.

If you believe any portion of Invoice #1042 is disputed, you had an obligation under our agreement and under basic principles of contract law to raise that dispute in writing before the payment due date. No such dispute was raised. California Civil Code Section 3289 further provides that interest accrues on unpaid contract obligations at the legal rate of ten percent per annum from the date payment was due, meaning additional interest has been accruing since October 17, 2024.

Accordingly, I formally demand that you remit payment of $8,400 in full no later than December 1, 2024. Payment may be made by check payable to Marcus T. Holloway or by wire transfer using the banking information provided in Invoice #1042.

If I do not receive full payment by December 1, 2024, I will file a civil action in San Francisco County Superior Court seeking the principal balance of $8,400, prejudgment interest at ten percent per annum, court costs, and attorney's fees to the extent permitted by our agreement and applicable law. I may also report this matter to the California Labor Commissioner's office. I sincerely hope NovaSpark will resolve this without litigation.

Sincerely,

Marcus T. Holloway
Independent Web Developer`,

    finalApproved: `Marcus T. Holloway
482 Brannan Street, Apt 3C
San Francisco, CA 94107
(415) 832-9047
marcus.holloway.dev@gmail.com

November 18, 2024

Priya Nair, CEO
NovaSpark Technologies, Inc.
1200 Market Street, Suite 400
San Francisco, CA 94102

RE: FORMAL DEMAND FOR PAYMENT — Invoice #1042 — $8,400 Overdue

Dear Ms. Nair:

This letter constitutes a formal demand for immediate payment of $8,400, representing the full outstanding balance due under our executed services agreement dated August 14, 2024. All good-faith attempts to resolve this matter informally have been exhausted, and I am now compelled to place this demand in writing before pursuing legal remedies.

Under the executed agreement, I designed, developed, and deployed a complete full-stack web application for NovaSpark Technologies, encompassing the front-end user interface, back-end API layer, database integration, third-party service connections, deployment configuration, and post-launch documentation. All deliverables were provided on schedule. You confirmed acceptance of the completed application by email on October 3, 2024. Invoice #1042, issued that day, established a payment due date of October 17, 2024. That deadline has now passed by more than thirty days without payment, dispute, or any substantive communication from your company.

My efforts to resolve this informally included written follow-up emails on October 18, October 25, and November 8, 2024, and voicemail messages left on November 2 and November 14, 2024. None of these communications received a response.

The legal basis for this claim is clear. California Civil Code Section 3300 et seq. entitles me to recover the full contract price for services rendered and accepted under a valid written agreement. California Business and Professions Code Section 6450 et seq. additionally protects independent contractors from nonpayment for completed work. Your written acceptance of the deliverables on October 3, 2024 confirms the work was completed to specification and that payment is owed. No written dispute of Invoice #1042 was raised before or after the due date, as would have been required under our agreement. Interest accrues on the unpaid balance at ten percent per annum pursuant to California Civil Code Section 3289 from October 17, 2024 forward.

You are hereby formally notified that full payment of $8,400 must be received no later than December 1, 2024. Payment should be made by check payable to Marcus T. Holloway or by wire transfer using the account information in Invoice #1042.

Should payment not be received by December 1, 2024, I will file a civil action in San Francisco County Superior Court seeking the principal balance, accrued interest, all recoverable costs, and attorney's fees as permitted by our agreement and applicable law. I will also report this matter to the California Labor Commissioner. This letter represents a final opportunity to resolve this matter without litigation.

Sincerely,

Marcus T. Holloway
Independent Web Developer`,
    reviewNote:
      "Well-structured CA demand with correct Civil Code and B&P Code citations. Minor polish on opening. Approved.",
    createdDaysAgo: 45,
  },

  // ─── 2. Cease and Desist — NY — Trademark Infringement ───
  {
    letterType: "cease-and-desist",
    subject: "Cease and Desist — Trademark Infringement — 'Crumb & Crown Bakery' vs. NationalBread Co.",
    jurisdictionState: "NY",
    jurisdictionCity: "Brooklyn",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "cease-and-desist",
      sender: {
        name: "Elena Vasquez",
        address: "Crumb & Crown Bakery, 214 Atlantic Avenue, Brooklyn, NY 11201",
        email: "elena@crumbandbrown.com",
        phone: "(718) 555-0192",
      },
      recipient: {
        name: "Legal Department",
        address:
          "NationalBread Co., LLC, 500 Fifth Avenue, 34th Floor, New York, NY 10110",
      },
      jurisdiction: { country: "US", state: "NY", city: "Brooklyn" },
      matter: {
        category: "cease-and-desist",
        subject:
          "Trademark infringement of 'Crumb & Crown' brand name by NationalBread Co.",
        description:
          "I operate Crumb & Crown Bakery, a small artisan bakery in Brooklyn that I founded in 2019. I hold a registered New York State trademark for 'Crumb & Crown' (Registration No. NY-TM-2019-08842). In September 2024, NationalBread Co. opened two Manhattan locations operating under the name 'Crown & Crumb Artisan Breads.' The similarity in name, market, and product category is causing customer confusion and harming my business.",
        incidentDate: "2024-09-15",
      },
      desiredOutcome:
        "Immediate cessation of all use of 'Crown & Crumb' or any confusingly similar mark, and written confirmation within 10 days.",
      communications: {
        summary:
          "Sent informal email to NationalBread Co. on October 2, 2024. Received automated reply only. No substantive response.",
        lastContactDate: "2024-10-02",
        method: "email",
      },
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Elena Vasquez
Crumb & Crown Bakery
214 Atlantic Avenue
Brooklyn, NY 11201
(718) 555-0192

November 5, 2024

Legal Department
NationalBread Co., LLC
500 Fifth Avenue, 34th Floor
New York, NY 10110

RE: CEASE AND DESIST — TRADEMARK INFRINGEMENT — "CROWN & CRUMB ARTISAN BREADS"

Dear Counsel:

This letter constitutes a formal cease and desist demand on behalf of Elena Vasquez, owner and operator of Crumb & Crown Bakery, located at 214 Atlantic Avenue, Brooklyn, NY 11201. I am writing to demand the immediate cessation of all use of the mark "Crown & Crumb Artisan Breads," and any other designation confusingly similar to my federally and state-protected mark, CRUMB & CROWN.

Crumb & Crown Bakery has operated continuously in Brooklyn, New York since 2019, offering artisan baked goods and bakery services under the CRUMB & CROWN name. I hold New York State Trademark Registration No. NY-TM-2019-08842 for the mark "CRUMB & CROWN" covering artisan baked goods and related bakery services. Over five years of continuous operation, the Crumb & Crown name has acquired significant consumer recognition and secondary meaning in the New York metropolitan area. My bakery has been featured in local press and has developed a loyal customer base that specifically associates the CRUMB & CROWN name with my products and establishment.

In September 2024, NationalBread Co., LLC opened retail bakery locations in Manhattan operating under the name "Crown & Crumb Artisan Breads." The marks are composed of the same two words — "Crown" and "Crumb" — merely reversed in order. They are used in connection with identical goods and services (artisan baked goods) and identical geographic market (New York City). This configuration creates a high likelihood of consumer confusion that constitutes trademark infringement under New York common law and false designation of origin cognizable under the Lanham Act, 15 U.S.C. § 1125(a). Courts have repeatedly held that transposed or rearranged word marks covering identical goods are confusingly similar. See, e.g., Grotrian, Helfferich, Schulz, Th. Steinweg Nachf. v. Steinway & Sons, 523 F.2d 1331 (2d Cir. 1975).

My client has already received multiple customer inquiries from individuals who confused NationalBread Co.'s Manhattan locations with Crumb & Crown Bakery, demonstrating actual confusion — the most compelling evidence of trademark infringement. I sent an informal written notice to NationalBread Co. on October 2, 2024 requesting voluntary remediation. I received only an automated acknowledgment and no substantive response.

Accordingly, I formally demand that NationalBread Co., LLC: (1) immediately and permanently cease all use of the mark "Crown & Crumb," or any other mark confusingly similar to "Crumb & Crown," in connection with any bakery, food service, or related goods or services in the State of New York; (2) immediately remove or destroy all signage, packaging, marketing materials, domain registrations, and social media profiles bearing or displaying the infringing mark; and (3) provide written confirmation of full compliance with items (1) and (2) within ten (10) days of receipt of this letter.

Failure to comply within the stated deadline will compel me to seek emergency injunctive relief in federal or state court, as well as monetary damages including disgorgement of profits, actual damages, enhanced damages for willful infringement, and attorney's fees and costs under 15 U.S.C. § 1117. All rights and remedies are expressly reserved.

Sincerely,

Elena Vasquez
Owner, Crumb & Crown Bakery`,

    finalApproved: `Elena Vasquez
Crumb & Crown Bakery
214 Atlantic Avenue
Brooklyn, NY 11201
(718) 555-0192

November 5, 2024

Legal Department
NationalBread Co., LLC
500 Fifth Avenue, 34th Floor
New York, NY 10110

RE: CEASE AND DESIST DEMAND — TRADEMARK INFRINGEMENT — "CROWN & CRUMB ARTISAN BREADS"

Dear Counsel:

This letter constitutes a formal cease and desist demand on behalf of Elena Vasquez, owner and operator of Crumb & Crown Bakery, 214 Atlantic Avenue, Brooklyn, NY 11201. You are hereby demanded to immediately cease all use of the mark "Crown & Crumb Artisan Breads" and any other designation confusingly similar to my registered mark, CRUMB & CROWN.

Background: Crumb & Crown Bakery has operated continuously in Brooklyn, New York since 2019, providing artisan baked goods under the CRUMB & CROWN name. I hold New York State Trademark Registration No. NY-TM-2019-08842 for "CRUMB & CROWN" covering artisan baked goods and bakery services in this jurisdiction. Through five years of consistent use, the mark has acquired substantial consumer recognition and secondary meaning throughout the New York metropolitan area. My bakery has been featured in regional press and has cultivated a loyal customer base that identifies CRUMB & CROWN exclusively with my products.

Infringement: In September 2024, NationalBread Co., LLC opened Manhattan retail locations under the name "Crown & Crumb Artisan Breads." The marks comprise the same two words — "Crown" and "Crumb" — simply reversed. They are used in connection with identical goods (artisan baked goods) in the identical geographic market (New York City). This creates a high likelihood of consumer confusion constituting trademark infringement under New York common law and false designation of origin under the Lanham Act, 15 U.S.C. § 1125(a). Courts in this Circuit consistently find transposed or rearranged word marks covering identical goods to be confusingly similar. See Grotrian, Helfferich, Schulz, Th. Steinweg Nachf. v. Steinway & Sons, 523 F.2d 1331 (2d Cir. 1975). I have already received customer inquiries demonstrating actual confusion — the most compelling evidence of infringement — causing quantifiable harm to my goodwill and business.

Prior Notice: An informal written notice sent to NationalBread Co. on October 2, 2024 produced only an automated reply and no substantive response.

Demands: NationalBread Co., LLC is hereby directed, within ten (10) days of receipt of this letter, to:

1. Immediately and permanently cease all use of "Crown & Crumb," or any designation confusingly similar to "Crumb & Crown," in connection with bakery, food service, or related goods or services in the State of New York;
2. Remove or destroy all signage, packaging, marketing materials, domain registrations, and social media profiles bearing or displaying the infringing mark; and
3. Provide written confirmation of full compliance with the foregoing demands.

Failure to comply within the stated period will compel the immediate filing of an action in federal or state court for injunctive relief, disgorgement of profits, actual damages, enhanced damages for willful infringement, and attorney's fees and costs under 15 U.S.C. § 1117. All rights and remedies are expressly reserved.

Sincerely,

Elena Vasquez
Owner, Crumb & Crown Bakery`,
    reviewNote:
      "Good NY trademark cease and desist. Added Grotrian case citation, strengthened demand enumeration. Approved.",
    createdDaysAgo: 40,
  },

  // ─── 3. Employment Dispute — TX — Wrongful Termination / FMLA ───
  {
    letterType: "employment-dispute",
    subject:
      "Notice of Wrongful Termination — FMLA Retaliation — James Okafor v. Summit Logistics Corp.",
    jurisdictionState: "TX",
    jurisdictionCity: "Houston",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "employment-dispute",
      sender: {
        name: "James Okafor",
        address: "9821 Fondren Road, Apt 12, Houston, TX 77096",
        email: "jamesokafor77@email.com",
        phone: "(713) 555-0347",
      },
      recipient: {
        name: "HR Director, Summit Logistics Corp.",
        address:
          "Summit Logistics Corp., 4400 Post Oak Parkway, Suite 700, Houston, TX 77027",
      },
      jurisdiction: { country: "US", state: "TX", city: "Houston" },
      matter: {
        category: "employment-dispute",
        subject:
          "Wrongful termination following approved FMLA leave — warehouse associate",
        description:
          "I was employed as a warehouse associate at Summit Logistics Corp. for four years. On August 5, 2024, my doctor approved me for FMLA leave for a serious health condition. I returned from FMLA leave on September 16, 2024, and was told by my supervisor on September 17, 2024 that my position had been eliminated. Three other employees with less seniority in the same role were retained. I believe my termination was retaliatory and violates the FMLA.",
        incidentDate: "2024-09-17",
      },
      desiredOutcome:
        "Reinstatement to my former position with full back pay and benefits, or a settlement of $45,000 within 21 days.",
      deadlineDate: "2024-12-15",
      communications: {
        summary:
          "Submitted written complaint to HR on September 20, 2024. HR acknowledged receipt but provided no substantive response.",
        lastContactDate: "2024-09-20",
        method: "letter",
      },
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `James Okafor
9821 Fondren Road, Apt 12
Houston, TX 77096
(713) 555-0347

November 22, 2024

HR Director
Summit Logistics Corp.
4400 Post Oak Parkway, Suite 700
Houston, TX 77027

RE: NOTICE OF WRONGFUL TERMINATION — FMLA RETALIATION — DEMAND FOR REINSTATEMENT OR SETTLEMENT

Dear HR Director:

I am writing to formally notify Summit Logistics Corp. that my termination on September 17, 2024 constituted unlawful retaliation in violation of the Family and Medical Leave Act of 1993 (FMLA), 29 U.S.C. § 2601 et seq., and to demand immediate reinstatement with full back pay or, alternatively, a settlement payment of $45,000 within twenty-one (21) days.

I was employed as a warehouse associate at Summit Logistics for four years, from approximately September 2020 through September 17, 2024. Throughout my employment, I received satisfactory or better performance evaluations and had no disciplinary record that could reasonably justify separation. My tenure and performance history directly contradict any suggestion that the elimination of my position was performance-driven.

On August 5, 2024, my treating physician certified a serious health condition as defined under 29 U.S.C. § 2611(11), necessitating FMLA leave. I gave proper notice of my need for leave and took the approved leave beginning August 5, 2024. I returned to active employment on September 16, 2024, within the statute's allotted twelve-week period. The very next day — September 17, 2024 — my supervisor informed me that my warehouse associate position had been eliminated due to restructuring. I was given no advance warning, no written documentation of the restructuring plan, and no opportunity to transfer to another open role within the company.

Critically, at least three other employees in the same warehouse associate classification with less tenure than me were retained following my termination. The same supervisor who terminated me was aware of my FMLA leave and the timing of my return. The temporal proximity between my protected leave, my return, and my termination — separated by a single calendar day — creates a compelling inference of retaliatory intent that cannot be explained by a facially neutral restructuring rationale. Federal courts have consistently held that close temporal proximity between the exercise of FMLA rights and adverse employment action constitutes evidence of retaliatory intent sufficient to withstand summary judgment. See Clark County School Dist. v. Breeden, 532 U.S. 268 (2001).

FMLA Section 2615(a)(2) makes it unlawful for any employer to discharge, demote, or otherwise discriminate against any employee for opposing or participating in any FMLA-protected activity. A violation entitles the affected employee to: lost wages and benefits with interest; liquidated damages equal to the amount of lost wages; reinstatement to the same or an equivalent position; and attorney's fees and costs. See 29 U.S.C. § 2617.

I submitted a written internal grievance to your Human Resources department on September 20, 2024. HR acknowledged receipt, but no substantive investigation response, reinstatement offer, or settlement proposal has been forthcoming in the more than two months since that filing.

I hereby demand, within twenty-one (21) days of receipt of this letter, either: (1) full reinstatement to my warehouse associate position with restoration of all seniority, benefits, and compensation at my prior rate of pay, together with back pay covering the period from September 17, 2024 through the reinstatement date; or (2) a lump-sum settlement payment of $45,000. Absent a satisfactory response by December 15, 2024, I will file a complaint with the U.S. Department of Labor Wage and Hour Division and pursue civil litigation in the Southern District of Texas.

Sincerely,

James Okafor`,

    finalApproved: `James Okafor
9821 Fondren Road, Apt 12
Houston, TX 77096
(713) 555-0347

November 22, 2024

HR Director
Summit Logistics Corp.
4400 Post Oak Parkway, Suite 700
Houston, TX 77027

RE: FORMAL NOTICE OF WRONGFUL TERMINATION — FMLA RETALIATION — DEMAND FOR REINSTATEMENT OR SETTLEMENT

Dear HR Director:

This letter constitutes formal notice that my termination on September 17, 2024 violated the Family and Medical Leave Act of 1993 (FMLA), 29 U.S.C. § 2601 et seq., and a demand for immediate reinstatement with full back pay or, alternatively, a settlement payment of $45,000 within twenty-one (21) days.

Employment History: I served as a warehouse associate at Summit Logistics Corp. from approximately September 2020 through September 17, 2024 — a four-year tenure marked by satisfactory or better performance evaluations and no disciplinary record. Nothing in my employment history supports a performance-based justification for my separation.

Protected Leave and Termination: On August 5, 2024, my physician certified a serious health condition under 29 U.S.C. § 2611(11) requiring FMLA leave. I provided proper notice, took the approved leave, and returned to work on September 16, 2024, within the statutory twelve-week period. The following day, September 17, 2024, my supervisor informed me that my position had been eliminated. I received no advance notice of any restructuring, no written documentation of the business rationale, and no opportunity to transfer to comparable open roles within the company.

Pretext Evidence: At least three other warehouse associates with less seniority than I hold were retained following my termination. The supervisor who delivered the termination decision had direct knowledge of my FMLA leave and my return date. The one-day gap between my return from protected leave and my termination creates an unmistakable inference of retaliatory intent. Federal courts consistently treat such close temporal proximity as probative evidence of retaliation sufficient to survive summary judgment. See Clark County School Dist. v. Breeden, 532 U.S. 268 (2001).

Legal Basis: FMLA Section 2615(a)(2) prohibits discharging any employee for exercising FMLA rights. A violation exposes Summit Logistics to liability for: all lost wages and benefits; interest thereon; liquidated damages equal to the wage loss; reinstatement to the same or an equivalent position; and attorney's fees and costs. See 29 U.S.C. § 2617.

Failure to Respond: I filed a written internal grievance with Human Resources on September 20, 2024. More than two months have elapsed without a substantive investigation response, reinstatement offer, or settlement proposal.

Demand: Within twenty-one (21) days of receipt of this letter, Summit Logistics Corp. must provide one of the following: (1) full reinstatement to my warehouse associate position with restoration of all seniority, benefits, and rate of pay, plus back pay from September 17, 2024 through the reinstatement date; or (2) a lump-sum settlement of $45,000. Absent a satisfactory response by December 15, 2024, I will file a complaint with the U.S. Department of Labor Wage and Hour Division and commence civil litigation in federal court in the Southern District of Texas. All rights and remedies are expressly reserved.

Sincerely,

James Okafor`,
    reviewNote:
      "Strong FMLA retaliation letter with Breeden cite. Added pretext section and cleaned demand structure. Approved.",
    createdDaysAgo: 38,
  },

  // ─── 4. Landlord–Tenant — FL — Security Deposit ───
  {
    letterType: "landlord-tenant",
    subject:
      "Demand for Return of Security Deposit ($2,200) — 1447 Pelican Bay Dr., Apt 5B, Naples, FL",
    jurisdictionState: "FL",
    jurisdictionCity: "Naples",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "landlord-tenant",
      sender: {
        name: "Brittany Summers",
        address: "221 Gulf Shore Blvd N, Naples, FL 34102",
        email: "bsummers.naples@email.com",
        phone: "(239) 555-0812",
      },
      recipient: {
        name: "Robert Calloway",
        address:
          "Calloway Property Management, 8800 Tamiami Trail N, Suite 200, Naples, FL 34108",
      },
      jurisdiction: { country: "US", state: "FL", city: "Naples" },
      matter: {
        category: "landlord-tenant",
        subject:
          "Security deposit of $2,200 not returned after vacating apartment on October 1, 2024",
        description:
          "I rented Apt 5B at 1447 Pelican Bay Dr., Naples, FL from November 1, 2022 to October 1, 2024. I paid a security deposit of $2,200. I vacated on October 1, 2024 and left the unit in clean condition. Under Florida Statute §83.49, the landlord had 30 days to return the deposit or provide a written itemized claim. As of November 5, 2024 — 35 days after vacating — I have received neither.",
        incidentDate: "2024-10-01",
      },
      financials: { amountOwed: 2200, currency: "USD" },
      desiredOutcome:
        "Full return of security deposit of $2,200 within 15 days, or I will pursue all remedies under Florida Statute §83.49 including double damages.",
      deadlineDate: "2024-11-20",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Brittany Summers
221 Gulf Shore Blvd N
Naples, FL 34102
(239) 555-0812

November 5, 2024

Robert Calloway
Calloway Property Management
8800 Tamiami Trail N, Suite 200
Naples, FL 34108

RE: DEMAND FOR RETURN OF SECURITY DEPOSIT — $2,200 — 1447 PELICAN BAY DR., APT 5B

Dear Mr. Calloway:

I am writing to demand the immediate return of my security deposit in the amount of $2,200, which you have unlawfully withheld in violation of Florida Statute Section 83.49. Your failure to comply with the statutory requirements within the mandated thirty-day period has significant legal consequences, and I expect full reimbursement without further delay.

I leased Apartment 5B at 1447 Pelican Bay Drive, Naples, Florida, pursuant to a written lease agreement that commenced November 1, 2022. I occupied the property for two full years and vacated on October 1, 2024, upon the natural expiration of my lease term. Prior to vacating, I provided proper written notice of my intent to vacate, thoroughly cleaned the unit, repaired any minor wear items at my own expense, and returned all keys and access devices to your office. The unit was left in clean, undamaged condition consistent with ordinary wear and tear, which Florida law expressly excludes from permissible deductions.

Florida Statute Section 83.49(3)(a) imposes a mandatory duty on landlords. Within thirty (30) days of a tenant vacating the premises, a landlord must either: return the security deposit in full; or mail the tenant a written notice of intention to impose a claim on the deposit, itemizing each specific deduction with the amount claimed. Compliance with this statute is not discretionary. It is a bright-line obligation with serious consequences for noncompliance.

The statutory thirty-day deadline in my case expired on November 1, 2024. As of today — November 5, 2024, thirty-five days after I vacated — I have received neither the return of my deposit nor any written notice of claimed deductions. You have not contacted me by mail, email, phone, or any other means regarding this deposit. Your complete silence during the statutory period is not excusable.

Under Florida Statute Section 83.49(3)(c), a landlord who fails to comply with the notice requirements of subsection (3)(a) forfeits the right to impose any claim against the security deposit. Moreover, where a landlord in bad faith fails to return a security deposit, the tenant may recover the full deposit, plus a penalty of up to twice the amount of the deposit, plus court costs and attorney's fees in a civil action. Your statutory forfeiture of any claimed deductions means the entire $2,200 must be returned to me.

Accordingly, I demand that you return my security deposit of $2,200 in full within fifteen (15) days of receipt of this letter, no later than November 20, 2024. Payment must be made by check payable to Brittany Summers and mailed to my current address at 221 Gulf Shore Blvd N, Naples, FL 34102, via certified mail.

If you fail to return my deposit by November 20, 2024, I will file a civil action in Collier County Court seeking return of the full deposit, statutory damages of up to twice the deposit amount, court costs, and attorney's fees. I will also file a complaint with the Florida Department of Agriculture and Consumer Services. The cost of litigation will far exceed the amount of this deposit. I urge you to resolve this matter promptly.

Sincerely,

Brittany Summers`,

    finalApproved: `Brittany Summers
221 Gulf Shore Blvd N
Naples, FL 34102
(239) 555-0812

November 5, 2024

Robert Calloway
Calloway Property Management
8800 Tamiami Trail N, Suite 200
Naples, FL 34108

RE: FORMAL DEMAND — RETURN OF SECURITY DEPOSIT — $2,200 — 1447 PELICAN BAY DR., APT 5B

Dear Mr. Calloway:

This letter constitutes a formal demand for the immediate return of my security deposit of $2,200, which you have unlawfully withheld in violation of Florida Statute Section 83.49. Your failure to meet the statutory thirty-day deadline has legal consequences that I am prepared to enforce.

Tenancy and Vacating: I leased Apartment 5B at 1447 Pelican Bay Drive, Naples, Florida from November 1, 2022 through October 1, 2024 — a two-year tenancy in which I was never late on rent and received no complaints from management. I provided written notice of vacating in advance, thoroughly cleaned the unit, patched minor scuffs at my own expense, and returned all keys along with all parking passes and access cards on my move-out date. I also photographed the unit extensively at the time of return. The premises were left in clean condition entirely consistent with ordinary wear and tear — the standard Florida law requires before any deductions may lawfully be taken from a security deposit.

Statutory Violation: Florida Statute Section 83.49(3)(a) requires a landlord to act within thirty (30) days of a tenant vacating: either return the deposit in full, or mail a written itemized notice of any intended claims. Both options are clear, unambiguous obligations with no exceptions. My vacate date was October 1, 2024. The thirty-day statutory deadline was November 1, 2024. As of November 5, 2024 — thirty-five days after I vacated — I have received neither the deposit nor any written communication whatsoever from your office.

Legal Consequences: Under Florida Statute Section 83.49(3)(c), a landlord who fails to comply with the notice requirements of subsection (3)(a) forfeits the right to impose any claim against the security deposit. Additionally, a landlord who in bad faith fails to return a security deposit may be liable for the full deposit amount, a penalty of up to twice the deposit, court costs, and attorney's fees. Your total statutory forfeiture of any claimed deductions means the entire $2,200 must be returned unconditionally.

Demand: Return the full $2,200 security deposit no later than November 20, 2024, by check payable to Brittany Summers, mailed via certified mail to the address above.

If payment is not received by November 20, 2024, I will file a civil action in Collier County Court seeking the full deposit, statutory double-damages, court costs, and attorney's fees. I will also submit a consumer complaint to the Florida Department of Agriculture and Consumer Services. The expense of that litigation will substantially exceed the amount at issue. Prompt payment is strongly in your interest.

Sincerely,

Brittany Summers`,
    reviewNote:
      "Clean FL §83.49 security deposit letter. Added forfeiture consequence paragraph and polished demand. Approved.",
    createdDaysAgo: 35,
  },

  // ─── 5. Personal Injury Demand — IL — Slip and Fall ───
  {
    letterType: "personal-injury-demand",
    subject:
      "Personal Injury Demand — Slip and Fall at Midlake Foods, Chicago, IL — $14,500 in Medical Expenses",
    jurisdictionState: "IL",
    jurisdictionCity: "Chicago",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "personal-injury-demand",
      sender: {
        name: "Donna R. Patterson",
        address: "3314 N. Clark Street, Chicago, IL 60657",
        email: "donnapatterson.chicago@email.com",
        phone: "(312) 555-0764",
      },
      recipient: {
        name: "Risk Management Department",
        address:
          "Midlake Foods, Inc., 400 W. Erie Street, Suite 1800, Chicago, IL 60654",
      },
      jurisdiction: { country: "US", state: "IL", city: "Chicago" },
      matter: {
        category: "personal-injury-demand",
        subject:
          "Slip and fall on wet unmarked floor at Midlake Foods, 800 N. Michigan Ave., Chicago, on November 3, 2024",
        description:
          "On November 3, 2024, I slipped and fell on a wet, unmarked floor in the produce section of Midlake Foods at 800 N. Michigan Ave. No wet floor signs were present. I sustained a left wrist fracture and lower back strain. Medical expenses to date are $14,500 including ER, orthopedic care, MRI, and physical therapy.",
        incidentDate: "2024-11-03",
      },
      financials: { amountOwed: 14500, currency: "USD" },
      desiredOutcome:
        "Settlement of $32,500 covering $14,500 medical expenses, $6,000 lost wages, and $12,000 pain and suffering.",
      deadlineDate: "2025-01-15",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Donna R. Patterson
3314 N. Clark Street
Chicago, IL 60657
(312) 555-0764

December 10, 2024

Risk Management Department
Midlake Foods, Inc.
400 W. Erie Street, Suite 1800
Chicago, IL 60654

RE: PERSONAL INJURY DEMAND — SLIP AND FALL — NOVEMBER 3, 2024 — 800 N. MICHIGAN AVE., CHICAGO

Dear Risk Management:

This letter is a formal demand for compensation arising from personal injuries sustained by Donna R. Patterson at the Midlake Foods store located at 800 N. Michigan Avenue, Chicago, Illinois on November 3, 2024, resulting directly from Midlake Foods' negligent failure to maintain safe premises and to warn customers of a hazardous condition.

On the morning of November 3, 2024, Ms. Patterson was lawfully present as a paying customer in the produce section of your store. She stepped onto a wet portion of the floor and slipped, falling forward and landing on her left wrist and lower back. The floor was wet from what appeared to be a recent cleaning or produce department spill. No wet floor warning signs, caution cones, or any visible hazard indicators were placed in the area where Ms. Patterson fell. Store employees did not warn Ms. Patterson of the wet condition before the fall.

As a direct result of this fall, Ms. Patterson sustained a displaced fracture of the left distal radius and acute lower back strain with associated lumbar muscle spasm. She was transported to Northwestern Medicine Emergency Department via ambulance, where X-rays and MRI imaging confirmed the injuries. She underwent immobilization treatment for the wrist fracture, received muscle relaxant and pain medication prescriptions, and was referred for orthopedic consultation and physical therapy. She has completed six sessions of physical therapy to date and remains under active medical supervision.

Illinois premises liability law imposes upon every business owner a duty of reasonable care to maintain its premises in a reasonably safe condition for business invitees and to warn them of known or reasonably discoverable hazardous conditions. See Illinois Pattern Jury Instruction 120.02; Ralls v. Village of Glendale Heights, 233 Ill. App. 3d 147 (1992). The absence of any wet floor warning signs in the location where Ms. Patterson fell constitutes a breach of this duty. The direct and proximate cause of her fall and resulting injuries was Midlake Foods' negligence in failing to either remedy or adequately warn of the hazard.

Ms. Patterson's documented damages are as follows:

Emergency transport and ER treatment (Northwestern Medicine): $6,200
Orthopedic consultation and follow-up (two visits): $2,800
Diagnostic imaging — wrist and lumbar MRI: $3,100
Physical therapy (six sessions to date): $2,400
Total medical expenses: $14,500

Ms. Patterson is a self-employed graphic designer. Her wrist fracture and pain prevented her from operating her business at full capacity for approximately six weeks, resulting in documented lost income of $6,000. Ms. Patterson also suffered significant pain, disruption to daily activities, and limitations in her professional and personal life that warrant additional compensation for pain and suffering and loss of normal life of $12,000.

Total damages claimed: $32,500.

To resolve this matter without litigation, I demand that Midlake Foods, Inc. or its liability insurer tender a settlement payment of $32,500 within thirty (30) days of receipt of this letter, no later than January 15, 2025. Comprehensive medical records and billing documentation supporting all claimed expenses will be provided upon written request.

Failure to respond with a reasonable settlement offer by January 15, 2025 will result in the filing of a civil complaint in the Circuit Court of Cook County, Law Division. All rights and remedies are reserved.

Sincerely,

Donna R. Patterson`,

    finalApproved: `Donna R. Patterson
3314 N. Clark Street
Chicago, IL 60657
(312) 555-0764

December 10, 2024

Risk Management Department
Midlake Foods, Inc.
400 W. Erie Street, Suite 1800
Chicago, IL 60654

RE: FORMAL PERSONAL INJURY DEMAND — SLIP AND FALL — NOVEMBER 3, 2024 — 800 N. MICHIGAN AVE., CHICAGO

Dear Risk Management:

This letter is a formal demand for compensation arising from personal injuries sustained by Donna R. Patterson as a direct result of Midlake Foods, Inc.'s negligence at your 800 N. Michigan Avenue, Chicago location on November 3, 2024.

The Incident: On the morning of November 3, 2024, Ms. Patterson was present as a lawfully admitted customer shopping in the produce section of your store at 800 N. Michigan Avenue, Chicago, Illinois. She stepped onto a wet floor and fell hard. The floor was wet from a recent cleaning or spill. No wet floor signs, caution cones, barriers, or any visible hazard warnings were placed in or near the area where she fell. Store employees had actual or constructive notice of the wet condition and failed to warn Ms. Patterson or any customer before the incident.

Injuries and Treatment: The fall caused a displaced fracture of the left distal radius and acute lower back strain with lumbar muscle spasm. Ms. Patterson received emergency transport to Northwestern Medicine Hospital by ambulance, where X-ray and MRI imaging confirmed both injuries. Treatment has included wrist immobilization and casting, prescription pain medications, follow-up orthopedic consultation, and six sessions of physical therapy targeting both the wrist and lumbar regions. Ms. Patterson's ability to perform her work as a self-employed graphic designer has been materially impaired throughout the recovery period, with restrictions continuing at the time this letter is written.

Liability: Illinois premises liability law requires a business to maintain reasonably safe conditions for its invitees and to warn of known or discoverable hazardous conditions. See Illinois Pattern Jury Instruction 120.02; Ralls v. Village of Glendale Heights, 233 Ill. App. 3d 147 (1992). The complete absence of any wet floor warning where Ms. Patterson fell constitutes a direct and proximate breach of this duty, causing her documented injuries.

Damages:

Medical expenses:
  Emergency transport and ER — Northwestern Medicine:    $6,200
  Orthopedic consultation and follow-up visits:          $2,800
  MRI imaging (wrist and lumbar spine):                  $3,100
  Physical therapy — 6 sessions:                         $2,400
  Total medical:                                        $14,500

Lost income (6 weeks, self-employed graphic designer):  $6,000
Pain, suffering, and loss of normal life:              $12,000
Total claimed:                                         $32,500

Demand: Tender a full and final settlement payment of $32,500 within thirty (30) days, no later than January 15, 2025. Medical records and billing documentation will be provided upon written request.

Absent a satisfactory response by January 15, 2025, Ms. Patterson will file a civil complaint in the Circuit Court of Cook County. All rights and remedies are reserved.

Sincerely,

Donna R. Patterson`,
    reviewNote:
      "Well-structured IL premises liability demand with Ralls cite and detailed damage table. Approved.",
    createdDaysAgo: 30,
  },

  // ─── 6. Insurance Dispute — WA — Homeowner Claim Denial ───
  {
    letterType: "insurance-dispute",
    subject:
      "Appeal of Denied Homeowner Insurance Claim — Policy #WA-HO-8824901 — $22,000 Pipe Burst Damage",
    jurisdictionState: "WA",
    jurisdictionCity: "Seattle",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "insurance-dispute",
      sender: {
        name: "Gerald and Kim Whitmore",
        address: "4822 NE 45th Street, Seattle, WA 98105",
        email: "gwhitmore.seattle@email.com",
        phone: "(206) 555-0931",
      },
      recipient: {
        name: "Claims Review Department",
        address:
          "Pacific Northwest Mutual Insurance Co., 1301 Fifth Avenue, Seattle, WA 98101",
      },
      jurisdiction: { country: "US", state: "WA", city: "Seattle" },
      matter: {
        category: "insurance-dispute",
        subject:
          "Appeal of denial of homeowner's insurance claim for water damage from burst pipe ($22,000)",
        description:
          "On January 8, 2024, a supply pipe burst in our basement during a cold snap, causing $22,000 in water damage. We filed a claim under Policy #WA-HO-8824901. Pacific Northwest Mutual denied the claim citing 'gradual damage' and 'lack of maintenance.' Our licensed plumber confirmed the pipe failure was sudden and caused by a rapid freeze event.",
        incidentDate: "2024-01-08",
      },
      financials: { amountOwed: 22000, currency: "USD" },
      desiredOutcome:
        "Full payment of $22,000 within 30 days or we will file a bad faith complaint with the Washington Insurance Commissioner.",
      deadlineDate: "2025-01-10",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Gerald and Kim Whitmore
4822 NE 45th Street
Seattle, WA 98105
(206) 555-0931

December 12, 2024

Claims Review Department
Pacific Northwest Mutual Insurance Co.
1301 Fifth Avenue
Seattle, WA 98101

RE: FORMAL APPEAL — DENIED CLAIM — POLICY #WA-HO-8824901 — JANUARY 8, 2024 LOSS

Dear Claims Review Department:

We write to formally appeal the denial of our homeowner's insurance claim under Policy Number WA-HO-8824901, and to demand full payment of $22,000 representing covered losses arising from a burst supply pipe at our home on January 8, 2024. We respectfully submit that your March 5, 2024 denial letter mischaracterizes the cause of loss, relies on a conclusion unsupported by an adequate investigation, and applies policy exclusions that do not apply to the facts of this claim.

On the morning of January 8, 2024, during a severe cold weather event across the Seattle area, a pressurized supply pipe in our finished basement burst suddenly and catastrophically. The flood destroyed approximately 900 square feet of engineered hardwood flooring, caused structural water damage to drywall on three walls, damaged electrical fixtures, and resulted in total loss of personal property in the affected area. Three independent licensed contractors submitted repair estimates ranging from $19,800 to $23,100.

We engaged Northwest Pipe Services LLC, a licensed Washington State plumbing contractor, to inspect and report on the cause of failure. Their written report, dated January 22, 2024, states unequivocally that the pipe failure was sudden and acute, caused by a rapid temperature drop generating hydraulic pressure sufficient to rupture the pipe, and that there was no evidence of prior corrosion, deterioration, or maintenance deficiency. This report was provided to your claims adjuster on January 25, 2024.

Despite this independent expert evidence, Pacific Northwest Mutual's denial letter of March 5, 2024 attributed the loss to "gradual damage" and "lack of maintenance." These grounds are contradicted directly and specifically by the plumber's expert report. Our policy, Certificate No. WA-HO-8824901, expressly provides coverage for "sudden and accidental discharge, leakage, or overflow of water from a plumbing system." A pipe rupture caused by a freeze event is, by definition, sudden and accidental. The insurer's characterization of this loss as gradual is factually unsupported and appears to have been reached without conducting any independent engineering or plumbing investigation of its own.

Under Washington Administrative Code 284-30-330, an insurer is prohibited from misrepresenting pertinent facts or policy provisions and from denying a claim on inadequate factual grounds. Pacific Northwest Mutual's denial, rendered without independent technical analysis and contrary to the expert evidence you received, violates WAC 284-30-330. Such conduct is actionable under Washington's Insurance Fair Conduct Act (IFCA), RCW 48.30.015, which provides a private right of action against insurers that unreasonably deny covered claims in violation of their statutory duties, including the right to recover up to three times actual damages and attorney's fees.

We hereby demand that Pacific Northwest Mutual reverse its denial and tender full payment of $22,000 within thirty (30) days of receipt of this letter, no later than January 10, 2025. Enclosed with this appeal are: (1) the Northwest Pipe Services expert report; (2) all three contractor repair estimates; and (3) photographs of the damage taken before remediation. If this appeal is not granted, we will file a complaint with the Washington State Office of the Insurance Commissioner and pursue all remedies available under the IFCA without further notice.

Sincerely,

Gerald and Kim Whitmore`,

    finalApproved: `Gerald and Kim Whitmore
4822 NE 45th Street
Seattle, WA 98105
(206) 555-0931

December 12, 2024

Claims Review Department
Pacific Northwest Mutual Insurance Co.
1301 Fifth Avenue
Seattle, WA 98101

RE: FORMAL APPEAL OF CLAIM DENIAL — POLICY #WA-HO-8824901 — $22,000 LOSS OF JANUARY 8, 2024

Dear Claims Review Department:

This letter constitutes a formal appeal of Pacific Northwest Mutual Insurance Co.'s March 5, 2024 denial of our homeowner's claim under Policy No. WA-HO-8824901, and a demand for payment of $22,000 in covered losses.

The Loss: On January 8, 2024, during an acute Seattle cold weather event, a pressurized water supply pipe in our finished basement burst suddenly and catastrophically. The resulting flood destroyed approximately 900 square feet of engineered hardwood flooring, caused structural water damage to drywall on three walls, damaged electrical fixtures, and resulted in the total loss of personal property in the affected area. Three licensed contractor estimates placed total repair costs between $19,800 and $23,100. We provided the estimates to your adjuster immediately upon receipt.

Expert Evidence of Sudden Cause: We engaged Northwest Pipe Services LLC, a licensed Washington State plumbing contractor, to inspect and report on the cause of failure. Their January 22, 2024 written report states unequivocally that the pipe failure was sudden and acute, caused by a rapid freeze event creating hydraulic pressure sufficient to rupture the pipe, and that there was no evidence of prior corrosion, deterioration, or maintenance deficiency. This report was provided to your claims adjuster on January 25, 2024.

Denial is Unsupported and Potentially Unlawful: Your March 5, 2024 denial letter cited "gradual damage" and "lack of maintenance" — conclusions directly refuted by the independent expert evidence you had in your possession at the time of the denial. Our policy expressly covers "sudden and accidental discharge, leakage, or overflow of water from a plumbing system." A freeze-caused pipe rupture is sudden and accidental by definition, as confirmed by the licensed plumbing contractor's written report. Your denial appears to have been rendered without independent engineering analysis, and in direct contradiction to the expert evidence submitted, which implicates Washington Administrative Code 284-30-330's express prohibition on claim denials based on inadequate investigation. This conduct is also potentially actionable under Washington's Insurance Fair Conduct Act (IFCA), RCW 48.30.015, which provides the right to recover treble actual damages and attorney's fees for any unreasonable denial of a covered claim.

Demand: Reverse the denial and tender payment of $22,000 in full no later than January 10, 2025. Enclosed with this letter are the plumber's expert report, three licensed contractor repair estimates, and pre-remediation photographs documenting the full extent of the damage. Failure to respond or issue payment by January 10, 2025 will result in a formal complaint to the Washington State Office of the Insurance Commissioner and commencement of an IFCA action in King County Superior Court seeking all available remedies. All rights are reserved.

Sincerely,

Gerald and Kim Whitmore`,
    reviewNote:
      "Solid WA insurance bad faith appeal. Correct WAC and IFCA citations. Expert report detail strengthened. Approved.",
    createdDaysAgo: 28,
  },

  // ─── 7. Contract Breach — GA — Construction Contractor ───
  {
    letterType: "contract-breach",
    subject:
      "Notice of Breach — Construction Contract — Abandoned Project — Apex Build Group ($35,000)",
    jurisdictionState: "GA",
    jurisdictionCity: "Atlanta",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "contract-breach",
      sender: {
        name: "Sandra and Devonte Williams",
        address: "714 Briarcliff Road NE, Atlanta, GA 30306",
        email: "williams.atlanta.home@email.com",
        phone: "(404) 555-0288",
      },
      recipient: {
        name: "Michael Torres, Owner",
        address:
          "Apex Build Group, LLC, 2200 Century Pkwy NE, Suite 100, Atlanta, GA 30345",
      },
      jurisdiction: { country: "US", state: "GA", city: "Atlanta" },
      matter: {
        category: "contract-breach",
        subject:
          "Contractor abandoned $35,000 home addition project after receiving $20,000 deposit",
        description:
          "We entered a written construction contract with Apex Build Group, LLC on June 10, 2024 for a $35,000 home addition. We paid $20,000 deposit. After minimal foundation work, Torres stopped responding on September 1, 2024 and abandoned the project. Replacement contractor quotes average $42,000 — a $7,000 overrun.",
        incidentDate: "2024-09-01",
      },
      financials: { amountOwed: 35000, currency: "USD" },
      desiredOutcome:
        "Return of $20,000 deposit and payment of $7,000 completion overrun (total $27,000) within 10 days.",
      deadlineDate: "2024-12-20",
      toneAndDelivery: { tone: "aggressive", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Sandra and Devonte Williams
714 Briarcliff Road NE
Atlanta, GA 30306
(404) 555-0288

December 5, 2024

Michael Torres, Owner
Apex Build Group, LLC
2200 Century Pkwy NE, Suite 100
Atlanta, GA 30345

RE: NOTICE OF BREACH OF CONSTRUCTION CONTRACT — DEMAND FOR $27,000 IN DAMAGES

Dear Mr. Torres:

This letter constitutes formal notice that Apex Build Group, LLC has materially breached the written construction contract dated June 10, 2024, and serves as a demand for payment of $27,000 in damages within ten (10) days. Your company's abandonment of our home addition project — after accepting a substantial deposit — constitutes one of the most fundamental forms of contractor breach recognized under Georgia law, and you will be held fully accountable for the resulting harm.

The contract, signed June 10, 2024, obligated Apex Build Group, LLC to construct a home addition at our property located at 714 Briarcliff Road NE, Atlanta, Georgia. The total contract price was $35,000, with a project completion deadline of September 30, 2024. To secure your performance, we paid a deposit of $20,000 on June 15, 2024. You commenced work in late June 2024, performing only minimal site preparation and foundation excavation before ceasing all operations without notice on or about September 1, 2024. The project site was abandoned — equipment removed, no personnel on-site, and no communication from your company — for the entirety of September and October 2024.

Despite repeated attempts to reach you by phone, text, and email throughout September and October 2024, you have not responded to a single communication. You have provided no explanation for the work stoppage, no revised timeline, no refund of the unearned deposit, and no indication that you intend to resume or complete the contracted work. Your abandonment of the project without justification is a material breach of the contract under O.C.G.A. § 13-6-11 et seq., giving rise to our right to recover all resulting damages.

We have mitigated our damages by soliciting competitive bids from two other licensed Atlanta-area contractors to complete the scope of work your company abandoned. The average of those two bids is $42,000, representing $7,000 more than the original contract price of $35,000. This overrun is a direct, foreseeable, and recoverable consequence of your breach.

Our damages are as follows:

Unearned deposit funds wrongfully retained: $20,000
Excess completion costs above original contract price: $7,000
Total damages: $27,000

Additionally, under O.C.G.A. § 43-41-17, a Georgia licensed contractor who abandons a project without justification faces suspension or revocation of their state contractor's license. We are prepared to file a complaint with the Georgia State Licensing Board for Residential and General Contractors documenting your conduct. Under O.C.G.A. § 10-1-399, your conduct may also constitute an unfair or deceptive trade practice actionable under the Georgia Fair Business Practices Act, which provides for recovery of actual damages, treble damages, and attorney's fees in egregious cases.

You are hereby demanded to remit $27,000 in full within ten (10) days of your receipt of this letter, no later than December 20, 2024. If you fail to comply, we will immediately: (1) file a civil action in Fulton County Superior Court for breach of contract; (2) file a formal complaint with the Georgia State Licensing Board for Residential and General Contractors; and (3) submit a complaint to the Georgia Consumer Protection Division. All rights and remedies are expressly reserved.

Sincerely,

Sandra and Devonte Williams`,

    finalApproved: `Sandra and Devonte Williams
714 Briarcliff Road NE
Atlanta, GA 30306
(404) 555-0288

December 5, 2024

Michael Torres, Owner
Apex Build Group, LLC
2200 Century Pkwy NE, Suite 100
Atlanta, GA 30345

RE: NOTICE OF MATERIAL BREACH — CONSTRUCTION CONTRACT — DEMAND FOR $27,000 IN DAMAGES

Dear Mr. Torres:

This letter constitutes formal notice that Apex Build Group, LLC has materially breached the written construction contract dated June 10, 2024, and a demand for payment of $27,000 in damages no later than December 20, 2024. Your company's abandonment of our contracted home addition project — after accepting a $20,000 deposit — is a textbook breach of contract under Georgia law that exposes you to civil liability and professional sanctions.

Contract and Performance: Under the written construction contract dated June 10, 2024, Apex Build Group agreed to construct a home addition at 714 Briarcliff Road NE, Atlanta, Georgia, for a total price of $35,000, with all work to be completed by September 30, 2024. We paid the required 57% deposit of $20,000 on June 15, 2024, in good faith reliance on your representations as to your experience, licensing, and capacity to complete the project on schedule. You commenced work in late June 2024, performed only minimal foundation excavation, and then abandoned the site entirely on or about September 1, 2024 — removing your equipment, withdrawing all personnel, and ceasing all communications with us without advance notice, explanation, or instruction.

Failure to Respond: Despite repeated phone calls, text messages, and emails throughout September and October 2024, you have not responded to a single communication from us. You have provided no explanation for the work stoppage, no revised completion schedule, no proposal to cure the default, no refund of any portion of the unearned deposit, and no indication whatsoever of any intention to complete the project.

Legal Basis and Consequences: Abandonment of a contracted project after accepting a substantial deposit — and after performing only a fraction of the contracted work — is a material breach of contract under O.C.G.A. § 13-6-11 et seq., entitling us to all resulting damages including the retained deposit and excess completion costs. Your conduct may also constitute an unfair trade practice under the Georgia Fair Business Practices Act, O.C.G.A. § 10-1-399, which provides for treble damages and attorney's fees for willful violations. License abandonment grounds additionally expose you to suspension or revocation under O.C.G.A. § 43-41-17.

Damages:

  Unearned deposit wrongfully retained:           $20,000
  Excess completion cost (avg. bid: $42,000
    minus original contract $35,000):              $7,000
  ─────────────────────────────────────────────
  Total damages:                                  $27,000

Demand: Remit $27,000 within ten (10) days, no later than December 20, 2024. Failure to pay will result in: (1) civil action in Fulton County Superior Court; (2) a formal complaint to the Georgia State Licensing Board for Residential and General Contractors; and (3) a report to the Georgia Consumer Protection Division. All rights are reserved.

Sincerely,

Sandra and Devonte Williams`,
    reviewNote:
      "Strong GA breach letter. Correct O.C.G.A. cites including GFBPA. Detailed damage table. Approved.",
    createdDaysAgo: 25,
  },

  // ─── 8. Consumer Complaint — CO — Odometer Fraud ───
  {
    letterType: "consumer-complaint",
    subject:
      "Consumer Complaint — Odometer Fraud — Boulder Auto Exchange — Used Vehicle Purchase",
    jurisdictionState: "CO",
    jurisdictionCity: "Boulder",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "consumer-complaint",
      sender: {
        name: "Tyler and Megan Kowalski",
        address: "2210 Mapleton Avenue, Boulder, CO 80304",
        email: "kowalski.boulder@email.com",
        phone: "(303) 555-0619",
      },
      recipient: {
        name: "Sales Manager",
        address: "Boulder Auto Exchange, 4455 Broadway, Boulder, CO 80304",
      },
      jurisdiction: { country: "US", state: "CO", city: "Boulder" },
      matter: {
        category: "consumer-complaint",
        subject:
          "Odometer fraud — purchased 2019 Honda CR-V represented as 42,000 miles; actual mileage approximately 87,000 miles",
        description:
          "On October 15, 2024, we purchased a 2019 Honda CR-V (VIN: 2HKRW2H84KH619284) from Boulder Auto Exchange for $21,500. The odometer was disclosed as 42,000 miles. After purchase, an independent mechanic found evidence consistent with 87,000+ miles. A vehicle history report confirmed the vehicle had 87,300 miles recorded at a 2023 service visit.",
        incidentDate: "2024-10-15",
      },
      financials: { amountOwed: 21500, currency: "USD" },
      desiredOutcome:
        "Full refund of $21,500 or compensation payment of $9,500 value differential within 14 days.",
      deadlineDate: "2025-01-05",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Tyler and Megan Kowalski
2210 Mapleton Avenue
Boulder, CO 80304
(303) 555-0619

December 18, 2024

Sales Manager
Boulder Auto Exchange
4455 Broadway
Boulder, CO 80304

RE: FORMAL COMPLAINT — ODOMETER FRAUD — 2019 HONDA CR-V — VIN 2HKRW2H84KH619284

Dear Sales Manager:

This letter constitutes a formal complaint and demand for relief arising from odometer fraud perpetrated in connection with our October 15, 2024 purchase of a 2019 Honda CR-V (VIN: 2HKRW2H84KH619284) from Boulder Auto Exchange. The vehicle was sold to us with a materially false mileage disclosure, causing us significant financial harm, and we intend to pursue all available remedies unless this matter is resolved within fourteen days.

On October 15, 2024, we visited Boulder Auto Exchange to purchase a used vehicle for our family. We were shown a 2019 Honda CR-V listed with 42,000 miles on the odometer, and your sales representatives verbally represented the vehicle's mileage as approximately 42,000 miles. We reviewed and signed the odometer disclosure statement provided by your dealership on the date of sale, which confirmed a mileage reading of 42,000. Relying on that disclosure, we agreed to a purchase price of $21,500. This price was consistent with the fair market value of a 2019 CR-V with low mileage at that time.

Within two weeks of purchase, several components appeared significantly more worn than 42,000 miles would warrant. An independent certified mechanic inspected the brake rotors, suspension bushings, and interior wear surfaces. The mechanic's written report, dated October 30, 2024, states that wear patterns are consistent with approximately 80,000 to 90,000 miles of use. We obtained a CarFax vehicle history report (No. CFX-20241102), which confirmed a documented service visit in March 2023 at which the vehicle's mileage was recorded as 87,300 — more than double the mileage you disclosed at the October 2024 sale.

This conduct constitutes odometer fraud under the Federal Motor Vehicle Information and Cost Savings Act (MVISA), 49 U.S.C. § 32705, and under the Colorado Consumer Protection Act, C.R.S. § 6-1-105(1)(e), which prohibits false representations regarding the characteristics of goods in a transaction. The federal private right of action under 49 U.S.C. § 32710 entitles us to the greater of $10,000 or three times actual damages, plus attorney's fees.

Our financial harm is quantifiable. A 2019 Honda CR-V with 87,000 miles has a fair market value of approximately $12,000 based on current Kelley Blue Book and Edmunds valuations for comparable vehicles in similar condition. We paid $21,500 for a vehicle worth $12,000. The difference — $9,500 — represents the minimum value differential and our direct monetary damages from your misrepresentation.

We demand, within fourteen (14) days of receipt of this letter, either: (1) a full refund of $21,500 upon return of the vehicle to Boulder Auto Exchange in its current condition; or (2) a compensation payment of $9,500 representing the fair market value differential between the vehicle as represented (42,000 miles) and as it actually was (87,000 miles). Payment must be by cashier's check. If neither option is accepted by January 5, 2025, we will file a complaint with the Colorado Attorney General's Consumer Protection Section, report the fraud to the National Highway Traffic Safety Administration, and file a civil lawsuit in Boulder County District Court seeking the maximum remedies under federal law, which may include $28,500 (three times actual damages), plus attorney's fees.

Sincerely,

Tyler and Megan Kowalski`,

    finalApproved: `Tyler and Megan Kowalski
2210 Mapleton Avenue
Boulder, CO 80304
(303) 555-0619

December 18, 2024

Sales Manager
Boulder Auto Exchange
4455 Broadway
Boulder, CO 80304

RE: FORMAL COMPLAINT AND DEMAND — ODOMETER FRAUD — 2019 HONDA CR-V (VIN: 2HKRW2H84KH619284)

Dear Sales Manager:

This letter is a formal complaint and demand for relief arising from odometer fraud perpetrated in connection with our October 15, 2024 purchase of a 2019 Honda CR-V (VIN: 2HKRW2H84KH619284) from Boulder Auto Exchange.

The Misrepresentation: On October 15, 2024, your dealership sold us the vehicle referenced above for $21,500. Your sales representative verbally represented the vehicle's mileage as approximately 42,000 miles, and the odometer disclosure statement presented to us at the point of sale confirmed a reading of 42,000 miles. We signed that statement and paid $21,500, a price we verified was consistent with low-mileage fair market value for a 2019 Honda CR-V of that specification. We had no reason to question the representation.

The Fraud Discovered: Within two weeks of purchase, multiple vehicle components appeared significantly more worn than 42,000 miles would warrant. We engaged an independent ASE-certified mechanic, who inspected the brake rotors, suspension bushings, and interior wear surfaces. His written report dated October 30, 2024 states that the observed wear patterns are consistent with a vehicle that has traveled approximately 80,000 to 90,000 miles. We then obtained a CarFax vehicle history report (No. CFX-20241102), which confirmed the vehicle had 87,300 miles documented at a licensed service facility in March 2023 — more than double the mileage your dealership disclosed to us just eighteen months later.

Legal Violations: Your conduct violates the Federal Motor Vehicle Information and Cost Savings Act (MVISA), 49 U.S.C. § 32705, prohibiting odometer fraud in vehicle transfers. It also violates the Colorado Consumer Protection Act, C.R.S. § 6-1-105(1)(e), prohibiting false representations as to the characteristics of goods in a transaction. The federal private right of action under 49 U.S.C. § 32710 entitles us to the greater of $10,000 or three times actual damages, plus attorney's fees.

Damages: A 2019 Honda CR-V with 87,000 miles has a fair market value of approximately $12,000 (per Kelley Blue Book and Edmunds). We paid $21,500. The difference is $9,500 in direct damages. Three times actual damages would be $28,500, plus attorney's fees.

Demand: Within fourteen (14) days of receipt of this letter, no later than January 5, 2025, provide one of the following: (1) a full refund of $21,500 upon return of the vehicle; or (2) a compensation payment of $9,500 representing the value differential. Payment must be by cashier's check. Failure to respond will result in a complaint to the Colorado Attorney General Consumer Protection Section, a report to the National Highway Traffic Safety Administration, and civil litigation seeking all federal remedies.

Sincerely,

Tyler and Megan Kowalski`,
    reviewNote:
      "Good CO odometer fraud letter with correct 49 U.S.C. § 32710 private action cite. Tightened facts. Approved.",
    createdDaysAgo: 22,
  },

  // ─── 9. Eviction Notice — AZ — Nonpayment ───
  {
    letterType: "eviction-notice",
    subject:
      "Notice to Pay Rent or Quit — 47 Days Past Due — 3301 E. Indian School Rd., Unit 204, Phoenix, AZ",
    jurisdictionState: "AZ",
    jurisdictionCity: "Phoenix",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "eviction-notice",
      sender: {
        name: "Desert Sun Properties, LLC (c/o Frank Delgado, Property Manager)",
        address:
          "Desert Sun Properties, LLC, 7200 N. Scottsdale Road, Suite 120, Scottsdale, AZ 85253",
        email: "fdelgado@desertsunprops.com",
        phone: "(480) 555-0477",
      },
      recipient: {
        name: "Tenant: Carlos Reyes",
        address: "Unit 204, 3301 E. Indian School Road, Phoenix, AZ 85018",
      },
      jurisdiction: { country: "US", state: "AZ", city: "Phoenix" },
      matter: {
        category: "eviction-notice",
        subject:
          "Tenant 47 days past due on rent — $1,850/month — total owed $2,775",
        description:
          "Tenant Carlos Reyes has not paid rent for November and December 2024, with a partial credit of $925. Total balance $2,775. Under Arizona Revised Statutes § 33-1368, a 5-day notice to pay or quit is required before commencing eviction proceedings.",
        incidentDate: "2024-11-01",
      },
      financials: { amountOwed: 2775, currency: "USD" },
      desiredOutcome:
        "Tenant pays all outstanding rent ($2,775) within 5 days, or vacates the premises.",
      deadlineDate: "2024-12-27",
      toneAndDelivery: { tone: "firm", deliveryMethod: "hand-delivery" },
    },
    aiDraft: `Desert Sun Properties, LLC
7200 N. Scottsdale Road, Suite 120
Scottsdale, AZ 85253
(480) 555-0477

December 22, 2024

Carlos Reyes
Unit 204
3301 E. Indian School Road
Phoenix, AZ 85018

RE: 5-DAY NOTICE TO PAY RENT OR QUIT — ARIZONA REVISED STATUTES § 33-1368(B)

Dear Mr. Reyes:

PLEASE TAKE NOTICE that you are in default under your residential lease agreement for failure to pay rent when due. This notice is formally served upon you pursuant to Arizona Revised Statutes Section 33-1368(B), which requires a landlord to provide written notice of a rent default and an opportunity to cure before commencing eviction proceedings in the Maricopa County Justice Court.

Your lease agreement, executed January 1, 2024, requires monthly rent payments of $1,850 to be paid on or before the first day of each calendar month. As of the date of service of this notice, you have failed to pay rent for the following periods:

  November 2024 rent (due November 1, 2024):     $1,850.00
  December 2024 rent (due December 1, 2024):      $1,850.00
  Less partial credit previously applied:          ($925.00)
  ──────────────────────────────────────────────
  TOTAL PAST DUE AND UNPAID:                      $2,775.00

Your failure to pay rent as required under your lease constitutes a material default. Prior written and verbal requests for payment have been made and have not produced any payment from you. This notice is your formal and final opportunity to cure the default before the landlord exercises its legal right to commence eviction proceedings.

YOU ARE HEREBY NOTIFIED that within five (5) calendar days of service of this notice upon you, you must do one of the following:

OPTION 1: Pay the total past due amount of $2,775.00 in full. Payment must be in certified funds only — cashier's check or money order made payable to Desert Sun Properties, LLC. Cash will not be accepted. Personal checks will not be accepted. Payment must be delivered to the property management office at 7200 N. Scottsdale Road, Suite 120, Scottsdale, Arizona 85253, during regular business hours of 9:00 a.m. to 5:00 p.m. Monday through Friday.

OPTION 2: Vacate and surrender peaceful possession of the premises located at Unit 204, 3301 E. Indian School Road, Phoenix, Arizona 85018, within five (5) calendar days, returning all keys, access cards, and garage door openers to the property management office.

If you fail to either pay the full amount owed or vacate the premises within the five (5) day period, Desert Sun Properties, LLC will file a Special Detainer action in the Maricopa County Justice Court, Precinct 4, seeking: (1) a writ of restitution immediately restoring possession of the premises to the landlord; (2) a judgment for all unpaid rent through the date of the court hearing; (3) any late fees and charges accrued under the lease; and (4) court costs and attorney's fees as provided by law.

The filing of this notice does not constitute an election to terminate your lease, nor does it waive any right, claim, or remedy of the landlord. All rights and remedies available to Desert Sun Properties, LLC under the lease agreement and Arizona law are expressly reserved and are not waived by the service of this notice.

Respectfully,

Frank Delgado, Property Manager
Desert Sun Properties, LLC`,

    finalApproved: `Desert Sun Properties, LLC
7200 N. Scottsdale Road, Suite 120
Scottsdale, AZ 85253
(480) 555-0477

December 22, 2024

Carlos Reyes
Unit 204
3301 E. Indian School Road
Phoenix, AZ 85018

RE: FIVE-DAY NOTICE TO PAY RENT OR QUIT — ARIZONA REVISED STATUTES § 33-1368(B)

Dear Mr. Reyes:

PLEASE TAKE NOTICE that you are in default under your residential lease agreement for failure to pay rent when due. This Five-Day Notice to Pay Rent or Quit is served upon you pursuant to Arizona Revised Statutes Section 33-1368(B), which requires a landlord to provide written notice of a rent default and a cure opportunity before commencing formal eviction proceedings in the Justice Court.

Your lease agreement, executed January 1, 2024, establishes a monthly rent obligation of $1,850, due and payable on or before the first calendar day of each month. Late charges accrue on any balance not received by the fifth of the month as specified in Section 6 of the lease. As of service of this notice, the following amounts are past due and unpaid:

  November 2024 rent (due November 1, 2024):     $1,850.00
  December 2024 rent (due December 1, 2024):      $1,850.00
  Partial credit previously applied:               ($925.00)
  ──────────────────────────────────────────────
  TOTAL PAST DUE AND UNPAID:                      $2,775.00

Prior written notices and verbal requests for payment have been provided to you and have not resulted in any payment. This notice is your final formal opportunity to cure the default before the landlord exercises its legal remedies. You are respectfully but firmly advised to take immediate action.

WITHIN FIVE (5) CALENDAR DAYS of service of this notice, you must do one of the following:

OPTION 1 — PAY IN FULL: Remit the entire balance of $2,775.00 in certified funds only. Acceptable forms of payment are cashier's check or money order made payable to Desert Sun Properties, LLC. Personal checks will not be accepted, and cash will not be accepted at the management office. Payment must be delivered during regular business hours (Monday through Friday, 9:00 a.m. to 5:00 p.m.) to: Desert Sun Properties, LLC, 7200 N. Scottsdale Road, Suite 120, Scottsdale, Arizona 85253.

OPTION 2 — VACATE AND SURRENDER: Surrender peaceful possession of the premises located at Unit 204, 3301 E. Indian School Road, Phoenix, Arizona 85018, within five (5) calendar days of service. You must return all keys, mailbox keys, parking passes, access cards, and garage door openers to the property management office. The unit must be left in a clean condition consistent with your obligations under the lease.

If you fail to pay in full or vacate within five (5) days, Desert Sun Properties, LLC will file a Special Detainer action in Maricopa County Justice Court, Precinct 4, seeking: (1) a writ of restitution restoring possession to the landlord; (2) a money judgment for all past-due rent through the hearing date; (3) accrued late fees and charges; and (4) court costs and attorney's fees as authorized by the lease and Arizona law.

A Special Detainer judgment becomes part of the public court record and is reportable to tenant screening agencies.

This notice does not terminate your lease and does not waive any right or remedy of the landlord under the lease or Arizona law. All rights and remedies are expressly reserved.

Frank Delgado, Property Manager
Desert Sun Properties, LLC`,
    reviewNote:
      "Statutory AZ eviction notice. Clear pay-or-quit options with certified funds requirement. Correct A.R.S. cite. Approved.",
    createdDaysAgo: 20,
  },

  // ─── 10. Intellectual Property — MA — Copyright Infringement ───
  {
    letterType: "intellectual-property",
    subject:
      "Copyright Infringement Notice — Unauthorized Commercial Use of Photographer's Images — Boston, MA",
    jurisdictionState: "MA",
    jurisdictionCity: "Boston",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "intellectual-property",
      sender: {
        name: "Rachel Ng Photography, LLC (Rachel Ng)",
        address: "88 Newbury Street, Studio 5, Boston, MA 02116",
        email: "rachel@rachelng.photography",
        phone: "(617) 555-0342",
      },
      recipient: {
        name: "Marketing Director",
        address:
          "Harborview Wellness Centers, LLC, 200 State Street, Boston, MA 02109",
      },
      jurisdiction: { country: "US", state: "MA", city: "Boston" },
      matter: {
        category: "intellectual-property",
        subject:
          "Commercial use of six copyrighted photographs without license — used in paid advertising campaign",
        description:
          "Six original photographs (U.S. Copyright Reg. No. VA 2-381-944) were used without license in Harborview Wellness Centers' paid digital advertising and printed brochures between August and November 2024. Images were created in 2022 for a different client and never licensed to Harborview.",
        incidentDate: "2024-08-01",
      },
      desiredOutcome:
        "Immediate removal of all infringing images, payment of $9,000 in licensing fees, and written confirmation within 7 days.",
      deadlineDate: "2025-01-07",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Rachel Ng Photography, LLC
88 Newbury Street, Studio 5
Boston, MA 02116
(617) 555-0342
rachel@rachelng.photography

December 5, 2024

Marketing Director
Harborview Wellness Centers, LLC
200 State Street
Boston, MA 02109

RE: NOTICE OF COPYRIGHT INFRINGEMENT — DEMAND FOR IMMEDIATE ACTION — U.S. COPYRIGHT REG. NO. VA 2-381-944

Dear Marketing Director:

This letter constitutes formal notice of copyright infringement and a demand for immediate remediation and compensation for the unauthorized commercial use of six copyrighted photographs belonging to Rachel Ng Photography, LLC. The infringement is documented, willful under the legal standard, and will be pursued to the fullest extent of federal copyright law if not resolved within the deadline stated below.

Rachel Ng is a professional commercial photographer based in Boston, Massachusetts. The six photographs at issue were created by Ms. Ng in 2022 during a limited scope engagement for a third-party client that contracted for interior and wellness facility photography at Harborview locations. That third-party engagement was governed by a written photography services agreement that expressly stated the license granted was limited to the commissioning client and did not extend to Harborview Wellness Centers or any other party. No license of any kind — direct, implied, or derivative — was ever granted to Harborview Wellness Centers, LLC for any use of the images. Ms. Ng retained all copyright in the photographs, which are registered with the United States Copyright Office under Registration No. VA 2-381-944. Copyright registration prior to infringement entitles the copyright holder to pursue statutory damages and attorney's fees.

Between August and November 2024, Harborview Wellness Centers used all six registered photographs in paid digital advertising campaigns across Google Ads, Instagram, and Facebook, and in printed brochures and point-of-sale materials at Harborview locations. Ms. Ng discovered this infringement on November 18, 2024. The photographs were reproduced, publicly displayed, and distributed in commerce without license, attribution, or compensation — and because Harborview received the images through a third-party delivery, the infringement was undertaken with knowledge that no valid license existed, constituting willful copyright infringement under 17 U.S.C. § 501.

The consequences of willful infringement are severe. As the registered copyright holder, Ms. Ng may elect statutory damages of up to $150,000 per work under 17 U.S.C. § 504(c)(2) — up to $900,000 for six works — or actual damages and lost profits under § 504(b). Under 17 U.S.C. § 505, she is also entitled to recover attorney's fees and costs. Injunctive relief under § 502 is additionally available.

Ms. Ng is prepared to resolve this matter without filing a lawsuit, provided the following conditions are satisfied no later than January 7, 2025:

1. Immediately remove all six photographs from every digital platform, advertising campaign, website, and social media account on which they appear;
2. Cease all further print distribution and recall any existing printed materials incorporating the photographs;
3. Pay licensing fees of $9,000 (six images at Ms. Ng's standard commercial rate of $1,500 per image per campaign use period); and
4. Provide written confirmation of full compliance with items 1 through 3.

Failure to satisfy all four conditions by January 7, 2025 will result in the immediate filing of a copyright infringement action in the United States District Court for the District of Massachusetts. Ms. Ng will pursue all available remedies, including maximum statutory damages, attorney's fees, and emergency injunctive relief.

Sincerely,

Rachel Ng
Rachel Ng Photography, LLC`,

    finalApproved: `Rachel Ng Photography, LLC
88 Newbury Street, Studio 5
Boston, MA 02116
(617) 555-0342
rachel@rachelng.photography

December 5, 2024

Marketing Director
Harborview Wellness Centers, LLC
200 State Street
Boston, MA 02109

RE: NOTICE OF COPYRIGHT INFRINGEMENT — DEMAND FOR IMMEDIATE REMEDIATION — U.S. COPYRIGHT REG. NO. VA 2-381-944

Dear Marketing Director:

This letter is formal notice of copyright infringement and a demand for immediate remediation and payment by Harborview Wellness Centers, LLC.

Ownership: Rachel Ng, operating as Rachel Ng Photography, LLC, is the sole author and registered copyright owner of six original photographs registered with the U.S. Copyright Office under Registration No. VA 2-381-944. These photographs were created in 2022 under a limited engagement for a third-party client. The governing photography services agreement expressly confined the license to that commissioning client and did not extend to Harborview Wellness Centers or any other party. No license — direct, implied, or derived — was ever granted to Harborview. Ms. Ng retained all copyright in the images. Pre-infringement federal registration entitles her to pursue statutory damages and attorney's fees.

Infringement: Between August and November 2024, Harborview Wellness Centers reproduced, publicly displayed, and distributed all six registered photographs without authorization in paid digital advertising campaigns running on Google Ads, Instagram, and Facebook, and in printed brochures and point-of-sale materials distributed at clinic locations. Ms. Ng discovered the infringement on November 18, 2024, by identifying the images in active advertising assets. Because Harborview received the images through a third-party delivery chain and had knowledge that no direct license from Ms. Ng existed, this constitutes willful copyright infringement under 17 U.S.C. § 501, entitling Ms. Ng to enhanced statutory damages.

Remedies Available: As a registered copyright holder whose works were willfully infringed, Ms. Ng may elect statutory damages of up to $150,000 per work — up to $900,000 for six works — under 17 U.S.C. § 504(c)(2), or alternatively, actual damages and disgorgement of Harborview's attributable profits under § 504(b). She is additionally entitled to attorney's fees and costs under 17 U.S.C. § 505 and injunctive relief under § 502.

Demand for Resolution: Ms. Ng is prepared to resolve this matter without litigation if the following are completed no later than January 7, 2025:

  1. Immediately remove all six photographs from every digital platform, advertising campaign, website, and social media account;
  2. Cease all further print distribution and recall any existing printed materials containing the photographs;
  3. Pay $9,000 in retroactive licensing fees (6 images × $1,500 standard commercial rate per campaign period); and
  4. Provide written confirmation of full compliance.

Failure to satisfy all conditions by January 7, 2025 will result in filing a copyright infringement action in the U.S. District Court for the District of Massachusetts, seeking maximum statutory damages, attorney's fees, costs, and emergency injunctive relief.

Sincerely,

Rachel Ng
Rachel Ng Photography, LLC`,
    reviewNote:
      "Strong MA copyright letter with willfulness theory and full § 504(c)(2) statutory damages framing. Approved.",
    createdDaysAgo: 18,
  },

  // ─── 11. Pre-Litigation Settlement — NJ — Car Accident ───
  {
    letterType: "pre-litigation-settlement",
    subject:
      "Pre-Litigation Settlement Demand — Rear-End Collision — Route 9, Parlin, NJ — $9,800 Medical Bills",
    jurisdictionState: "NJ",
    jurisdictionCity: "Parlin",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "pre-litigation-settlement",
      sender: {
        name: "Autumn Delacroix",
        address: "117 Washington Road, Parlin, NJ 08859",
        email: "adelacroix.nj@email.com",
        phone: "(732) 555-0583",
      },
      recipient: {
        name: "Claims Department",
        address:
          "Garden State Auto Insurance Co., 25 Commerce Drive, Cranford, NJ 07016",
      },
      jurisdiction: { country: "US", state: "NJ", city: "Parlin" },
      matter: {
        category: "pre-litigation-settlement",
        subject:
          "Rear-end collision on October 7, 2024, Route 9 South, Parlin — cervical strain and headaches",
        description:
          "On October 7, 2024, I was stopped at a red light on Route 9 South in Parlin, NJ when struck from behind by a vehicle insured by Garden State Auto Insurance (Policy No. GSAI-NJ-7741892). I sustained cervical strain, headaches, and restricted range of motion. Medical bills total $9,800. My claim has been pending 60 days.",
        incidentDate: "2024-10-07",
      },
      financials: { amountOwed: 9800, currency: "USD" },
      desiredOutcome:
        "Pre-litigation settlement of $24,500 covering medical expenses, lost wages, and pain and suffering within 30 days.",
      deadlineDate: "2025-01-20",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Autumn Delacroix
117 Washington Road
Parlin, NJ 08859
(732) 555-0583

December 20, 2024

Claims Department
Garden State Auto Insurance Co.
25 Commerce Drive
Cranford, NJ 07016

RE: PRE-LITIGATION SETTLEMENT DEMAND — COLLISION OF OCTOBER 7, 2024 — POLICY NO. GSAI-NJ-7741892

Dear Claims Department:

This letter constitutes a formal pre-litigation settlement demand on behalf of Autumn Delacroix arising from a rear-end motor vehicle collision on October 7, 2024, caused by your insured, Robert Marchetti. Ms. Delacroix suffered documented personal injuries and financial losses as a direct result of Mr. Marchetti's negligence, and she is prepared to resolve all claims arising from this incident through a pre-litigation settlement of $24,500.

On the morning of October 7, 2024, Ms. Delacroix was lawfully stopped at a red traffic signal on Route 9 South in Parlin, Middlesex County, New Jersey. Without warning, her vehicle was struck from behind by Mr. Marchetti's vehicle at meaningful speed. Ms. Delacroix's vehicle was stationary when impact occurred. There is no credible dispute about the fact of the collision or its cause. Police were dispatched and responded to the scene, and a police report documents the collision. Mr. Marchetti's insurer — your company — has acknowledged the claim under Policy No. GSAI-NJ-7741892.

The collision caused Ms. Delacroix to sustain cervical strain with muscle spasm, persistent headaches, and significant restriction of cervical range of motion — a cluster of injuries commonly produced by the biomechanical forces of a rear-end impact. Ms. Delacroix was transported to Robert Wood Johnson University Hospital Emergency Department by ambulance that same day. Examination, imaging, and neurology consultation confirmed the injury diagnosis. She was placed on a treatment plan of chiropractic care and physical therapy. To date, she has completed twelve sessions of chiropractic treatment and eight sessions of physical therapy, with some residual symptoms still present.

New Jersey law establishes clear liability in this type of collision. A motor vehicle operator has the duty to maintain a safe following distance and to control the vehicle sufficiently to stop in safety. N.J. Stat. Ann. § 39:4-89. The driver of a vehicle that rear-ends a stopped vehicle has presumptively failed that duty. See Martin v. Bateman, 249 N.J. Super. 285 (App. Div. 1991) (rear-end collision with stopped vehicle creates presumption of negligence in following driver). Mr. Marchetti's liability is not a contested issue.

Ms. Delacroix's documented damages are as follows:

Medical expenses:
  Robert Wood Johnson University Hospital (ER and ambulance): $4,200
  Chiropractic care — 12 sessions:                           $2,800
  Physical therapy — 8 sessions:                             $2,800
  Total medical expenses:                                    $9,800

Lost wages (three weeks of reduced capacity, administrative role): $3,600

Pain, suffering, and diminished quality of life: $11,100

Total claimed damages: $24,500

Ms. Delacroix's offer to settle for $24,500 reflects the documented medical expenses, her lost income, and a reasonable valuation of her pain and suffering — all well within the range of outcomes in comparable New Jersey auto injury cases. This offer is made in good faith and pursuant to New Jersey Court Rule 4:58 (Offer of Judgment). Supporting medical records, billing statements, and the treating providers' reports are enclosed with this letter.

If a settlement agreement for $24,500 is not reached by January 20, 2025, Ms. Delacroix will file a civil complaint in the Superior Court of New Jersey, Middlesex County, Law Division. All rights and remedies are reserved.

Sincerely,

Autumn Delacroix`,

    finalApproved: `Autumn Delacroix
117 Washington Road
Parlin, NJ 08859
(732) 555-0583

December 20, 2024

Claims Department
Garden State Auto Insurance Co.
25 Commerce Drive
Cranford, NJ 07016

RE: PRE-LITIGATION SETTLEMENT DEMAND — COLLISION OF OCTOBER 7, 2024 — POLICY NO. GSAI-NJ-7741892

Dear Claims Department:

This letter constitutes a formal pre-litigation settlement demand on behalf of Autumn Delacroix arising from a rear-end motor vehicle collision on October 7, 2024, caused by your insured, Robert Marchetti. Ms. Delacroix demands pre-litigation settlement of $24,500 to resolve all personal injury and property claims arising from this incident, and invites resolution before further legal proceedings become necessary.

The Collision: On October 7, 2024, Ms. Delacroix was lawfully stopped at a red traffic signal on Route 9 South in Parlin, Middlesex County, New Jersey. While stationary, her vehicle was struck from behind by the vehicle operated by your insured. The collision was documented by Sayreville Police, and the responding officer's report confirms the facts. Your company acknowledged receipt of the claim under Policy No. GSAI-NJ-7741892 more than sixty days ago.

Injuries and Treatment: The rear-end impact caused Ms. Delacroix to sustain cervical strain, persistent headaches, and significant restriction of cervical range of motion. She was transported by ambulance to Robert Wood Johnson University Hospital Emergency Department, where examination and imaging confirmed the diagnosis. She completed twelve sessions of chiropractic care and eight sessions of physical therapy. Residual symptoms persist at the time of this letter.

Liability: New Jersey law imposes upon every motor vehicle operator the duty to maintain a safe following distance and adequate control to avoid collisions with traffic ahead. N.J. Stat. Ann. § 39:4-89. Courts in New Jersey have consistently held that the driver of a vehicle that rear-ends a stopped vehicle is presumptively negligent. See Martin v. Bateman, 249 N.J. Super. 285 (App. Div. 1991). Mr. Marchetti's liability for this collision is well-established by both the physical evidence and controlling New Jersey precedent. It is not a contested issue in this matter.

Damages:

  Robert Wood Johnson University Hospital (ER + ambulance):  $4,200
  Chiropractic care — 12 sessions:                           $2,800
  Physical therapy — 8 sessions:                             $2,800
  Total medical expenses:                                    $9,800

  Lost wages — three weeks, administrative role:             $3,600
  Pain, suffering, diminished quality of life:              $11,100
  Total claimed damages:                                    $24,500

Ms. Delacroix's medical expenses are fully documented in the records accompanying this letter. Her wage loss is supported by employer confirmation and pay records. The pain and suffering component reflects the duration and nature of her symptoms, the disruption to her daily activities, and the limitations imposed on her professional and personal life during the weeks of her recovery.

Settlement Demand: Ms. Delacroix demands payment of $24,500 in full and final settlement of all claims, to be received no later than January 20, 2025. This offer is made pursuant to New Jersey Court Rule 4:58 (Offer of Judgment). Complete medical records, billing statements, the treating providers' reports, and employment records supporting all claimed damages are enclosed with this letter.

If a settlement agreement is not reached by January 20, 2025, Ms. Delacroix will file a civil complaint in the Superior Court of New Jersey, Middlesex County, Law Division, without further notice. All rights and remedies are reserved.

Sincerely,

Autumn Delacroix`,
    reviewNote:
      "Well-structured NJ auto injury pre-litigation demand. Martin v. Bateman cite and R. 4:58 reference. Approved.",
    createdDaysAgo: 16,
  },

  // ─── 12. Debt Collection — OH — Personal Loan ───
  {
    letterType: "debt-collection",
    subject: "Final Demand for Repayment of Personal Loan — $6,500 — Columbus, OH",
    jurisdictionState: "OH",
    jurisdictionCity: "Columbus",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "debt-collection",
      sender: {
        name: "Patricia Owens",
        address: "5540 Olentangy River Road, Columbus, OH 43235",
        email: "powens.columbus@email.com",
        phone: "(614) 555-0771",
      },
      recipient: {
        name: "Kevin Hargrove",
        address: "2819 E. Main Street, Columbus, OH 43209",
      },
      jurisdiction: { country: "US", state: "OH", city: "Columbus" },
      matter: {
        category: "debt-collection",
        subject:
          "Repayment demand for $6,500 personal loan made June 2, 2024, due September 1, 2024",
        description:
          "On June 2, 2024, I loaned Kevin Hargrove $6,500 per a written promissory note due September 1, 2024. He made one $500 partial payment. Remaining balance $6,000 is more than 3 months past due. Four written repayment requests have been ignored.",
        incidentDate: "2024-09-01",
      },
      financials: { amountOwed: 6000, currency: "USD" },
      desiredOutcome:
        "Payment of remaining $6,000 balance within 14 days or I will file in Franklin County Municipal Court.",
      deadlineDate: "2025-01-10",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Patricia Owens
5540 Olentangy River Road
Columbus, OH 43235
(614) 555-0771

December 26, 2024

Kevin Hargrove
2819 E. Main Street
Columbus, OH 43209

RE: FINAL DEMAND FOR REPAYMENT — PROMISSORY NOTE DATED JUNE 2, 2024 — $6,000 OUTSTANDING BALANCE

Dear Mr. Hargrove:

This letter constitutes my final demand for repayment of the outstanding balance of $6,000 due under the promissory note we both executed on June 2, 2024. I have now exhausted every informal avenue to resolve this matter, and I am writing to formally document the default and to provide you one last opportunity to pay before I initiate legal proceedings.

On June 2, 2024, I loaned you the sum of $6,500 as documented in a written promissory note signed by both of us on that date. The note required you to repay the full $6,500 no later than September 1, 2024. I made this loan to you in good faith based on our longstanding personal acquaintance and your representation that the funds would be repaid within three months. I received a partial payment of $500 from you in August 2024, which I applied to reduce the outstanding principal. You have made no further payments since August 2024. As of December 26, 2024, the remaining principal balance of $6,000 has been past due for nearly four months — since September 1, 2024.

I made four separate written demands for payment after the due date. I sent written requests by email on September 5, September 22, October 15, and November 30, 2024. You have not responded to any of these communications with either a payment or an explanation for the nonpayment. Your silence has forced me to retain legal counsel and to send this formal demand letter as a last step before filing.

Your failure to repay the promissory note as agreed constitutes a breach of a valid written contract enforceable under Ohio law. Ohio Revised Code Section 1343.01 provides that unpaid promissory note obligations accrue prejudgment interest at the statutory rate of eight percent per annum, or at any higher rate specified in the note, from the date payment was due. Interest has therefore been accruing on the $6,000 unpaid balance since September 1, 2024, increasing the total amount you owe with each passing day. Under O.R.C. § 2303.27, costs of court are recoverable by the prevailing party in a civil action, and in actions on promissory notes, the court has discretion to award attorney's fees in appropriate circumstances.

The outstanding principal balance you owe is $6,000. In the interest of resolving this matter without the cost, time, and stress of litigation for either of us, I am prepared to accept payment of the principal balance of $6,000 only — forgoing my claim for accrued interest — if payment is received in full on or before January 10, 2025. Payment must be made in certified funds: cashier's check or money order made payable to Patricia Owens, and delivered or mailed by certified mail to my address above.

If I do not receive full payment in certified funds by January 10, 2025, I will file a civil action in the Franklin County Municipal Court without further notice. I will seek the full principal balance of $6,000, prejudgment interest accrued from September 1, 2024 through the date of judgment, court filing costs, and all other available remedies. Please take this letter seriously. The cost of the court filing fee and your potential liability for costs and attorney's fees far exceed the amount you owe. I urge you to pay.

Sincerely,

Patricia Owens`,

    finalApproved: `Patricia Owens
5540 Olentangy River Road
Columbus, OH 43235
(614) 555-0771

December 26, 2024

Kevin Hargrove
2819 E. Main Street
Columbus, OH 43209

RE: FINAL DEMAND FOR REPAYMENT — PROMISSORY NOTE DATED JUNE 2, 2024 — $6,000 OUTSTANDING

Dear Mr. Hargrove:

This letter constitutes my final written demand for repayment of the $6,000 outstanding principal balance owed to me under the written promissory note you executed on June 2, 2024. I have pursued every reasonable informal avenue to recover this debt. You have left me no alternative but to formally document the default and present you with one final opportunity to pay before I proceed with legal action.

Background and Terms: On June 2, 2024, I extended you a personal loan of $6,500 in exchange for a written promissory note signed by both of us on that date, requiring full repayment of the $6,500 principal no later than September 1, 2024. I extended this loan in good faith based on our personal acquaintance and your written commitment to repay within ninety days. You made a single partial payment of $500 in August 2024, which I applied in good faith to reduce the outstanding principal. Since that payment, you have made no further payments of any amount. The remaining balance of $6,000 has been in default for nearly four months as of this letter.

Prior Demands Ignored: I sent four separate written payment demands by email on September 5, September 22, October 15, and November 30, 2024. Each communication specifically referenced the promissory note, the outstanding balance, and the overdue status of the debt. You did not respond to any of these demands — not with payment, not with an explanation, and not with any proposed repayment arrangement.

Legal Rights and Consequences: Your failure to repay constitutes a material breach of an enforceable written contract. Under Ohio Revised Code Section 1343.01, prejudgment interest accrues on unpaid promissory note balances at the statutory rate of eight percent per annum from the date payment was due — September 1, 2024. Recoverable costs are authorized under O.R.C. § 2303.27, and the court has discretion to award attorney's fees in note-enforcement cases. Every day of delay increases what you owe.

Final Opportunity: I am prepared to accept payment of the $6,000 principal only — forgoing my claim for accrued interest — if received in full by January 10, 2025. Payment must be by cashier's check or money order payable to Patricia Owens, delivered by certified mail to 5540 Olentangy River Road, Columbus, OH 43235.

Consequence of Non-Payment: If payment is not received by January 10, 2025, I will file a civil action in Franklin County Municipal Court seeking the $6,000 principal, all prejudgment interest from September 1, 2024 through judgment, court costs, and any attorney's fees. No further extensions will be granted.

Sincerely,

Patricia Owens`,
    reviewNote:
      "Clean OH promissory note demand. Verified O.R.C. § 1343.01 and § 2303.27 cites. Tightened final paragraph. Approved.",
    createdDaysAgo: 14,
  },

  // ─── 13. Family Law — NC — Child Support Arrears ───
  {
    letterType: "family-law",
    subject:
      "Demand for Child Support Arrears — 8 Months Unpaid — Case No. 2023-DR-4471, Mecklenburg County, NC",
    jurisdictionState: "NC",
    jurisdictionCity: "Charlotte",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "family-law",
      sender: {
        name: "Jasmine L. Carter",
        address: "4409 Sharon Road, Charlotte, NC 28211",
        email: "jlcarter.charlotte@email.com",
        phone: "(704) 555-0932",
      },
      recipient: {
        name: "Darnell Carter",
        address: "7712 Providence Road, Charlotte, NC 28226",
      },
      jurisdiction: { country: "US", state: "NC", city: "Charlotte" },
      matter: {
        category: "family-law",
        subject:
          "8 months of unpaid child support — $1,200/month — total arrears $9,600",
        description:
          "Pursuant to a Consent Order in Mecklenburg County District Court (Case No. 2023-DR-4471), Darnell Carter must pay $1,200/month in child support. No payments received since March 2024. Total arrears: $9,600 (8 months). Multiple contact attempts ignored.",
        incidentDate: "2024-04-01",
      },
      financials: { amountOwed: 9600, currency: "USD" },
      desiredOutcome:
        "Payment of $9,600 in arrears within 14 days or motion for contempt will be filed.",
      deadlineDate: "2025-01-15",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Jasmine L. Carter
4409 Sharon Road
Charlotte, NC 28211
(704) 555-0932

January 1, 2025

Darnell Carter
7712 Providence Road
Charlotte, NC 28226

RE: DEMAND FOR PAYMENT OF CHILD SUPPORT ARREARS — $9,600 — CASE NO. 2023-DR-4471

Dear Mr. Carter:

This letter constitutes a formal demand for immediate payment of $9,600 in child support arrears that you owe pursuant to a Consent Order entered by the Mecklenburg County District Court in Case No. 2023-DR-4471. Your eight-month failure to pay child support is not only a breach of a court order but is directly harming our two children, and I am now compelled to put this demand in writing before pursuing enforcement remedies.

The Consent Order entered in May 2023 established your child support obligation at $1,200 per month for our two minor children. This order was agreed to by both parties and entered by a court of competent jurisdiction. It is a binding legal obligation — not a suggestion. You complied with the order from May 2023 through March 2024, demonstrating your awareness of and ability to meet the obligation. Since April 2024, you have made absolutely no child support payments — not a single dollar across eight consecutive months. As of January 2025, eight months of child support remain wholly unpaid, resulting in total arrears of $9,600 (8 months × $1,200 per month).

The impact on our children has been real and measurable. Child support is not a personal payment to me — it is a legally mandated contribution to the health, education, housing, and general welfare of your children. Your extended nonpayment has forced me to cover all household expenses and childcare costs unilaterally, stretching my resources and reducing what I can provide for our children.

I have made multiple attempts to reach you by phone and text since April 2024, requesting payment or at minimum an explanation for your nonpayment. You have not responded to any of my outreach. My attorney sent a formal written demand in November 2024 that likewise received no response. Your deliberate and prolonged failure to engage constitutes willful noncompliance with the court's order.

The legal consequences of your continued nonpayment are significant. Under North Carolina General Statute Section 50-13.9, failure to comply with a child support order may be enforced through contempt proceedings, which can result in incarceration, fines, and mandatory compliance. Under N.C.G.S. § 110-136.3, the state is further authorized to pursue income withholding from your wages or other income sources, to intercept your state and federal tax refunds, to report arrears to credit bureaus, and to suspend your driver's license and any professional licenses you hold. Additionally, unpaid child support accrues interest under North Carolina law, increasing the total amount owed with each passing month.

I am formally demanding that you pay the full $9,600 in arrears — representing eight months of unpaid support at $1,200 per month — within fourteen (14) days of receipt of this letter, no later than January 15, 2025. Payment must be made in certified funds: cashier's check or money order payable to Jasmine L. Carter, mailed by certified mail or delivered in person.

If full payment is not received by January 15, 2025, I will file a Motion for Order to Show Cause for Civil Contempt in Mecklenburg County District Court, referring the matter to the Mecklenburg County Child Support Enforcement Agency for immediate income withholding, and pursuing all available state and federal collection remedies without further notice. I also reserve the right to seek all accrued interest on the arrears through the date of payment.

Sincerely,

Jasmine L. Carter`,

    finalApproved: `Jasmine L. Carter
4409 Sharon Road
Charlotte, NC 28211
(704) 555-0932

January 1, 2025

Darnell Carter
7712 Providence Road
Charlotte, NC 28226

RE: FORMAL DEMAND — CHILD SUPPORT ARREARS — $9,600 — CASE NO. 2023-DR-4471 (MECKLENBURG COUNTY DISTRICT COURT)

Dear Mr. Carter:

This letter constitutes formal notice and demand for the immediate payment of $9,600 in child support arrears that you owe pursuant to the Consent Order entered by the Mecklenburg County District Court in Case No. 2023-DR-4471. Eight months of nonpayment is not a lapse or oversight — it is a prolonged and deliberate failure to fulfill a court-ordered obligation that is causing direct, measurable harm to your two children. I am providing you one final opportunity to remedy this before I pursue every enforcement mechanism available under North Carolina law.

Obligation and Default: The Consent Order entered in May 2023 requires you to pay $1,200 per month in child support for our two minor children. You fulfilled this obligation from May 2023 through March 2024, demonstrating you understood and were capable of meeting it. Since April 1, 2024, you have made no payments whatsoever. Eight consecutive months of nonpayment has produced arrears of $9,600 (8 months × $1,200). This is not disputed — it is arithmetic fact from a court record.

Impact on the Children: Child support is not a personal payment to me. It is a legal mechanism by which both parents contribute to the health, housing, education, and welfare of their children. Your sustained nonpayment has forced me to cover all household costs and childcare expenses unilaterally, on my income alone — an inequitable outcome the Consent Order was designed to prevent.

Prior Contact: I attempted to reach you by phone and text multiple times beginning in April 2024, requesting payment or an explanation. My attorney sent a formal demand in November 2024. You have not responded to any contact across eight months.

Legal Consequences: Failure to comply with a child support order is enforceable through contempt proceedings under N.C.G.S. § 50-13.9, which can result in incarceration and fines. Under N.C.G.S. § 110-136.3, enforcement agencies are authorized to garnish your wages, intercept tax refunds, report the delinquency to credit bureaus, and suspend your driver's and professional licenses. Arrears also accrue interest, increasing the total you owe.

Demand: Remit $9,600 in certified funds — cashier's check or money order payable to Jasmine L. Carter — by certified mail to 4409 Sharon Road, Charlotte, NC 28211, or by hand delivery, no later than January 15, 2025.

Failure to pay by January 15, 2025 will result in filing of a Motion for Order to Show Cause for Civil Contempt in Mecklenburg County District Court, referral to the Child Support Enforcement Agency for income withholding, and pursuit of all available collection remedies including tax interception and license suspension. I reserve the right to seek all accrued interest. No further informal requests will be made.

Sincerely,

Jasmine L. Carter`,
    reviewNote:
      "Strong NC child support arrears demand with N.C.G.S. § 50-13.9 and § 110-136.3 cites. Clear consequence framing. Approved.",
    createdDaysAgo: 12,
  },

  // ─── 14. Neighbor/HOA — NV — HOA Fence Dispute ───
  {
    letterType: "neighbor-hoa",
    subject:
      "HOA Violation Fine Dispute — Unauthorized Fence Installation — Summerlin Community, Las Vegas, NV",
    jurisdictionState: "NV",
    jurisdictionCity: "Las Vegas",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "neighbor-hoa",
      sender: {
        name: "Omar and Stella Rashid",
        address: "9244 Spanish Trail Drive, Las Vegas, NV 89117",
        email: "omerashid.lv@email.com",
        phone: "(702) 555-0814",
      },
      recipient: {
        name: "Board of Directors",
        address:
          "Summerlin Heights Homeowners Association, c/o Premier HOA Management, 3111 S. Valley View Blvd., Suite 201, Las Vegas, NV 89102",
      },
      jurisdiction: { country: "US", state: "NV", city: "Las Vegas" },
      matter: {
        category: "neighbor-hoa",
        subject:
          "Dispute of $1,800 in HOA fines for unauthorized fence — fence installed with verbal approval from prior HOA manager",
        description:
          "We installed a 5-foot vinyl privacy fence in our backyard in June 2024, following verbal approval from then-HOA manager David Kim, who stated no formal architectural review was required for backyard fences under 6 feet. After Mr. Kim departed, new management imposed $1,800 in fines. We relied in good faith on his verbal assurance and have documentation.",
        incidentDate: "2024-06-01",
      },
      financials: { amountOwed: 1800, currency: "USD" },
      desiredOutcome:
        "Waiver of the $1,800 in fines based on good-faith reliance on verbal approval from the former HOA manager.",
      deadlineDate: "2025-01-31",
      toneAndDelivery: { tone: "moderate", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Omar and Stella Rashid
9244 Spanish Trail Drive
Las Vegas, NV 89117
(702) 555-0814

January 5, 2025

Board of Directors
Summerlin Heights Homeowners Association
c/o Premier HOA Management
3111 S. Valley View Blvd., Suite 201
Las Vegas, NV 89102

RE: FORMAL DISPUTE OF HOA FINES — $1,800 — FENCE INSTALLATION — 9244 SPANISH TRAIL DRIVE

Dear Board of Directors:

We write to formally dispute the $1,800 in HOA violation fines levied against our property at 9244 Spanish Trail Drive in connection with our installation of a vinyl privacy fence in June 2024. We submit that these fines were improperly assessed because we acted in good faith reliance on the express authorization of the Association's own authorized representative, and that basic principles of equity and estoppel bar the Board from penalizing us under these circumstances.

In May 2024, before proceeding with any fence installation, we contacted the Association's then-manager, David Kim, to understand what approval was required. We did not assume any right to proceed without review — we asked. On May 22, 2024, Mr. Kim responded in a written text message that rear-yard fences under six feet in height do not require Architectural Review Committee approval under current guidelines, and that we could proceed without filing a formal application.

Relying on that representation from the Association's duly authorized Property Manager, we contracted for and installed a 5-foot vinyl privacy fence in June 2024. The fence is within the height Mr. Kim described, is constructed of materials consistent with neighborhood aesthetics, and does not encroach on any shared property or easement. We believed we were in full compliance because the Association's own agent told us we were.

Following Mr. Kim's departure, new management issued a violation notice and imposed $1,800 in fines for lack of ARC approval — directly contradicting his written guidance. Nevada Revised Statutes Section 116.3102 requires HOA boards to act in good faith and with equity in enforcing governing documents. Under Nevada estoppel doctrine, a party is barred from taking a position that contradicts a prior representation upon which another has reasonably relied to their detriment. See Restatement (Second) of Contracts § 90. The Association, through its authorized agent, represented no ARC approval was needed. We acted on that representation and incurred material expense. Imposing fines now is inequitable and legally untenable.

We retain the text message exchange and installation contract records and are prepared to present them at a Board hearing if requested.

We respectfully request that the Board: (1) waive all $1,800 in fines based on our good-faith reliance on the Association's authorized agent; and (2) confirm in writing that the existing fence is permitted. Please respond no later than January 31, 2025. If relief is not granted by that date, we will request a formal Board hearing under Nevada Revised Statutes Section 116.31085 and present complete documentation. We wish to resolve this cooperatively.

Sincerely,

Omar and Stella Rashid`,

    finalApproved: `Omar and Stella Rashid
9244 Spanish Trail Drive
Las Vegas, NV 89117
(702) 555-0814

January 5, 2025

Board of Directors
Summerlin Heights Homeowners Association
c/o Premier HOA Management
3111 S. Valley View Blvd., Suite 201
Las Vegas, NV 89102

RE: FORMAL DISPUTE OF HOA FINES — $1,800 — FENCE INSTALLATION — 9244 SPANISH TRAIL DRIVE

Dear Board of Directors:

We formally dispute $1,800 in HOA violation fines assessed against our property at 9244 Spanish Trail Drive in connection with our June 2024 installation of a vinyl privacy fence. We acted in good faith reliance on the express authorization of the Association's own property manager, and equity bars the Board from penalizing us under these circumstances.

What We Did and Why: Before beginning any fence installation, we contacted the Association's then-manager, David Kim, specifically to determine what approval was required. We did not assume any right to proceed without review — we asked. On May 22, 2024, Mr. Kim responded in writing via text message, stating that rear-yard fences not exceeding six feet in height do not require Architectural Review Committee approval under current Association guidelines and that we could proceed without filing a formal application.

Relying entirely on that representation — made by the Association's duly authorized Property Manager — we contracted for and installed a 5-foot vinyl privacy fence in June 2024. The fence is within the height Mr. Kim described, is constructed of standard materials consistent with neighborhood character, and does not encroach on any easement or shared space. We believed we were in full compliance because the Association's own agent told us we were.

Why the Fine Is Improper: Following Mr. Kim's departure, new management issued a violation notice and imposed $1,800 in fines for lack of ARC approval — directly contradicting Mr. Kim's written guidance. Nevada Revised Statutes Section 116.3102 requires HOA boards to act in good faith and with equity in enforcing governing documents. Under Nevada estoppel doctrine, a party is barred from taking a position that contradicts a prior representation upon which another reasonably relied to their detriment. See Restatement (Second) of Contracts § 90. The Association, through its authorized agent, represented that no ARC approval was needed. We acted on that representation and incurred material expense. Imposing fines now is inequitable and legally untenable.

We retain the May 22, 2024 text message exchange and installation contract records, which we will present at a formal Board hearing if needed.

Request for Relief: We respectfully request that the Board: (1) waive all $1,800 in fines based on our documented good-faith reliance on the Association's authorized agent; and (2) confirm in writing that the existing fence is permitted in its current configuration. Please provide a written response no later than January 31, 2025.

If relief is not granted by January 31, 2025, we will formally request a Board hearing under Nevada Revised Statutes Section 116.31085 and present our full documentation at that hearing. We remain committed to resolving this cooperatively as long-standing community members.

Sincerely,

Omar and Stella Rashid`,
    reviewNote:
      "Good NV HOA estoppel dispute. Correct N.R.S. § 116.3102 and § 116.31085 cites with R2d Contracts § 90. Appropriate moderate tone. Approved.",
    createdDaysAgo: 10,
  },

  // ─── 15. Demand Letter — OR — Warranty Dispute ───
  {
    letterType: "demand-letter",
    subject:
      "Demand for Warranty Repair or Refund — Roof Leak — Pacific Northwest Roofing Co., Portland, OR",
    jurisdictionState: "OR",
    jurisdictionCity: "Portland",
    intakeJson: {
      schemaVersion: "1.0",
      letterType: "demand-letter",
      sender: {
        name: "Gregory and Anita Walsh",
        address: "3812 NE Fremont Street, Portland, OR 97212",
        email: "gwalsh.pdx@email.com",
        phone: "(503) 555-0627",
      },
      recipient: {
        name: "Owner/Manager",
        address:
          "Pacific Northwest Roofing Co., 6100 SE Foster Road, Portland, OR 97206",
      },
      jurisdiction: { country: "US", state: "OR", city: "Portland" },
      matter: {
        category: "demand-letter",
        subject:
          "Contractor refusing to honor 5-year workmanship warranty on roof installed in September 2022",
        description:
          "Pacific Northwest Roofing Co. installed a new roof on our home in September 2022 and provided a written 5-year workmanship warranty. In October 2024, we discovered active water intrusion. The company's own inspector confirmed the leaks were caused by improper flashing installation — a covered warranty defect. Despite this, Pacific Northwest Roofing refuses to perform repairs without additional charge.",
        incidentDate: "2024-10-28",
      },
      financials: { amountOwed: 18500, currency: "USD" },
      desiredOutcome:
        "Honor the warranty and perform all necessary repairs at no cost within 30 days, or reimburse the cost of a replacement contractor.",
      deadlineDate: "2025-02-01",
      toneAndDelivery: { tone: "firm", deliveryMethod: "certified-mail" },
    },
    aiDraft: `Gregory and Anita Walsh
3812 NE Fremont Street
Portland, OR 97212
(503) 555-0627

January 8, 2025

Owner/Manager
Pacific Northwest Roofing Co.
6100 SE Foster Road
Portland, OR 97206

RE: DEMAND TO HONOR WARRANTY — ROOF INSTALLATION SEPTEMBER 2022 — CONFIRMED FLASHING DEFECT

Dear Owner/Manager:

This letter constitutes a formal demand that Pacific Northwest Roofing Co. honor its written 5-year workmanship warranty and immediately perform all necessary repairs to our roof, at no charge to us, no later than February 1, 2025. Your company's refusal to perform warranted repairs — after your own inspector confirmed a warranty-covered defect — is a clear breach of your contractual warranty obligation and may constitute an unlawful trade practice under Oregon law.

In September 2022, Pacific Northwest Roofing Co. installed a complete new roof at our home at 3812 NE Fremont Street, Portland, Oregon, for a total project cost of $18,500. Your company provided a written 5-year workmanship warranty covering defects in materials and installation through September 2027.

In late October 2024, we discovered two active water intrusion points: one at the north chimney-roof junction, and a second at the east dormer wall-roof junction. We reported these leaks to your office on October 28, 2024 and requested a warranty inspection. You sent an inspector on November 10, 2024. His written inspection summary of November 14, 2024 states unequivocally that both leaks were caused by improper flashing installation at the time of the original 2022 project — precisely the category of defect your warranty commits to remedy at no cost to us.

Despite that written finding, Pacific Northwest Roofing has declined to perform the warranted repairs without charging us an additional fee. A warranty is a binding contractual commitment. Refusing to honor it entitles us to all actual damages including the cost to cure the defect through other means under Oregon Revised Statutes Section 72.7140. Your refusal may also constitute a deceptive trade practice under O.R.S. § 646.608, which prohibits misrepresenting the terms of a warranty in connection with the sale of services — a matter the Oregon Attorney General's Consumer Protection Division actively investigates.

We formally demand that Pacific Northwest Roofing Co. perform all necessary warranty repairs — complete re-flashing at the north chimney and east dormer, and any related remediation to ensure the roof is watertight — at no cost, with all work completed no later than February 1, 2025. If repairs are not completed by February 1, 2025, we will engage a licensed replacement contractor and file a civil action in Multnomah County Circuit Court seeking all repair costs, consequential damages, and all other available remedies. We will also file a complaint with the Oregon Construction Contractors Board. All rights and remedies are expressly reserved.

Sincerely,

Gregory and Anita Walsh`,

    finalApproved: `Gregory and Anita Walsh
3812 NE Fremont Street
Portland, OR 97212
(503) 555-0627

January 8, 2025

Owner/Manager
Pacific Northwest Roofing Co.
6100 SE Foster Road
Portland, OR 97206

RE: FORMAL DEMAND TO HONOR WARRANTY — ROOF INSTALLATION SEPTEMBER 2022 — CONFIRMED FLASHING DEFECT

Dear Owner/Manager:

This letter is a formal demand that Pacific Northwest Roofing Co. honor its written 5-year workmanship warranty and perform all necessary repairs at no charge by February 1, 2025. Your refusal to perform warranted repairs — after your own inspector confirmed a covered installation defect — is a breach of contract and may constitute a deceptive trade practice under Oregon law.

Background: In September 2022, Pacific Northwest Roofing Co. installed a complete new roof at 3812 NE Fremont Street, Portland, Oregon for $18,500, accompanied by a written 5-year workmanship warranty covering installation and materials defects through September 2027.

Defect Confirmed: In late October 2024, we discovered active water intrusion entering the interior of our home at two distinct locations: the junction of the roof surface with the north chimney, and the junction of the east dormer wall with the roof plane. We reported both leaks to your office on October 28, 2024 and formally requested a warranty inspection. Your inspector visited the property on November 10, 2024. His written inspection summary dated November 14, 2024 states unequivocally that both leaks were caused by improper flashing installation at the time of the original 2022 project — precisely the category of defect your warranty expressly commits to remedy at no charge.

Refusal to Honor Warranty: Despite your own inspector's written finding attributing both defects to your company's 2022 installation work, Pacific Northwest Roofing has declined to perform the warranted repairs without charging us an additional fee. A warranty is a binding contractual obligation — not a conditional promise. Breach of an express warranty entitles us to all actual damages, including the cost to repair the defect through other means. See O.R.S. § 72.7140. Your refusal may also constitute a deceptive trade practice under O.R.S. § 646.608, which prohibits misrepresenting the terms or coverage of a warranty in connection with the sale of services.

Demand: Perform all necessary warranty repairs — complete re-flashing at the north chimney and east dormer, and any remediation required to ensure the roof is fully watertight — at no cost, with all work completed no later than February 1, 2025.

If repairs are not completed by February 1, 2025, we will engage a licensed replacement contractor and file a civil action in Multnomah County Circuit Court for breach of express warranty, seeking all repair costs, consequential damages including interior water damage remediation, and all other available remedies. We will also file a formal complaint with the Oregon Construction Contractors Board. All rights are reserved.

Sincerely,

Gregory and Anita Walsh`,
    reviewNote:
      "OR warranty breach demand with O.R.S. § 72.7140 and § 646.608 citations. Added CCB complaint threat. Approved.",
    createdDaysAgo: 8,
  },
];

async function ensureSubscription(userId: number): Promise<void> {
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const periodStart = new Date("2024-01-01T00:00:00Z");
  const periodEnd = new Date("2025-01-01T00:00:00Z");

  const values: Omit<InsertSubscription, "id"> = {
    userId,
    plan: "annual",
    status: "active",
    lettersAllowed: 50,
    lettersUsed: 15,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  };

  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));
    console.log(`  [Subscription] Updated existing subscription for user ${userId}`);
  } else {
    await db.insert(subscriptions).values(values);
    console.log(`  [Subscription] Created new subscription for user ${userId}`);
  }
}

interface SeedResult {
  requestId: number;
  finalVersionId: number;
  finalContent: string;
}

async function seedLetter(letter: LetterSeed, index: number): Promise<SeedResult | null> {
  const existing = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        eq(letterRequests.userId, SUBSCRIBER_USER_ID),
        eq(letterRequests.subject, letter.subject)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(`  [${index + 1}] SKIPPED (already exists): ${letter.subject.slice(0, 60)}...`);
    return { requestId: existing[0].id, finalVersionId: existing[0].currentFinalVersionId ?? 0, finalContent: letter.finalApproved };
  }

  const createdAt = new Date(Date.now() - letter.createdDaysAgo * 24 * 60 * 60 * 1000);

  const reqValues: Omit<InsertLetterRequest, "id"> = {
    userId: SUBSCRIBER_USER_ID,
    letterType: letter.letterType,
    subject: letter.subject,
    issueSummary: letter.intakeJson.matter?.description?.slice(0, 500) ?? "",
    jurisdictionCountry: "US",
    jurisdictionState: letter.jurisdictionState,
    jurisdictionCity: letter.jurisdictionCity,
    intakeJson: letter.intakeJson,
    status: "approved",
    assignedReviewerId: ATTORNEY_USER_ID,
    priority: "normal",
    lastStatusChangedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };

  const [req] = await db.insert(letterRequests).values(reqValues).returning({ id: letterRequests.id });
  const requestId = req.id;

  const draftCreatedAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
  const draftValues: Omit<InsertLetterVersion, "id"> = {
    letterRequestId: requestId,
    versionType: "ai_draft",
    content: letter.aiDraft,
    createdByType: "system",
    createdAt: draftCreatedAt,
  };
  const [draftVersion] = await db.insert(letterVersions).values(draftValues).returning({ id: letterVersions.id });

  const finalCreatedAt = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000);
  const finalValues: Omit<InsertLetterVersion, "id"> = {
    letterRequestId: requestId,
    versionType: "final_approved",
    content: letter.finalApproved,
    createdByType: "attorney",
    createdByUserId: ATTORNEY_USER_ID,
    createdAt: finalCreatedAt,
  };
  const [finalVersion] = await db.insert(letterVersions).values(finalValues).returning({ id: letterVersions.id });

  await db
    .update(letterRequests)
    .set({
      currentAiDraftVersionId: draftVersion.id,
      currentFinalVersionId: finalVersion.id,
    })
    .where(eq(letterRequests.id, requestId));

  const reviewCreatedAt = new Date(createdAt.getTime() + 6 * 60 * 60 * 1000);
  const reviewValues: Omit<InsertReviewAction, "id"> = {
    letterRequestId: requestId,
    reviewerId: ATTORNEY_USER_ID,
    actorType: "attorney",
    action: "approved",
    noteText: letter.reviewNote,
    noteVisibility: "internal",
    fromStatus: "pending_review",
    toStatus: "approved",
    createdAt: reviewCreatedAt,
  };
  await db.insert(reviewActions).values(reviewValues);

  console.log(
    `  [${index + 1}] INSERTED: ${letter.subject.slice(0, 60)}... (req #${requestId}, draft #${draftVersion.id}, final #${finalVersion.id})`
  );

  return { requestId, finalVersionId: finalVersion.id, finalContent: letter.finalApproved };
}

/**
 * Script-local equivalent of embedAndStoreLetterVersion from server/pipeline/embeddings.
 * Uses generateEmbedding (pure OpenAI call) and updates the vector store via the
 * script's own db connection to avoid running auto-migrations (which getDb() triggers).
 * Mirrors the error instrumentation pattern of the canonical helper.
 */
async function embedAndStoreLetterVersion(versionId: number, content: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    const vectorStr = `[${embedding.join(",")}]`;
    await db.execute(
      sql`UPDATE letter_versions SET embedding = ${vectorStr}::vector WHERE id = ${versionId}`
    );
    console.log(`  [Embeddings] Stored embedding for version #${versionId} (${embedding.length} dims)`);
  } catch (err) {
    console.error(`  [Embeddings] Failed to embed version #${versionId}:`, err);
    throw err;
  }
}

async function runEmbeddingsForMissingVersions(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("\n  [Embeddings] OPENAI_API_KEY not set — skipping embedding generation.");
    return;
  }

  // Find all final_approved versions for user 1612 that are missing embeddings
  const missing = await db.execute(
    sql`
      SELECT lv.id, lv.content
      FROM letter_versions lv
      JOIN letter_requests lr ON lv.letter_request_id = lr.id
      WHERE lr.user_id = ${SUBSCRIBER_USER_ID}
        AND lv.version_type = 'final_approved'
        AND lv.embedding IS NULL
    `
  );

  const rows = (missing as unknown) as Array<{ id: number; content: string }>;

  if (rows.length === 0) {
    console.log("  [Embeddings] All final_approved versions already have embeddings.");
    return;
  }

  console.log(`\n  [Embeddings] Generating embeddings for ${rows.length} final_approved version(s) missing embeddings...`);

  for (const row of rows) {
    try {
      await embedAndStoreLetterVersion(row.id, row.content);
    } catch (err) {
      console.error(`  [Embeddings] Error for version #${row.id}:`, err);
    }
  }
}

async function verifyResults(): Promise<void> {
  console.log("\n=== Verification ===");

  const requestCount = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM letter_requests WHERE user_id = ${SUBSCRIBER_USER_ID} AND status = 'approved'`
  );
  console.log(`  Approved letter requests for user ${SUBSCRIBER_USER_ID}:`, ((requestCount as unknown) as Array<{ count: number }>)[0]?.count ?? "?");

  const versionCount = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM letter_versions lv JOIN letter_requests lr ON lv.letter_request_id = lr.id WHERE lr.user_id = ${SUBSCRIBER_USER_ID}`
  );
  console.log(`  Letter versions (all types):`, ((versionCount as unknown) as Array<{ count: number }>)[0]?.count ?? "?");

  const reviewCount = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM review_actions ra JOIN letter_requests lr ON ra.letter_request_id = lr.id WHERE lr.user_id = ${SUBSCRIBER_USER_ID} AND ra.action = 'approved'`
  );
  console.log(`  Review actions (approved):`, ((reviewCount as unknown) as Array<{ count: number }>)[0]?.count ?? "?");

  const embeddingCount = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM letter_versions lv JOIN letter_requests lr ON lv.letter_request_id = lr.id WHERE lr.user_id = ${SUBSCRIBER_USER_ID} AND lv.version_type = 'final_approved' AND lv.embedding IS NOT NULL`
  );
  console.log(`  Final versions with embeddings:`, ((embeddingCount as unknown) as Array<{ count: number }>)[0]?.count ?? "?");
}

async function main(): Promise<void> {
  console.log("=== Seeding Approved Letters ===\n");
  console.log(`Target: user_id ${SUBSCRIBER_USER_ID}, reviewer_id ${ATTORNEY_USER_ID}\n`);

  console.log("→ Setting up subscription...");
  await ensureSubscription(SUBSCRIBER_USER_ID);

  console.log("\n→ Inserting letter requests...");
  for (let i = 0; i < LETTERS.length; i++) {
    await seedLetter(LETTERS[i], i);
  }

  console.log("\n→ Running embedding pipeline for any unembedded final_approved versions...");
  await runEmbeddingsForMissingVersions();

  await verifyResults();

  console.log("\n=== Seed complete ===\n");
  await pgClient.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
