import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { checkTrpcRateLimit, getClientIp } from "../rateLimiter";
import { TRPCError } from "@trpc/server";
import { captureServerException } from "../sentry";
import { LETTER_TYPE_CONFIG } from "../../shared/types";

const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(3000),
});

const extractedFieldsSchema = z.object({
  letterType: z.string().max(100).optional(),
  subject: z.string().max(500).optional(),
  jurisdictionState: z.string().max(5).optional(),
  jurisdictionCity: z.string().max(200).optional(),
  senderName: z.string().max(300).optional(),
  senderAddress: z.string().max(500).optional(),
  senderEmail: z.string().max(320).optional(),
  senderPhone: z.string().max(30).optional(),
  recipientName: z.string().max(300).optional(),
  recipientAddress: z.string().max(500).optional(),
  recipientEmail: z.string().max(320).optional(),
  incidentDate: z.string().max(50).optional(),
  description: z.string().max(5000).optional(),
  additionalContext: z.string().max(2000).optional(),
  amountOwed: z.string().max(50).optional(),
  desiredOutcome: z.string().max(2000).optional(),
  deadlineDate: z.string().max(50).optional(),
  tonePreference: z.enum(["firm", "moderate", "aggressive"]).optional(),
  priorCommunication: z.string().max(2000).optional(),
  deliveryMethod: z.string().max(50).optional(),
  communicationsSummary: z.string().max(2000).optional(),
}).passthrough();

const converseResponseSchema = z.object({
  extractedFields: extractedFieldsSchema.default({}),
  followUpQuestions: z.array(z.string().max(500)).max(5).default([]),
  summary: z.string().max(2000).default(""),
  completeness: z.number().min(0).max(100).default(0),
  isComplete: z.boolean().default(false),
});

const scoreFactorSchema = z.object({
  name: z.string().max(200).default("Unknown"),
  score: z.number().min(0).max(10).default(0),
  maxScore: z.number().min(0).max(10).default(2),
  explanation: z.string().max(1000).default(""),
  suggestion: z.string().max(500).nullable().default(null),
});

const improvementTipSchema = z.object({
  action: z.string().max(500).default(""),
  impact: z.string().max(500).default(""),
});

const scoreResponseSchema = z.object({
  score: z.number().min(1).max(10).default(5),
  maxScore: z.literal(10).default(10),
  factors: z.array(scoreFactorSchema).max(10).default([]),
  summary: z.string().max(2000).default(""),
  strengths: z.array(z.string().max(500)).max(10).default([]),
  weaknesses: z.array(z.string().max(500)).max(10).default([]),
  improvementTips: z.array(improvementTipSchema).max(10).default([]),
});

const letterTypeList = Object.entries(LETTER_TYPE_CONFIG)
  .map(([key, val]) => `- "${key}": ${val.label} — ${val.description}`)
  .join("\n");

