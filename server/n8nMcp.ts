// server/n8nMcp.ts — deprecated, intentionally empty.
//
// This module previously imported `@modelcontextprotocol/sdk`, which is not a
// dependency of this repo. The imports caused a TypeScript compile failure in
// the 2026-04-16 pre-deploy audit. No other file in the codebase imports from
// this module (verified via grep on the fix/deployment-blockers-apr16 branch
// — only replit.md references it, as documentation).
//
// The n8n MCP path has been superseded by the direct-API pipeline in
// server/pipeline/ and the LangGraph StateGraph in server/pipeline/graph/.
// Keeping the file as an empty stub instead of deleting it avoids churn with
// the MCP-only deploy tooling and keeps git history intact. A follow-up PR
// may remove the file outright once a local shell is available.

export {};
