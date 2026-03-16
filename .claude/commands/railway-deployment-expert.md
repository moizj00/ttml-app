---
name: railway-deployment-expert
description: "Expert in deploying full-stack applications to Railway.com, including Express.js + Vite + tRPC + Supabase + Drizzle ORM monorepos. Use for: creating Railway projects, configuring Dockerfile and railway.toml, setting environment variables, managing custom domains, fixing deployment crashes, and using the Railway MCP server or GraphQL API. Covers builder selection (Dockerfile vs Railpack), CORS configuration, port binding, esbuild externalization, and Cloudflare DNS integration."
---

# Railway Deployment Expert

Overview: End-to-end deployment of the TTML stack (Express + Vite + Wouter + tRPC + Supabase + Drizzle ORM) to Railway.com. Captures real-world lessons from production deployments, including crash fixes, domain configuration, and the Railway GraphQL API.

---

## Builder Decision: Dockerfile vs Railpack

Railway supports three builders. The choice determines how the image is built.

| Builder | When to Use | How to Activate |
|---------|-------------|-----------------|
| Dockerfile (recommended for TTML) | Complex monorepo builds, multi-stage builds, pnpm workspaces, custom esbuild/vite pipelines | Place Dockerfile at root — Railway auto-detects it. Set `builder = "DOCKERFILE"` in railway.toml to be explicit. |
| Railpack (default for new services) | Simple Node/Python/Go apps with standard build chains, no custom bundling | Remove or rename the Dockerfile. Set `builder = "RAILPACK"` in railway.toml. |
| Nixpacks (legacy) | Migrating old services only | Set `builder = "NIXPACKS"` in railway.toml. Railpack is the modern replacement. |

**Critical rule:** If a Dockerfile exists at the project root, Railway always uses it regardless of the builder setting in railway.toml. To switch to Railpack, you must rename or delete the Dockerfile.

---

## Using Dockerfile + railway.toml Together

These two files serve different purposes and work together:

* **Dockerfile** controls how the image is built (stages, dependencies, compilation).
* **railway.toml** controls how the container is deployed (start command, health check, restart policy, env vars, watch paths).

Settings in railway.toml override the Railway dashboard. The CMD in the Dockerfile can be overridden by `startCommand` in railway.toml.

---

## Canonical Configuration for TTML Stack

### railway.toml

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node dist/index.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[deploy.healthCheck]
httpPath = "/api/health"
intervalSeconds = 30
timeoutSeconds = 10
startPeriodSeconds = 20

[deploy.environmentVariables]
NODE_ENV = "production"
PORT = "3000"
CORS_ALLOWED_ORIGINS = "https://talk-to-my-lawyer.com"
```

### Dockerfile (Multi-Stage)

See `templates/Dockerfile` for the full template. Key rules:

* Stage 1 (builder): `pnpm install --frozen-lockfile` → `pnpm run build`
* Stage 2 (production): `pnpm install --frozen-lockfile --prod` (strips devDependencies)
* `ENV NODE_ENV=production` in the production stage
* `EXPOSE 3000` (documentation only — Railway uses $PORT)
* HEALTHCHECK using wget on `/api/health`
* `CMD ["node", "dist/index.js"]`

---

## esbuild Externalization (Critical for Vite+Express Monorepos)

When esbuild bundles the server, it inlines local files (like vite.config.ts) even when `--packages=external` is set. If vite.config.ts imports devDependencies like `@tailwindcss/vite`, the production build crashes with `ERR_MODULE_NOT_FOUND`.

**Fix — add explicit externals to the build script:**

```json
"build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --external:@tailwindcss/vite --external:@vitejs/plugin-react --external:vite"
```

**Fix — prevent esbuild from statically resolving vite.config.ts in server/_core/vite.ts:**

```ts
// Use a variable path so esbuild cannot statically resolve and bundle vite.config.ts
if (process.env.NODE_ENV !== "production") {
  const configPath = "../../vite.config.js";
  const { default: viteConfig } = await import(configPath);
  // ...
}
```

---

## Port Binding

Railway injects `$PORT` at runtime. The server must use it:

```ts
const port = parseInt(process.env.PORT || "3000");
server.listen(port, () => console.log(`Server running on port ${port}`));
```

**Avoid scanning for available ports** (`findAvailablePort`) in production — Railway sets `$PORT` and expects the app to use it exactly.

---

## CORS Configuration

```ts
const STATIC_ALLOWED_ORIGINS = new Set([
  "https://talk-to-my-lawyer.com",
  "https://www.talk-to-my-lawyer.com",
]);

