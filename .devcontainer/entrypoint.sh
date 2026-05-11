#!/bin/bash
set -e

# TTML Dev Container Entrypoint
# Runs migrate, app, and worker as separate processes in one container

echo "🚀 Starting TTML Dev Container..."

# Build first (needed for dist/migrate.js, dist/index.js, and dist/worker.js)
echo "🔨 Building server..."
pnpm build

# Run migrations
echo "🔄 Running database migrations..."
node --dns-result-order=ipv4first dist/migrate.js || true

# Start app and worker in parallel
echo "✨ Starting app and worker..."

# Start app in background
echo "Starting Express app on port ${PORT:-3000}..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js &
APP_PID=$!

# Start worker in background
echo "Starting pipeline worker..."
node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js &
WORKER_PID=$!

echo "✅ All services started!"
echo "   App: http://localhost:${PORT:-3000}"
echo "   Worker: Running in background (PID: $WORKER_PID)"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Trap to kill both processes on exit
trap "kill $APP_PID $WORKER_PID 2>/dev/null; exit" SIGINT SIGTERM EXIT

# Wait for both processes
wait $APP_PID $WORKER_PID
