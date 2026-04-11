#!/bin/sh
set -e

echo "[start.sh] Running database migrations..."
node dist/migrate.js

echo "[start.sh] Starting server..."
exec node --import ./dist/instrument.js dist/index.js
