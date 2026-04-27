/**
 * Normalize Supabase connection strings for Railway's IPv4-only network.
 *
 * Railway's container network can't reach Supabase's direct DB host
 * (`db.<PROJECT_REF>.supabase.co`) — that hostname has only AAAA records, no
 * A records, so any IPv4-only egress fails with `ENETUNREACH` for IPv6
 * addresses or `ENODATA` for IPv4 lookups.
 *
 * Worse, Railway's Supabase integration / reference-variable sync
 * intermittently rewrites `DATABASE_URL`, `SUPABASE_DIRECT_URL`, and
 * `SUPABASE_DATABASE_URL` from the pooler form back to the direct form (e.g.
 * after a Supabase password rotation). The web service silently 401s on
 * every authenticated request and the worker crash-loops on pg-boss start —
 * exactly what we observed in production.
 *
 * `normalizeSupabaseUrlForPooler` is a defensive layer: at every connection
 * attempt, if the URL is in the IPv6-only direct form, rewrite it to the
 * pooler form (`<region>.pooler.supabase.com:5432`) with the project-ref
 * prefixed username (`postgres.<PROJECT_REF>`). The session pooler at port
 * 5432 supports `LISTEN/NOTIFY` (which pg-boss requires) and is
 * IPv4-friendly.
 *
 * The pooler region is account/project-specific. Set `SUPABASE_POOLER_HOST`
 * to override the default.
 */

import { createLogger } from "../logger";

const logger = createLogger({ module: "SupabaseUrl" });

/**
 * If the connection string points at the IPv6-only Supabase direct host,
 * rewrite it to the pooler form. Idempotent — pooler-form URLs are returned
 * unchanged. Returns the original string if parsing fails.
 */
export function normalizeSupabaseUrlForPooler(rawUrl: string): string {
  const POOLER_HOST =
    process.env.SUPABASE_POOLER_HOST ||
    "aws-1-us-west-2.pooler.supabase.com";

  try {
    const url = new URL(rawUrl);
    const directMatch = url.hostname.match(
      /^db\.([a-z0-9]+)\.supabase\.co$/i
    );
    // Only rewrite when:
    //   1. hostname matches the IPv6-only direct host pattern, AND
    //   2. username is the bare `postgres` (no project-ref prefix).
    // If the username is already `postgres.<PROJECT_REF>`, the URL is
    // pooler-form already and we leave it alone.
    if (directMatch && url.username === "postgres") {
      const projectRef = directMatch[1];
      url.hostname = POOLER_HOST;
      url.username = `postgres.${projectRef}`;
      // Strip ?sslmode=require — node-postgres treats it as 'verify-full',
      // which fails on Supabase's CA chain. Callers set
      // `{ ssl: { rejectUnauthorized: false } }` or `ssl: 'require'` (the
      // postgres-js form) on their pool instead.
      url.searchParams.delete("sslmode");
      const masked = url
        .toString()
        .replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
      logger.warn(
        { rewrittenTo: masked, projectRef },
        "[SupabaseUrl] Auto-rewriting direct Supabase URL (db.*.supabase.co) to pooler form. Railway is IPv4-only; the direct host is IPv6-only and unreachable. Set SUPABASE_POOLER_HOST to override the default region."
      );
      return url.toString();
    }
  } catch (err) {
    logger.warn(
      { err },
      "[SupabaseUrl] Failed to parse connection string for pooler rewrite — using as-is"
    );
  }
  return rawUrl;
}
