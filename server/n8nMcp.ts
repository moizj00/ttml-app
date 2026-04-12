import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool, CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "./logger";
import type { ResearchPacket, DraftOutput } from "../shared/types";

const mcpLogger = createLogger({ module: "N8nMcp" });

let _client: Client | null = null;
let _connecting = false;
let _lastConnectAttempt = 0;
const RECONNECT_COOLDOWN_MS = 30_000;

let _discoveredToolName: string | null = null;

interface McpConfig {
  url: string;
  token: string;
  configured: boolean;
  toolName: string;
}

function getMcpConfig(): McpConfig {
  const url = process.env.N8N_MCP_URL ?? "";
  const token = process.env.N8N_MCP_BEARER_TOKEN ?? "";
  const toolName = process.env.N8N_MCP_TOOL_NAME ?? "";
  return { url, token, toolName, configured: !!(url && token) };
}

async function getClient(): Promise<Client | null> {
  const config = getMcpConfig();
  if (!config.configured) {
    mcpLogger.warn("[N8nMcp] MCP not configured — missing N8N_MCP_URL or N8N_MCP_BEARER_TOKEN");
    return null;
  }

  if (_client) return _client;

  if (_connecting) {
    mcpLogger.info("[N8nMcp] Connection already in progress — skipping");
    return null;
  }

  const now = Date.now();
  if (now - _lastConnectAttempt < RECONNECT_COOLDOWN_MS) {
    mcpLogger.info("[N8nMcp] Reconnect cooldown active — skipping");
    return null;
  }

  _connecting = true;
  _lastConnectAttempt = now;

  try {
    mcpLogger.info({ url: config.url }, "[N8nMcp] Connecting to n8n MCP server");

    const transport = new StreamableHTTPClientTransport(
      new URL(config.url),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${config.token}`,
          },
        },
      }
    );

    const client = new Client(
      { name: "ttml-pipeline", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    _client = client;
    mcpLogger.info("[N8nMcp] Connected to n8n MCP server");
    return client;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mcpLogger.error({ err: msg }, "[N8nMcp] Failed to connect to n8n MCP server");
    _client = null;
    return null;
  } finally {
    _connecting = false;
  }
}

function resetClient(): void {
  if (_client) {
    try {
      _client.close();
    } catch { /* ignore */ }
    _client = null;
  }
  _discoveredToolName = null;
}

export interface N8nMcpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export async function listN8nTools(): Promise<N8nMcpToolInfo[]> {
  const client = await getClient();
  if (!client) return [];

  try {
    const result = await client.listTools();
    const tools: N8nMcpToolInfo[] = (result.tools ?? []).map((t: Tool) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    }));
    mcpLogger.info({ count: tools.length, names: tools.map((t) => t.name) }, "[N8nMcp] Available tools");
    return tools;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mcpLogger.error({ err: msg }, "[N8nMcp] Failed to list tools");
    resetClient();
    return [];
  }
}

export interface N8nVettingReport {
  citationsVerified: number;
  citationsRemoved: number;
  citationsFlagged: string[];
  bloatPhrasesRemoved: string[];
  jurisdictionIssues: string[];
  factualIssuesFound: string[];
  changesApplied: string[];
  overallAssessment: string;
  riskLevel: "low" | "medium" | "high";
}

export interface N8nPipelineResult {
  letterId: number;
  success: boolean;
  researchPacket?: ResearchPacket;
  draftOutput?: DraftOutput;
  assembledLetter?: string;
  vettedLetter?: string;
  vettingReport?: N8nVettingReport;
  researchOutput?: string;
  draftContent?: string;
  provider?: string;
  stages?: string[];
  bloatDetected?: number;
  error?: string;
}

export interface N8nMcpCallResult {
  success: boolean;
  content: N8nPipelineResult | string | null;
  isError: boolean;
}

function parseToolCallContent(result: CallToolResult): N8nPipelineResult | string | null {
  if (!result.content || !Array.isArray(result.content)) return null;

  const textParts = result.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text);

  if (textParts.length === 0) return null;

  const joined = textParts.length === 1 ? textParts[0] : textParts.join("\n");

  try {
    return JSON.parse(joined) as N8nPipelineResult;
  } catch {
    return joined;
  }
}

export async function callN8nTool(toolName: string, args: Record<string, unknown>): Promise<N8nMcpCallResult> {
  const client = await getClient();
  if (!client) {
    return { success: false, content: "MCP client not available", isError: true };
  }

  try {
    mcpLogger.info({ toolName, argKeys: Object.keys(args) }, "[N8nMcp] Calling tool");

    const result = await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: 120_000 }
    );

    const isError = result.isError === true;
    const content = "content" in result && Array.isArray(result.content)
      ? parseToolCallContent(result as CallToolResult)
      : null;

    mcpLogger.info({ toolName, isError, hasContent: !!content }, "[N8nMcp] Tool call complete");

    return { success: !isError, content, isError };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mcpLogger.error({ toolName, err: msg }, "[N8nMcp] Tool call failed");
    resetClient();
    return { success: false, content: msg, isError: true };
  }
}

export interface N8nPipelinePayload {
  letterId: number;
  letterType: string;
  userId: string;
  callbackUrl: string;
  callbackSecret: string;
  intakeData: {
    sender: { name: string; address: string; email?: string; phone?: string };
    recipient: { name: string; address: string; email?: string; phone?: string };
    jurisdictionState: string;
    jurisdictionCountry: string;
    matter: { category: string; subject: string; description: string; incidentDate?: string };
    desiredOutcome: string;
    letterType: string;
    tonePreference?: string;
    financials?: { amountOwed?: number; currency?: string };
    additionalContext?: string;
  };
  normalizedInput?: Record<string, unknown> | object;
}

async function resolveToolName(tools: N8nMcpToolInfo[]): Promise<string | null> {
  const config = getMcpConfig();

  if (config.toolName) {
    const exact = tools.find((t) => t.name === config.toolName);
    if (exact) {
      mcpLogger.info({ toolName: config.toolName }, "[N8nMcp] Using configured tool name (N8N_MCP_TOOL_NAME)");
      return exact.name;
    }
    mcpLogger.warn(
      { configuredName: config.toolName, available: tools.map((t) => t.name) },
      "[N8nMcp] Configured N8N_MCP_TOOL_NAME not found among available tools"
    );
    return null;
  }

  if (_discoveredToolName) {
    const cached = tools.find((t) => t.name === _discoveredToolName);
    if (cached) return cached.name;
    _discoveredToolName = null;
  }

  if (tools.length === 1) {
    _discoveredToolName = tools[0].name;
    mcpLogger.info({ toolName: _discoveredToolName }, "[N8nMcp] Single tool available — using it");
    return _discoveredToolName;
  }

  const keywords = ["legal-letter", "letter-submission", "legal-pipeline", "ttml"];
  for (const kw of keywords) {
    const match = tools.find((t) => t.name.toLowerCase().includes(kw));
    if (match) {
      _discoveredToolName = match.name;
      mcpLogger.info({ toolName: _discoveredToolName, matchedKeyword: kw }, "[N8nMcp] Matched tool by keyword");
      return _discoveredToolName;
    }
  }

  mcpLogger.error(
    { available: tools.map((t) => t.name) },
    "[N8nMcp] Could not identify the correct pipeline tool. Set N8N_MCP_TOOL_NAME env var to specify explicitly."
  );
  return null;
}

export async function triggerN8nPipeline(payload: N8nPipelinePayload): Promise<N8nMcpCallResult> {
  const tools = await listN8nTools();
  if (tools.length === 0) {
    return { success: false, content: "No n8n MCP tools available", isError: true };
  }

  const toolName = await resolveToolName(tools);
  if (!toolName) {
    return {
      success: false,
      content: `Cannot determine which n8n tool to call. Available: [${tools.map((t) => t.name).join(", ")}]. Set N8N_MCP_TOOL_NAME to specify.`,
      isError: true,
    };
  }

  mcpLogger.info(
    { toolName, totalTools: tools.length },
    "[N8nMcp] Triggering pipeline via resolved tool"
  );

  const args: Record<string, unknown> = {
    letterId: payload.letterId,
    letterType: payload.letterType,
    userId: payload.userId,
    callbackUrl: payload.callbackUrl,
    callbackSecret: payload.callbackSecret,
    intakeData: payload.intakeData,
  };
  if (payload.normalizedInput) {
    args.normalizedInput = payload.normalizedInput;
  }

  return callN8nTool(toolName, args);
}

export function isN8nMcpConfigured(): boolean {
  return getMcpConfig().configured;
}

export { resetClient as resetN8nMcpClient };
