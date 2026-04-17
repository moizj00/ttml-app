/**
 * Tests for the origin allowlist in getOriginUrl.
 *
 * These tests exercise the *default* allowlist (canonical hosts only, no env
 * override). The env-driven side of the allowlist is tested in a separate file
 * (helpers.envAllowlist.test.ts) because ALLOWED_ORIGIN_HOSTS is read once at
 * module load and frozen into a Set, so each env-variant needs its own process.
 */
import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { getOriginUrl } from "./helpers";

const CANONICAL = "https://www.talk-to-my-lawyer.com";

function makeReq(headers: Record<string, string | string[] | undefined>): Request {
  // Only the `headers` field of Request is read by getOriginUrl.
  return { headers } as unknown as Request;
}

describe("getOriginUrl — default allowlist", () => {
  describe("canonical hosts", () => {
    it("accepts origin header for www.talk-to-my-lawyer.com", () => {
      const req = makeReq({ origin: "https://www.talk-to-my-lawyer.com" });
      expect(getOriginUrl(req)).toBe("https://www.talk-to-my-lawyer.com");
    });

    it("accepts origin header for apex talk-to-my-lawyer.com", () => {
      const req = makeReq({ origin: "https://talk-to-my-lawyer.com" });
      expect(getOriginUrl(req)).toBe("https://talk-to-my-lawyer.com");
    });

    it("is case-insensitive on host matching", () => {
      const req = makeReq({ origin: "https://WWW.Talk-To-My-Lawyer.COM" });
      // The origin string is returned verbatim, but the check itself passes.
      expect(getOriginUrl(req)).toBe("https://WWW.Talk-To-My-Lawyer.COM");
    });

    it("accepts x-forwarded-host for canonical", () => {
      const req = makeReq({ "x-forwarded-host": "www.talk-to-my-lawyer.com" });
      expect(getOriginUrl(req)).toBe("https://www.talk-to-my-lawyer.com");
    });

    it("accepts plain host header for canonical", () => {
      const req = makeReq({ host: "talk-to-my-lawyer.com" });
      expect(getOriginUrl(req)).toBe("https://talk-to-my-lawyer.com");
    });
  });

  describe("previously-wildcarded hosts are now REJECTED", () => {
    it("rejects arbitrary *.railway.app origin", () => {
      const req = makeReq({ origin: "https://evil-actor.railway.app" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("rejects arbitrary *.railway.app x-forwarded-host", () => {
      const req = makeReq({ "x-forwarded-host": "someone-else.railway.app" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("rejects *.replit.dev origin", () => {
      const req = makeReq({ origin: "https://phish.replit.dev" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("rejects triple-segment janeway.replit.dev origin", () => {
      const req = makeReq({ origin: "https://aaa-bbb-ccc.janeway.replit.dev" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });
  });

  describe("header handling", () => {
    it("falls back to canonical when Origin header is malformed", () => {
      const req = makeReq({ origin: "not a url" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("rejects localhost origin and falls through to x-forwarded-host", () => {
      const req = makeReq({
        origin: "http://localhost:3000",
        "x-forwarded-host": "www.talk-to-my-lawyer.com",
      });
      expect(getOriginUrl(req)).toBe("https://www.talk-to-my-lawyer.com");
    });

    it("rejects localhost in x-forwarded-host", () => {
      const req = makeReq({ "x-forwarded-host": "localhost:3000" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("picks the first entry when x-forwarded-host is an array", () => {
      const req = makeReq({
        "x-forwarded-host": ["www.talk-to-my-lawyer.com", "attacker.com"],
      });
      expect(getOriginUrl(req)).toBe("https://www.talk-to-my-lawyer.com");
    });

    it("rejects array whose first entry is not allowlisted", () => {
      const req = makeReq({
        "x-forwarded-host": ["attacker.com", "www.talk-to-my-lawyer.com"],
      });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("returns canonical when no origin-like headers are present", () => {
      const req = makeReq({});
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("rejects unrelated third-party origin", () => {
      const req = makeReq({ origin: "https://evil.com" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });

    it("rejects origin whose host happens to CONTAIN an allowed host", () => {
      // Exact-match only — no substring leeway.
      const req = makeReq({ origin: "https://www.talk-to-my-lawyer.com.evil.com" });
      expect(getOriginUrl(req)).toBe(CANONICAL);
    });
  });
});
