import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { logger } from "../logger";

/**
 * LangSmith tracing is automatically enabled for ALL LangChain model calls
 * when these environment variables are set on the Railway service:
 *
 *   LANGSMITH_TRACING=true
 *   LANGSMITH_API_KEY=<your-langsmith-api-key>
 *   LANGSMITH_PROJECT=ttml
 *   LANGSMITH_ENDPOINT=https://api.smith.langchain.com
 *
 * Every model.invoke() call will appear in the LangSmith dashboard with
 * full input/output, token usage, latency, model name, and cost data.
 * No additional code is needed — LangChain auto-reports to LangSmith.
 */

export function isLangSmithEnabled(): boolean {
  return process.env.LANGSMITH_TRACING === "true" && !!process.env.LANGSMITH_API_KEY;
}

// Log LangSmith status at module load time
if (isLangSmithEnabled()) {
  logger.info(
    `[LangSmith] Tracing enabled — project: ${process.env.LANGSMITH_PROJECT ?? "default"}, endpoint: ${process.env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com"}`
  );
} else {
  logger.info("[LangSmith] Tracing disabled — set LANGSMITH_TRACING=true and LANGSMITH_API_KEY to enable");
}

// ═══════════════════════════════════════════════════════
// DROP-IN REPLACEMENT FOR VERCEL AI SDK's generateText()
// ═══════════════════════════════════════════════════════

export interface GenerateTextParams {
  /** LangChain chat model (ChatAnthropic, ChatOpenAI, etc.) */
  model: BaseChatModel;
  /** System prompt */
  system: string;
  /** User prompt */
  prompt: string;
  /** Maximum output tokens (applied via model.bind) */
  maxOutputTokens?: number;
  /** Abort signal for timeout enforcement */
  abortSignal?: AbortSignal;
  /** Custom run name for LangSmith trace (e.g. "ttml-research-123") */
  runName?: string;
  /** Custom metadata attached to the LangSmith trace */
  metadata?: Record<string, unknown>;
  /** Tags for LangSmith filtering (e.g. ["ttml", "research"]) */
  tags?: string[];
}

export interface GenerateTextResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Alias for inputTokens — backward compat with accumulateTokens() */
    promptTokens: number;
    /** Alias for outputTokens — backward compat with accumulateTokens() */
    completionTokens: number;
  };
}

/**
 * Drop-in replacement for Vercel AI SDK's `generateText()`.
 *
 * Uses LangChain models internally, which means:
 * - All calls are automatically traced in LangSmith (when env vars are set)
 * - Token usage is extracted from LangChain's `usage_metadata`
 * - AbortSignal timeouts work via LangChain's `signal` option
 *
 * The return shape is identical to the AI SDK, so existing
 * `accumulateTokens()`, `calculateCost()`, and `withModelFailover()`
 * all work unchanged.
 */
export async function generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
  const { model, system, prompt, maxOutputTokens, abortSignal, runName, metadata, tags } = params;

  // Build LangChain invoke options
  const invokeOptions: Record<string, unknown> = {};
  if (abortSignal) invokeOptions.signal = abortSignal;
  if (runName) invokeOptions.runName = runName;
  if (metadata) invokeOptions.metadata = metadata;
  if (tags) invokeOptions.tags = tags;

  // Bind maxTokens if specified (per-call override without mutating the model)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configuredModel: any = maxOutputTokens
    ? model.bind({ max_tokens: maxOutputTokens })
    : model;

  const messages = [
    new SystemMessage(system),
    new HumanMessage(prompt),
  ];

  const response = await configuredModel.invoke(messages, invokeOptions);

  // Extract text content from the AIMessage response
  const text = typeof response.content === "string"
    ? response.content
    : Array.isArray(response.content)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? response.content.map((block: any) => (typeof block === "string" ? block : block.text ?? "")).join("")
      : String(response.content);

  // Extract token usage from LangChain's usage_metadata
  const inputTokens = response.usage_metadata?.input_tokens ?? 0;
  const outputTokens = response.usage_metadata?.output_tokens ?? 0;

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      // Backward compatibility: accumulateTokens() checks both shapes
      promptTokens: inputTokens,
      completionTokens: outputTokens,
    },
  };
}
