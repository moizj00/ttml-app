import type { IntakeJson } from "../../shared/types";
import type { NotificationCategory } from "../db/notifications";
import { createLogger } from "../logger";
import { Anthropic } from "@anthropic-ai/sdk";
import { updateLetterStatus, createLetterVersion, updateLetterVersionPointers, createNotification } from "../db";

const logger = createLogger("simple-pipeline");

/**
 * Ultra-simple letter generation pipeline
 * 
 * Single stage: Take user intake → Claude generates letter → Save to DB
 * No research, no vetting, no orchestration complexity.
 * 
 * Enable via PIPELINE_MODE=simple
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type SimplePipelineResult = {
  success: boolean;
  letter?: string;
  error?: string;
};

function buildPrompt(intake: IntakeJson): string {
  const {
    matter,
    jurisdiction,
    recipientInfo,
    senderInfo,
    urgencyLevel,
    tone,
    additionalContext,
  } = intake;

  return `You are a senior attorney drafting a formal legal letter on behalf of a client. Prepare the letter based on the following information:

**Letter Type:** ${matter?.type ?? "General Legal Matter"}
**Subject:** ${matter?.subject ?? "N/A"}
**Description:** ${matter?.description ?? "N/A"}

**Jurisdiction:** ${jurisdiction?.state ?? jurisdiction?.country ?? "General"}

**From (Sender):**
- Name: ${senderInfo?.name ?? "N/A"}
- Email: ${senderInfo?.email ?? "N/A"}
- Phone: ${senderInfo?.phone ?? "N/A"}

**To (Recipient):**
- Name: ${recipientInfo?.name ?? "N/A"}
- Entity: ${recipientInfo?.entity ?? "N/A"}
- Email: ${recipientInfo?.email ?? "N/A"}
- Address: ${recipientInfo?.address ?? "N/A"}

**Tone:** ${tone ?? "Professional"}
**Urgency:** ${urgencyLevel ?? "Normal"}
**Additional Context:** ${additionalContext ?? "None"}

Draft a comprehensive, professional legal letter addressing the matter described above.
The letter must:
1. Use proper legal formatting (date, recipient address, salutation, body, closing, signature block)
2. Be clear, concise, and authoritative
3. Address all core issues described
4. State appropriate next steps or remedies
5. Be formatted in plain text only (no markdown)

Output only the letter content, ready for attorney review and signature.`;
}

export async function runSimplePipeline(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): Promise<SimplePipelineResult> {
  try {
    logger.info({ letterId, userId }, "[Simple] Starting simple pipeline");

    // Update status to indicate pipeline started
    await updateLetterStatus(letterId, "drafting");

    // Build the prompt
    const prompt = buildPrompt(intake);
    logger.debug({ letterId }, "[Simple] Prompt built, requesting draft");

    // Request letter draft from language model
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract the letter content
    const letterContent =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    if (!letterContent) {
      logger.error({ letterId }, "[Simple] Draft generation returned empty response");
      await updateLetterStatus(letterId, "submitted");
      return {
        success: false,
        error: "Draft generation returned empty response",
      };
    }

    logger.info(
      { letterId, tokenUsage: message.usage },
      "[Simple] Draft generated successfully"
    );

    // Save as ai_draft version (this is what the paywall expects)
    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: letterContent,
      createdByType: "system",
      createdByUserId: userId,
      metadataJson: {
        mode: "simple",
        promptTokens: message.usage?.input_tokens,
        completionTokens: message.usage?.output_tokens,
      },
    });

    // version[0] from .returning() can be undefined if insert silently failed
    if (!version?.insertId) {
      logger.error({ letterId }, "[Simple] createLetterVersion returned no insertId");
      return { success: false, error: "Failed to save letter version" };
    }

    // Update the letter request to point to this version
    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: version.insertId,
    });

    // Mark as complete - this triggers the paywall state
    await updateLetterStatus(letterId, "generated_locked");

    // Notify user that their letter draft is ready for attorney review
    if (userId) {
      try {
        await createNotification({
          userId,
          type: "letter_draft_ready",
          title: "Your letter is ready for review!",
          body: `Our team has prepared your ${intake.matter?.type ?? "legal letter"} and it is ready for attorney review.`,
          link: `/dashboard/letters/${letterId}`,
          category: "letters" satisfies NotificationCategory,
        });
        logger.info({ letterId, userId }, "[Simple] User notification created");
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, letterId }, "[Simple] Failed to create notification (non-fatal)");
      }
    }

    logger.info({ letterId }, "[Simple] Letter saved and status updated");

    return {
      success: true,
      letter: letterContent,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, letterId }, "[Simple] Pipeline failed");

    // Revert to submitted state to allow retry
    try {
      await updateLetterStatus(letterId, "submitted");
    } catch (updateErr) {
      logger.error(
        { updateErr, letterId },
        "[Simple] Failed to revert status after error"
      );
    }

    return {
      success: false,
      error,
    };
  }
}
