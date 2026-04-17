/**
 * Tests for the ALLOWED_ORIGIN_HOSTS environment-variable expansion.
 *
 * The allowlist Set is built once at module load time, so this file has to:
 *   1. set process.env.ALLOWED_ORIGIN_HOSTS before the first import
 *   2. use vi.resetModules() between variants to re-run the module body
 *   3. dynamically import helpers so the Set is rebuilt from the new env
 *
 * Keeping these in their own file avoids cross-contaminating the default-
 * allowlist tests in helpers.test.ts, which also import the same module.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { Request } from "express";

const CANONICAL = "https://www.talk-to-my-lawyer.com";

function makeReq(headers: Record<string, string | string[] | undefined>): Request {
  return { headers } as unknown as Request;
}

const originalEnv = process.env.ALLOWED_ORIGIN_HOSTS;

async function loadHelpersWithEnv(value: string | undefined) {
  if (value === undefined) {
    delete process.env.ALLOWED_ORIGIN_HOSTS;
  } else {
    process.env.ALLOWED_ORIGIN_HOSTS = value;
  }
  vi.resetModules();
  return import("./helpers");
}

describe("getOriginUrl — ALLOWED_ORIGIN_HOSTS env expansion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.ALLOWED_ORIGIN_HOSTS;
    } else {
      process.env.ALLOWED_ORIGIN_HOSTS = originalEnv;
    }
    vi.resetModules();
  });

  it("accepts a host supplied via ALLOWED_ORIGIN_HOSTS", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv("ttml-app.up.railway.app");
    const req = makeReq({ origin: "https://ttml-app.up.railway.app" });
    expect(getOriginUrl(req)).toBe("https://ttml-app.up.railway.app");
  });

  it("accepts multiple comma-separated hosts", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv(
      "ttml-app.up.railway.app,ai-worker.up.railway.app"
    );
    const reqA = makeReq({ origin: "https://ttml-app.up.railway.app" });
    const reqB = makeReq({ origin: "https://ai-worker.up.railway.app" });
    expect(getOriginUrl(reqA)).toBe("https://ttml-app.up.railway.app");
    expect(getOriginUrl(reqB)).toBe("https://ai-worker.up.railway.app");
  });

  it("trims whitespace and ignores empty entries", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv(
      " ttml-app.up.railway.app , ,  preview.example.com  "
    );
    const reqA = makeReq({ origin: "https://ttml-app.up.railway.app" });
    const reqB = makeReq({ origin: "https://preview.example.com" });
    expect(getOriginUrl(reqA)).toBe("https://ttml-app.up.railway.app");
    expect(getOriginUrl(reqB)).toBe("https://preview.example.com");
  });

  it("is case-insensitive when comparing against env-supplied hosts", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv("PREVIEW.EXAMPLE.COM");
    const req = makeReq({ origin: "https://preview.example.com" });
    expect(getOriginUrl(req)).toBe("https://preview.example.com");
  });

  it("still rejects a NON-allowlisted host even when env is set", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv("ttml-app.up.railway.app");
    const req = makeReq({ origin: "https://evil.railway.app" });
    expect(getOriginUrl(req)).toBe(CANONICAL);
  });

  it("canonical hosts still accepted alongside env-supplied ones", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv("preview.example.com");
    const req = makeReq({ origin: "https://www.talk-to-my-lawyer.com" });
    expect(getOriginUrl(req)).toBe("https://www.talk-to-my-lawyer.com");
  });

  it("empty env var leaves canonical-only allowlist", async () => {
    const { getOriginUrl } = await loadHelpersWithEnv("");
    const canonicalReq = makeReq({ origin: "https://www.talk-to-my-lawyer.com" });
    const railwayReq = makeReq({ origin: "https://ttml-app.up.railway.app" });
    expect(getOriginUrl(canonicalReq)).toBe("https://www.talk-to-my-lawyer.com");
    expect(getOriginUrl(railwayReq)).toBe(CANONICAL);
  });
});
