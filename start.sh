#!/bin/sh
# start.sh — Production startup script.
# 1. Run Drizzle migrations to ensure the DB schema is up-to-date.
# 2. Start the Express server with Sentry instrumentation.
#
# migrate.js exits with code 0 on success, non-zero on failure.
# If migrations fail, the server does NOT start (fail-fast).
#
# --dns-result-order=ipv4first: Railway's network cannot reach Supabase's
# shared pooler via IPv6 (ENETUNREACH). This forces Node to prefer IPv4
# addresses when resolving DNS, which is the only way to connect from Railway.

set -e

echo "[start.sh] Running database migrations..."
node --dns-result-order=ipv4first dist/migrate.js

echo "[start.sh] Migrations complete. Starting server..."
exec node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js
