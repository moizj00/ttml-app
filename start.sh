#!/bin/sh
# start.sh — Production startup script.
# 1. Run Drizzle migrations to ensure the DB schema is up-to-date.
# 2. Start the pipeline worker in the background (consumes pg-boss jobs).
# 3. Start the Express server in the background and wait on it (captures exit code).
#
# migrate.js exits with code 0 on success, non-zero on failure.
# If migrations fail, neither the worker nor the server starts (fail-fast).
#
# --dns-result-order=ipv4first: Railway's network cannot reach Supabase's
# shared pooler via IPv6 (ENETUNREACH). This forces Node to prefer IPv4
# addresses when resolving DNS, which is the only way to connect from Railway.

set -e

echo "[start.sh] Running database migrations..."
node --dns-result-order=ipv4first dist/migrate.js
echo "[start.sh] Migrations complete."

# ── Start the pipeline worker (pg-boss consumer) in the background ──
# The worker registers boss.work() to consume jobs from the "pipeline" queue.
# Without this process, enqueued jobs are never picked up.
echo "[start.sh] Starting pipeline worker (background)..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js &
WORKER_PID=$!
echo "[start.sh] Pipeline worker started (PID=$WORKER_PID)"

# ── Start the Express server in the background ──
echo "[start.sh] Starting Express server..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js &
SERVER_PID=$!
echo "[start.sh] Express server started (PID=$SERVER_PID)"

# On SIGTERM/SIGINT/EXIT, forward the signal to both child processes so they
# shut down cleanly. EXIT trap ensures cleanup runs even on set -e failures.
cleanup() {
  echo "[start.sh] Shutdown signal received — stopping server (PID: $SERVER_PID) and worker (PID: $WORKER_PID)..."
  kill "$SERVER_PID" 2>/dev/null || true
  kill "$WORKER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  wait "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT SIGTERM SIGINT

# Wait for the server; capture its exit code safely past set -e.
# Using `wait pid || EXIT_CODE=$?` avoids set -e terminating the script when
# the server exits non-zero (e.g. uncaught exception, OOM).
wait "$SERVER_PID" || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}
echo "[start.sh] Express server exited (code=$EXIT_CODE)"
exit "$EXIT_CODE"
