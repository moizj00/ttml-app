#!/bin/bash
# Continuous Revalidation Loop for TTML
# Runs TypeScript check + tests on every file change
# Usage: ./scripts/revalidate.sh [watch|once]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use Node 22 if available (required by project), else fall back to system node
if [ -f "/tmp/node-v22.14.0-linux-x64/bin/node" ]; then
  export PATH="/tmp/node-v22.14.0-linux-x64/bin:$PATH"
fi

# Verify Node version
NODE_VER=$(node --version 2>/dev/null || echo "none")
echo "=== TTML Revalidation Loop ==="
echo "Node: $NODE_VER (required: >=22.12.0)"
echo "Project: $PROJECT_DIR"
echo ""

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
  echo "ERROR: pnpm not found. Install with: npm install -g pnpm@10.4.1"
  exit 1
fi

run_checks() {
  local start_time=$(date +%s)
  local status=0

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Revalidation started at $(date '+%H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. TypeScript check
  echo ""
  echo "[1/3] Running TypeScript check (tsc --noEmit)..."
  if pnpm check 2>&1; then
    echo "  ✅ TypeScript check passed"
  else
    echo "  ❌ TypeScript check FAILED"
    status=1
  fi

  # 2. Unit tests
  echo ""
  echo "[2/3] Running unit tests (vitest run)..."
  if pnpm test 2>&1; then
    echo "  ✅ Tests passed"
  else
    echo "  ❌ Tests FAILED"
    status=1
  fi

  # 3. Production build
  echo ""
  echo "[3/3] Running production build..."
  if pnpm build 2>&1; then
    echo "  ✅ Build succeeded"
  else
    echo "  ❌ Build FAILED"
    status=1
  fi

  # Summary
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ $status -eq 0 ]; then
    echo "  ✅ ALL CHECKS PASSED (${duration}s)"
  else
    echo "  ❌ SOME CHECKS FAILED (${duration}s)"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  return $status
}

# Determine mode
MODE="${1:-watch}"

if [ "$MODE" == "once" ]; then
  run_checks
  exit $?
fi

# Watch mode: run on file changes using git diff
# Fallback: run every 30 seconds
LAST_HASH=""
echo "Watch mode: checking for changes every 5s..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
  CURRENT_HASH=$(find server shared client -name "*.ts" -o -name "*.tsx" | sort | xargs md5sum 2>/dev/null | md5sum | awk '{print $1}')

  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    LAST_HASH="$CURRENT_HASH"
    run_checks || true  # Continue even on failure
  fi

  sleep 5
done
