/**
 * LangGraph Fallback Node
 * 
 * Handles graceful degradation when pipeline stages exhaust all retries.
 * Attempts to deliver the best available content with appropriate warnings,
 * rather than failing completely.
 */

import type { PipelineState, PipelineErrorInfo } from "../state";
import { buildPipelineContextFromState } from "../state";
import { bestEffortFallback, FALLBACK_EXCLUDED_CODES } from "../../fallback";
import {
  updateLetterStatus,
  createNotification,
} from "../../../db";
import { sendAdminAlertEmail } from "../../../email";
import { captureServerException } from "../../../sentry";
import { createLogger } from "../../../logger";

const nodeLogger = createLogger({ module: "LangGraphFallbackNode" });

// ═══════════════════════════════════════════════════════
// FALLBACK NODE
// ═══════════════════════════════════════════════════════

export async function fallbackNode(
  state: PipelineState
): Promise<Partial<PipelineState>> {
  const {
    letterId,
    intake,
    lastError,
    errors,
    intermediateDraftContent,
    vettedLetter,
    assembledLetter,
    draft,
    qualityWarnings,
  } = state;

  nodeLogger.warn(
    {
      letterId,
      lastErrorCode: lastError?.code,
      lastErrorStage: lastError?.stage,
      hasIntermediateContent: !!intermediateDraftContent,
      hasVettedLetter: !!vettedLetter,
      hasAssembledLetter: !!assembledLetter,
      hasDraft: !!draft,
    },
    "[FallbackNode] Entering fallback recovery"
  );

  // Determine the best available content
  const bestContent =
    vettedLetter ??
    assembledLetter ??
    intermediateDraftContent ??
    draft?.draftLetter ??
    null;

  // Check if the error code is excluded from fallback (should fail hard instead)
  const shouldFailHard =
    lastError &&
    FALLBACK_EXCLUDED_CODES.has(lastError.code);

  if (shouldFailHard) {
    nodeLogger.error(
      { letterId, errorCode: lastError?.code },
      "[FallbackNode] Error code excluded from fallback - failing hard"
    );

    // Notify admins of hard failure
    try {
      await Promise.all([
        updateLetterStatus(letterId, "pipeline_failed"),
        sendAdminAlertEmail({
          subject: `Pipeline Hard Failure: Letter #${letterId}`,
          body: `Letter #${letterId} failed with excluded error code ${lastError?.code}. No fallback possible.\n\nError: ${lastError?.message}`,
        }),
        ...(state.userId ? [
          createNotification({
            userId: state.userId,
            type: "letter_failed",
            title: "Letter Generation Failed",
            message: `We were unable to generate your letter. Our team has been notified and will contact you shortly.`,
            link: `/dashboard/letters/${letterId}`,
          }),
        ] : []),
      ]);
    } catch (notifyErr) {
      captureServerException(notifyErr, {
        tags: { component: "fallback", error_type: "notification_failed" },
        extra: { letterId },
      });
    }

    const errorInfo: PipelineErrorInfo = {
      code: lastError?.code ?? "FALLBACK_EXCLUDED",
      message: `Pipeline failed with non-recoverable error: ${lastError?.message}`,
      stage: "fallback",
      timestamp: new Date().toISOString(),
    };

    return {
      currentStage: "failed",
      lastError: errorInfo,
      errors: [errorInfo],
    };
  }

  // If we have usable content, deliver it with degradation warnings
  if (bestContent && bestContent.length > 100) {
    nodeLogger.info(
      { letterId, contentLength: bestContent.length },
      "[FallbackNode] Delivering best-effort content"
    );

    const pipelineCtx = buildPipelineContextFromState(state);

    try {
      // Use existing bestEffortFallback to finalize the letter
      const fallbackSuccess = await bestEffortFallback({
        letterId,
        intake,
        intermediateDraftContent: bestContent,
        qualityWarnings,
        pipelineErrorCode: lastError?.code ?? "UNKNOWN_ERROR",
        errorMessage: lastError?.message ?? "Unknown error",
        dbFields: {
          subject: intake.matter?.subject,
          jurisdictionState: intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? null,
        },
      });

      if (!fallbackSuccess) {
        nodeLogger.error(
          { letterId },
          "[FallbackNode] bestEffortFallback returned false - no fallback content could be saved"
        );
        // Fall through to complete failure below
      } else {
        // Successfully delivered best-effort fallback
        return {
          currentStage: "complete",
          vettedLetter: bestContent,
          qualityWarnings: [
            `FALLBACK_DELIVERY: Letter delivered with degraded quality after pipeline errors.`,
            `Last error stage: ${lastError?.stage}`,
            `Total errors: ${errors.length}`,
            ...(qualityWarnings ?? []),
          ],
          lastError: null,
        };
      }
    } catch (fallbackErr) {
      const errorMessage =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);

      nodeLogger.error(
        { letterId, error: errorMessage },
        "[FallbackNode] Best-effort fallback failed"
      );

      captureServerException(fallbackErr, {
        tags: { component: "fallback", error_type: "best_effort_failed" },
        extra: { letterId, bestContentLength: bestContent.length },
      });

      // Fall through to complete failure
    }
  }

  // No usable content available - complete failure
  nodeLogger.error(
    { letterId, hasAnyContent: !!bestContent },
    "[FallbackNode] No recoverable content - pipeline failed"
  );

  try {
    await Promise.all([
      updateLetterStatus(letterId, "pipeline_failed"),
      sendAdminAlertEmail({
        subject: `Pipeline Complete Failure: Letter #${letterId}`,
        body: `Letter #${letterId} failed completely with no recoverable content.\n\nErrors:\n${errors.map((e) => `- ${e.stage}: ${e.message}`).join("\n")}`,
      }),
      ...(state.userId ? [
        createNotification({
          userId: state.userId,
          type: "letter_failed",
          title: "Letter Generation Failed",
          message: `We were unable to generate your letter. Our team has been notified and will contact you shortly.`,
          link: `/dashboard/letters/${letterId}`,
        }),
      ] : []),
    ]);
  } catch (notifyErr) {
    captureServerException(notifyErr, {
      tags: { component: "fallback", error_type: "notification_failed" },
      extra: { letterId },
    });
  }

  const errorInfo: PipelineErrorInfo = {
    code: "FALLBACK_EXHAUSTED",
    message: "Pipeline failed completely - no recoverable content available",
    stage: "fallback",
    details: errors.map((e) => `${e.stage}: ${e.message}`).join("; "),
    timestamp: new Date().toISOString(),
  };

  return {
    currentStage: "failed",
    lastError: errorInfo,
    errors: [errorInfo],
  };
}
