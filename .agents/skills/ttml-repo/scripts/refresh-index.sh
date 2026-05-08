#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/home/tesla_laptops/ttml-app}"

if [ ! -d "$ROOT" ]; then
  echo "Repo root not found: $ROOT" >&2
  exit 1
fi

cd "$ROOT"

section() {
  printf '\n## %s\n\n' "$1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

if ! have rg; then
  echo "refresh-index.sh requires rg (ripgrep)." >&2
  exit 1
fi

echo "# TTML Live Repo Index"
echo
printf 'Generated: %s\n' "$(date -Is 2>/dev/null || date)"
printf 'Root: %s\n' "$ROOT"

section "Git"
git status --short 2>/dev/null | sed -n '1,80p' || true
git branch --show-current 2>/dev/null || true

section "Package Scripts"
node -e '
  const pkg = require("./package.json");
  for (const [name, script] of Object.entries(pkg.scripts || {})) {
    console.log(`- ${name}: ${script}`);
  }
' 2>/dev/null || sed -n '/"scripts": {/,/},/p' package.json

section "Runtime Entrypoints"
printf '%s\n' \
  "- Local dev: package.json -> pnpm dev -> server/_core/index.ts" \
  "- Web build entry: server/_core/index.ts -> dist/index.js" \
  "- Worker build entry: server/worker.ts -> dist/worker.js" \
  "- Migrate build entry: server/migrate.ts -> dist/migrate.js" \
  "- Docker dispatcher: docker-entrypoint.sh PROCESS_TYPE=web|worker|migrate|all"

section "Docker Entrypoint Process Types"
sed -n '/case "$PROCESS_TYPE"/,/esac/p' docker-entrypoint.sh 2>/dev/null | sed -n '1,120p'

section "Frontend Routes"
rg -n '<Route path=' client/src/App.tsx | sed -E 's/^[^:]+:[0-9]+:[[:space:]]*/- /' | sed -n '1,180p'

section "Frontend Pages"
find client/src/pages -maxdepth 3 -type f \( -name '*.tsx' -o -name '*.ts' \) | sort | sed -n '1,220p'

section "tRPC Router Composition"
sed -n '/export const appRouter/,/});/p' server/routers/index.ts 2>/dev/null | sed -n '1,120p'

section "tRPC Router Files"
find server/routers -maxdepth 3 -type f -name '*.ts' | sort

section "Express REST and Middleware Registrations"
rg -n 'register[A-Za-z0-9]+Route|app\.(get|post|put|patch|delete|use)|createExpressMiddleware|stripeWebhookHandler' server/_core/index.ts server/*.ts server/**/*.ts \
  | sed -n '1,220p'

section "Database Modules"
find server/db drizzle/schema -maxdepth 3 -type f -name '*.ts' | sort

section "Shared Sources"
find shared -maxdepth 3 -type f -name '*.ts' | sort

section "Pipeline Files"
find server/pipeline -maxdepth 4 -type f -name '*.ts' | sort

section "Queue and Worker References"
rg -n 'QUEUE_NAME|getBoss|pg-boss|processRunPipeline|LANGGRAPH_PIPELINE|PIPELINE_MODE|enqueue' server/queue.ts server/worker.ts server/pipeline -g '*.ts' | sed -n '1,220p'

section "Environment Access"
rg -n 'process\.env|ENV\.' server client shared -g '*.ts' -g '*.tsx' | sed -n '1,220p'

section "Status and Pricing Imports"
rg -n 'LETTER_STATUS|ALLOWED_TRANSITIONS|shared/pricing|PRICING|pricing' server client shared -g '*.ts' -g '*.tsx' | sed -n '1,220p'

section "Tests"
find server e2e -maxdepth 4 -type f \( -name '*.test.ts' -o -name '*.spec.ts' \) | sort | sed -n '1,260p'

section "Docs"
find . -maxdepth 3 -type f -name '*.md' | sort | sed -n '1,160p'
