import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { getPostgresSsl } from "./postgresSsl";

vi.mock("../logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("getPostgresSsl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUPABASE_CA_CERT_PATH;
    delete process.env.PGSSLROOTCERT;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns verify-full config when cert exists at default path", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) =>
      String(p).includes("prod-ca-2021.crt")
    );
    vi.spyOn(fs, "readFileSync").mockReturnValue("FAKE-CERT-PEM");

    const result = getPostgresSsl("postgresql://db.supabase.co:5432/postgres");

    expect(result).toEqual({ ca: "FAKE-CERT-PEM", rejectUnauthorized: true });
  });

  it("returns verify-full config when explicit path is provided", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) =>
      String(p).includes("/custom/ca.crt")
    );
    vi.spyOn(fs, "readFileSync").mockReturnValue("CUSTOM-CERT");

    const result = getPostgresSsl(
      "postgresql://db.supabase.co:5432/postgres",
      "/custom/ca.crt"
    );

    expect(result).toEqual({ ca: "CUSTOM-CERT", rejectUnauthorized: true });
  });

  it("returns verify-full config from env var when set", () => {
    process.env.SUPABASE_CA_CERT_PATH = "/env/ca.crt";
    vi.spyOn(fs, "existsSync").mockImplementation((p) =>
      String(p).includes("/env/ca.crt")
    );
    vi.spyOn(fs, "readFileSync").mockReturnValue("ENV-CERT");

    const result = getPostgresSsl("postgresql://db.supabase.co:5432/postgres");

    expect(result).toEqual({ ca: "ENV-CERT", rejectUnauthorized: true });
  });

  it("falls back to 'require' when no cert and URL needs SSL", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const result = getPostgresSsl("postgresql://db.supabase.co:5432/postgres");

    expect(result).toBe("require");
  });

  it("returns false when no cert and URL does not need SSL", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const result = getPostgresSsl("postgresql://localhost:5432/postgres");

    expect(result).toBe(false);
  });

  it("returns false when no URL and no cert", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const result = getPostgresSsl();

    expect(result).toBe(false);
  });
});
