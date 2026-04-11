#!/bin/sh
# start.sh — Production startup script.
# 1. Run Drizzle migrations to ensure the DB schema is up-to-date.
# 2. Start the Express server with Sentry instrumentation.
#
# migrate.js exits with code 0 on success, non-zero on failure.
# If migrations fail, the server does NOT start (fail-fast).

set -e

echo "[start.sh] Running database migrations..."
node dist/migrate.js

echo "[start.sh] Migrations complete. Starting server..."
exec node --import ./dist/instrument.js dist/index.js
