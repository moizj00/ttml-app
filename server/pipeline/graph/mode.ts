// ═══════════════════════════════════════════════════════
// LANGGRAPH_PIPELINE mode parser
//
// Backwards-compatible interpretation of the LANGGRAPH_PIPELINE env:
//   - unset / empty / "false" / "off"  → off  (skip LangGraph, use n8n + standard)
//   - "true" / "tier3"                  → tier3
//     LangGraph runs ONLY when n8n is unavailable or fails;
//     n8n remains primary if N8N_PRIMARY=true.
//   - "primary"                         → primary
//     LangGraph runs FIRST. n8n is bypassed unless LangGraph fails.
//   - "canary"                          → canary
//     A pseudo-random subset of letters routes to LangGraph; the rest
//     route to n8n / standard. The canary fraction is controlled by
//     LANGGRAPH_CANARY_FRACTION (default 0.1 = 10%).
//
// "true" continues to mean "tier3" so existing deployments using
// LANGGRAPH_PIPELINE=true keep their current behaviour.
// ═══════════════════════════════════════════════════════

export type LangGraphMode = "off" | "tier3" | "primary" | "canary";

export function parseLangGraphMode(raw: string | undefined): LangGraphMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "false" || v === "off" || v === "0") return "off";
  if (v === "true" || v === "tier3") return "tier3";
  if (v === "primary") return "primary";
  if (v === "canary") return "canary";
  return "off";
}

/**
 * Decide whether a specific letter should run through LangGraph given the
 * configured mode. Pure & deterministic per (mode, letterId, fraction) so
 * tests can exercise it without mocks.
 *
 * The N8N_PRIMARY=true env still wins for tier3: callers should consult
 * useLangGraphForLetter() AND fall through to n8n if LangGraph fails.
 * For "primary" mode the dispatch logic should call LangGraph first
 * regardless of N8N_PRIMARY.
 */
export function useLangGraphForLetter(opts: {
  mode: LangGraphMode;
  letterId: number;
  canaryFraction?: number;
}): boolean {
  switch (opts.mode) {
    case "off":
      return false;
    case "tier3":
    case "primary":
      return true;
    case "canary": {
      const fraction = opts.canaryFraction ?? 0.1;
      if (fraction <= 0) return false;
      if (fraction >= 1) return true;
      // Stable hash of letterId so the same letter always lands on the
      // same side of the split — required for retries to behave
      // consistently across attempts.
      const slot = Math.abs(hashInt(opts.letterId)) % 1000;
      return slot < Math.floor(fraction * 1000);
    }
  }
}

function hashInt(n: number): number {
  // xorshift-ish mixer; deterministic and good enough for canary slotting.
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x;
}

export function getCanaryFractionFromEnv(): number {
  const raw = process.env.LANGGRAPH_CANARY_FRACTION;
  if (!raw) return 0.1;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0.1;
  return Math.min(1, Math.max(0, n));
}
