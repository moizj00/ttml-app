#!/bin/bash
set -e

# TTML Dev Container Entrypoint
# Runs migrate, app, and worker as separate processes in one container

echo "🚀 Starting TTML Dev Container..."

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Run migrations
echo "🔄 Running database migrations..."
node dist/migrate.js || true

# Start app and worker in parallel
echo "✨ Starting app and worker..."

# Build first (needed for dist/index.js and dist/worker.js)
pnpm build

# Start app in background
echo "Starting Express app on port ${PORT:-3000}..."
node --import ./dist/instrument.js dist/index.js &
APP_PID=$!

# Start worker in background
echo "Starting pipeline worker..."
node --import ./dist/instrument.js dist/worker.js &
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
