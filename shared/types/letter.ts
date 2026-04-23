import { z } from "zod";

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted: ["researching", "pipeline_failed"],
  researching: ["drafting", "submitted", "pipeline_failed"],
  drafting: [
    "ai_generation_completed_hidden",
    "generated_locked",
    "submitted",
    "pipeline_failed",
  ],
  ai_generation_completed_hidden: [
    "letter_released_to_subscriber",
    "pipeline_failed",
  ],
  letter_released_to_subscriber: [
    "attorney_review_upsell_shown",
    "pending_review",
  ],
  attorney_review_upsell_shown: ["pending_review"],
  generated_unlocked: ["pending_review"],
  generated_locked: ["pending_review"],
  pending_review: ["under_review"],
  under_review: ["approved", "rejected", "needs_changes", "pending_review"],
  needs_changes: ["submitted", "pending_review"],
  approved: ["sent", "client_revision_requested", "client_approval_pending"],
  client_approval_pending: [
    "client_approved",
    "client_revision_requested",
    "client_declined",
  ],
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
  ai_generation_completed_hidden: {
    label: "Research & Draft Complete",
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
  },
  letter_released_to_subscriber: {
    label: "Draft Ready",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
  attorney_review_upsell_shown: {
    label: "Draft Viewed",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  generated_locked: {
    label: "Draft Ready",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
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
  createdAt: Date;
  updatedAt: Date;
}

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
      descriptionPlaceholder:
        "Describe what is owed, when it was due, and what efforts you have already made to collect...",
      desiredOutcomePlaceholder:
        "e.g., Full payment of $3,500 within 14 days or I will pursue legal action.",
      amountOwedLabel: "Amount Owed (USD)",
    },
    situationFields: [
      {
        key: "paymentDueDate",
        label: "Payment Due Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "invoiceReference",
        label: "Invoice / Reference Number",
        type: "text",
        placeholder: "e.g., INV-1042",
        defaultEnabled: true,
      },
      {
        key: "debtorRelationship",
        label: "Relationship to Debtor",
        type: "text",
        placeholder: "e.g., Client, Contractor, Tenant",
        defaultEnabled: true,
      },
    ],
  },
  "cease-and-desist": {
    label: "Cease and Desist",
    description: "Order to stop specific activities or face legal action",
    targetWordCount: 500,
    tip: "Used to stop harassment, defamation, or IP infringement.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Cease and Desist — Unauthorized use of trademark",
      descriptionPlaceholder:
        "Describe the specific conduct or activity that must stop, when it began, and how it has harmed you...",
      desiredOutcomePlaceholder:
        "e.g., Immediate cessation of all infringing activity and written confirmation within 7 days.",
    },
    situationFields: [
      {
        key: "conductType",
        label: "Type of Conduct",
        type: "select",
        options: [
          "Harassment",
          "Defamation",
          "IP Infringement",
          "Stalking",
          "Other",
        ],
        defaultEnabled: true,
      },
      {
        key: "conductStartDate",
        label: "When Conduct Began",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "harmDescription",
        label: "How It Has Harmed You",
        type: "textarea",
        placeholder: "Describe the harm or damages caused...",
        defaultEnabled: true,
      },
    ],
  },
  "contract-breach": {
    label: "Contract Breach",
    description: "Notice of breach of contract terms",
    targetWordCount: 550,
    tip: "For when a party has failed to uphold agreed-upon terms.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Notice of Breach — Service Agreement dated Jan 15, 2025",
      descriptionPlaceholder:
        "Describe the contract terms that were violated, when the breach occurred, and the resulting damages...",
      desiredOutcomePlaceholder:
        "e.g., Cure the breach within 10 days or compensate for damages of $X.",
    },
    situationFields: [
      {
        key: "contractDate",
        label: "Contract Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "contractType",
        label: "Type of Contract",
        type: "text",
        placeholder: "e.g., Service Agreement, Lease, NDA",
        defaultEnabled: true,
      },
      {
        key: "breachedTerms",
        label: "Specific Terms Breached",
        type: "textarea",
        placeholder: "Describe which contract provisions were violated...",
        defaultEnabled: true,
      },
    ],
  },
  "eviction-notice": {
    label: "Eviction Notice",
    description: "Formal notice to vacate a rental property",
    targetWordCount: 350,
    tip: "Formally notifies a tenant to vacate a rental property.",
    intakeHints: {
      subjectPlaceholder: "e.g., Notice to Vacate — 123 Main St, Unit 4B",
      descriptionPlaceholder:
        "Include the property address, lease start date, reason for eviction (e.g., nonpayment, lease violation), and amount owed if applicable...",
      desiredOutcomePlaceholder:
        "e.g., Vacate the premises within 30 days or legal proceedings will commence.",
    },
    situationFields: [
      {
        key: "propertyAddress",
        label: "Property Address",
        type: "text",
        placeholder: "e.g., 123 Main St, Unit 4B",
        defaultEnabled: true,
      },
      {
        key: "leaseStartDate",
        label: "Lease Start Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "evictionReason",
        label: "Reason for Eviction",
        type: "select",
        options: [
          "Nonpayment of Rent",
          "Lease Violation",
          "End of Lease Term",
          "Property Damage",
          "Other",
        ],
        defaultEnabled: true,
      },
      {
        key: "rentOwed",
        label: "Rent Amount Owed",
        type: "number",
        placeholder: "0.00",
        defaultEnabled: true,
      },
    ],
  },
  "employment-dispute": {
    label: "Employment Dispute",
    description: "Workplace-related legal matter",
    targetWordCount: 600,
    tip: "Covers wrongful termination, discrimination, or wage issues.",
    intakeHints: {
      subjectPlaceholder: "e.g., Wrongful Termination — Notice of Legal Action",
      descriptionPlaceholder:
        "Describe your employment history, the incident or dispute, any witnesses, and HR communications that occurred...",
      desiredOutcomePlaceholder:
        "e.g., Reinstatement and back pay, or a settlement of $X within 21 days.",
    },
    situationFields: [
      {
        key: "employerName",
        label: "Employer Name",
        type: "text",
        placeholder: "e.g., Acme Corp",
        defaultEnabled: true,
      },
      {
        key: "positionTitle",
        label: "Position / Title",
        type: "text",
        placeholder: "e.g., Senior Developer",
        defaultEnabled: true,
      },
      {
        key: "employmentStartDate",
        label: "Employment Start Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "hrContact",
        label: "HR Contact",
        type: "text",
        placeholder: "e.g., Jane Smith, HR Director",
        defaultEnabled: true,
      },
      {
        key: "disputeType",
        label: "Type of Dispute",
        type: "select",
        options: [
          "Wrongful Termination",
          "Discrimination",
          "Wage/Hour Violation",
          "Harassment",
          "Retaliation",
          "Other",
        ],
        defaultEnabled: true,
      },
    ],
  },
  "consumer-complaint": {
    label: "Consumer Complaint",
    description: "Complaint against a business or service provider",
    targetWordCount: 500,
    tip: "File formal complaints against businesses or service providers.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Formal Complaint — Defective Product / Failure to Refund",
      descriptionPlaceholder:
        "Describe the product or service, what was promised vs. what was delivered, order numbers, and prior attempts to resolve...",
      desiredOutcomePlaceholder:
        "e.g., Full refund of $X within 14 days or I will file a complaint with the BBB and pursue legal remedies.",
    },
    situationFields: [
      {
        key: "businessName",
        label: "Business Name",
        type: "text",
        placeholder: "e.g., XYZ Electronics",
        defaultEnabled: true,
      },
      {
        key: "orderNumber",
        label: "Order / Account Number",
        type: "text",
        placeholder: "e.g., ORD-12345",
        defaultEnabled: true,
      },
      {
        key: "purchaseDate",
        label: "Purchase Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "productService",
        label: "Product or Service",
        type: "text",
        placeholder: "e.g., Laptop Model X, Cleaning Service",
        defaultEnabled: true,
      },
    ],
  },
  "pre-litigation-settlement": {
    label: "Pre-Litigation Settlement",
    description: "Formal settlement offer before filing a lawsuit",
    targetWordCount: 550,
    tip: "Resolve disputes cost-effectively before proceeding to court.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Pre-Litigation Settlement Offer — Slip and Fall at 456 Oak Ave",
      descriptionPlaceholder:
        "Describe the dispute, the damages or harm suffered, and the basis for your claim. Include relevant dates, incidents, and any prior communications...",
      desiredOutcomePlaceholder:
        "e.g., Settlement payment of $X within 30 days to avoid civil litigation.",
      amountOwedLabel: "Settlement Amount Sought (USD)",
    },
    situationFields: [
      {
        key: "liabilityBasis",
        label: "Basis for Liability",
        type: "textarea",
        placeholder: "Explain why the other party is liable...",
        defaultEnabled: true,
      },
      {
        key: "damagesBreakdown",
        label: "Damages Breakdown",
        type: "textarea",
        placeholder:
          "e.g., Medical: $5,000, Lost wages: $3,000, Property: $2,000",
        defaultEnabled: true,
      },
    ],
  },
  "debt-collection": {
    label: "Debt Collection",
    description: "Formal notice demanding repayment of a debt",
    targetWordCount: 450,
    tip: "For collecting overdue balances from individuals or businesses.",
    intakeHints: {
      subjectPlaceholder: "e.g., Final Notice — $2,400 Outstanding Balance Due",
      descriptionPlaceholder:
        "Include the original amount owed, original due date, any partial payments made, and the total balance remaining...",
      desiredOutcomePlaceholder:
        "e.g., Full payment of $2,400 by [date] or account will be referred to collections.",
      amountOwedLabel: "Total Balance Owed (USD)",
    },
    situationFields: [
      {
        key: "originalDueDate",
        label: "Original Due Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "partialPayments",
        label: "Partial Payments Made",
        type: "text",
        placeholder: "e.g., $500 on Jan 1, $200 on Feb 15",
        defaultEnabled: true,
      },
      {
        key: "accountNumber",
        label: "Account Number",
        type: "text",
        placeholder: "e.g., ACCT-9876",
        defaultEnabled: true,
      },
    ],
  },
  "estate-probate": {
    label: "Estate / Probate",
    description: "Legal correspondence related to estates, wills, and probate",
    targetWordCount: 550,
    tip: "Covers executor duties, inheritance disputes, and probate proceedings.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Estate of [Name] — Notice to Creditors / Heir Dispute",
      descriptionPlaceholder:
        "Include the decedent's name, date of death, probate case number if applicable, nature of the dispute, and your role (executor, heir, creditor)...",
      desiredOutcomePlaceholder:
        "e.g., Distribution of estate assets per the will within 60 days.",
    },
    situationFields: [
      {
        key: "decedentName",
        label: "Decedent Name",
        type: "text",
        placeholder: "Full legal name of the deceased",
        defaultEnabled: true,
      },
      {
        key: "dateOfDeath",
        label: "Date of Death",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "probateCaseNumber",
        label: "Probate Case Number",
        type: "text",
        placeholder: "e.g., PR-2025-0042",
        defaultEnabled: true,
      },
      {
        key: "yourRole",
        label: "Your Role",
        type: "select",
        options: ["Executor", "Heir", "Beneficiary", "Creditor", "Other"],
        defaultEnabled: true,
      },
    ],
  },
  "landlord-tenant": {
    label: "Landlord–Tenant",
    description: "Disputes between landlords and tenants beyond eviction",
    targetWordCount: 500,
    tip: "For security deposit disputes, habitability issues, or lease violations.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Demand for Security Deposit Return — 789 Elm St, Unit 2",
      descriptionPlaceholder:
        "Include the property address, lease dates, the specific issue (security deposit, repairs, harassment, lease terms), and any relevant communications...",
      desiredOutcomePlaceholder:
        "e.g., Return of full $1,800 security deposit within 21 days as required by state law.",
    },
    situationFields: [
      {
        key: "propertyAddress",
        label: "Property Address",
        type: "text",
        placeholder: "e.g., 789 Elm St, Unit 2",
        defaultEnabled: true,
      },
      {
        key: "leaseStartDate",
        label: "Lease Start Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "leaseEndDate",
        label: "Lease End Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "issueType",
        label: "Type of Issue",
        type: "select",
        options: [
          "Security Deposit",
          "Habitability",
          "Repairs",
          "Lease Violation",
          "Harassment",
          "Other",
        ],
        defaultEnabled: true,
      },
    ],
  },
  "insurance-dispute": {
    label: "Insurance Dispute",
    description: "Dispute a denied or underpaid insurance claim",
    targetWordCount: 550,
    tip: "Challenge unfair claim denials or bad faith insurance practices.",
    intakeHints: {
      subjectPlaceholder: "e.g., Appeal of Denied Claim — Policy #ABC12345",
      descriptionPlaceholder:
        "Include your policy number, the claim details, the denial reason given by the insurer, and why you believe the denial is incorrect...",
      desiredOutcomePlaceholder:
        "e.g., Approval and payment of claim totaling $X within 30 days.",
      amountOwedLabel: "Claim Amount (USD)",
    },
    situationFields: [
      {
        key: "policyNumber",
        label: "Policy Number",
        type: "text",
        placeholder: "e.g., ABC12345",
        defaultEnabled: true,
      },
      {
        key: "claimNumber",
        label: "Claim Number",
        type: "text",
        placeholder: "e.g., CLM-2025-001",
        defaultEnabled: true,
      },
      {
        key: "denialReason",
        label: "Denial Reason Given",
        type: "textarea",
        placeholder:
          "What reason did the insurer provide for denying the claim?",
        defaultEnabled: true,
      },
      {
        key: "insurerName",
        label: "Insurance Company",
        type: "text",
        placeholder: "e.g., State Farm, Allstate",
        defaultEnabled: true,
      },
    ],
  },
  "personal-injury-demand": {
    label: "Personal Injury Demand",
    description: "Demand letter for compensation after personal injury",
    targetWordCount: 600,
    tip: "Document injuries, medical costs, and lost wages for compensation.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Personal Injury Demand — Car Accident on [Date]",
      descriptionPlaceholder:
        "Describe the incident, your injuries, medical treatment received, medical costs, lost income, and how the recipient is liable...",
      desiredOutcomePlaceholder:
        "e.g., Settlement payment of $X covering medical expenses, lost wages, and pain and suffering within 30 days.",
      amountOwedLabel: "Total Damages Sought (USD)",
    },
    situationFields: [
      {
        key: "injuryDescription",
        label: "Injury Description",
        type: "textarea",
        placeholder: "Describe your injuries in detail...",
        defaultEnabled: true,
      },
      {
        key: "medicalProvider",
        label: "Medical Provider",
        type: "text",
        placeholder: "e.g., City General Hospital, Dr. Smith",
        defaultEnabled: true,
      },
      {
        key: "medicalCosts",
        label: "Medical Costs (USD)",
        type: "number",
        placeholder: "0.00",
        defaultEnabled: true,
      },
      {
        key: "lostWages",
        label: "Lost Wages (USD)",
        type: "number",
        placeholder: "0.00",
        defaultEnabled: true,
      },
    ],
  },
  "intellectual-property": {
    label: "Intellectual Property",
    description: "Protect trademarks, copyrights, patents, or trade secrets",
    targetWordCount: 550,
    tip: "Enforce IP rights and demand infringement stops immediately.",
    intakeHints: {
      subjectPlaceholder: "e.g., Copyright Infringement Notice — [Work Title]",
      descriptionPlaceholder:
        "Identify your IP (trademark name/registration, copyright work, patent number), describe how it is being infringed, and when you discovered the infringement...",
      desiredOutcomePlaceholder:
        "e.g., Immediately remove all infringing content and provide written confirmation within 7 days.",
    },
    situationFields: [
      {
        key: "ipType",
        label: "Type of IP",
        type: "select",
        options: ["Trademark", "Copyright", "Patent", "Trade Secret", "Other"],
        defaultEnabled: true,
      },
      {
        key: "registrationNumber",
        label: "Registration / Patent Number",
        type: "text",
        placeholder: "e.g., US Patent #10,123,456",
        defaultEnabled: true,
      },
      {
        key: "workTitle",
        label: "Title of Work / Mark",
        type: "text",
        placeholder: "e.g., 'My Novel', 'BrandName™'",
        defaultEnabled: true,
      },
      {
        key: "infringementUrl",
        label: "URL of Infringement (if online)",
        type: "text",
        placeholder: "e.g., https://example.com/infringing-page",
        defaultEnabled: true,
      },
    ],
  },
  "family-law": {
    label: "Family Law",
    description: "Legal matters involving divorce, custody, or support",
    targetWordCount: 550,
    tip: "Address custody, child support, alimony, or asset division disputes.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Demand for Child Support — Case No. 2025-DR-0042",
      descriptionPlaceholder:
        "Describe the family law matter, relevant court orders or agreements, the issue at hand, and any non-compliance by the other party...",
      desiredOutcomePlaceholder:
        "e.g., Compliance with existing support order or payment of arrears of $X within 14 days.",
    },
    situationFields: [
      {
        key: "caseNumber",
        label: "Case Number",
        type: "text",
        placeholder: "e.g., 2025-DR-0042",
        defaultEnabled: true,
      },
      {
        key: "matterType",
        label: "Type of Matter",
        type: "select",
        options: [
          "Child Support",
          "Child Custody",
          "Alimony/Spousal Support",
          "Asset Division",
          "Divorce",
          "Other",
        ],
        defaultEnabled: true,
      },
      {
        key: "existingOrderDate",
        label: "Existing Court Order Date",
        type: "date",
        placeholder: "",
        defaultEnabled: true,
      },
      {
        key: "childrenInvolved",
        label: "Number of Children Involved",
        type: "number",
        placeholder: "0",
        defaultEnabled: true,
      },
    ],
  },
  "neighbor-hoa": {
    label: "Neighbor / HOA Dispute",
    description: "Resolve conflicts with neighbors or homeowners associations",
    targetWordCount: 500,
    tip: "Address noise, property damage, HOA rule violations, or boundary disputes.",
    intakeHints: {
      subjectPlaceholder:
        "e.g., Formal Complaint — Persistent Noise Violation at [Address]",
      descriptionPlaceholder:
        "Describe the dispute, specific incidents with dates, prior verbal or written attempts to resolve, and how it has affected you...",
      desiredOutcomePlaceholder:
        "e.g., Immediate cessation of the nuisance activity within 10 days or I will file a complaint with local authorities.",
    },
    situationFields: [
      {
        key: "disputeType",
        label: "Type of Dispute",
        type: "select",
        options: [
          "Noise",
          "Property Damage",
          "Boundary/Fence",
          "HOA Violation",
          "Tree/Landscaping",
          "Parking",
          "Other",
        ],
        defaultEnabled: true,
      },
      {
        key: "neighborAddress",
        label: "Neighbor / HOA Address",
        type: "text",
        placeholder: "e.g., 124 Main St (next door)",
        defaultEnabled: true,
      },
      {
        key: "hoaName",
        label: "HOA Name (if applicable)",
        type: "text",
        placeholder: "e.g., Sunset Ridge HOA",
        defaultEnabled: true,
      },
    ],
  },
  "general-legal": {
    label: "General Legal Letter",
    description:
      "Other legal correspondence not covered by specific categories",
    targetWordCount: 450,
    tip: "Any other legal correspondence that doesn't fit the above.",
    intakeHints: {
      subjectPlaceholder: "e.g., Legal Notice — [Brief description of issue]",
      descriptionPlaceholder:
        "Describe your legal matter in detail, including relevant dates, parties involved, and the basis for your claim or concern...",
      desiredOutcomePlaceholder:
        "e.g., Resolution of the matter within 30 days.",
    },
  },
};
