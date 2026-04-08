import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit, getClientIp } from "../rateLimiter";
import { documentAnalysisResultLenientSchema, type DocumentAnalysisResult } from "../../shared/types";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import {
  adminProcedure,
  emailVerifiedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../_core/trpc";
import {
  claimLetterForReview,
  createAttachment,
  createLetterRequest,
  createLetterVersion,
  createNotification,
  notifyAdmins,
  getAllLetterRequests,
  getAllUsers,
  getAllUsersWithSubscription,
  markAsPaidDb,
  getAttachmentsByLetterId,
  getEmployeesAndAdmins,
  getFailedJobs,
  getLetterRequestById,
  getLetterRequestSafeForSubscriber,
  getLetterRequestsByUserId,
  getLetterVersionById,
  getLetterVersionsByRequestId,
  getNotificationsByUserId,
  getResearchRunsByLetterId,
  getReviewActions,
  getCostAnalytics,
  getSystemStats,
  getWorkflowJobsByLetterId,
  logReviewAction,
  markAllNotificationsRead,
  markNotificationRead,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateUserRole,
  updateUserProfile,
  getUserById,
  getUserByEmail,
  deleteUserVerificationTokens,
  createEmailVerificationToken,
  purgeFailedJobs,
  updateLetterPdfUrl,
  archiveLetterRequest,
  createDiscountCodeForEmployee,
  getDiscountCodeByEmployeeId,
  rotateDiscountCode,
  getDiscountCodeByCode,
  getAllDiscountCodes,
  updateDiscountCode,
  getCommissionsByEmployeeId,
  getEmployeeEarningsSummary,
  getAllCommissions,
  getAdminReferralDetails,
  markCommissionsPaid,
  createPayoutRequest,
  getPayoutRequestsByEmployeeId,
  getAllPayoutRequests,
  processPayoutRequest,
  getPayoutRequestById,
  getAllEmployeeEarnings,
  decrementLettersUsed,
  claimFreeTrialSlot,
  refundFreeTrialSlot,
  getAllLessons,
  createPipelineLesson,
  updatePipelineLesson,
  getQualityScoreStats,
  getQualityScoreTrend,
  getQualityScoresByLetterType,
  getLessonImpactSummary,
  assignRoleId,
  getPublishedBlogPosts,
  getBlogPostBySlug,
  getAllBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  getBlogPostSlugById,
  getPipelineAnalytics,
} from "../db";
import { invalidateBlogPostCache } from "../blogCacheInvalidation";
import { getCachedBlogPosts, getCachedBlogPost } from "../blogCache";
import {
  sendLetterApprovedEmail,
  sendLetterRejectedEmail,
  sendNeedsChangesEmail,
  sendNewReviewNeededEmail,
  sendLetterSubmissionEmail,
  sendLetterUnlockedEmail,
  sendStatusUpdateEmail,
  sendVerificationEmail,
  sendReviewAssignedEmail,
  sendPayoutCompletedEmail,
  sendPayoutRejectedEmail,
  sendLetterToRecipient,
  sendAttorneyInvitationEmail,
  sendAttorneyWelcomeEmail,
  sendClientRevisionRequestEmail,
} from "../email";
import { captureServerException } from "../sentry";
import { enqueuePipelineJob, enqueueRetryFromStageJob, getPipelineQueue } from "../queue";
import { extractLessonFromApproval, extractLessonFromRejection, extractLessonFromChangesRequest, extractLessonFromEdit, extractLessonFromSubscriberFeedback, computeAndStoreQualityScore, consolidateLessonsForScope } from "../learning";
import type { InsertPipelineLesson } from "../../drizzle/schema";
import { BLOG_CATEGORIES } from "../../drizzle/schema";
import { generateAndUploadApprovedPdf } from "../pdfGenerator";
import { storagePut } from "../storage";
import { invalidateUserCache, getOriginUrl } from "../supabaseAuth";
import {
  createCheckoutSession,
  createBillingPortalSession,
  createLetterUnlockCheckout,
  createTrialReviewCheckout,
  getUserSubscription,
  checkLetterSubmissionAllowed,
  incrementLettersUsed,
  hasActiveRecurringSubscription,
} from "../stripe";
import { logger } from "../logger";

/**
 * Sync a discount code to/from the Cloudflare Worker KV allowlist.
 * Called fire-and-forget (errors are swallowed) — the Worker degrades gracefully
 * to not redirecting unknown codes; any temporary sync failure is non-critical.
 */
async function syncCodeToWorkerAllowlist(code: string, action: "add" | "remove"): Promise<void> {
  const workerUrl = process.env.AFFILIATE_WORKER_URL ?? "";
  const secret = process.env.AFFILIATE_WORKER_SECRET ?? "";
  if (!workerUrl || !secret) return;

  await fetch(`${workerUrl.replace(/\/$/, "")}/admin/codes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ code, action }),
    signal: AbortSignal.timeout(5000),
  });
}

const intakeJsonSchema = z.object({
  schemaVersion: z.string().default("1.0"),
  letterType: z.string(),
  sender: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  recipient: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  jurisdiction: z.object({
    country: z.string(),
    state: z.string(),
    city: z.string().optional(),
  }),
  matter: z.object({
    category: z.string(),
    subject: z.string(),
    description: z.string(),
    incidentDate: z.string().optional(),
  }),
  financials: z
    .object({
      amountOwed: z.number().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  desiredOutcome: z.string(),
  deadlineDate: z.string().optional(),
  additionalContext: z.string().optional(),
  tonePreference: z
    .enum(["firm", "moderate", "aggressive"])
    .optional(),
  language: z.string().optional(),
  priorCommunication: z.string().optional(),
  deliveryMethod: z.string().optional(),
  communications: z
    .object({
      summary: z.string(),
      lastContactDate: z.string().optional(),
      method: z
        .enum(["email", "phone", "letter", "in-person", "other"])
        .optional(),
    })
    .optional(),
  toneAndDelivery: z
    .object({
      tone: z.enum(["firm", "moderate", "aggressive"]),
      deliveryMethod: z
        .enum(["email", "certified-mail", "hand-delivery"])
        .optional(),
    })
    .optional(),
});


// ─── Role Guards ──────────────────────────────────────────────────────────────

const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "employee" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Employee or Admin access required",
    });
  }
  return next({ ctx });
});

const attorneyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "attorney" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Attorney or Admin access required",
    });
  }
  return next({ ctx });
});

const subscriberProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "subscriber") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Subscriber access required",
    });
  }
  return next({ ctx });
});

function getAppUrl(req: {
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (host && !String(host).includes("localhost")) {
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    return `${proto}://${host}`;
  }
  return "https://www.talk-to-my-lawyer.com";
}

// ═══════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════


export const documentsRouter = router({
    analyze: emailVerifiedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(500),
          fileType: z.enum(["pdf", "docx", "txt"]),
          // Max base64 string length for a ~7.5MB file (accounts for ~33% base64 overhead)
          fileBase64: z.string().min(1).max(10_485_760), // 10MB base64 string = ~7.5MB actual file
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkTrpcRateLimit("general", `user:${ctx.user.id}`);

        // Enforce binary size limit: 7.5MB decoded
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        if (fileBuffer.byteLength > 7_864_320) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "File exceeds the 7.5 MB size limit. Please upload a smaller document.",
          });
        }

        // Extract text from document
        let documentText = "";
        try {
          if (input.fileType === "pdf") {
            const { PDFParse } = await import("pdf-parse");
            const parser = new PDFParse({ data: fileBuffer });
            const pdfData = await parser.getText();
            await parser.destroy();
            documentText = pdfData.text;
          } else if (input.fileType === "docx") {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            documentText = result.value;
          } else {
            documentText = fileBuffer.toString("utf-8");
          }
        } catch (err) {
          logger.error({ err: err }, "[DocumentAnalyzer] Text extraction failed:");
          captureServerException(err, { tags: { component: "document_analyzer", error_type: "text_extraction_failed" } });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not extract text from the document. Please ensure it is a valid file.",
          });
        }

        if (!documentText || documentText.trim().length < 50) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The document appears to be empty or contains no readable text.",
          });
        }

        // Truncate to avoid token limits (~100k chars)
        const truncatedText = documentText.length > 100_000
          ? documentText.slice(0, 100_000) + "\n\n[Document truncated due to length]"
          : documentText;

        // Build OpenAI prompt
        const openai = (await import("@ai-sdk/openai")).createOpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        const { generateText: aiGenerateText } = await import("ai");

        const prompt = `You are a legal document analyst specializing in identifying what legal action a recipient of a document should take, AND in reading between the lines to detect emotional tone, hidden intent, veiled threats, and manipulative language. Analyze the following document and return a JSON object with this EXACT structure — no additional fields, no markdown, just valid JSON:

{
  "summary": "A clear 2-4 paragraph summary of what this document is about, its purpose, and the key parties involved.",
  "actionItems": [
    "Action item or obligation 1",
    "Action item or obligation 2"
  ],
  "flaggedRisks": [
    {
      "clause": "The specific clause or section title",
      "description": "Why this is risky or important",
      "severity": "high"
    }
  ],
  "recommendedLetterType": "demand-letter",
  "urgencyLevel": "high",
  "detectedDeadline": "30 days from receipt",
  "detectedJurisdiction": "California",
  "detectedParties": {
    "senderName": "Acme Corp",
    "recipientName": "John Smith"
  },
  "recommendedResponseSummary": "A one-sentence description of the most important thing the recipient should do in response to this document.",
  "emotionalIntelligence": {
    "overallTone": "Threatening but Polite",
    "toneConfidence": "high",
    "emotionBreakdown": [
      { "emotion": "urgency", "intensity": 85 },
      { "emotion": "anger", "intensity": 30 },
      { "emotion": "condescension", "intensity": 60 }
    ],
    "hiddenImplications": [
      "Implies legal action if you don't comply within 10 days, though phrased as a suggestion"
    ],
    "redFlags": [
      {
        "passage": "We kindly request your prompt attention to this matter",
        "explanation": "Despite the polite wording, this is a veiled threat implying consequences for non-compliance"
      }
    ],
    "manipulationTactics": [
      "False urgency — creates artificial time pressure to prevent careful consideration"
    ],
    "trueIntentSummary": "Plain-English paragraph explaining what this document is really saying beneath all the formality."
  },
  "extractedEvidence": [
    {
      "type": "date",
      "value": "March 15, 2024",
      "context": "Date the original agreement was signed",
      "confidence": "high"
    },
    {
      "type": "amount",
      "value": "$5,000",
      "context": "Claimed damages for breach of contract",
      "confidence": "high"
    },
    {
      "type": "party",
      "value": "Acme Corp",
      "context": "The sending party making the legal claim",
      "confidence": "high"
    }
  ]
}

Field rules:
- summary: Comprehensive yet readable overview (2-4 paragraphs)
- actionItems: Array of 3-10 concrete obligations, deadlines, or required actions the document recipient must take
- flaggedRisks: Array of 2-8 important clauses, risks, or provisions that deserve attention. severity must be "low", "medium", or "high"
- recommendedLetterType: The type of response letter the recipient should consider sending. Must be exactly one of: "demand-letter", "cease-and-desist", "contract-breach", "eviction-notice", "employment-dispute", "consumer-complaint", "general-legal". If no legal response letter is warranted, set to null.
- urgencyLevel: How urgently the recipient needs to respond — "low", "medium", or "high" based on deadlines, legal consequences, and tone
- detectedDeadline: Any specific deadline or response window mentioned in the document (e.g., "30 days from the date of this letter"). Set to null if none found.
- detectedJurisdiction: The US state or jurisdiction mentioned or implied in the document (e.g., "California", "New York"). Set to null if unclear.
- detectedParties: The party who sent this document (senderName) and the party it was sent to (recipientName). Use null for either if not clearly identified.
- recommendedResponseSummary: One concise sentence (under 150 chars) describing the best action the document recipient should take.

Emotional Intelligence field rules:
- overallTone: A short labeled tone description (e.g., "Threatening but Polite", "Passive-Aggressive", "Genuinely Cooperative", "Coldly Professional", "Manipulatively Friendly"). Be specific and nuanced.
- toneConfidence: How confident you are in the tone assessment — "low", "medium", or "high"
- emotionBreakdown: Array of 4-8 detected emotions with intensity 0-100. Include emotions like: anger, fear, urgency, friendliness, condescension, sarcasm, guilt-tripping, confidence, deception, desperation. Only include emotions that are actually present (intensity > 0).
- hiddenImplications: Array of 2-6 things the document implies without saying directly. Look for unstated consequences, implied threats wrapped in polite language, assumptions the document makes without stating, and obligations it tries to create through implication rather than explicit statement.
- redFlags: Array of 1-5 specific passages where language wraps threats, pressure, or unfavorable terms in friendly/neutral/humorous tone. Quote the actual passage and explain what's really being said. Look for: polite language disguising demands, humor masking serious consequences, casual framing of significant obligations, and professional language softening harsh realities.
- manipulationTactics: Array of 1-5 identified persuasion or manipulation techniques. Look for: false urgency, appeal to authority, guilt-tripping, minimization of the recipient's rights, anchoring bias, social proof manipulation, fear of loss framing, and false dichotomies.
- trueIntentSummary: A plain-English paragraph (2-4 sentences) explaining what this document is REALLY saying when you strip away all the formality, politeness, and legal language. Be direct and honest about the sender's true motivations and goals.

Evidence extraction rules:
- extractedEvidence: Array of 3-10 structured evidence items found in the document. Each item has:
  - type: One of "date", "amount", "party", "clause", "deadline", "obligation"
  - value: The specific value (e.g., "March 15, 2024", "$5,000", "ABC Corp", "Section 12.3")
  - context: A brief sentence explaining the significance of this evidence
  - confidence: "high", "medium", or "low" based on how clearly this appears in the document
- Look for: specific dates and timelines, monetary amounts (damages, fees, penalties), named parties and their roles, important contract clauses or legal provisions, deadlines for action, and stated obligations or requirements.

- Return ONLY valid JSON, no markdown fences, no explanation outside the JSON object.

Document to analyze:
---
${truncatedText}
---`;

        let analysisResult: DocumentAnalysisResult;

        try {
          const { text } = await aiGenerateText({
            model: openai("gpt-4o"),
            prompt,
            maxOutputTokens: 5000,
          });

          // Parse and strip JSON from possible markdown code fences
          let jsonStr = text.trim();
          const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();
          const objMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (objMatch) jsonStr = objMatch[0];

          const parsed: unknown = JSON.parse(jsonStr);

          // Validate via lenient schema (applies safe defaults for partial/malformed AI output)
          analysisResult = documentAnalysisResultLenientSchema.parse(parsed);
        } catch (err) {
          logger.error({ err: err }, "[DocumentAnalyzer] AI analysis failed:");
          captureServerException(err, { tags: { component: "document_analyzer", error_type: "ai_analysis_failed" } });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AI analysis failed. Please try again.",
          });
        }

        // Persist result to DB (best-effort, non-blocking)
        (async () => {
          try {
            const db = await (await import("../db")).getDb();
            if (db) {
              const { documentAnalyses } = await import("../../drizzle/schema");
              await db.insert(documentAnalyses).values({
                documentName: input.fileName,
                fileType: input.fileType,
                analysisJson: analysisResult,
                userId: ctx.user.id,
              });
            }
          } catch (dbErr) {
            logger.error({ err: dbErr }, "[DocumentAnalyzer] DB insert failed (non-fatal):");
            captureServerException(dbErr, { tags: { component: "document_analyzer", error_type: "db_insert_failed" } });
          }
        })();

        return analysisResult;
      }),

    getMyAnalyses: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.number().int().optional(), // id of the last row seen (for keyset pagination)
        }).optional()
      )
      .query(async ({ ctx, input }) => {
        const limit = input?.limit ?? 20;
        const cursor = input?.cursor;
        try {
          const db = await (await import("../db")).getDb();
          if (!db) return { rows: [], nextCursor: undefined };
          const { documentAnalyses } = await import("../../drizzle/schema");
          const { eq, desc, lt, and } = await import("drizzle-orm");

          const conditions = cursor
            ? and(eq(documentAnalyses.userId, ctx.user.id), lt(documentAnalyses.id, cursor))
            : eq(documentAnalyses.userId, ctx.user.id);

          const fetched = await db
            .select()
            .from(documentAnalyses)
            .where(conditions)
            .orderBy(desc(documentAnalyses.createdAt), desc(documentAnalyses.id))
            .limit(limit + 1);

          let nextCursor: number | undefined;
          if (fetched.length > limit) {
            nextCursor = fetched[limit].id;
            fetched.pop();
          }

          return { rows: fetched, nextCursor };
        } catch (err) {
          logger.error({ err: err }, "[DocumentAnalyzer] getMyAnalyses failed:");
          captureServerException(err, { tags: { component: "document_analyzer", error_type: "get_analyses_failed" } });
          return { rows: [], nextCursor: undefined };
        }
      }),
});
