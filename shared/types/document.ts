import { z } from "zod";

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

export const insertDocumentAnalysisSchema = z.object({
  documentName: z.string().min(1).max(500),
  fileType: z.enum(["pdf", "docx", "txt"]),
  analysisJson: documentAnalysisResultSchema,
  userId: z.number().int().nullable().optional(),
});

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
