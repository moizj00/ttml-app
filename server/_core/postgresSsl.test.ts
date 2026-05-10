import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildNodePostgresSslConfig,
  buildPostgresSslConfig,
  getSupabaseCaCertPath,
} from "./postgresSsl";

const ORIGINAL_SUPABASE_CA_CERT_PATH = process.env.SUPABASE_CA_CERT_PATH;
const ORIGINAL_PGSSLROOTCERT = process.env.PGSSLROOTCERT;

afterEach(() => {
  if (ORIGINAL_SUPABASE_CA_CERT_PATH === undefined) {
    delete process.env.SUPABASE_CA_CERT_PATH;
  } else {
    process.env.SUPABASE_CA_CERT_PATH = ORIGINAL_SUPABASE_CA_CERT_PATH;
  }

  if (ORIGINAL_PGSSLROOTCERT === undefined) {
    delete process.env.PGSSLROOTCERT;
  } else {
    process.env.PGSSLROOTCERT = ORIGINAL_PGSSLROOTCERT;
  }
});

describe("Postgres SSL configuration", () => {
  it("uses the configured Supabase CA certificate for verified postgres-js SSL", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ttml-supabase-ca-"));
    const certPath = path.join(dir, "prod-ca-2021.crt");
    writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\ntest\n");
    process.env.SUPABASE_CA_CERT_PATH = certPath;
    delete process.env.PGSSLROOTCERT;

    const ssl = buildPostgresSslConfig(
      "postgresql://postgres.example:pass@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
    );

    expect(ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\ntest\n",
      rejectUnauthorized: true,
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses PGSSLROOTCERT when SUPABASE_CA_CERT_PATH is not set", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ttml-pgsslrootcert-"));
    const certPath = path.join(dir, "prod-ca-2021.crt");
    writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\npg\n");
    delete process.env.SUPABASE_CA_CERT_PATH;
    process.env.PGSSLROOTCERT = certPath;

    expect(getSupabaseCaCertPath()).toBe(certPath);
    expect(
      buildNodePostgresSslConfig(
        "postgresql://postgres.example:pass@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
      )
    ).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\npg\n",
      rejectUnauthorized: true,
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to encrypted SSL when no CA certificate is available", () => {
    process.env.SUPABASE_CA_CERT_PATH = path.join(
      tmpdir(),
      "missing-supabase-ca.crt"
    );
    delete process.env.PGSSLROOTCERT;

    expect(
      buildPostgresSslConfig(
        "postgresql://postgres.example:pass@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
      )
    ).toBe("require");
    expect(
      buildNodePostgresSslConfig(
        "postgresql://postgres.example:pass@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
      )
    ).toEqual({ rejectUnauthorized: false });
  });

  it("does not enable SSL for local non-SSL URLs", () => {
    expect(
      buildPostgresSslConfig("postgresql://postgres:postgres@localhost:5432/app")
    ).toBe(false);
    expect(
      buildNodePostgresSslConfig(
        "postgresql://postgres:postgres@localhost:5432/app"
      )
    ).toBe(false);
  });
});
