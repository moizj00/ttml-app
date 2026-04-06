/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";

import { z } from "zod";

// ─── Status Machine (single source of truth) ───
// This is the CANONICAL transition map. server/db.ts imports from here.
// Admin forceStatusTransition bypasses this map (force=true).
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted: ["researching", "pipeline_failed"],
  researching: ["drafting", "submitted", "pipeline_failed"],
  drafting: ["generated_locked", "submitted", "pipeline_failed"],
  // generated_unlocked is a legacy status (Phase ≤68). New letters always go to
  // generated_locked. Legacy letters in generated_unlocked are treated identically
  // to generated_locked on the frontend (StatusTimeline maps them). The only
  // valid forward transition is pending_review (subscriber submits for review).
  generated_unlocked: ["pending_review"],
  generated_locked: ["pending_review"],
  pending_review: ["under_review"],
  under_review: ["approved", "rejected", "needs_changes", "pending_review"],
  needs_changes: ["submitted"],
  approved: ["client_approval_pending"],
  client_approval_pending: ["client_approved", "client_revision_requested", "client_declined"],
  client_revision_requested: ["pending_review", "under_review"],
  client_approved: ["sent"],
  sent: [],
  rejected: ["submitted"],
  client_declined: [],
  pipeline_failed: ["submitted"],
};

