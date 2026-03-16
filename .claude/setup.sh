#!/bin/bash
set -e

echo "=== Talk-to-My-Lawyer: Claude Code Setup ==="

# ── 1. Enable corepack + install correct pnpm version ──────────────────────
echo "[1/4] Enabling corepack and pnpm@10.4.1..."
corepack enable
corepack prepare pnpm@10.4.1 --activate

# ── 2. Install dependencies ─────────────────────────────────────────────────
echo "[2/4] Installing dependencies with pnpm..."
pnpm install

# ── 3. Set up .env if missing ───────────────────────────────────────────────
echo "[3/4] Checking .env file..."
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "  → .env created from .env.example (fill in your secrets)"
  else
    touch .env
    echo "  → Empty .env created — add your secrets before running the app"
  fi
else
  echo "  → .env already exists, skipping"
fi

# ── 4. TypeScript check (non-blocking) ─────────────────────────────────────
echo "[4/4] Running TypeScript check..."
pnpm run check || echo "  ⚠ TypeScript errors found — fix before committing"

echo ""
echo "✅ Setup complete. Run 'pnpm dev' to start the dev server."
