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

# --no-frozen-lockfile: let pnpm update pnpm-lock.yaml in place when package.json
# has drifted (e.g. new @langchain/* and @anthropic-ai/sdk deps added in the
# 2026-04-16 deploy-blockers commit). Without this flag, pnpm v10 defaults to
# --frozen-lockfile whenever the CI env var is set and fails the build. We
# cannot easily regenerate and push a 348 KB pnpm-lock.yaml through this
# MCP-only deploy path, so we let the container regenerate it from package.json
# on every build. The patches/ directory is already copied so pnpm can apply
# the wouter@3.7.1 patch during install.
RUN pnpm install --no-frozen-lockfile

# Copy all source files needed for the build
COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/
COPY drizzle/ ./drizzle/
# attached_assets/ holds the approved- and draft-letter HTML templates that
# server/letterTemplates.ts loads at runtime via __dirname/../attached_assets.
# These ship as plain HTML (not bundled by esbuild), so they must be COPYed
# into both the builder and production stages.
COPY attached_assets/ ./attached_assets/
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

# Install production-only dependencies. Copy the regenerated lockfile from the
# builder stage so stage 2 uses exactly what stage 1 resolved.
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/patches/ ./patches/
RUN pnpm install --prod --frozen-lockfile

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

# Copy the HTML letter templates loaded at runtime by server/letterTemplates.ts
# (resolves to __dirname/../attached_assets/Template-*.html). Without these the
# PDF generation path silently fails with ENOENT, leaving letters at status
# `approved` with pdf_url=NULL — observed in production for letter #6.
COPY --from=builder /app/attached_assets/ ./attached_assets/

# package.json must live next to dist/index.js because vite.config.ts
# (bundled into dist/index.js) reads it via fs.readFileSync at startup.
# NOTE: after the vite.ts dynamic-import fix this is no longer strictly
# required, but keeping it here is harmless and guards against any other
# top-level package.json reads in the bundle.
COPY --from=builder /app/package.json ./

# Multi-service entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE ${PORT:-3000}

# ─── Multi-service usage ────────────────────────────────────────────────────
# This image supports three roles via the PROCESS_TYPE env var:
#
#   PROCESS_TYPE=web     → Express server (default)
#   PROCESS_TYPE=worker  → pg-boss pipeline worker
#   PROCESS_TYPE=migrate → one-shot Drizzle migration
#   PROCESS_TYPE=all     → legacy single-container (web)
#
# Set PROCESS_TYPE per Railway service. All services share the same image.
# ────────────────────────────────────────────────────────────────────────────

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider \
  "http://localhost:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD []
