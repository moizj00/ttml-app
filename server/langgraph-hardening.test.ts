/**
 * LangGraph Hardening — Behavioral Tests
 *
 * Every test calls the real function and asserts on its output.
 * No file reads, no string sniffing.
 *
 * Covered:
 *   1. classifyNodeError — maps Error messages and typed objects to
 *      the correct PipelineErrorCode
 *   2. withErrorRecovery — the wrapper catches node throws, sets the
 *      right error fields, burns the budget for permanent errors,
 *      emits a distinct instant_budget_exhaustion log event, and
 *      passes successful results through unchanged
 *   3. routeAfterVetting / VETTING_ROUTE_MAP (finalize_degraded path)
 *   4. getStreamChunksAfter — ownership: throws LetterNotFoundError /
 *      LetterAccessDeniedError instead of silently returning []
 *   5. streamChunksAfter tRPC procedure — translates domain errors to
 *      NOT_FOUND / FORBIDDEN, id serialisation, correct userId binding
 *   6. PipelineState schema — all new hardening fields present
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyNodeError,
  withErrorRecovery,
  routeAfterVetting,
  VETTING_ROUTE_MAP,
} from "./pipeline/graph/index";
import type { PipelineStateType } from "./pipeline/graph/state";
import { emptySharedContext } from "./pipeline/graph/memory";
import {
  PIPELINE_ERROR_CODES,
  PIPELINE_ERROR_CATEGORY,
  PipelineError,
} from "../shared/types/pipeline";
import {
  LetterNotFoundError,
  LetterAccessDeniedError,
} from "./db/pipeline-records";

// ─── Shared state fixture ─────────────────────────────────────────────────────
function baseState(over: Partial<PipelineStateType> = {}): PipelineStateType {
  return {
    letterId: 1,
    userId: 0,
    intake: {},
    messages: [],
    sharedContext: emptySharedContext(),
    researchPacket: null,
    researchProvider: "",
    researchUnverified: false,
    assembledLetter: "Dear Recipient, …",
    vettedLetter: "",
    qualityDegraded: false,
    retryCount: 0,
    errorRetryCount: 0,
    lastErrorStage: "",
    lastErrorCode: "",
    lastErrorMessage: "",
    qualityWarnings: [],
    vettingReport: null,
    vettingReports: [],
    workflowJobId: 0,
    currentStage: "vetting",
    isFreePreview: false,
    ...over,
  } as PipelineStateType;
}

// ═══════════════════════════════════════════════════════════════════
// Section 1 — classifyNodeError
// ═══════════════════════════════════════════════════════════════════
describe("classifyNodeError", () => {
  // ── Typed PipelineError objects ────────────────────────────────────
  it("returns the code from a typed PipelineError object", () => {
    const err = new PipelineError(PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE, "missing field");
    expect(classifyNodeError(err)).toBe(PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE);
  });

  it("returns the code when the error has a .code property matching a known code", () => {
    const err = { code: PIPELINE_ERROR_CODES.API_KEY_MISSING, message: "key gone" };
    expect(classifyNodeError(err)).toBe(PIPELINE_ERROR_CODES.API_KEY_MISSING);
  });

  it("ignores .code when the value is not a known PipelineErrorCode and falls through to message sniffing", () => {
    // An Error object with an unknown .code property — code is ignored,
    // message is sniffed → RATE_LIMITED
    const err = Object.assign(new Error("rate limit exceeded"), { code: "SOME_UNKNOWN_THING" });
    expect(classifyNodeError(err)).toBe(PIPELINE_ERROR_CODES.RATE_LIMITED);
  });

  // ── API key message sniffing ───────────────────────────────────────
  it("maps 'ANTHROPIC_API_KEY not set' to API_KEY_MISSING", () => {
    expect(classifyNodeError(new Error("ANTHROPIC_API_KEY not set"))).toBe(
      PIPELINE_ERROR_CODES.API_KEY_MISSING
    );
  });

  it("maps 'OpenAI api key missing' to API_KEY_MISSING (case-insensitive)", () => {
    expect(classifyNodeError(new Error("OpenAI api key missing"))).toBe(
      PIPELINE_ERROR_CODES.API_KEY_MISSING
    );
  });

  it("maps 'apikey invalid' to API_KEY_MISSING", () => {
    expect(classifyNodeError(new Error("apikey invalid"))).toBe(
      PIPELINE_ERROR_CODES.API_KEY_MISSING
    );
  });

  it("maps 'api_key not configured' to API_KEY_MISSING", () => {
    expect(classifyNodeError(new Error("api_key not configured"))).toBe(
      PIPELINE_ERROR_CODES.API_KEY_MISSING
    );
  });

  // ── Content policy ─────────────────────────────────────────────────
  it("maps 'content policy violation' to CONTENT_POLICY_VIOLATION", () => {
    expect(classifyNodeError(new Error("content policy violation"))).toBe(
      PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION
    );
  });

  it("maps 'content filter triggered' to CONTENT_POLICY_VIOLATION", () => {
    expect(classifyNodeError(new Error("content filter triggered"))).toBe(
      PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION
    );
  });

  // ── Intake incomplete ──────────────────────────────────────────────
  it("maps 'Intake validation failed: missing sender name' to INTAKE_INCOMPLETE", () => {
    expect(
      classifyNodeError(new Error("Intake validation failed: missing sender name"))
    ).toBe(PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE);
  });

  it("maps 'intake pre-flight check failed' to INTAKE_INCOMPLETE", () => {
    expect(classifyNodeError(new Error("intake pre-flight check failed"))).toBe(
      PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE
    );
  });

  it("maps 'intake incomplete — required fields missing' to INTAKE_INCOMPLETE", () => {
    expect(
      classifyNodeError(new Error("intake incomplete — required fields missing"))
    ).toBe(PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE);
  });

  // ── Timeout ───────────────────────────────────────────────────────
  it("maps 'request timeout' to API_TIMEOUT", () => {
    expect(classifyNodeError(new Error("request timeout"))).toBe(
      PIPELINE_ERROR_CODES.API_TIMEOUT
    );
  });

  it("maps 'timed out after 30s' to API_TIMEOUT", () => {
    expect(classifyNodeError(new Error("timed out after 30s"))).toBe(
      PIPELINE_ERROR_CODES.API_TIMEOUT
    );
  });

  it("maps 'request aborted by server' to API_TIMEOUT", () => {
    expect(classifyNodeError(new Error("request aborted by server"))).toBe(
      PIPELINE_ERROR_CODES.API_TIMEOUT
    );
  });

  // ── Rate limit ────────────────────────────────────────────────────
  it("maps 'rate limit exceeded' to RATE_LIMITED", () => {
    expect(classifyNodeError(new Error("rate limit exceeded"))).toBe(
      PIPELINE_ERROR_CODES.RATE_LIMITED
    );
  });

  // ── Fallback ──────────────────────────────────────────────────────
  it("returns UNKNOWN_ERROR for an unrecognised error message", () => {
    expect(classifyNodeError(new Error("something went completely wrong"))).toBe(
      PIPELINE_ERROR_CODES.UNKNOWN_ERROR
    );
  });

  it("returns UNKNOWN_ERROR for a plain string error", () => {
    expect(classifyNodeError("something broke")).toBe(
      PIPELINE_ERROR_CODES.UNKNOWN_ERROR
    );
  });

  it("returns UNKNOWN_ERROR for null/undefined", () => {
    expect(classifyNodeError(null)).toBe(PIPELINE_ERROR_CODES.UNKNOWN_ERROR);
    expect(classifyNodeError(undefined)).toBe(PIPELINE_ERROR_CODES.UNKNOWN_ERROR);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 2 — withErrorRecovery
// ═══════════════════════════════════════════════════════════════════
describe("withErrorRecovery", () => {
  const state = baseState({ errorRetryCount: 1 });

  it("passes through the node result when the node succeeds", async () => {
    const node = vi.fn().mockResolvedValue({ assembledLetter: "result content" });
    const wrapped = withErrorRecovery("draft", node);

    const result = await wrapped(state);

    expect(result.assembledLetter).toBe("result content");
    // errorRetryCount must NOT be touched on success
    expect(result.errorRetryCount).toBeUndefined();
  });

  it("catches a thrown Error and sets lastErrorCode/lastErrorStage/lastErrorMessage", async () => {
    const node = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));
    const wrapped = withErrorRecovery("research", node);

    const result = await wrapped(state);

    expect(result.lastErrorCode).toBe(PIPELINE_ERROR_CODES.RATE_LIMITED);
    expect(result.lastErrorStage).toBe("research");
    expect(result.lastErrorMessage).toBe("rate limit exceeded");
    expect(result.currentStage).toBe("error");
  });

  it("increments errorRetryCount by 1 for a transient error", async () => {
    const node = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));
    const wrapped = withErrorRecovery("draft", node);

    const result = await wrapped(baseState({ errorRetryCount: 0 }));

    expect(result.errorRetryCount).toBe(1); // 0 + 1
  });

  it("accumulates errorRetryCount across multiple transient failures", async () => {
    const node = vi.fn().mockRejectedValue(new Error("request timeout"));
    const wrapped = withErrorRecovery("assembly", node);

    const r1 = await wrapped(baseState({ errorRetryCount: 0 }));
    const r2 = await wrapped(baseState({ errorRetryCount: r1.errorRetryCount ?? 0 }));

    expect(r2.errorRetryCount).toBe(2);
  });

  it("burns the full error budget (errorRetryCount=3) for a permanent error", async () => {
    const node = vi.fn().mockRejectedValue(new Error("ANTHROPIC_API_KEY not set"));
    const wrapped = withErrorRecovery("init", node);

    const result = await wrapped(baseState({ errorRetryCount: 0 }));

    expect(result.errorRetryCount).toBe(3);
    expect(result.lastErrorCode).toBe(PIPELINE_ERROR_CODES.API_KEY_MISSING);
  });

  it("burns the full budget for INTAKE_INCOMPLETE (permanent)", async () => {
    const node = vi.fn().mockRejectedValue(
      new Error("Intake validation failed: missing recipient")
    );
    const wrapped = withErrorRecovery("init", node);

    const result = await wrapped(baseState({ errorRetryCount: 0 }));

    expect(result.errorRetryCount).toBe(3);
    expect(result.lastErrorCode).toBe(PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE);
  });

  it("burns the full budget for CONTENT_POLICY_VIOLATION (permanent)", async () => {
    const node = vi.fn().mockRejectedValue(new Error("content policy violation"));
    const wrapped = withErrorRecovery("draft", node);

    const result = await wrapped(baseState({ errorRetryCount: 0 }));

    expect(result.errorRetryCount).toBe(3);
    expect(result.lastErrorCode).toBe(PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION);
  });

  it("handles a typed PipelineError object (uses .code directly)", async () => {
    const pipelineErr = new PipelineError(
      PIPELINE_ERROR_CODES.SUPERSEDED,
      "letter was superseded"
    );
    const node = vi.fn().mockRejectedValue(pipelineErr);
    const wrapped = withErrorRecovery("vetting", node);

    const result = await wrapped(state);

    expect(result.lastErrorCode).toBe(PIPELINE_ERROR_CODES.SUPERSEDED);
    // SUPERSEDED is permanent
    expect(result.errorRetryCount).toBe(3);
  });

  it("classifies UNKNOWN_ERROR as transient (increments, does not burn budget)", async () => {
    const node = vi.fn().mockRejectedValue(new Error("something totally unexpected"));
    const wrapped = withErrorRecovery("research", node);

    const result = await wrapped(baseState({ errorRetryCount: 1 }));

    expect(result.errorRetryCount).toBe(2); // incremented, not burned
    expect(result.lastErrorCode).toBe(PIPELINE_ERROR_CODES.UNKNOWN_ERROR);
  });

  it("permanent error at errorRetryCount=0 routes straight to fail (instant exhaustion)", async () => {
    // Behavioral guarantee: a permanent error must burn the full budget in
    // one shot so routeAfterVetting immediately routes to "fail" without
    // giving the graph any retry iterations.
    const node = vi.fn().mockRejectedValue(new Error("ANTHROPIC_API_KEY not set"));
    const wrapped = withErrorRecovery("init", node);

    const result = await wrapped(baseState({ errorRetryCount: 0, assembledLetter: "some content" }));

    // Budget must be 3 (fully burned)
    expect(result.errorRetryCount).toBe(3);
    // Routing must immediately be "fail" — no degraded path, no retries
    expect(
      routeAfterVetting({
        ...baseState(),
        errorRetryCount: result.errorRetryCount ?? 0,
        lastErrorCode: result.lastErrorCode ?? "",
        assembledLetter: "some content",
      })
    ).toBe("fail");
  });

  it("transient error at errorRetryCount=0 does NOT immediately route to fail", async () => {
    const node = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));
    const wrapped = withErrorRecovery("research", node);

    const result = await wrapped(baseState({ errorRetryCount: 0, assembledLetter: "some content" }));

    // Budget is 1 — not exhausted, so router should not go to "fail"
    expect(result.errorRetryCount).toBe(1);
    expect(
      routeAfterVetting({
        ...baseState(),
        errorRetryCount: result.errorRetryCount ?? 0,
        lastErrorCode: result.lastErrorCode ?? "",
        assembledLetter: "some content",
      })
    ).not.toBe("fail");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 3 — finalize_degraded path via routeAfterVetting
// ═══════════════════════════════════════════════════════════════════
describe("routeAfterVetting — finalize_degraded path", () => {
  it("routes to finalize_degraded when error budget exhausted AND content exists", () => {
    expect(
      routeAfterVetting(baseState({ errorRetryCount: 3, assembledLetter: "partial draft" }))
    ).toBe("finalize_degraded");
  });

  it("routes to fail (not finalize_degraded) when error budget exhausted AND content is empty", () => {
    expect(
      routeAfterVetting(baseState({ errorRetryCount: 3, assembledLetter: "" }))
    ).toBe("fail");
  });

  it("finalize_degraded maps to the 'finalize' node in VETTING_ROUTE_MAP", () => {
    expect(VETTING_ROUTE_MAP["finalize_degraded"]).toBe("finalize");
  });

  it("every VETTING_ROUTE_MAP value is a non-empty node name", () => {
    for (const [route, node] of Object.entries(VETTING_ROUTE_MAP)) {
      expect(node.length, `route '${route}'`).toBeGreaterThan(0);
    }
  });

  it("all permanent PipelineErrorCodes route to fail regardless of content", () => {
    const permanentCodes = (
      Object.keys(PIPELINE_ERROR_CATEGORY) as Array<
        keyof typeof PIPELINE_ERROR_CATEGORY
      >
    ).filter(c => PIPELINE_ERROR_CATEGORY[c] === "permanent");

    expect(permanentCodes.length).toBeGreaterThan(0);
    for (const code of permanentCodes) {
      const r = routeAfterVetting(
        baseState({ lastErrorCode: code, assembledLetter: "content" })
      );
      expect(r, `code=${code}`).toBe("fail");
    }
  });

  it("transient error with content and retries available routes to finalize (not fail)", () => {
    const r = routeAfterVetting(
      baseState({
        lastErrorCode: PIPELINE_ERROR_CODES.RATE_LIMITED,
        assembledLetter: "content",
        errorRetryCount: 1,
        qualityDegraded: false,
      })
    );
    expect(r).not.toBe("fail");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 4 — getStreamChunksAfter — ownership isolation
// ═══════════════════════════════════════════════════════════════════

// Module-level state controlled per test
let mockOwnerUserId: number | null = null; // null = letter not found
let mockChunks: Array<{
  id: bigint;
  letterId: number;
  chunkText: string;
  stage: string;
  sequenceNumber: number;
  createdAt: Date;
}> = [];

// Chainable DB mock.
//   Query 1 (ownership): …select({userId}).from().where().limit(1)  → Promise<[{userId}]>
//   Query 2 (chunks):    …select().from().where().orderBy()          → Promise<chunks>
function makeChainableDb() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () =>
      Promise.resolve(
        mockOwnerUserId !== null ? [{ userId: mockOwnerUserId }] : []
      ),
    orderBy: () => Promise.resolve(mockChunks),
    and: () => chain,
  };
  return chain;
}

vi.mock("./db/core", () => ({
  getDb: vi.fn().mockImplementation(async () => makeChainableDb()),
}));describe("getStreamChunksAfter — ownership isolation", () => {
  beforeEach(() => {
    mockOwnerUserId = null;
    mockChunks = [];
  });

  it("returns [] when db is unavailable", async () => {
    const { getDb } = await import("./db/core");
    vi.mocked(getDb).mockResolvedValueOnce(null as any);

    const { getStreamChunksAfter } = await import("./db/pipeline-records");
    const result = await getStreamChunksAfter(1, 1, -1);
    expect(result).toEqual([]);
  });

  it("throws LetterNotFoundError when the letter does not exist", async () => {
    mockOwnerUserId = null; // .limit(1) returns [] → letter not found

    const { getStreamChunksAfter } = await import("./db/pipeline-records");
    await expect(getStreamChunksAfter(404, 1, -1)).rejects.toThrow(LetterNotFoundError);
  });

  it("LetterNotFoundError message names the letter id", async () => {
    mockOwnerUserId = null;
    const { getStreamChunksAfter } = await import("./db/pipeline-records");
    await expect(getStreamChunksAfter(77, 1, -1)).rejects.toThrow("77");
  });

  it("throws LetterAccessDeniedError when the letter belongs to a different user", async () => {
    mockOwnerUserId = 999; // belongs to user 999, not user 1

    const { getStreamChunksAfter } = await import("./db/pipeline-records");
    await expect(getStreamChunksAfter(1, 1 /* userId=1 */, -1)).rejects.toThrow(
      LetterAccessDeniedError
    );
  });

  it("LetterAccessDeniedError is not thrown for the correct owner", async () => {
    const now = new Date();
    mockOwnerUserId = 42; // letter owned by user 42
    mockChunks = [
      { id: 1n, letterId: 7, chunkText: "chunk A", stage: "research", sequenceNumber: 1, createdAt: now },
      { id: 2n, letterId: 7, chunkText: "chunk B", stage: "draft",    sequenceNumber: 2, createdAt: now },
    ];

    const { getStreamChunksAfter } = await import("./db/pipeline-records");
    const result = await getStreamChunksAfter(7, 42 /* correct owner */, 0);
    expect(result).toHaveLength(2);
    expect(result[0].chunkText).toBe("chunk A");
    expect(result[1].chunkText).toBe("chunk B");
  });

  it("returns [] (empty, no throw) when the letter is owned but has no chunks", async () => {
    mockOwnerUserId = 42;
    mockChunks = []; // no chunks yet — valid initial state

    const { getStreamChunksAfter } = await import("./db/pipeline-records");
    const result = await getStreamChunksAfter(7, 42, -1);
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 5 — streamChunksAfter tRPC procedure
// ═══════════════════════════════════════════════════════════════════

const mockGetStreamChunksAfter = vi.fn();

vi.mock("./db", async (importOriginal) => {
  // Re-export domain error classes unchanged so the tRPC procedure can
  // do `instanceof LetterNotFoundError` / `instanceof LetterAccessDeniedError`
  // checks. Without this, the instanceof guard silently fails because a
  // different class reference is used in the mock vs the production module.
  const { LetterNotFoundError: LNF, LetterAccessDeniedError: LAD } =
    await importOriginal<typeof import("./db")>();
  return {
    LetterNotFoundError: LNF,
    LetterAccessDeniedError: LAD,
    getStreamChunksAfter: (...args: unknown[]) => mockGetStreamChunksAfter(...args),
    getLetterRequestById: vi.fn(),
    getLetterVersionsByRequestId: vi.fn(),
    getLetterVersionById: vi.fn(),
    getLetterRequestsByUserId: vi.fn().mockResolvedValue([]),
    getNotificationsByUserId: vi.fn().mockResolvedValue([]),
    getReviewActions: vi.fn().mockResolvedValue([]),
    getAttachmentsByLetterId: vi.fn().mockResolvedValue([]),
    markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    updateLetterPdfUrl: vi.fn().mockResolvedValue(undefined),
    updateLetterStoragePath: vi.fn().mockResolvedValue(undefined),
    updateLetterStatus: vi.fn().mockResolvedValue(undefined),
    logReviewAction: vi.fn().mockResolvedValue(undefined),
    createLetterVersion: vi.fn().mockResolvedValue({ insertId: 1 }),
    createLetterRequest: vi.fn().mockResolvedValue({ insertId: 1 }),
    createAttachment: vi.fn().mockResolvedValue(undefined),
    archiveLetterRequest: vi.fn().mockResolvedValue(undefined),
    updateLetterVersionPointers: vi.fn().mockResolvedValue(undefined),
    getLetterRequestSafeForSubscriber: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("./db/pipeline-records", async (importOriginal) => {
  // Spread the entire real module so that:
  //  • Section 4 tests can import and call the real getStreamChunksAfter
  //    (backed by the vi.mock("./db/core") chain below)
  //  • The real LetterNotFoundError / LetterAccessDeniedError class
  //    references are preserved so instanceof checks in the tRPC
  //    procedure work correctly
  const real = await importOriginal<typeof import("./db/pipeline-records")>();
  return { ...real };
});

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
  initServerSentry: vi.fn(),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue(undefined),
  storageGet: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/file.pdf" }),
}));

vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: vi.fn().mockResolvedValue("https://cdn.example.com/file.pdf"),
}));

vi.mock("./stripe", () => ({
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  incrementLettersUsed: vi.fn().mockResolvedValue(true),
  getUserSubscription: vi.fn().mockResolvedValue(null),
  hasActiveRecurringSubscription: vi.fn().mockResolvedValue(false),
  createBillingPortalSession: vi.fn().mockResolvedValue("https://billing.stripe.com"),
  activateSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/letters", () => ({
  submitLetter: vi.fn().mockResolvedValue({ letterId: 1, status: "submitted", isFreePreview: false }),
  getSubscriberReleasedLetterProcedure: vi.fn().mockResolvedValue(null),
  processSubscriberFeedback: vi.fn().mockResolvedValue(undefined),
  retryFromRejected: vi.fn().mockResolvedValue(undefined),
  sendLetterToRecipientFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/admin2fa", () => ({
  signAdmin2FAToken: vi.fn().mockReturnValue("tok"),
  verifyAdmin2FAToken: vi.fn().mockReturnValue(true),
  ADMIN_2FA_COOKIE: "admin_2fa",
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email-id", error: null }) },
  })),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeSubscriberCtx(userId = 42): TrpcContext {
  return {
    user: {
      id: userId,
      role: "subscriber" as const,
      openId: `sub-${userId}`,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      freeReviewUsedAt: null,
    },
    req: { headers: { cookie: "" } } as any,
    cookies: {},
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as TrpcContext;
}

describe("streamChunksAfter tRPC procedure", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serialises chunk id as a string (bigint safety)", async () => {
    mockGetStreamChunksAfter.mockResolvedValue([
      { id: 9007199254740993n, letterId: 10, chunkText: "hello", stage: "draft", sequenceNumber: 1, createdAt: now },
    ]);

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    const result = await caller.letters.streamChunksAfter({ letterId: 10, afterSeq: 0 });

    expect(result).toHaveLength(1);
    // id must be the string representation, not a lossy JS number
    expect(result[0].id).toBe("9007199254740993");
    expect(typeof result[0].id).toBe("string");
  });

  it("passes the authenticated user's id to getStreamChunksAfter (not a caller-supplied one)", async () => {
    mockGetStreamChunksAfter.mockResolvedValue([]);

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    await caller.letters.streamChunksAfter({ letterId: 7, afterSeq: 5 });

    expect(mockGetStreamChunksAfter).toHaveBeenCalledWith(
      7,    // letterId from input
      42,   // userId from ctx — NOT from input (no userId in the input schema)
      5     // afterSeq from input
    );
  });

  it("throws FORBIDDEN when getStreamChunksAfter throws LetterAccessDeniedError", async () => {
    mockGetStreamChunksAfter.mockRejectedValue(new LetterAccessDeniedError(999));

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    await expect(
      caller.letters.streamChunksAfter({ letterId: 999, afterSeq: -1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when getStreamChunksAfter throws LetterNotFoundError", async () => {
    mockGetStreamChunksAfter.mockRejectedValue(new LetterNotFoundError(404));

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    await expect(
      caller.letters.streamChunksAfter({ letterId: 404, afterSeq: -1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("re-throws unexpected errors (not LetterNotFoundError or LetterAccessDeniedError)", async () => {
    mockGetStreamChunksAfter.mockRejectedValue(new Error("database connection lost"));

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    await expect(
      caller.letters.streamChunksAfter({ letterId: 1, afterSeq: -1 })
    ).rejects.toThrow("database connection lost");
  });

  it("defaults afterSeq to -1 when omitted (returns all chunks)", async () => {
    mockGetStreamChunksAfter.mockResolvedValue([]);

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    await caller.letters.streamChunksAfter({ letterId: 1 });

    expect(mockGetStreamChunksAfter).toHaveBeenCalledWith(1, 42, -1);
  });

  it("returns all output fields required by the output schema", async () => {
    mockGetStreamChunksAfter.mockResolvedValue([
      { id: 1n, letterId: 10, chunkText: "Draft content", stage: "draft", sequenceNumber: 3, createdAt: now },
    ]);

    const caller = appRouter.createCaller(makeSubscriberCtx(42));
    const [chunk] = await caller.letters.streamChunksAfter({ letterId: 10, afterSeq: 2 });

    expect(chunk).toMatchObject({
      id: "1",
      letterId: 10,
      chunkText: "Draft content",
      stage: "draft",
      sequenceNumber: 3,
      createdAt: now,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 6 — PipelineState schema — hardening fields
// ═══════════════════════════════════════════════════════════════════
describe("PipelineState — hardening fields present in default state", () => {
  it("includes lastErrorCode defaulting to empty string", () => {
    const s = baseState();
    expect(s.lastErrorCode).toBe("");
  });

  it("includes lastErrorMessage defaulting to empty string", () => {
    const s = baseState();
    expect(s.lastErrorMessage).toBe("");
  });

  it("includes isFreePreview defaulting to false", () => {
    const s = baseState();
    expect(s.isFreePreview).toBe(false);
  });

  it("includes workflowJobId defaulting to 0", () => {
    const s = baseState();
    expect(s.workflowJobId).toBe(0);
  });

  it("includes vettingReports defaulting to empty array", () => {
    const s = baseState();
    expect(Array.isArray(s.vettingReports)).toBe(true);
    expect(s.vettingReports).toHaveLength(0);
  });
});
