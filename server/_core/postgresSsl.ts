import fs from "node:fs";
import path from "node:path";
import type { ConnectionOptions } from "node:tls";

type VerifiedSslConfig = ConnectionOptions & {
  ca: string;
  rejectUnauthorized: true;
};

type UnverifiedEncryptedSslConfig = {
  rejectUnauthorized: false;
};

export type PostgresJsSslConfig = false | "require" | VerifiedSslConfig;
export type NodePostgresSslConfig =
  | false
  | VerifiedSslConfig
  | UnverifiedEncryptedSslConfig;

export function needsPostgresSsl(url: string | null | undefined): boolean {
  if (!url) return false;

  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes("supabase.co") ||
    lowerUrl.includes("supabase.com") ||
    lowerUrl.includes("amazonaws.com") ||
    lowerUrl.includes("neon.tech")
  ) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const sslMode = parsed.searchParams.get("sslmode");
    return Boolean(sslMode && sslMode !== "disable");
  } catch {
    return lowerUrl.includes("sslmode=require");
  }
}

export function getSupabaseCaCertPath(): string {
  return (
    process.env.SUPABASE_CA_CERT_PATH ||
    process.env.PGSSLROOTCERT ||
    path.resolve(process.cwd(), "certs", "prod-ca-2021.crt")
  );
}

export function loadSupabaseCaCertificate(): string | null {
  const certPath = getSupabaseCaCertPath();
  if (!fs.existsSync(certPath)) return null;
  return fs.readFileSync(certPath, "utf8");
}

export function buildPostgresSslConfig(
  url: string | null | undefined
): PostgresJsSslConfig {
  if (!needsPostgresSsl(url)) return false;

  const ca = loadSupabaseCaCertificate();
  if (!ca) return "require";

  return {
    ca,
    rejectUnauthorized: true,
  };
}

export function buildNodePostgresSslConfig(
  url: string | null | undefined
): NodePostgresSslConfig {
  if (!needsPostgresSsl(url)) return false;

  const ca = loadSupabaseCaCertificate();
  if (!ca) {
    return { rejectUnauthorized: false };
  }

  return {
    ca,
    rejectUnauthorized: true,
  };
}
