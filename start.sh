#!/bin/sh
# start.sh — Production startup script.
# 1. Run Drizzle migrations to ensure the DB schema is up-to-date.
# 2. Start the pipeline worker (pg-boss consumer) in the background.
# 3. Start the Express server with Sentry instrumentation (foreground).
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

# ── Trap signals to gracefully shut down both processes ──
cleanup() {
  echo "[start.sh] Shutting down..."
  kill $WORKER_PID 2>/dev/null || true
  kill $SERVER_PID 2>/dev/null || true
  wait $WORKER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

# ── Start the Express server (foreground) ──
echo "[start.sh] Starting Express server..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js &
SERVER_PID=$!
echo "[start.sh] Express server started (PID=$SERVER_PID)"

# ── Wait for either process to exit ──
# If either the server or worker dies, we want to know about it.
# Railway will restart the container based on restartPolicyType.
wait -n $WORKER_PID $SERVER_PID 2>/dev/null || wait $WORKER_PID $SERVER_PID 2>/dev/null || true
EXIT_CODE=$?
echo "[start.sh] A process exited with code $EXIT_CODE — shutting down all processes"
cleanup
