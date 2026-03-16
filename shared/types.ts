/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";

// ─── Status Machine (single source of truth) ───
// This is the CANONICAL transition map. server/db.ts imports from here.
// Admin forceStatusTransition bypasses this map (force=true).
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted: ["researching"],
  researching: ["drafting", "submitted"],       // "submitted" = pipeline failure reset
  drafting: ["generated_locked", "submitted"],   // "submitted" = pipeline failure reset
  generated_locked: ["pending_review"],           // free unlock or paid unlock
  pending_review: ["under_review"],
  under_review: ["approved", "rejected", "needs_changes"],
  needs_changes: ["submitted", "researching", "drafting"], // "submitted" = subscriber resubmit after changes
  approved: [],                                  // terminal
  rejected: ["submitted"],                       // subscriber can retry from scratch
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
  rejected: { label: "Rejected", color: "text-red-700", bgColor: "bg-red-200" },
};

// ─── Letter Type display config ───
// targetWordCount: target word count for the AI drafting stage.
// These are calibrated to produce professional, appropriately-scoped letters
// for each category. The pipeline prompt instructs Claude to aim for this count.
export const LETTER_TYPE_CONFIG: Record<
  string,
  { label: string; description: string; targetWordCount: number }
> = {
  "demand-letter": {
    label: "Demand Letter",
    description: "Formal demand for payment, action, or resolution",
    targetWordCount: 450,
  },
  "cease-and-desist": {
    label: "Cease and Desist",
    description: "Order to stop specific activities or face legal action",
    targetWordCount: 500,
  },
  "contract-breach": {
    label: "Contract Breach",
    description: "Notice of breach of contract terms",
    targetWordCount: 550,
  },
  "eviction-notice": {
    label: "Eviction Notice",
    description: "Formal notice to vacate a property",
    targetWordCount: 350,
  },
  "employment-dispute": {
    label: "Employment Dispute",
    description: "Workplace-related legal matter",
    targetWordCount: 600,
  },
  "consumer-complaint": {
    label: "Consumer Complaint",
    description: "Complaint against a business or service provider",
    targetWordCount: 500,
  },
  "general-legal": {
    label: "General Legal Letter",
    description: "Other legal correspondence",
    targetWordCount: 450,
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
}

// ─── Research Packet Shape ───
export interface ResearchPacket {
  researchSummary: string;
  jurisdictionProfile: {
    country: string;
    stateProvince: string;
    city?: string;
    authorityHierarchy: string[];
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
  factualDataNeeded: string[];
  openQuestions: string[];
  riskFlags: string[];
  draftingConstraints: string[];
}

// ─── Draft Output Shape ───
export interface DraftOutput {
  draftLetter: string;
  attorneyReviewSummary: string;
  openQuestions: string[];
  riskFlags: string[];
  reviewNotes?: string;
}
