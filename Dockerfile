# syntax=docker/dockerfile:1

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:25-alpine AS builder

WORKDIR /app

# Install pnpm via npm (avoids corepack prepare network download which OOM-kills
# in Railway's build environment — exit code 137).
RUN npm install -g pnpm@10.4.1 --no-fund --no-audit

# Install dependencies first (layer-cached unless lockfile changes)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install

# Copy all source files needed for the build
COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/
COPY drizzle/ ./drizzle/
COPY vite.config.ts tsconfig.json drizzle.config.ts components.json ./

# Build: vite builds client → dist/public, esbuild bundles server → dist/index.js
RUN pnpm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:25-alpine AS production

WORKDIR /app

# Set NODE_ENV so the server enters production mode (serveStatic, not setupVite)
ENV NODE_ENV=production

# Install pnpm via npm (same approach as builder stage — reliable, no network OOM)
RUN npm install -g pnpm@10.4.1 --no-fund --no-audit

# Install production-only dependencies
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/patches/ ./patches/
RUN pnpm install --prod

# Copy the compiled server bundle + client assets
# dist/index.js    — esbuild server bundle
# dist/migrate.js  — esbuild migration runner (executed before server start)
# dist/public/     — vite client build (index.html + assets/)
COPY --from=builder /app/dist/ ./dist/

# Copy the Drizzle migration folder so migrate.js can apply them at startup.
# The Drizzle migrator reads drizzle/meta/_journal.json and the auto-generated
# SQL files in the drizzle/ root (e.g. drizzle/0000_nervous_james_howlett.sql).
# migrate.ts resolves the path as __dirname/../drizzle (i.e. dist/../drizzle).
COPY --from=builder /app/drizzle/ ./drizzle/

# package.json must live next to dist/index.js because vite.config.ts
# (bundled into dist/index.js) reads it via fs.readFileSync at startup.
# NOTE: after the vite.ts dynamic-import fix this is no longer strictly
# required, but keeping it here is harmless and guards against any other
# top-level package.json reads in the bundle.
COPY --from=builder /app/package.json ./

# Legacy startup script: runs migrations + worker + server in one container.
# Kept for single-container platforms that want the old behavior.
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE ${PORT:-3000}

# ─── Multi-service usage ────────────────────────────────────────────────────
# This image supports three roles via different commands:
#
#   App (web server):   node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js
#   Worker (pg-boss):   node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js
#   Migrate (one-shot): node --dns-result-order=ipv4first dist/migrate.js
#
# Override CMD in docker-compose.yml, Railway service config, or K8s pod spec.
# The default CMD below starts the web server only (decoupled model).
# Use ./start.sh for the legacy single-container model (migrate + worker + web).
# ────────────────────────────────────────────────────────────────────────────

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider \
  "http://localhost:${PORT:-3000}/api/health" || exit 1

CMD ["node", "--dns-result-order=ipv4first", "--import", "./dist/instrument.js", "dist/index.js"]
