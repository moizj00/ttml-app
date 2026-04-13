import type { IntakeJson } from "../../shared/types";
import { createLogger } from "../logger";
import { Anthropic } from "@anthropic-ai/sdk";
import { updateLetterStatus, createLetterVersion, updateLetterVersionPointers } from "../db";

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

function buildPrompt(intake: IntakeJson): string {
  const {
    matter,
    jurisdiction,
    recipient,
    sender,
    tonePreference,
    desiredOutcome,
    additionalContext,
  } = intake;

  return `You are a professional legal letter writer. Generate a formal legal letter based on the following information:

**Letter Type:** ${matter?.type || "General Legal Matter"}
**Subject:** ${matter?.subject || "N/A"}
**Description:** ${matter?.description || "N/A"}

**Jurisdiction:** ${jurisdiction?.state || jurisdiction?.country || "General"}

**From (Sender):**
- Name: ${sender?.name || "N/A"}
- Email: ${sender?.email || "N/A"}
- Phone: ${sender?.phone || "N/A"}

**To (Recipient):**
- Name: ${recipient?.name || "N/A"}
- Entity: ${recipient?.entity || "N/A"}
- Email: ${recipient?.email || "N/A"}
- Address: ${recipient?.address || "N/A"}

**Tone:** ${tonePreference || "Professional"}
**Desired Outcome:** ${desiredOutcome || "N/A"}
**Additional Context:** ${additionalContext || "None"}

Generate a comprehensive, professional legal letter addressing the matter described above. 
The letter should:
1. Use proper legal formatting (date, recipient address, salutation, body, closing, signature block)
2. Be clear, concise, and professional
3. Address the core issue(s) described
4. Suggest appropriate next steps or remedies
5. Be formatted in plain text (not markdown)

Output only the letter content, ready to send.`;
}

export async function runSimplePipeline(
  letterId: number,
  intake: IntakeJson,
  userId?: number
): Promise<{ success: boolean; letter?: string; error?: string }> {
  try {
    logger.info({ letterId, userId }, "[Simple] Starting simple pipeline");

    // Transition: submitted → researching → drafting (status machine requires this path)
    await updateLetterStatus(letterId, "researching");
    await updateLetterStatus(letterId, "drafting");

    // Build the prompt
    const prompt = buildPrompt(intake);
    logger.debug({ letterId }, "[Simple] Prompt built, calling Claude");

    // Call Claude
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
      logger.error({ letterId }, "[Simple] Claude returned empty response");
      await updateLetterStatus(letterId, "submitted");
      return {
        success: false,
        error: "Claude returned empty response",
      };
    }

    logger.info(
      { letterId, tokenUsage: message.usage },
      "[Simple] Claude generated letter"
    );

    // Save as ai_draft version (this is what the paywall expects)
    const version = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: letterContent,
      createdByType: "system",
      createdByUserId: userId,
      metadataJson: {
        model: "claude-3-5-sonnet-20241022",
        provider: "anthropic",
        mode: "simple",
        promptTokens: message.usage?.input_tokens,
        completionTokens: message.usage?.output_tokens,
      },
    });

    // Update the letter request to point to this version
    await updateLetterVersionPointers(letterId, {
      currentAiDraftVersionId: version.insertId,
    });

    // Mark as complete - this triggers the paywall state
    await updateLetterStatus(letterId, "generated_locked");

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
