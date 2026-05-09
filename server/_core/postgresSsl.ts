import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../logger";

const logger = createLogger({ module: "PostgresSSL" });

const DEFAULT_CA_PATHS = [
  "certs/prod-ca-2021.crt",
  "certs/supabase-ca.crt",
  "certs/rds-global-bundle.pem",
];

function findCertFile(explicitPath?: string): string | undefined {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) return explicitPath;
    logger.warn({ path: explicitPath }, "[PostgresSSL] Explicit CA path not found");
    return undefined;
  }

  const envPath = process.env.SUPABASE_CA_CERT_PATH || process.env.PGSSLROOTCERT;
  if (envPath && fs.existsSync(envPath)) return envPath;

  for (const p of DEFAULT_CA_PATHS) {
    if (fs.existsSync(p)) return p;
  }

  return undefined;
}

export type PostgresSslConfig =
  | false
  | "require"
  | { ca: string; rejectUnauthorized: boolean };

/**
 * Returns SSL configuration for postgres-js and node-postgres clients.
 *
 * Priority:
 *   1. explicitPath argument
 *   2. SUPABASE_CA_CERT_PATH / PGSSLROOTCERT env vars
 *   3. Built-in defaults (certs/prod-ca-2021.crt, certs/supabase-ca.crt, certs/rds-global-bundle.pem)
 *
 * When a certificate file is found, returns `{ ca, rejectUnauthorized: true }`
 * which enables TLS with full CA verification (verify-full behavior).
 *
 * When no certificate is found and the database URL appears to need SSL
 * (Supabase, Neon, AWS, etc.), falls back to `"require"` (encrypt without
 * verifying the server certificate).
 *
 * For local / non-SSL connections, returns `false`.
 */
export function getPostgresSsl(
  dbUrl?: string,
  explicitCaPath?: string
): PostgresSslConfig {
  const certPath = findCertFile(explicitCaPath);

  if (certPath) {
    try {
      const ca = fs.readFileSync(path.resolve(certPath), "utf8");
      logger.info({ path: certPath }, "[PostgresSSL] Using CA certificate for verify-full");
      return { ca, rejectUnauthorized: true };
    } catch (err) {
      logger.warn({ err, path: certPath }, "[PostgresSSL] Failed to read CA cert");
    }
  }

  if (!dbUrl) {
    return false;
  }

  const needsEncryption =
    dbUrl.includes("supabase.co") ||
    dbUrl.includes("supabase.com") ||
    dbUrl.includes("amazonaws.com") ||
    dbUrl.includes("neon.tech") ||
    dbUrl.includes("sslmode=require");

  if (needsEncryption) {
    logger.warn(
      "[PostgresSSL] No CA cert found — falling back to ssl=require (encryption without verification)"
    );
    return "require";
  }

  return false;
}
