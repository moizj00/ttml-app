#!/bin/sh
# docker-entrypoint.sh — Multi-service dispatcher.
#
# Set PROCESS_TYPE env var per Railway service:
#   web     → Express server (default)
#   worker  → pg-boss pipeline worker
#   migrate → one-shot Drizzle migration
#
# This replaces per-service startCommand overrides that require
# Railway dashboard configuration.

set -e

PROCESS_TYPE="${PROCESS_TYPE:-web}"

case "$PROCESS_TYPE" in
  web)
    echo "[entrypoint] Starting web server..."
    exec node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js
    ;;
  worker)
    echo "[entrypoint] Starting pipeline worker..."
    exec node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js
    ;;
  migrate)
    echo "[entrypoint] Running database migrations (one-shot)..."
    # Run migration and capture exit code
    node --dns-result-order=ipv4first dist/migrate.js
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
      echo "[entrypoint] Migrations completed successfully."
    else
      echo "[entrypoint] Migrations failed with exit code $EXIT_CODE."
    fi
    exit $EXIT_CODE
    ;;
  all)
    echo "[entrypoint] Starting all (legacy single-container mode)..."
    echo "[entrypoint] Running database migrations..."
    node --dns-result-order=ipv4first dist/migrate.js
    echo "[entrypoint] Starting pipeline worker (background)..."
    node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js &
    echo "[entrypoint] Starting Express server..."
    exec node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js
    ;;
  *)
    echo "[entrypoint] Unknown PROCESS_TYPE: $PROCESS_TYPE"
    echo "Valid values: web, worker, migrate, all"
    exit 1
    ;;
esac
