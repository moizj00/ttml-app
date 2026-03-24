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
  generated_locked: ["pending_review"],
  pending_review: ["under_review"],
  under_review: ["approved", "rejected", "needs_changes", "pending_review"],
  needs_changes: ["submitted"],
  approved: ["client_approval_pending"],
  client_approval_pending: ["client_approved"],
  client_approved: ["sent"],
  sent: [],
  rejected: ["submitted"],
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
}

// ─── Draft Output Shape ───
export interface DraftOutput {
  draftLetter: string;
  attorneyReviewSummary: string;
  openQuestions: string[];
  riskFlags: string[];
  reviewNotes?: string;
  groundingWarnings?: string[];
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
}
