// ═══════════════════════════════════════════════════════
// Worker LANGGRAPH_PIPELINE wiring smoke test.
//
// Asserts (via source-level inspection) that worker.ts:
//   - Imports the mode parser and useLangGraphForLetter selector
//   - Still preserves the literal `LANGGRAPH_PIPELINE === "true"` check
//     so existing deployments using the boolean-string variant remain
//     wired correctly.
//   - Logs the resolved mode for observability.
//   - Falls through to the n8n + standard pipeline when LangGraph fails.
// ═══════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const WORKER_PATH = path.join(process.cwd(), "server/worker.ts");
const ORCHESTRATOR_PATH = path.join(
  process.cwd(),
  "server/pipeline/orchestrator.ts"
);

describe("worker.ts — LANGGRAPH_PIPELINE mode wiring", () => {
  it("imports parseLangGraphMode + useLangGraphForLetter", async () => {
    const src = await fs.readFile(WORKER_PATH, "utf8");
    expect(src).toContain("parseLangGraphMode");
    expect(src).toContain("useLangGraphForLetter");
    expect(src).toContain("getCanaryFractionFromEnv");
  });

  it("preserves the literal LANGGRAPH_PIPELINE === \"true\" check (back-compat)", async () => {
    const src = await fs.readFile(WORKER_PATH, "utf8");
    expect(src).toContain('process.env.LANGGRAPH_PIPELINE === "true"');
  });

  it("logs the resolved langGraphMode for ops visibility", async () => {
    const src = await fs.readFile(WORKER_PATH, "utf8");
    expect(src).toMatch(/langGraphMode|mode=\$\{langGraphMode/);
  });

  it("retains the n8n primary path in the orchestrator (N8N_PRIMARY)", async () => {
    const src = await fs.readFile(ORCHESTRATOR_PATH, "utf8");
    expect(src).toContain("N8N_PRIMARY");
    expect(src).toMatch(/Try n8n workflow first/i);
  });
});
