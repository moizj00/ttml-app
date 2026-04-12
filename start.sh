#!/bin/sh
# start.sh — Production startup script.
# 1. Run Drizzle migrations to ensure the DB schema is up-to-date.
# 2. Start the pipeline worker in the background (consumes pg-boss jobs).
# 3. Start the Express server in the foreground (Railway monitors this process).
#
# migrate.js exits with code 0 on success, non-zero on failure.
# If migrations fail, neither process starts (fail-fast).
#
# --dns-result-order=ipv4first: Railway's network cannot reach Supabase's
# shared pooler via IPv6 (ENETUNREACH). This forces Node to prefer IPv4
# addresses when resolving DNS, which is the only way to connect from Railway.

set -e

echo "[start.sh] Running database migrations..."
node --dns-result-order=ipv4first dist/migrate.js

echo "[start.sh] Migrations complete. Starting pipeline worker in background..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js &
WORKER_PID=$!
echo "[start.sh] Worker started (PID: $WORKER_PID)"

# On SIGTERM/SIGINT, kill the worker so it shuts down cleanly alongside the server
cleanup() {
  echo "[start.sh] Shutdown signal received — stopping worker (PID: $WORKER_PID)..."
  kill "$WORKER_PID" 2>/dev/null || true
}
trap cleanup TERM INT

echo "[start.sh] Starting Express server..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js
EXIT_CODE=$?

# Server exited — ensure worker is also stopped
kill "$WORKER_PID" 2>/dev/null || true
wait "$WORKER_PID" 2>/dev/null || true
exit $EXIT_CODE