// Extra origins from env
const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);
for (const o of extraOrigins) STATIC_ALLOWED_ORIGINS.add(o);

// Allow Railway preview deployments automatically
const railwayOrigin = origin && /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin);
```

**Server-to-server callers** (n8n webhooks, Stripe webhooks, Sentry) do not send Origin headers — no CORS entry needed for them.

---

## Health Check Endpoint

Add a lightweight health endpoint before any body parsers or auth middleware:

```ts
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, timestamp: Date.now() });
});
```

**Use `/api/health`** (not a tRPC endpoint) — tRPC requires `?input=` query params which complicates health checks.

---

## Deployment Workflow

### Step 1 — Create Project via Railway API

Read `references/railway_api.md` for the full GraphQL API reference. Quick summary:

```python
import requests

TOKEN = "your-railway-api-token"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
API = "https://backboard.railway.com/graphql/v2"

def gql(query, variables=None):
    r = requests.post(API, json={"query": query, "variables": variables}, headers=HEADERS)
    return r.json()

# Get workspace ID
me = gql("{ me { workspaces { edges { node { id name } } } } }")
workspace_id = me["data"]["me"]["workspaces"]["edges"][0]["node"]["id"]

# Create project
project = gql("""
  mutation($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      id
      defaultEnvironment { id }
    }
  }
""", {"input": {"name": "my-app", "workspaceId": workspace_id}})

project_id = project["data"]["projectCreate"]["id"]
env_id = project["data"]["projectCreate"]["defaultEnvironment"]["id"]
```

### Step 2 — Create Service from GitHub

```python
service = gql("""
  mutation($input: ServiceCreateInput!) {
    serviceCreate(input: $input) { id }
  }
""", {"input": {
  "projectId": project_id,
  "name": "web",
  "source": {"repo": "owner/repo-name"}
}})

service_id = service["data"]["serviceCreate"]["id"]
```

### Step 3 — Set Environment Variables

Use `serviceVariablesBulkUpsert` for efficiency:

```python
variables = [
  {"name": "NODE_ENV", "value": "production"},
  {"name": "PORT", "value": "3000"},
  {"name": "DATABASE_URL", "value": "postgresql://..."},
  # ... all other vars
]