function buildConversationSystemPrompt(): string {
  return `You are a legal intake assistant for "Talk to My Lawyer," a platform that generates attorney-reviewed legal letters. Your job is to help users describe their legal situation conversationally and extract structured data needed to draft a legal letter.

AVAILABLE LETTER TYPES:
${letterTypeList}

YOUR RESPONSIBILITIES:
1. Understand the user's legal situation from their natural language description
2. Extract structured data (names, dates, amounts, addresses, jurisdiction, letter type) from their messages
3. Ask targeted follow-up questions to fill in missing required information
4. Adapt your questions based on the letter type and jurisdiction (e.g., California security deposit → "Did your landlord provide an itemized statement within 21 days?")
5. Be empathetic but efficient — don't ask unnecessary questions

REQUIRED FIELDS (must be extracted before intake is complete):
- letterType: Which type of legal letter fits their situation
- subject: Brief subject line for the letter
- jurisdictionState: US state where the issue occurred (2-letter code)
- senderName: The user's full name
- senderAddress: The user's mailing address
- recipientName: Who the letter is addressed to
- recipientAddress: Recipient's mailing address
- description: Detailed description of the situation (at least 20 characters)
- desiredOutcome: What the user wants to happen (at least 10 characters)

OPTIONAL BUT HELPFUL FIELDS:
- incidentDate, amountOwed, deadlineDate, senderEmail, senderPhone, recipientEmail
- additionalContext, priorCommunication, communicationsSummary
- tonePreference (firm/moderate/aggressive), deliveryMethod

RESPONSE FORMAT:
Return ONLY valid JSON with this structure:
{
  "extractedFields": { ... fields extracted so far from ALL messages ... },
  "followUpQuestions": ["Question 1?", "Question 2?"],
  "summary": "Brief summary of what you understand so far",
  "completeness": 0-100,
  "isComplete": false
}

RULES:
- Return 1-3 follow-up questions at a time, prioritizing required fields
- Set isComplete=true ONLY when all required fields have values
- completeness should reflect the percentage of required fields filled
- For jurisdiction, try to detect the state from context clues (city names, state references)
- For letterType, recommend the best match based on the situation
- Always extract ALL possible fields from EVERY message, not just new ones
- Use two-letter state codes (e.g., "CA" not "California")
- Be conversational in your questions, not robotic`;
}

function buildCaseStrengthSystemPrompt(): string {
  return `You are a legal case strength evaluator for "Talk to My Lawyer." Analyze the intake data and score the case strength on a 1-10 scale.

SCORING CRITERIA (each contributes to the overall score):

1. EVIDENCE COMPLETENESS (0-2 points)
   - Does the user have documentation? (contracts, receipts, emails, photos)
   - Are dates, amounts, and parties clearly identified?

2. LEGAL BASIS CLARITY (0-2 points)
   - Is there a clear legal theory? (breach of contract, statutory violation, etc.)
   - Does the situation match a recognized legal claim?

3. JURISDICTION REQUIREMENTS (0-2 points)
   - Are jurisdiction-specific prerequisites met?
   - Examples: California security deposit 21-day rule, demand letter prerequisites for certain claims
   - Is the statute of limitations likely still open?

4. AMOUNT & DAMAGES DOCUMENTATION (0-2 points)
   - Are financial damages clearly quantified?
   - Is there documentation supporting the amounts claimed?

5. COMMUNICATION TRAIL (0-2 points)
   - Has the user attempted to resolve the issue before seeking legal action?
   - Is there a paper trail of prior communications?

RESPONSE FORMAT:
Return ONLY valid JSON:
{
  "score": 7,
  "maxScore": 10,
  "factors": [
    {
      "name": "Evidence Completeness",
      "score": 2,
      "maxScore": 2,
      "explanation": "You have a written contract and payment records.",
      "suggestion": null
    },
    {
      "name": "Legal Basis",
      "score": 1,
      "maxScore": 2,
      "explanation": "The breach of contract claim is somewhat clear but needs more specifics.",
      "suggestion": "Specify which contract terms were violated and provide the exact dates."
    }
  ],
  "summary": "Your case has a solid foundation with clear documentation. Strengthening the specific contract terms violated would improve your position.",
  "strengths": ["Written contract exists", "Clear financial damages"],
  "weaknesses": ["No prior demand letter sent", "Missing exact breach dates"],
  "improvementTips": [
    { "action": "Upload your contract", "impact": "Could improve score from 7 to 9" },
    { "action": "Add dates of communication with the other party", "impact": "Strengthens communication trail" }
  ]
}`;
}

function parseJsonFromLLM(text: string): unknown {
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0];
  return JSON.parse(jsonStr);
}

