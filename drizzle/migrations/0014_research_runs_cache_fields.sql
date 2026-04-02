-- Migration 0014: Add cacheHit and cacheKey fields to research_runs
-- Supports Cloudflare KV-based research result caching.

ALTER TABLE research_runs
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cache_key VARCHAR(256);
