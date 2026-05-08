#!/bin/bash
# Commit-and-Check: Save changes, commit, and run all validation checks
# Usage: ./scripts/commit-and-check.sh "Commit message here"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

COMMIT_MSG="${1:-WIP}"

# Use Node 22 if available
if [ -f "/tmp/node-v22.14.0-linux-x64/bin/node" ]; then
  export PATH="/tmp/node-v22.14.0-linux-x64/bin:$PATH"
fi

echo "=== TTML Commit + Check ==="
echo "Node: $(node --version 2>/dev/null || echo 'N/A')"
echo "Commit: $COMMIT_MSG"
echo ""

# 1. Check git status
echo "[1/5] Git status..."
git add -A
git status --short

# 2. Commit
echo ""
echo "[2/5] Committing..."
if git diff --cached --quiet; then
  echo "  ℹ️  No changes to commit"
else
  git commit -m "$COMMIT_MSG"
  echo "  ✅ Committed: $COMMIT_MSG"
fi

# 3. TypeScript check (best effort - requires node_modules)
echo ""
echo "[3/5] TypeScript check (pnpm check)..."
if command -v pnpm &> /dev/null; then
  if pnpm check 2>&1; then
    echo "  ✅ TypeScript check passed"
  else
    echo "  ❌ TypeScript check FAILED (review errors above)"
    echo "  Tip: Run 'pnpm install' first if node_modules is missing"
    exit 1
  fi
else
  echo "  ⚠️  pnpm not available — skipping TypeScript check"
fi

# 4. Tests
echo ""
echo "[4/5] Running tests (pnpm test)..."
if command -v pnpm &> /dev/null; then
  if pnpm test 2>&1; then
    echo "  ✅ Tests passed"
  else
    echo "  ❌ Tests FAILED (review errors above)"
    exit 1
  fi
else
  echo "  ⚠️  pnpm not available — skipping tests"
fi

# 5. Build
echo ""
echo "[5/5] Production build (pnpm build)..."
if command -v pnpm &> /dev/null; then
  if pnpm build 2>&1; then
    echo "  ✅ Build succeeded"
  else
    echo "  ❌ Build FAILED (review errors above)"
    exit 1
  fi
else
  echo "  ⚠️  pnpm not available — skipping build"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ ALL CHECKS COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
