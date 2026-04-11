import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
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

// ── OpenAI — used as backup/failover model for all stages ──
export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[Pipeline] OPENAI_API_KEY is not set — OpenAI failover is unavailable"
    );
  }
  return createOpenAI({ apiKey });
}

/** Returns true if OpenAI failover is available (API key is set) */
export function isOpenAIFailoverAvailable(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  return !!(apiKey && apiKey.trim().length > 0);
}

/** Stage 1: Perplexity sonar-pro — web-grounded legal research (fail-hard, no fallback) */
export function getResearchModel() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[Pipeline] PERPLEXITY_API_KEY is not set — research stage requires Perplexity (fail-hard, no fallback)"
    );
  }
  const perplexity = createOpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
    name: "perplexity",
  });
  return { model: perplexity.chat("sonar-pro"), provider: "perplexity" };
}


/** Stage 2: OpenAI gpt-4o — primary drafting model */
export function getDraftModel() {
  const openai = getOpenAIClient();
  return openai("gpt-4o");
}

/** Stage 2 failover: Anthropic claude-sonnet-4 */
export function getDraftModelFallback() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-sonnet-4");
}

/** Stage 3: Anthropic claude-sonnet-4 — final polished letter assembly (direct Anthropic API) */
export function getAssemblyModel() {
  const anthropic = getAnthropicClient();
  return anthropic("claude-sonnet-4");
}

/** Stage 3 failover: OpenAI gpt-4o-mini */
export function getAssemblyModelFallback() {
  const openai = getOpenAIClient();
  return openai("gpt-4o-mini");
}

/** Stage 4 vetting failover: OpenAI gpt-4o-mini */
export function getVettingModelFallback() {
  const openai = getOpenAIClient();
  return openai("gpt-4o-mini");
}


// Timeout constants (ms)
export const RESEARCH_TIMEOUT_MS = 90_000; // 90s — Perplexity web search can be slow
export const DRAFT_TIMEOUT_MS = 90_000; // 90s — Claude Sonnet drafting a full legal letter
export const ASSEMBLY_TIMEOUT_MS = 90_000; // 90s — Claude Sonnet final assembly

export const SONNET_PRICING = { inputPerMillion: 3, outputPerMillion: 15 };
export const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "sonar-pro": { inputPerMillion: 3, outputPerMillion: 15 },
  "sonar": { inputPerMillion: 1, outputPerMillion: 1 },
  "claude-opus-4-5": { inputPerMillion: 15, outputPerMillion: 75 },
  // Support both full and short model IDs to avoid drift when model IDs change
  "claude-sonnet-4-20250514": SONNET_PRICING,
  "claude-sonnet-4": SONNET_PRICING,
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o-search-preview": { inputPerMillion: 2.5, outputPerMillion: 10 },
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

