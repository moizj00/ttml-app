---
name: supabase-n8n-sentry-agent
description: >
  A full-stack automation agent that integrates Supabase (database & auth),
  n8n (workflow automation), and Sentry (error monitoring) via MCP servers.
  Use this agent to manage data, trigger workflows, and track errors across
  your stack from a single conversational interface.
version: "1.0.0"
tools:
  - mcp

mcp_servers:
  supabase:
    command: npx
    args:
      - "-y"
      - "@supabase/mcp-server-supabase@latest"
    env:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: [${SUPABASE_SERVICE_ROLE_KEY}](https://lguqhibpxympxvwqpedf.supabase.co)
    description: >
      Connects to your Supabase project. Enables querying tables,
      managing rows, running SQL, and interacting with Supabase Auth.

  n8n:
    command: npx
    args:
      - "-y"
      - "@n8n/mcp-server@latest"
    env:
      N8N_BASE_URL: ${N8N_BASE_URL}
      N8N_API_KEY: ${N8N_API_KEY}
    description: >
      Connects to your n8n instance. Enables listing, triggering,
      and managing workflows programmatically.

  sentry:
    command: npx
    args:
      - "-y"
      - "@sentry/mcp-server@latest"
    env:
      SENTRY_AUTH_TOKEN: ${SENTRY_AUTH_TOKEN}
      SENTRY_ORG: ${SENTRY_ORG}
      SENTRY_PROJECT: ${SENTRY_PROJECT}
    description: >
      Connects to your Sentry organization. Enables querying issues,
      events, releases, and performance data.
---

# Supabase + n8n + Sentry Agent

This agent integrates three core services — **Supabase**, **n8n**, and **Sentry** — via MCP servers, giving you a single conversational interface to manage your full-stack automation and observability pipeline.

## Capabilities

### Supabase
- Query and mutate database tables using natural language
- Run raw SQL statements against your Supabase project
- Inspect table schemas and relationships
- Manage Supabase Auth users (list, invite, delete)
- Fetch and set project configuration

### n8n
- List all available workflows and their statuses
- Trigger workflows by name or ID with custom payloads
- Inspect workflow execution logs and history
- Enable or disable workflows on demand
- Create and update workflow configurations

### Sentry
- Fetch open issues filtered by project, environment, or severity
- Retrieve detailed stack traces and event data for a given issue
- List recent releases and associated commits
- Query performance metrics (P95, P99 latencies, transaction throughput)
- Assign, resolve, or ignore issues

## Example Prompts

- "Show me all unresolved Sentry errors from the last 24 hours in production."
- "Trigger the n8n workflow 'nightly-report' with payload { env: prod }."
- "Query the Supabase orders table for all rows where status = pending."
- "List all n8n workflows that are currently disabled."
- "Which Sentry issue has the highest event count this week?"
- "Insert a new row into the Supabase logs table with the following data."

## Environment Variables

Set the following secrets in your repository or environment before using this agent:

| Variable | Service | Description |
|---|---|---|
| SUPABASE_URL | Supabase | Your project URL (e.g. https://xyz.supabase.co) |
| SUPABASE_SERVICE_ROLE_KEY | Supabase | Service role key (keep secret!) |
| N8N_BASE_URL | n8n | Base URL of your n8n instance |
| N8N_API_KEY | n8n | API key generated in n8n settings |
| SENTRY_AUTH_TOKEN | Sentry | Auth token from Sentry account settings |
| SENTRY_ORG | Sentry | Your Sentry organization slug |
| SENTRY_PROJECT | Sentry | Your Sentry project slug |

## Notes

- The Supabase MCP server runs in **read-only** mode by default. Remove the --read-only flag to allow writes.
- Ensure your n8n instance is network-accessible from the agent runtime environment.
- Sentry Auth Tokens should be scoped to the minimum required permissions (e.g. project:read, event:read).
