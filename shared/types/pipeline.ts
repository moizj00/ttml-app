import { z } from "zod";

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
  tonePreference?: "firm" | "moderate" | "aggressive";
  language?: string;
  priorCommunication?: string;
  deliveryMethod?: string;
  communications?: {
    summary: string;
    lastContactDate?: string;
    method?: "email" | "phone" | "letter" | "in-person" | "other";
  };
  toneAndDelivery?: {
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

export interface ValidationResult {
  stage: string;
  check: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  timestamp: string;
}

export interface GroundingReport {
  totalCitationsInDraft: number;
  groundedCitations: string[];
  ungroundedCitations: string[];
  passed: boolean;
}

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

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CounterArgument {
  argument: string;
  howAddressed: string;
  strength: "strong" | "moderate" | "weak";
}

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
  ragExampleCount?: number;
  ragSimilarityScores?: number[];
  ragAbGroup?: "test" | "control";
  lessonCount?: number;
  _intermediateDraftContent?: string;
  counterArguments?: CounterArgument[];
  citationRevalidationModelKey?: string;
  isFreePreview?: boolean;
}

export interface DraftOutput {
  draftLetter: string;
  attorneyReviewSummary: string;
  openQuestions: string[];
  riskFlags: string[];
  reviewNotes?: string;
  groundingWarnings?: string[];
  counterArguments?: CounterArgument[];
}

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
  RESEARCH_PROVIDER_FAILED: "RESEARCH_PROVIDER_FAILED",
  DRAFTING_PROVIDER_FAILED: "DRAFTING_PROVIDER_FAILED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type PipelineErrorCode =
  (typeof PIPELINE_ERROR_CODES)[keyof typeof PIPELINE_ERROR_CODES];

export type PipelineErrorCategory = "transient" | "permanent";

export const PIPELINE_ERROR_CATEGORY: Record<
  PipelineErrorCode,
  PipelineErrorCategory
> = {
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
  RESEARCH_PROVIDER_FAILED: "transient",
  DRAFTING_PROVIDER_FAILED: "transient",
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
  RESEARCH_PROVIDER_FAILED: "Research Provider Failed",
  DRAFTING_PROVIDER_FAILED: "Drafting Provider Failed",
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
  details?: string
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

  constructor(
    code: PipelineErrorCode,
    message: string,
    stage: string,
    details?: string
  ) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.stage = stage;
    this.details = details;
    this.category = PIPELINE_ERROR_CATEGORY[code];
  }

  toStructured(): StructuredPipelineError {
    return createPipelineError(
      this.code,
      this.message,
      this.stage,
      this.details
    );
  }

  toJSON(): string {
    return JSON.stringify(this.toStructured());
  }
}

export function parsePipelineError(
  errorMessage: string | null | undefined
): StructuredPipelineError | null {
  if (!errorMessage) return null;
  try {
    const parsed = JSON.parse(errorMessage);
    if (
      parsed &&
      typeof parsed === "object" &&
      "code" in parsed &&
      "message" in parsed &&
      "stage" in parsed
    ) {
      return {
        code: parsed.code as PipelineErrorCode,
        message: parsed.message as string,
        stage: parsed.stage as string,
        details: parsed.details as string | undefined,
        category:
          PIPELINE_ERROR_CATEGORY[parsed.code as PipelineErrorCode] ??
          "transient",
      };
    }
  } catch {
    // Not JSON — legacy string error
  }
  return null;
}

export function getErrorDisplayMessage(
  errorMessage: string | null | undefined
): string {
  if (!errorMessage) return "";
  const structured = parsePipelineError(errorMessage);
  if (structured) return structured.message;
  return errorMessage;
}

export function isTransientError(
  errorMessage: string | null | undefined
): boolean {
  if (!errorMessage) return true;
  const structured = parsePipelineError(errorMessage);
  if (structured) return structured.category === "transient";
  const lower = errorMessage.toLowerCase();
  if (lower.includes("content policy") || lower.includes("content filter"))
    return false;
  if (
    lower.includes("intake validation failed") ||
    lower.includes("intake pre-flight")
  )
    return false;
  if (
    lower.includes("api key") ||
    lower.includes("api_key") ||
    lower.includes("apikey")
  )
    return false;
  return true;
}
