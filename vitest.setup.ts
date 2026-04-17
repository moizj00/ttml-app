/**
 * vitest.setup.ts
 *
 * Runs before every test file (via vitest.config.ts `setupFiles`).
 * Stubs environment variables that are required at runtime so that
 * tests can import server modules without crashing.
 *
 * NOTE: These are test-only stubs — they do NOT grant any real permissions.
 * The values are intentionally fake/deterministic so tests remain hermetic.
 */

// ── Admin 2FA ─────────────────────────────────────────────────────────────────
// admin2fa.ts resolves its HMAC secret lazily (inside signAdmin2FAToken /
// verifyAdmin2FAToken) rather than at module-load time. We still stub the
// env var here so that any test that exercises those functions gets a
// predictable, non-empty secret.
// We deliberately do NOT stub SUPABASE_SERVICE_ROLE_KEY so that the live
// integration test (supabase-auth.test.ts) continues to skip itself when
// real credentials are absent.
if (!process.env.ADMIN_2FA_SECRET && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.ADMIN_2FA_SECRET = "test-admin-2fa-secret-stub-for-vitest-do-not-use-in-production";
}

// ── Supabase (prevents DB connection attempts in unit tests) ──────────────────
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = "https://test.supabase.co";
}
if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = "test-anon-key-stub";
}
// NOTE: SUPABASE_SERVICE_ROLE_KEY is intentionally NOT stubbed here.
// supabase-auth.test.ts uses describe.skipIf(!SUPABASE_CONFIGURED) which
// checks for a real service role key — stubbing it would cause those live
// integration tests to run with fake credentials and fail.

// ── Database ──────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

// ── Redis / BullMQ (prevents real connection in unit tests) ───────────────────
if (!process.env.UPSTASH_REDIS_URL) {
  process.env.UPSTASH_REDIS_URL = "redis://localhost:6379";
}

// ── App URL ───────────────────────────────────────────────────────────────────
if (!process.env.APP_URL) {
  process.env.APP_URL = "http://localhost:5000";
}