gql("""
  mutation($serviceId: String!, $environmentId: String!, $variables: [VariableInput!]!) {
    serviceVariablesBulkUpsert(serviceId: $serviceId, environmentId: $environmentId, variables: $variables)
  }
""", {"serviceId": service_id, "environmentId": env_id, "variables": variables})
```

### Step 4 — Add Custom Domain

```python
domain = gql("""
  mutation($input: CustomDomainCreateInput!) {
    customDomainCreate(input: $input) {
      id
      domain
    }
  }
""", {"input": {
  "domain": "talk-to-my-lawyer.com",
  "serviceId": service_id,
  "environmentId": env_id,
  "targetPort": 3000
}})
```

**Critical:** Always set `targetPort` when creating a custom domain. A null `targetPort` causes 404 errors even when the deployment is healthy.

### Step 5 — Fix targetPort on Existing Domain (404 Fix)

If a custom domain returns 404 despite a healthy deployment, the `targetPort` is likely null:

**Check current targetPort:**

```python
domains = gql("""
  { domains(projectId: $pid, serviceId: $sid, environmentId: $eid) {
    customDomains { id domain targetPort }
  }}
""", {"pid": project_id, "sid": service_id, "eid": env_id})
```

**Fix it:**

```python
gql("""
  mutation {
    customDomainUpdate(environmentId: $eid, id: $did, targetPort: 3000)
  }
""", {"eid": env_id, "did": domain_id})
```

### Step 6 — Trigger Deployment

```python
gql("""
  mutation($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
  }
""", {"serviceId": service_id, "environmentId": env_id})
```

### Step 7 — Monitor Deployment

```python
status = gql("""
  { deployments(input: { serviceId: $sid, environmentId: $eid }, first: 1) {
    edges { node { id status createdAt } }
  }}
""", {"sid": service_id, "eid": env_id})
```

**Status values:** `BUILDING`, `DEPLOYING`, `SUCCESS`, `FAILED`, `CRASHED`

---

## Custom Domain + Cloudflare Setup

| Setting | Value |
|---------|-------|
| DNS Record Type | CNAME |
| Root domain (@) | abc123.up.railway.app |
| Proxy Status | Orange cloud (Proxied) is fine |
| SSL/TLS Mode | Full (NOT Full Strict, NOT Flexible) |
| Universal SSL | Enabled |

**Common 404 causes with Cloudflare:**

1. `targetPort` is null on the Railway custom domain — fix with `customDomainUpdate`
2. SSL set to "Flexible" — causes redirect loops; set to "Full"
3. Domain added to Railway but DNS not yet propagated — wait up to 5 minutes

---

## Drizzle ORM Migrations on Railway

Run migrations as a `preDeployCommand` in railway.toml so they execute before the new container starts:

```toml
[deploy]
preDeployCommand = ["pnpm", "run", "db:push"]
startCommand = "node dist/index.js"
```

Or run them as a one-off job via Railway's API before triggering the main deployment.

**Critical:** The `DATABASE_URL` must use the **connection pooler URL** for Supabase (port 6543), not the direct connection (port 5432), to avoid connection limit issues.

---

## MCP Server Usage

The Railway MCP server (railway-mcp-server) provides tools for managing Railway resources. List tools with:

```bash
manus-mcp-cli tool list --server railway-mcp-server
```

**Key tools:** `create-project`, `create-service`, `list-services`, `get-service-info`, `create-deployment`, `get-deployment-logs`, `list-variables`, `upsert-variables`, `create-domain`, `get-domain-status`, `restart-service`

When MCP tools are unavailable or return errors, fall back to the Railway GraphQL API directly (see `references/railway_api.md`).

---

## Common Crash Patterns

| Error | Cause | Fix |
|-------|-------|-----|
| ERR_MODULE_NOT_FOUND: @tailwindcss/vite | esbuild bundled vite.config.ts into server | Add `--external:@tailwindcss/vite --external:vite` to esbuild command; use variable path for dynamic import |
| ERR_MODULE_NOT_FOUND: @vitejs/plugin-react | Same as above | Same fix |
| HTTP 404 on custom domain | targetPort is null | Run `customDomainUpdate` with `targetPort: 3000` |
| App starts but crashes immediately | findAvailablePort scanning fails | Use `process.env.PORT` directly without scanning |
| Build succeeds but container exits | NODE_ENV not set to production | Set `ENV NODE_ENV=production` in Dockerfile production stage |
| Migrations fail on deploy | Direct Supabase connection (port 5432) | Use pooler URL (port 6543) in DATABASE_URL |

---

## References

* `references/railway_api.md` — Full Railway GraphQL API reference with all mutations and queries
* `templates/Dockerfile` — Production-ready multi-stage Dockerfile for TTML stack
* `templates/railway.toml` — Canonical railway.toml configuration
* `scripts/deploy.py` — Full deployment automation script (create project → service → vars → domain → deploy)