export const intakeRouter = router({
  converse: publicProcedure
    .input(
      z.object({
        message: z.string().min(1).max(5000),
        conversationHistory: z.array(conversationMessageSchema).max(30).default([]),
        prefillContext: z
          .object({
            letterType: z.string().max(100).optional(),
            subject: z.string().max(500).optional(),
            jurisdictionState: z.string().max(5).optional(),
            senderName: z.string().max(300).optional(),
            recipientName: z.string().max(300).optional(),
            description: z.string().max(2000).optional(),
            detectedDeadline: z.string().max(200).optional(),
            urgencyLevel: z.enum(["low", "medium", "high"]).optional(),
            emotionalTone: z.string().max(200).optional(),
            actionItems: z.array(z.string().max(500)).max(5).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        const clientIp = getClientIp(ctx.req);
        await checkTrpcRateLimit("document", `ip:intake:${clientIp}`);
      } else {
        await checkTrpcRateLimit("general", `user:${ctx.user.id}`);
      }

      const openai = (await import("@ai-sdk/openai")).createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const { generateText } = await import("ai");

      const systemPrompt = buildConversationSystemPrompt();

      let contextPrefix = "";
      if (input.prefillContext) {
        const pf = input.prefillContext;
        const parts: string[] = [];
        if (pf.letterType) parts.push(`Recommended letter type: ${pf.letterType}`);
        if (pf.subject) parts.push(`Subject: ${pf.subject}`);
        if (pf.jurisdictionState) parts.push(`Jurisdiction: ${pf.jurisdictionState}`);
        if (pf.senderName) parts.push(`Sender: ${pf.senderName}`);
        if (pf.recipientName) parts.push(`Recipient: ${pf.recipientName}`);
        if (pf.description) parts.push(`Description: ${pf.description}`);
        if (pf.detectedDeadline) parts.push(`Detected Deadline: ${pf.detectedDeadline}`);
        if (pf.urgencyLevel) parts.push(`Urgency Level: ${pf.urgencyLevel}`);
        if (pf.emotionalTone) parts.push(`Emotional Tone of Document: ${pf.emotionalTone}`);
        if (pf.actionItems && pf.actionItems.length > 0) parts.push(`Action Items: ${pf.actionItems.join("; ")}`);
        if (parts.length > 0) {
          contextPrefix = `[PRE-FILLED CONTEXT from document analysis — incorporate these as already-known fields]\n${parts.join("\n")}\n\n`;
        }
      }

      const historyText = input.conversationHistory
        .map((msg) => `${msg.role === "user" ? "USER" : "ASSISTANT"}: ${msg.content}`)
        .join("\n\n");

      const userPrompt = `${contextPrefix}${historyText ? `CONVERSATION SO FAR:\n${historyText}\n\n` : ""}USER'S NEW MESSAGE:\n${input.message}\n\nAnalyze all messages and extract every field you can. Return your JSON response.`;

      try {
        const { text } = await generateText({
          model: openai("gpt-4o"),
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: 2000,
        });

        const parsed = parseJsonFromLLM(text);
        const validated = converseResponseSchema.safeParse(parsed);

        if (!validated.success) {
          console.warn("[IntakeConverse] LLM response failed schema validation:", validated.error.issues);
          captureServerException(new Error("LLM converse response failed validation"), {
            tags: { component: "intake_converse", error_type: "schema_validation" },
            extra: { issues: validated.error.issues },
          });
          return {
            extractedFields: {},
            followUpQuestions: ["Could you tell me more about your legal situation?"],
            summary: "",
            completeness: 0,
            isComplete: false,
          };
        }

        const result = validated.data;
        const ef = result.extractedFields;
        const validLetterType = ef.letterType && ef.letterType in LETTER_TYPE_CONFIG;
        const validState = ef.jurisdictionState && /^[A-Z]{2}$/.test(ef.jurisdictionState);
        const requiredFields = [
          ef.letterType, ef.subject, ef.jurisdictionState,
          ef.senderName, ef.senderAddress, ef.recipientName,
          ef.recipientAddress, ef.description, ef.desiredOutcome,
        ];
        const filledCount = requiredFields.filter(v => v && String(v).trim().length > 0).length;
        const totalRequired = requiredFields.length;
        const serverCompleteness = Math.round((filledCount / totalRequired) * 100);
        const serverIsComplete = filledCount === totalRequired
          && validLetterType === true
          && validState === true
          && (ef.description?.length ?? 0) >= 20
          && (ef.desiredOutcome?.length ?? 0) >= 10;

        result.completeness = serverCompleteness;
        result.isComplete = serverIsComplete;

        return result;
      } catch (err) {
        console.error("[IntakeConverse] AI conversation failed:", err);
        captureServerException(err, {
          tags: { component: "intake_converse", error_type: "ai_failed" },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI conversation failed. Please try again.",
        });
      }
    }),

  scoreCase: publicProcedure
    .input(
      z.object({
        letterType: z.string().max(100),
        jurisdictionState: z.string().max(5),
        senderName: z.string().max(300).optional(),
        recipientName: z.string().max(300).optional(),
        description: z.string().min(10).max(5000),
        desiredOutcome: z.string().min(5).max(2000),
        amountOwed: z.string().max(50).optional(),
        incidentDate: z.string().max(50).optional(),
        additionalContext: z.string().max(2000).optional(),
        priorCommunication: z.string().max(2000).optional(),
        communicationsSummary: z.string().max(2000).optional(),
        hasExhibits: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        const clientIp = getClientIp(ctx.req);
        await checkTrpcRateLimit("document", `ip:score:${clientIp}`);
      } else {
        await checkTrpcRateLimit("general", `user:${ctx.user.id}`);
      }

      const openai = (await import("@ai-sdk/openai")).createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const { generateText } = await import("ai");

      const systemPrompt = buildCaseStrengthSystemPrompt();

      const intakeSummary = [
        `Letter Type: ${input.letterType}`,
        `Jurisdiction: ${input.jurisdictionState}`,
        input.senderName ? `Sender: ${input.senderName}` : null,
        input.recipientName ? `Recipient: ${input.recipientName}` : null,
        `Description: ${input.description}`,
        `Desired Outcome: ${input.desiredOutcome}`,
        input.amountOwed ? `Amount Owed: $${input.amountOwed}` : null,
        input.incidentDate ? `Incident Date: ${input.incidentDate}` : null,
        input.additionalContext ? `Additional Context: ${input.additionalContext}` : null,
        input.priorCommunication ? `Prior Communication: ${input.priorCommunication}` : null,
        input.communicationsSummary ? `Communications Summary: ${input.communicationsSummary}` : null,
        `Has Supporting Documents: ${input.hasExhibits ? "Yes" : "No"}`,
      ]
        .filter(Boolean)
        .join("\n");

      try {
        const { text } = await generateText({
          model: openai("gpt-4o"),
          system: systemPrompt,
          prompt: `Score the strength of this legal case:\n\n${intakeSummary}`,
          maxOutputTokens: 2000,
        });

        const parsed = parseJsonFromLLM(text);
        const validated = scoreResponseSchema.safeParse(parsed);

        if (!validated.success) {
          console.warn("[CaseStrength] LLM response failed schema validation:", validated.error.issues);
          captureServerException(new Error("LLM score response failed validation"), {
            tags: { component: "case_strength", error_type: "schema_validation" },
            extra: { issues: validated.error.issues },
          });
          return {
            score: 5,
            maxScore: 10 as const,
            factors: [],
            summary: "Unable to fully evaluate case strength. Please try again.",
            strengths: [],
            weaknesses: [],
            improvementTips: [],
          };
        }

        return validated.data;
      } catch (err) {
        console.error("[CaseStrength] AI scoring failed:", err);
        captureServerException(err, {
          tags: { component: "case_strength", error_type: "ai_failed" },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Case strength scoring failed. Please try again.",
        });
      }
    }),
});