export function isValidTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Status display config ───
export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  submitted: {
    label: "Submitted",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  researching: {
    label: "Researching",
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
  },
  drafting: {
    label: "Drafting",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  generated_locked: {
    label: "Draft Ready",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  // Legacy alias — same display as generated_locked
  generated_unlocked: {
    label: "Draft Ready",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  pending_review: {
    label: "Awaiting Review",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  under_review: {
    label: "Under Review",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
  needs_changes: {
    label: "Changes Requested",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  approved: {
    label: "Approved",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  client_approval_pending: {
    label: "Awaiting Client Approval",
    color: "text-teal-600",
    bgColor: "bg-teal-100",
  },
  client_revision_requested: {
    label: "Revision Requested",
    color: "text-violet-600",
    bgColor: "bg-violet-100",
  },
  client_declined: {
    label: "Client Declined",
    color: "text-red-700",
    bgColor: "bg-red-200",
  },
  client_approved: {
    label: "Client Approved",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
  sent: {
    label: "Sent to Recipient",
    color: "text-sky-700",
    bgColor: "bg-sky-100",
  },
  rejected: { label: "Rejected", color: "text-red-700", bgColor: "bg-red-200" },
  pipeline_failed: {
    label: "Pipeline Failed",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
};

// ─── Universal Legal Subject Taxonomy ───
// Single source of truth for all legal subject categories across the platform.
// References: letter types, blog categories, pipeline lessons, analytics.
export const LEGAL_SUBJECTS = [
  "demand-letter",
  "cease-and-desist",
  "contract-breach",
  "eviction-notice",
  "employment-dispute",
  "consumer-complaint",
  "pre-litigation-settlement",
  "debt-collection",
  "estate-probate",
  "landlord-tenant",
  "insurance-dispute",
  "personal-injury-demand",
  "intellectual-property",
  "family-law",
  "neighbor-hoa",
  "general-legal",
] as const;
export type LegalSubject = (typeof LEGAL_SUBJECTS)[number];

// ─── Situation Field Definition ───
export interface SituationFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  placeholder?: string;
  options?: string[];
  defaultEnabled: boolean;
}

export interface IntakeFieldConfig {
  enabledDefaultFields: string[];
  customFields: SituationFieldDef[];
}

export interface IntakeFormTemplateRecord {
  id: number;
  ownerUserId: number;
  title: string;
  baseLetterType: string;
  fieldConfig: IntakeFieldConfig;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Letter Type display config ───
// targetWordCount: target word count for the AI drafting stage.
// These are calibrated to produce professional, appropriately-scoped letters
// for each category. The pipeline prompt instructs Claude to aim for this count.
// intakeHints: contextual field hints shown in the submission form for each type.
// situationFields: additional fields shown dynamically in Step 4 based on letter type.
export const LETTER_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    description: string;
    targetWordCount: number;
    tip: string;
    intakeHints?: {
      subjectPlaceholder?: string;
      descriptionPlaceholder?: string;
      desiredOutcomePlaceholder?: string;
      amountOwedLabel?: string;
    };
    situationFields?: SituationFieldDef[];
  }
> = {
  "demand-letter": {
    label: "Demand Letter",
    description: "Formal demand for payment, action, or resolution",
    targetWordCount: 450,
    tip: "Best for unpaid debts, invoices, or property damage claims.",
    intakeHints: {
      subjectPlaceholder: "e.g., Demand for unpaid invoice #1042 — $3,500 owed",
      descriptionPlaceholder: "Describe what is owed, when it was due, and what efforts you have already made to collect...",
      desiredOutcomePlaceholder: "e.g., Full payment of $3,500 within 14 days or I will pursue legal action.",
      amountOwedLabel: "Amount Owed (USD)",
    },
    situationFields: [
      { key: "paymentDueDate", label: "Payment Due Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "invoiceReference", label: "Invoice / Reference Number", type: "text", placeholder: "e.g., INV-1042", defaultEnabled: true },
      { key: "debtorRelationship", label: "Relationship to Debtor", type: "text", placeholder: "e.g., Client, Contractor, Tenant", defaultEnabled: true },
    ],
  },
  "cease-and-desist": {
    label: "Cease and Desist",
    description: "Order to stop specific activities or face legal action",
    targetWordCount: 500,
    tip: "Used to stop harassment, defamation, or IP infringement.",
    intakeHints: {
      subjectPlaceholder: "e.g., Cease and Desist — Unauthorized use of trademark",
      descriptionPlaceholder: "Describe the specific conduct or activity that must stop, when it began, and how it has harmed you...",
      desiredOutcomePlaceholder: "e.g., Immediate cessation of all infringing activity and written confirmation within 7 days.",
    },
    situationFields: [
      { key: "conductType", label: "Type of Conduct", type: "select", options: ["Harassment", "Defamation", "IP Infringement", "Stalking", "Other"], defaultEnabled: true },
      { key: "conductStartDate", label: "When Conduct Began", type: "date", placeholder: "", defaultEnabled: true },
      { key: "harmDescription", label: "How It Has Harmed You", type: "textarea", placeholder: "Describe the harm or damages caused...", defaultEnabled: true },
    ],
  },
  "contract-breach": {
    label: "Contract Breach",
    description: "Notice of breach of contract terms",
    targetWordCount: 550,
    tip: "For when a party has failed to uphold agreed-upon terms.",
    intakeHints: {
      subjectPlaceholder: "e.g., Notice of Breach — Service Agreement dated Jan 15, 2025",
      descriptionPlaceholder: "Describe the contract terms that were violated, when the breach occurred, and the resulting damages...",
      desiredOutcomePlaceholder: "e.g., Cure the breach within 10 days or compensate for damages of $X.",
    },
    situationFields: [
      { key: "contractDate", label: "Contract Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "contractType", label: "Type of Contract", type: "text", placeholder: "e.g., Service Agreement, Lease, NDA", defaultEnabled: true },
      { key: "breachedTerms", label: "Specific Terms Breached", type: "textarea", placeholder: "Describe which contract provisions were violated...", defaultEnabled: true },
    ],
  },
  "eviction-notice": {
    label: "Eviction Notice",
    description: "Formal notice to vacate a rental property",
    targetWordCount: 350,
    tip: "Formally notifies a tenant to vacate a rental property.",
    intakeHints: {
      subjectPlaceholder: "e.g., Notice to Vacate — 123 Main St, Unit 4B",
      descriptionPlaceholder: "Include the property address, lease start date, reason for eviction (e.g., nonpayment, lease violation), and amount owed if applicable...",
      desiredOutcomePlaceholder: "e.g., Vacate the premises within 30 days or legal proceedings will commence.",
    },
    situationFields: [
      { key: "propertyAddress", label: "Property Address", type: "text", placeholder: "e.g., 123 Main St, Unit 4B", defaultEnabled: true },
      { key: "leaseStartDate", label: "Lease Start Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "evictionReason", label: "Reason for Eviction", type: "select", options: ["Nonpayment of Rent", "Lease Violation", "End of Lease Term", "Property Damage", "Other"], defaultEnabled: true },
      { key: "rentOwed", label: "Rent Amount Owed", type: "number", placeholder: "0.00", defaultEnabled: true },
    ],
  },
  "employment-dispute": {
    label: "Employment Dispute",
    description: "Workplace-related legal matter",
    targetWordCount: 600,
    tip: "Covers wrongful termination, discrimination, or wage issues.",
    intakeHints: {
      subjectPlaceholder: "e.g., Wrongful Termination — Notice of Legal Action",
      descriptionPlaceholder: "Describe your employment history, the incident or dispute, any witnesses, and HR communications that occurred...",
      desiredOutcomePlaceholder: "e.g., Reinstatement and back pay, or a settlement of $X within 21 days.",
    },
    situationFields: [
      { key: "employerName", label: "Employer Name", type: "text", placeholder: "e.g., Acme Corp", defaultEnabled: true },
      { key: "positionTitle", label: "Position / Title", type: "text", placeholder: "e.g., Senior Developer", defaultEnabled: true },
      { key: "employmentStartDate", label: "Employment Start Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "hrContact", label: "HR Contact", type: "text", placeholder: "e.g., Jane Smith, HR Director", defaultEnabled: true },
      { key: "disputeType", label: "Type of Dispute", type: "select", options: ["Wrongful Termination", "Discrimination", "Wage/Hour Violation", "Harassment", "Retaliation", "Other"], defaultEnabled: true },
    ],
  },
  "consumer-complaint": {
    label: "Consumer Complaint",
    description: "Complaint against a business or service provider",
    targetWordCount: 500,
    tip: "File formal complaints against businesses or service providers.",
    intakeHints: {
      subjectPlaceholder: "e.g., Formal Complaint — Defective Product / Failure to Refund",
      descriptionPlaceholder: "Describe the product or service, what was promised vs. what was delivered, order numbers, and prior attempts to resolve...",
      desiredOutcomePlaceholder: "e.g., Full refund of $X within 14 days or I will file a complaint with the BBB and pursue legal remedies.",
    },
    situationFields: [
      { key: "businessName", label: "Business Name", type: "text", placeholder: "e.g., XYZ Electronics", defaultEnabled: true },
      { key: "orderNumber", label: "Order / Account Number", type: "text", placeholder: "e.g., ORD-12345", defaultEnabled: true },
      { key: "purchaseDate", label: "Purchase Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "productService", label: "Product or Service", type: "text", placeholder: "e.g., Laptop Model X, Cleaning Service", defaultEnabled: true },
    ],
  },
  "pre-litigation-settlement": {
    label: "Pre-Litigation Settlement",
    description: "Formal settlement offer before filing a lawsuit",
    targetWordCount: 550,
    tip: "Resolve disputes cost-effectively before proceeding to court.",
    intakeHints: {
      subjectPlaceholder: "e.g., Pre-Litigation Settlement Offer — Slip and Fall at 456 Oak Ave",
      descriptionPlaceholder: "Describe the dispute, the damages or harm suffered, and the basis for your claim. Include relevant dates, incidents, and any prior communications...",
      desiredOutcomePlaceholder: "e.g., Settlement payment of $X within 30 days to avoid civil litigation.",
      amountOwedLabel: "Settlement Amount Sought (USD)",
    },
    situationFields: [
      { key: "liabilityBasis", label: "Basis for Liability", type: "textarea", placeholder: "Explain why the other party is liable...", defaultEnabled: true },
      { key: "damagesBreakdown", label: "Damages Breakdown", type: "textarea", placeholder: "e.g., Medical: $5,000, Lost wages: $3,000, Property: $2,000", defaultEnabled: true },
    ],
  },
  "debt-collection": {
    label: "Debt Collection",
    description: "Formal notice demanding repayment of a debt",
    targetWordCount: 450,
    tip: "For collecting overdue balances from individuals or businesses.",
    intakeHints: {
      subjectPlaceholder: "e.g., Final Notice — $2,400 Outstanding Balance Due",
      descriptionPlaceholder: "Include the original amount owed, original due date, any partial payments made, and the total balance remaining...",
      desiredOutcomePlaceholder: "e.g., Full payment of $2,400 by [date] or account will be referred to collections.",
      amountOwedLabel: "Total Balance Owed (USD)",
    },
    situationFields: [
      { key: "originalDueDate", label: "Original Due Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "partialPayments", label: "Partial Payments Made", type: "text", placeholder: "e.g., $500 on Jan 1, $200 on Feb 15", defaultEnabled: true },
      { key: "accountNumber", label: "Account Number", type: "text", placeholder: "e.g., ACCT-9876", defaultEnabled: true },
    ],
  },
  "estate-probate": {
    label: "Estate / Probate",
    description: "Legal correspondence related to estates, wills, and probate",
    targetWordCount: 550,
    tip: "Covers executor duties, inheritance disputes, and probate proceedings.",
    intakeHints: {
      subjectPlaceholder: "e.g., Estate of [Name] — Notice to Creditors / Heir Dispute",
      descriptionPlaceholder: "Include the decedent's name, date of death, probate case number if applicable, nature of the dispute, and your role (executor, heir, creditor)...",
      desiredOutcomePlaceholder: "e.g., Distribution of estate assets per the will within 60 days.",
    },
    situationFields: [
      { key: "decedentName", label: "Decedent Name", type: "text", placeholder: "Full legal name of the deceased", defaultEnabled: true },
      { key: "dateOfDeath", label: "Date of Death", type: "date", placeholder: "", defaultEnabled: true },
      { key: "probateCaseNumber", label: "Probate Case Number", type: "text", placeholder: "e.g., PR-2025-0042", defaultEnabled: true },
      { key: "yourRole", label: "Your Role", type: "select", options: ["Executor", "Heir", "Beneficiary", "Creditor", "Other"], defaultEnabled: true },
    ],
  },
  "landlord-tenant": {
    label: "Landlord–Tenant",
    description: "Disputes between landlords and tenants beyond eviction",
    targetWordCount: 500,
    tip: "For security deposit disputes, habitability issues, or lease violations.",
    intakeHints: {
      subjectPlaceholder: "e.g., Demand for Security Deposit Return — 789 Elm St, Unit 2",
      descriptionPlaceholder: "Include the property address, lease dates, the specific issue (security deposit, repairs, harassment, lease terms), and any relevant communications...",
      desiredOutcomePlaceholder: "e.g., Return of full $1,800 security deposit within 21 days as required by state law.",
    },
    situationFields: [
      { key: "propertyAddress", label: "Property Address", type: "text", placeholder: "e.g., 789 Elm St, Unit 2", defaultEnabled: true },
      { key: "leaseStartDate", label: "Lease Start Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "leaseEndDate", label: "Lease End Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "issueType", label: "Type of Issue", type: "select", options: ["Security Deposit", "Habitability", "Repairs", "Lease Violation", "Harassment", "Other"], defaultEnabled: true },
    ],
  },
  "insurance-dispute": {
    label: "Insurance Dispute",
    description: "Dispute a denied or underpaid insurance claim",
    targetWordCount: 550,
    tip: "Challenge unfair claim denials or bad faith insurance practices.",
    intakeHints: {
      subjectPlaceholder: "e.g., Appeal of Denied Claim — Policy #ABC12345",
      descriptionPlaceholder: "Include your policy number, the claim details, the denial reason given by the insurer, and why you believe the denial is incorrect...",
      desiredOutcomePlaceholder: "e.g., Approval and payment of claim totaling $X within 30 days.",
      amountOwedLabel: "Claim Amount (USD)",
    },
    situationFields: [
      { key: "policyNumber", label: "Policy Number", type: "text", placeholder: "e.g., ABC12345", defaultEnabled: true },
      { key: "claimNumber", label: "Claim Number", type: "text", placeholder: "e.g., CLM-2025-001", defaultEnabled: true },
      { key: "denialReason", label: "Denial Reason Given", type: "textarea", placeholder: "What reason did the insurer provide for denying the claim?", defaultEnabled: true },
      { key: "insurerName", label: "Insurance Company", type: "text", placeholder: "e.g., State Farm, Allstate", defaultEnabled: true },
    ],
  },
  "personal-injury-demand": {
    label: "Personal Injury Demand",
    description: "Demand letter for compensation after personal injury",
    targetWordCount: 600,
    tip: "Document injuries, medical costs, and lost wages for compensation.",
    intakeHints: {
      subjectPlaceholder: "e.g., Personal Injury Demand — Car Accident on [Date]",
      descriptionPlaceholder: "Describe the incident, your injuries, medical treatment received, medical costs, lost income, and how the recipient is liable...",
      desiredOutcomePlaceholder: "e.g., Settlement payment of $X covering medical expenses, lost wages, and pain and suffering within 30 days.",
      amountOwedLabel: "Total Damages Sought (USD)",
    },
    situationFields: [
      { key: "injuryDescription", label: "Injury Description", type: "textarea", placeholder: "Describe your injuries in detail...", defaultEnabled: true },
      { key: "medicalProvider", label: "Medical Provider", type: "text", placeholder: "e.g., City General Hospital, Dr. Smith", defaultEnabled: true },
      { key: "medicalCosts", label: "Medical Costs (USD)", type: "number", placeholder: "0.00", defaultEnabled: true },
      { key: "lostWages", label: "Lost Wages (USD)", type: "number", placeholder: "0.00", defaultEnabled: true },
    ],
  },
  "intellectual-property": {
    label: "Intellectual Property",
    description: "Protect trademarks, copyrights, patents, or trade secrets",
    targetWordCount: 550,
    tip: "Enforce IP rights and demand infringement stops immediately.",
    intakeHints: {
      subjectPlaceholder: "e.g., Copyright Infringement Notice — [Work Title]",
      descriptionPlaceholder: "Identify your IP (trademark name/registration, copyright work, patent number), describe how it is being infringed, and when you discovered the infringement...",
      desiredOutcomePlaceholder: "e.g., Immediately remove all infringing content and provide written confirmation within 7 days.",
    },
    situationFields: [
      { key: "ipType", label: "Type of IP", type: "select", options: ["Trademark", "Copyright", "Patent", "Trade Secret", "Other"], defaultEnabled: true },
      { key: "registrationNumber", label: "Registration / Patent Number", type: "text", placeholder: "e.g., US Patent #10,123,456", defaultEnabled: true },
      { key: "workTitle", label: "Title of Work / Mark", type: "text", placeholder: "e.g., 'My Novel', 'BrandName™'", defaultEnabled: true },
      { key: "infringementUrl", label: "URL of Infringement (if online)", type: "text", placeholder: "e.g., https://example.com/infringing-page", defaultEnabled: true },
    ],
  },
  "family-law": {
    label: "Family Law",
    description: "Legal matters involving divorce, custody, or support",
    targetWordCount: 550,
    tip: "Address custody, child support, alimony, or asset division disputes.",
    intakeHints: {
      subjectPlaceholder: "e.g., Demand for Child Support — Case No. 2025-DR-0042",
      descriptionPlaceholder: "Describe the family law matter, relevant court orders or agreements, the issue at hand, and any non-compliance by the other party...",
      desiredOutcomePlaceholder: "e.g., Compliance with existing support order or payment of arrears of $X within 14 days.",
    },
    situationFields: [
      { key: "caseNumber", label: "Case Number", type: "text", placeholder: "e.g., 2025-DR-0042", defaultEnabled: true },
      { key: "matterType", label: "Type of Matter", type: "select", options: ["Child Support", "Child Custody", "Alimony/Spousal Support", "Asset Division", "Divorce", "Other"], defaultEnabled: true },
      { key: "existingOrderDate", label: "Existing Court Order Date", type: "date", placeholder: "", defaultEnabled: true },
      { key: "childrenInvolved", label: "Number of Children Involved", type: "number", placeholder: "0", defaultEnabled: true },
    ],
  },
  "neighbor-hoa": {
    label: "Neighbor / HOA Dispute",
    description: "Resolve conflicts with neighbors or homeowners associations",
    targetWordCount: 500,
    tip: "Address noise, property damage, HOA rule violations, or boundary disputes.",
    intakeHints: {
      subjectPlaceholder: "e.g., Formal Complaint — Persistent Noise Violation at [Address]",
      descriptionPlaceholder: "Describe the dispute, specific incidents with dates, prior verbal or written attempts to resolve, and how it has affected you...",
      desiredOutcomePlaceholder: "e.g., Immediate cessation of the nuisance activity within 10 days or I will file a complaint with local authorities.",
    },
    situationFields: [
      { key: "disputeType", label: "Type of Dispute", type: "select", options: ["Noise", "Property Damage", "Boundary/Fence", "HOA Violation", "Tree/Landscaping", "Parking", "Other"], defaultEnabled: true },
      { key: "neighborAddress", label: "Neighbor / HOA Address", type: "text", placeholder: "e.g., 124 Main St (next door)", defaultEnabled: true },
      { key: "hoaName", label: "HOA Name (if applicable)", type: "text", placeholder: "e.g., Sunset Ridge HOA", defaultEnabled: true },
    ],
  },
  "general-legal": {
    label: "General Legal Letter",
    description: "Other legal correspondence not covered by specific categories",
    targetWordCount: 450,
    tip: "Any other legal correspondence that doesn't fit the above.",
    intakeHints: {
      subjectPlaceholder: "e.g., Legal Notice — [Brief description of issue]",
      descriptionPlaceholder: "Describe your legal matter in detail, including relevant dates, parties involved, and the basis for your claim or concern...",
      desiredOutcomePlaceholder: "e.g., Describe the specific action or resolution you are seeking.",
    },
    situationFields: [],
  },
};

// ─── US States ───
export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

// ─── Intake JSON Schema Shape ───
export interface IntakeJson {
  schemaVersion: string;
  letterType: string;
  sender: { name: string; address: string; email?: string; phone?: string };
  recipient: { name: string; address: string; email?: string; phone?: string };
  jurisdiction: { country: string; state: string; city?: string };
  matter: {
    category: string;
    subject: string;
    description: string;
    incidentDate?: string;
  };
  financials?: { amountOwed?: number; currency?: string };
  desiredOutcome: string;
  deadlineDate?: string;
  additionalContext?: string;
  tonePreference?: "firm" | "moderate" | "aggressive"; // kept for backwards compat
  language?: string; // e.g. "english", "spanish", "french"
  priorCommunication?: string; // legacy simple field
  deliveryMethod?: string; // legacy simple field
  communications?: {
    // structured prior communications
    summary: string;
    lastContactDate?: string; // ISO date string
    method?: "email" | "phone" | "letter" | "in-person" | "other";
  };
  toneAndDelivery?: {
    // structured tone + delivery
    tone: "firm" | "moderate" | "aggressive";
    deliveryMethod?: "email" | "certified-mail" | "hand-delivery";
  };
  exhibits?: {
    label: string;
    description?: string;
    hasAttachment?: boolean;
  }[];
  evidenceSummary?: string;
  situationFields?: Record<string, string | number>;
}

// ─── Research Packet Shape ───
export interface ResearchPacket {
  researchSummary: string;
  jurisdictionProfile: {
    country: string;
    stateProvince: string;
    city?: string;
    authorityHierarchy: string[];
    politicalContext?: string;
    localCourts?: string;
  };
  issuesIdentified: string[];
  applicableRules: {
    ruleTitle: string;
    ruleType: string;
    jurisdiction: string;
    citationText: string;
    sectionOrRule: string;
    summary: string;
    sourceUrl: string;
    sourceTitle: string;
    relevance: string;
    confidence: "high" | "medium" | "low";
  }[];
  localJurisdictionElements: {
    element: string;
    whyItMatters: string;
    sourceUrl: string;
    confidence: "high" | "medium" | "low";
  }[];
  recentCasePrecedents?: {
    caseName?: string;
    citation?: string;
    court?: string;
    year?: number;
    facts?: string;
    holding?: string;
    relevance?: string;
    damages?: string;
    sourceUrl?: string;
    summary?: string;
  }[];
  statuteOfLimitations?: {
    statute?: string;
    period?: string;
    clockStartsOn?: string;
    deadlineEstimate?: string;
    urgencyFlag?: boolean;
    notes?: string;
  };
  preSuitRequirements?: {
    demandLetterRequired?: boolean;
    statute?: string;
    waitingPeriodDays?: number;
    requiredContent?: string[];
    deliveryMethod?: string;
    consequenceOfNonCompliance?: string;
    description?: string;
    notes?: string;
  };
  availableRemedies?: {
    actualDamages?: string;
    statutoryDamages?: string;
    punitiveDamages?: string;
    attorneyFees?: string;
    injunctiveRelief?: string;
    multiplier?: string;
  };
  commonDefenses?: {
    defense?: string;
    description?: string;
    counterArgument?: string;
    successRate?: string;
  }[];
  enforcementClimate?: {
    agActivity?: string;
    classActions?: string;
    recentLegislation?: string;
    politicalLeaning?: string;
  };
  factualDataNeeded: string[];
  openQuestions: string[];
  riskFlags: string[];
  draftingConstraints: string[];
}

// ─── Citation Registry Entry ───
export interface CitationRegistryEntry {
  registryNumber: number;
  citationText: string;
  ruleTitle: string;
  ruleType: string;
  confidence: "high" | "medium" | "low";
  sourceUrl: string;
  sourceTitle: string;
  revalidated: boolean;
}

// ─── Citation Audit Report ───
export interface CitationAuditEntry {
  citation: string;
  registryNumber: number | null;
  status: "verified" | "unverified";
  confidence: "high" | "medium" | "low";
  source: "research_packet" | "claude_generated";
}

export interface CitationAuditReport {
  verifiedCitations: CitationAuditEntry[];
  unverifiedCitations: CitationAuditEntry[];
  totalCitations: number;
  hallucinationRiskScore: number;
  auditedAt: string;
}

// ─── Validation Result (used across all pipeline stages) ───
export interface ValidationResult {
  stage: string;
  check: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  timestamp: string;
}

// ─── Grounding Report (citation grounding check) ───
export interface GroundingReport {
  totalCitationsInDraft: number;
  groundedCitations: string[];
  ungroundedCitations: string[];
  passed: boolean;
}

// ─── Content Consistency Report ───
export interface ContentConsistencyReport {
  senderNameFound: boolean;
  recipientNameFound: boolean;
  jurisdictionFound: boolean;
  jurisdictionMismatch: boolean;
  expectedJurisdiction: string;
  foundJurisdiction: string | null;
  passed: boolean;
  warnings: string[];
}

// ─── Token Usage (captured from AI SDK generateText calls) ───
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ─── Pipeline Context (source of truth throughout all stages) ───
export interface PipelineContext {
  letterId: number;
  userId: number;
  intake: IntakeJson;
  researchProvider?: string;
  citationRegistry?: CitationRegistryEntry[];
  researchUnverified?: boolean;
  webGrounded?: boolean;
  validationResults?: ValidationResult[];
  groundingReport?: GroundingReport;
  consistencyReport?: ContentConsistencyReport;
  assemblyVettingFeedback?: string;
  citationRevalidationTokens?: TokenUsage;
  qualityWarnings?: string[];
  /** Number of RAG examples injected in the drafting stage (0 = none retrieved or control group). */
  ragExampleCount?: number;
  /** Similarity scores of injected RAG examples (empty if none injected). */
  ragSimilarityScores?: number[];
  /** A/B testing group: "test" = RAG was injected (or attempted); "control" = RAG was skipped. */
  ragAbGroup?: "test" | "control";
  /** Total lesson count injected across all pipeline stages for this run. */
  lessonCount?: number;
  /**
   * Best intermediate draft content captured progressively as stages complete.
   * Used by the best-effort fallback to deliver a draft even when pipeline fails
   * mid-run before finalizeLetterAfterVetting persists the final version.
   * Ladder (latest wins): draft → assembled → vetted
   */
  _intermediateDraftContent?: string;
  counterArguments?: CounterArgument[];
  citationRevalidationModelKey?: string;
}

// ─── Counter-Argument Analysis ───
export interface CounterArgument {
  argument: string;
  howAddressed: string;
  strength: "strong" | "moderate" | "weak";
}

// ─── Draft Output Shape ───
export interface DraftOutput {
  draftLetter: string;
  attorneyReviewSummary: string;
  openQuestions: string[];
  riskFlags: string[];
  reviewNotes?: string;
  groundingWarnings?: string[];
  counterArguments?: CounterArgument[];
}

// ─── Document Analysis Result ───
export const flaggedRiskSchema = z.object({
  clause: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});
export type FlaggedRisk = z.infer<typeof flaggedRiskSchema>;

export const TTML_LETTER_TYPES = [
  "demand-letter",
  "cease-and-desist",
  "contract-breach",
  "eviction-notice",
  "employment-dispute",
  "consumer-complaint",
  "general-legal",
] as const;
export type TtmlLetterType = (typeof TTML_LETTER_TYPES)[number];

export const EMOTION_LABELS = [
  "anger",
  "fear",
  "urgency",
  "friendliness",
  "condescension",
  "sarcasm",
  "guilt-tripping",
  "confidence",
  "deception",
  "desperation",
] as const;
export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export const emotionBreakdownItemSchema = z.object({
  emotion: z.string(),
  intensity: z.number().min(0).max(100),
});
export type EmotionBreakdownItem = z.infer<typeof emotionBreakdownItemSchema>;

export const redFlagItemSchema = z.object({
  passage: z.string(),
  explanation: z.string(),
});
export type RedFlagItem = z.infer<typeof redFlagItemSchema>;

export const emotionalIntelligenceSchema = z.object({
  overallTone: z.string(),
  toneConfidence: z.enum(["low", "medium", "high"]),
  emotionBreakdown: z.array(emotionBreakdownItemSchema),
  hiddenImplications: z.array(z.string()),
  redFlags: z.array(redFlagItemSchema),
  manipulationTactics: z.array(z.string()),
  trueIntentSummary: z.string(),
});
export type EmotionalIntelligence = z.infer<typeof emotionalIntelligenceSchema>;

// ─── Evidence Item (extracted from Document Analyzer) ───
export interface EvidenceItem {
  type: "date" | "amount" | "party" | "clause" | "deadline" | "obligation";
  value: string;
  context: string;
  confidence: "high" | "medium" | "low";
}

export const evidenceItemSchema = z.object({
  type: z.enum(["date", "amount", "party", "clause", "deadline", "obligation"]),
  value: z.string(),
  context: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

// Canonical (strict) result schema — use for return types and DB storage
export const documentAnalysisResultSchema = z.object({
  summary: z.string(),
  actionItems: z.array(z.string()),
  flaggedRisks: z.array(flaggedRiskSchema),
  recommendedLetterType: z.enum(TTML_LETTER_TYPES).nullable(),
  urgencyLevel: z.enum(["low", "medium", "high"]),
  detectedDeadline: z.string().nullable(),
  detectedJurisdiction: z.string().nullable(),
  detectedParties: z.object({
    senderName: z.string().nullable(),
    recipientName: z.string().nullable(),
  }),
  recommendedResponseSummary: z.string(),
  emotionalIntelligence: emotionalIntelligenceSchema.nullable(),
  extractedEvidence: z.array(evidenceItemSchema).optional(),
});
export type DocumentAnalysisResult = z.infer<typeof documentAnalysisResultSchema>;

// Lenient schema for parsing raw AI output — applies safe defaults for missing/malformed fields
export const documentAnalysisResultLenientSchema = z.object({
  summary: z.string().default("Summary unavailable."),
  actionItems: z.array(z.string()).default([]),
  flaggedRisks: z.array(
    z.object({
      clause: z.string().default("Unknown clause"),
      description: z.string().default(""),
      severity: z.enum(["low", "medium", "high"]).default("medium"),
    })
  ).default([]),
  recommendedLetterType: z.enum(TTML_LETTER_TYPES).nullable().default(null),
  urgencyLevel: z.enum(["low", "medium", "high"]).default("medium"),
  detectedDeadline: z.string().nullable().default(null),
  detectedJurisdiction: z.string().nullable().default(null),
  detectedParties: z.object({
    senderName: z.string().nullable(),
    recipientName: z.string().nullable(),
  }).default({ senderName: null, recipientName: null }),
  recommendedResponseSummary: z.string().default(""),
  emotionalIntelligence: z.object({
    overallTone: z.string().default("Neutral"),
    toneConfidence: z.enum(["low", "medium", "high"]).default("medium"),
    emotionBreakdown: z.array(
      z.object({
        emotion: z.string().default("neutral"),
        intensity: z.number().min(0).max(100).default(50),
      })
    ).default([]),
    hiddenImplications: z.array(z.string()).default([]),
    redFlags: z.array(
      z.object({
        passage: z.string().default(""),
        explanation: z.string().default(""),
      })
    ).default([]),
    manipulationTactics: z.array(z.string()).default([]),
    trueIntentSummary: z.string().default(""),
  }).nullable().default(null),
  extractedEvidence: z.array(
    z.object({
      type: z.enum(["date", "amount", "party", "clause", "deadline", "obligation"]).default("clause"),
      value: z.string().default(""),
      context: z.string().default(""),
      confidence: z.enum(["high", "medium", "low"]).default("medium"),
    })
  ).optional().default([]),
});

// Zod insert schema for the document_analyses table
export const insertDocumentAnalysisSchema = z.object({
  documentName: z.string().min(1).max(500),
  fileType: z.enum(["pdf", "docx", "txt"]),
  analysisJson: documentAnalysisResultSchema,
  userId: z.number().int().nullable().optional(),
});

// SessionStorage key and shape for passing analysis prefill to the SubmitLetter form
export const ANALYZE_PREFILL_KEY = "documentAnalysisPrefill";
export interface AnalysisPrefill {
  letterType?: string;
  subject?: string;
  jurisdictionState?: string;
  senderName?: string;
  recipientName?: string;
  description?: string;
  evidenceItems?: EvidenceItem[];
  evidenceSummary?: string;
}

// ─── Pipeline Error Codes ───
export const PIPELINE_ERROR_CODES = {
  JSON_PARSE_FAILED: "JSON_PARSE_FAILED",
  CITATION_VALIDATION_FAILED: "CITATION_VALIDATION_FAILED",
  WORD_COUNT_EXCEEDED: "WORD_COUNT_EXCEEDED",
  API_TIMEOUT: "API_TIMEOUT",
  RATE_LIMITED: "RATE_LIMITED",
  GROUNDING_CHECK_FAILED: "GROUNDING_CHECK_FAILED",
  CONTENT_POLICY_VIOLATION: "CONTENT_POLICY_VIOLATION",
  ASSEMBLY_STRUCTURE_INVALID: "ASSEMBLY_STRUCTURE_INVALID",
  VETTING_REJECTED: "VETTING_REJECTED",
  RESEARCH_VALIDATION_FAILED: "RESEARCH_VALIDATION_FAILED",
  DRAFT_VALIDATION_FAILED: "DRAFT_VALIDATION_FAILED",
  JURISDICTION_MISMATCH: "JURISDICTION_MISMATCH",
  INTAKE_INCOMPLETE: "INTAKE_INCOMPLETE",
  API_KEY_MISSING: "API_KEY_MISSING",
  N8N_ERROR: "N8N_ERROR",
  SUPERSEDED: "SUPERSEDED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type PipelineErrorCode = typeof PIPELINE_ERROR_CODES[keyof typeof PIPELINE_ERROR_CODES];

export type PipelineErrorCategory = "transient" | "permanent";

export const PIPELINE_ERROR_CATEGORY: Record<PipelineErrorCode, PipelineErrorCategory> = {
  JSON_PARSE_FAILED: "transient",
  CITATION_VALIDATION_FAILED: "transient",
  WORD_COUNT_EXCEEDED: "transient",
  API_TIMEOUT: "transient",
  RATE_LIMITED: "transient",
  GROUNDING_CHECK_FAILED: "transient",
  CONTENT_POLICY_VIOLATION: "permanent",
  ASSEMBLY_STRUCTURE_INVALID: "transient",
  VETTING_REJECTED: "transient",
  RESEARCH_VALIDATION_FAILED: "transient",
  DRAFT_VALIDATION_FAILED: "transient",
  JURISDICTION_MISMATCH: "transient",
  INTAKE_INCOMPLETE: "permanent",
  API_KEY_MISSING: "permanent",
  N8N_ERROR: "transient",
  SUPERSEDED: "permanent",
  UNKNOWN_ERROR: "transient",
};

export const PIPELINE_ERROR_LABELS: Record<PipelineErrorCode, string> = {
  JSON_PARSE_FAILED: "JSON Parse Failed",
  CITATION_VALIDATION_FAILED: "Citation Validation Failed",
  WORD_COUNT_EXCEEDED: "Word Count Exceeded",
  API_TIMEOUT: "API Timeout",
  RATE_LIMITED: "Rate Limited",
  GROUNDING_CHECK_FAILED: "Grounding Check Failed",
  CONTENT_POLICY_VIOLATION: "Content Policy Violation",
  ASSEMBLY_STRUCTURE_INVALID: "Assembly Structure Invalid",
  VETTING_REJECTED: "Vetting Rejected",
  RESEARCH_VALIDATION_FAILED: "Research Validation Failed",
  DRAFT_VALIDATION_FAILED: "Draft Validation Failed",
  JURISDICTION_MISMATCH: "Jurisdiction Mismatch",
  INTAKE_INCOMPLETE: "Intake Incomplete",
  API_KEY_MISSING: "API Key Missing",
  N8N_ERROR: "n8n Integration Error",
  SUPERSEDED: "Superseded",
  UNKNOWN_ERROR: "Unknown Error",
};

export interface StructuredPipelineError {
  code: PipelineErrorCode;
  message: string;
  stage: string;
  details?: string;
  category: PipelineErrorCategory;
}

export function createPipelineError(
  code: PipelineErrorCode,
  message: string,
  stage: string,
  details?: string,
): StructuredPipelineError {
  return {
    code,
    message,
    stage,
    details,
    category: PIPELINE_ERROR_CATEGORY[code],
  };
}

export class PipelineError extends Error {
  public readonly code: PipelineErrorCode;
  public readonly stage: string;
  public readonly details?: string;
  public readonly category: PipelineErrorCategory;

  constructor(code: PipelineErrorCode, message: string, stage: string, details?: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.stage = stage;
    this.details = details;
    this.category = PIPELINE_ERROR_CATEGORY[code];
  }

  toStructured(): StructuredPipelineError {
    return createPipelineError(this.code, this.message, this.stage, this.details);
  }

  toJSON(): string {
    return JSON.stringify(this.toStructured());
  }
}

export function parsePipelineError(errorMessage: string | null | undefined): StructuredPipelineError | null {
  if (!errorMessage) return null;
  try {
    const parsed = JSON.parse(errorMessage);
    if (parsed && typeof parsed === "object" && "code" in parsed && "message" in parsed && "stage" in parsed) {
      return {
        code: parsed.code as PipelineErrorCode,
        message: parsed.message as string,
        stage: parsed.stage as string,
        details: parsed.details as string | undefined,
        category: PIPELINE_ERROR_CATEGORY[parsed.code as PipelineErrorCode] ?? "transient",
      };
    }
  } catch {
    // Not JSON — legacy string error
  }
  return null;
}

export function getErrorDisplayMessage(errorMessage: string | null | undefined): string {
  if (!errorMessage) return "";
  const structured = parsePipelineError(errorMessage);
  if (structured) return structured.message;
  return errorMessage;
}

export function isTransientError(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return true;
  const structured = parsePipelineError(errorMessage);
  if (structured) return structured.category === "transient";
  const lower = errorMessage.toLowerCase();
  if (lower.includes("content policy") || lower.includes("content filter")) return false;
  if (lower.includes("intake validation failed") || lower.includes("intake pre-flight")) return false;
  if (lower.includes("api key") || lower.includes("api_key") || lower.includes("apikey")) return false;
  return true;
}
