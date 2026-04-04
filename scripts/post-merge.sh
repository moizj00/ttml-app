#!/bin/bash
set -e
pnpm install --no-frozen-lockfile
pnpm run db:push || true
