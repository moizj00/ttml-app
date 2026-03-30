import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { TokenUsage } from "../../shared/types";

// ═══════════════════════════════════════════════════════
// MODEL PROVIDERS
// ═══════════════════════════════════════════════════════

// ── Anthropic (Claude) — direct API, used for Stage 2 (draft) and Stage 3 (assembly) ──
export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[Pipeline] ANTHROPIC_API_KEY is not set — cannot run drafting or assembly stages"
    );
  }
  return createAnthropic({ apiKey });
}

/** Stage 1: Perplexity sonar-pro — web-grounded legal research (direct API) */
export function getResearchModel() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      "[Pipeline] PERPLEXITY_API_KEY is not set — falling back to Claude for research"
    );
    const anthropic = getAnthropicClient();
    return {
      model: anthropic("claude-opus-4-5"),
      provider: "anthropic-fallback",
    };
  }
  // Perplexity is OpenAI-compatible — use @ai-sdk/openai with custom baseURL
  const perplexity = createOpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
    name: "perplexity",
  });
  return { model: perplexity.chat("sonar-pro"), provider: "perplexity" };
}

/** Stage 2: Anthropic claude-opus-4-5 — initial legal draft (direct Anthropic API) */
export function getDraftModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-opus-4-5");
}

/** Stage 3: Anthropic claude-opus-4-5 — final polished letter assembly (direct Anthropic API) */
export function getAssemblyModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-opus-4-5");
}

// Timeout constants (ms)
export const RESEARCH_TIMEOUT_MS = 90_000; // 90s — Perplexity web search can be slow
export const DRAFT_TIMEOUT_MS = 120_000; // 120s — Claude drafting a full legal letter
export const ASSEMBLY_TIMEOUT_MS = 120_000; // 120s — Claude final assembly

export const SONNET_PRICING = { inputPerMillion: 3, outputPerMillion: 15 };
export const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "sonar-pro": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-4-5": { inputPerMillion: 15, outputPerMillion: 75 },
  // Support both full and short model IDs to avoid drift when model IDs change
  "claude-sonnet-4-20250514": SONNET_PRICING,
  "claude-sonnet-4": SONNET_PRICING,
};

export function createTokenAccumulator(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function accumulateTokens(
  acc: TokenUsage,
  // AI SDK v6 uses inputTokens/outputTokens; accept both shapes for compatibility
  usage: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined
) {
  if (!usage) return;
  acc.promptTokens += usage.inputTokens ?? usage.promptTokens ?? 0;
  acc.completionTokens += usage.outputTokens ?? usage.completionTokens ?? 0;
  acc.totalTokens = acc.promptTokens + acc.completionTokens;
}

export function calculateCost(modelKey: string, usage: TokenUsage): string {
  const pricing = MODEL_PRICING[modelKey];
  if (!pricing) return "0";
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPerMillion;
  return (inputCost + outputCost).toFixed(6);
}

