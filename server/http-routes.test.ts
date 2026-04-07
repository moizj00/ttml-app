/**
 * HTTP Route Integration Tests
 *
 * Tests the following Express routes at the HTTP level:
 *  - GET  /health
 *  - GET  /health/details
 *  - POST /api/pipeline/n8n-callback
 *  - POST /api/stripe/webhook
 *  - GET  /api/letters/:id/draft-pdf
 *  - POST /api/cron/draft-reminders
 *
 * Approach: spin up a minimal Express server on a random port,
 * use Node's built-in fetch() for requests, tear down after each suite.
 * All external deps (DB, Stripe, email) mocked at module level.
 */

import http from "http";
import express from "express";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL MOCKS  (must be hoisted before any imports)
// ════════════════════════════════════════════════════════════════════════════

vi.mock("./db/core", () => ({
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
  createLetterVersion: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateLetterStatus: vi.fn().mockResolvedValue(undefined),
  updateLetterVersionPointers: vi.fn().mockResolvedValue(undefined),
  logReviewAction: vi.fn().mockResolvedValue(undefined),
  getLetterRequestById: vi.fn().mockResolvedValue(null),
  getUserById: vi.fn().mockResolvedValue(null),
  getAllUsers: vi.fn().mockResolvedValue([]),
  hasLetterBeenPreviouslyUnlocked: vi.fn().mockResolvedValue(false),
  getLetterRequestSafeForSubscriber: vi.fn().mockResolvedValue(null),
  getLetterVersionsByRequestId: vi.fn().mockResolvedValue([]),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
  countCompletedLetters: vi.fn().mockResolvedValue(0),
  getDiscountCodeByCode: vi.fn().mockResolvedValue(null),
  incrementDiscountCodeUsage: vi.fn().mockResolvedValue(undefined),
  createCommission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
}));

vi.mock("./email", () => ({
  sendLetterReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
  sendNewReviewNeededEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendDraftReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterUnlockedEmail: vi.fn().mockResolvedValue(undefined),
  sendEmployeeCommissionEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pipeline", () => ({
  runAssemblyStage: vi.fn().mockResolvedValue("assembled letter text"),
  autoAdvanceIfPreviouslyUnlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./supabaseAuth", () => ({
  authenticateRequest: vi.fn().mockResolvedValue(null),
  registerSupabaseAuthRoutes: vi.fn(),
}));

vi.mock("./pdfGenerator", () => ({
  generateDraftPdfBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 mock")),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock("./healthCheck", () => ({
  getPublicHealth: vi.fn().mockReturnValue({
    status: "healthy",
    timestamp: 1700000000000,
    uptime: 12345,
  }),
  getDetailedHealth: vi.fn().mockResolvedValue({
    status: "healthy",
    timestamp: 1700000000000,
    uptime: 12345,
    services: {
      database: { status: "ok", responseTimeMs: 5 },
      redis: { status: "unconfigured", responseTimeMs: 0 },
    },
  }),
  startHealthProbe: vi.fn(),
}));

vi.mock("./stripe", () => ({
  getStripe: vi.fn(),
  activateSubscription: vi.fn().mockResolvedValue(undefined),
  cancelSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./stripe-products", () => ({
  getPlanConfig: vi.fn().mockReturnValue({ name: "Per Letter", stripePriceId: "price_test" }),
  PLANS: {},
  LETTER_UNLOCK_PRICE_CENTS: 4900,
  MONTHLY_PRICE_CENTS: 2900,
  YEARLY_PRICE_CENTS: 19900,
}));

vi.mock("./_core/env", () => ({
  ENV: {
    isProduction: false,
    databaseUrl: "postgresql://test:test@localhost/test",
    stripeSecretKey: "sk_test_xxx",
    stripeWebhookSecret: "whsec_test_secret",
    resendApiKey: "re_test_xxx",
    r2AccountId: "r2-test",
    r2AccessKeyId: "r2-key",
    r2SecretAccessKey: "r2-secret",
    r2BucketName: "test-bucket",
    upstashRedisRestUrl: "",
    upstashRedisRestToken: "",
    perplexityApiKey: "pplx-test",
    openaiApiKey: "sk-openai-test",
    anthropicApiKey: "sk-ant-test",
    sentryDsn: "",
  },
}));

vi.mock("../drizzle/schema", () => {
  const t = new Proxy({}, { get: (_: any, prop: string) => prop });
  return {
    letterRequests: t,
    subscriptions: t,
    processedStripeEvents: t,
    users: t,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  isNull: vi.fn((x: any) => x),
  lt: vi.fn((...args: any[]) => args),
  inArray: vi.fn((...args: any[]) => args),
  sql: vi.fn((x: any) => x),
}));

// ════════════════════════════════════════════════════════════════════════════
// IMPORTS  (after all vi.mock() declarations)
// ════════════════════════════════════════════════════════════════════════════

const { registerN8nCallbackRoute } = await import("./n8nCallback");
const { stripeWebhookHandler } = await import("./stripeWebhook");
const { registerDraftPdfRoute } = await import("./draftPdfRoute");
const { registerDraftRemindersRoute } = await import("./draftReminders");
const { getPublicHealth, getDetailedHealth } = await import("./healthCheck");
const { authenticateRequest } = await import("./supabaseAuth");
const { getStripe, activateSubscription } = await import("./stripe");
const { getDb, getUserById, getLetterRequestById,
        getLetterRequestSafeForSubscriber, getLetterVersionsByRequestId } = await import("./db");
const { generateDraftPdfBuffer } = await import("./pdfGenerator");
const { checkTrpcRateLimit } = await import("./rateLimiter");
const { sendDraftReminderEmail } = await import("./email");

// ════════════════════════════════════════════════════════════════════════════
// TEST SERVER HELPERS
// ════════════════════════════════════════════════════════════════════════════

interface TestServer {
  url: string;
  close(): Promise<void>;
}

function startServer(app: express.Express): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((res, rej) =>
            server.close((err) => (err ? rej(err) : res()))
          ),
      });
    });
  });
}

/** DB mock with properly chained methods including onConflictDoNothing */
function makeDbMock(selectData: any[] = []) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(selectData),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    execute: vi.fn().mockResolvedValue([]),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. HEALTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

describe("GET /health", () => {
  let server: TestServer;

  beforeAll(async () => {
    const app = express();
    app.get("/health", (_req, res) => {
      const result = getPublicHealth();
      res.status(result.status === "unhealthy" ? 503 : 200).json(result);
    });
    app.get("/health/details", async (req, res) => {
      try {
        const user = await authenticateRequest(req);
        if (!user || (user as any).role !== "admin") {
          res.status(user ? 403 : 401).json({ error: "Admin authentication required" });
          return;
        }
      } catch {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }
      const result = await getDetailedHealth();
      res.status(result.status === "unhealthy" ? 503 : 200).json(result);
    });
    server = await startServer(app);
  });

  afterAll(() => server.close());

  beforeEach(() => {
    vi.mocked(getPublicHealth).mockReturnValue({ status: "healthy", timestamp: Date.now(), uptime: 100 });
    vi.mocked(getDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: Date.now(),
      uptime: 100,
      services: { database: { status: "ok", responseTimeMs: 5 }, redis: { status: "unconfigured", responseTimeMs: 0 } },
    });
    vi.mocked(authenticateRequest).mockResolvedValue(null);
  });

  it("GET /health → 200 with status field", async () => {
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(typeof body.timestamp).toBe("number");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /health → 503 when status is unhealthy", async () => {
    vi.mocked(getPublicHealth).mockReturnValueOnce({ status: "unhealthy", timestamp: Date.now(), uptime: 0 });
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unhealthy");
  });

  it("GET /health → 200 when status is degraded", async () => {
    vi.mocked(getPublicHealth).mockReturnValueOnce({ status: "degraded", timestamp: Date.now(), uptime: 100 });
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
  });

  it("GET /health/details → 401 when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/health/details`);
    expect(res.status).toBe(401);
  });

  it("GET /health/details → 403 when authenticated but not admin", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({ id: 1, role: "subscriber" } as any);
    const res = await fetch(`${server.url}/health/details`);
    expect(res.status).toBe(403);
  });

  it("GET /health/details → 200 with services breakdown for admin", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({ id: 99, role: "admin" } as any);
    const res = await fetch(`${server.url}/health/details`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("services");
    expect(body.services).toHaveProperty("database");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. n8n CALLBACK  POST /api/pipeline/n8n-callback
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/pipeline/n8n-callback", () => {
  let server: TestServer;
  const CALLBACK_SECRET = "test-callback-secret-xyz";

  const validPayload = {
    letterId: 42,
    success: true,
    researchPacket: {
      researchSummary: "CA Civil Code § 1950.5 applies",
      jurisdictionProfile: { country: "US", stateProvince: "CA", city: "LA", authorityHierarchy: [] },
      issuesIdentified: ["Deposit not returned"],
      applicableRules: [],
      localJurisdictionElements: [],
      factualDataNeeded: [],
      openQuestions: [],
      riskFlags: [],
      draftingConstraints: [],
    },
    draftOutput: {
      draftLetter: "Dear Bob,\n\nYou owe me money.\n\nSincerely, Alice",
      structuredDemands: [],
      toneAssessment: "firm",
      citationsUsed: [],
      wordCount: 10,
      qualityScore: 80,
    },
    assembledLetter: "Dear Bob,\n\nFinal assembled letter.\n\nSincerely, Alice",
    vettedLetter: "Dear Bob,\n\nVetted letter.\n\nSincerely, Alice",
    vettingReport: {
      citationsVerified: 1, citationsRemoved: 0, citationsFlagged: [],
      bloatPhrasesRemoved: [], jurisdictionIssues: [], factualIssuesFound: [],
      changesApplied: [], overallAssessment: "Passes", riskLevel: "low",
    },
    stages: ["perplexity-research", "anthropic-draft", "anthropic-assembly", "anthropic-vetting"],
    provider: "n8n-4stage",
  };

  beforeAll(async () => {
    process.env.N8N_CALLBACK_SECRET = CALLBACK_SECRET;
    const app = express();
    app.use(express.json({ limit: "12mb" }));
    registerN8nCallbackRoute(app);
    server = await startServer(app);
  });

  afterAll(async () => {
    delete process.env.N8N_CALLBACK_SECRET;
    await server.close();
  });

  beforeEach(() => {
    vi.mocked(getLetterRequestById).mockResolvedValue({
      id: 42,
      userId: 10,
      subject: "Security Deposit",
      letterType: "demand_letter",
      jurisdictionState: "CA",
      jurisdictionCountry: "US",
      status: "researching",
      intakeJson: {
        sender: { name: "Alice", address: "123 Main St" },
        recipient: { name: "Bob", address: "456 Elm St" },
        jurisdiction: { country: "US", state: "CA" },
        matter: { subject: "Deposit", description: "Deposit issue", category: "landlord-tenant" },
        desiredOutcome: "Get deposit back",
        letterType: "demand_letter",
        schemaVersion: "2.0",
      },
    } as any);
    vi.mocked(getUserById).mockResolvedValue({
      id: 10, email: "alice@test.com", name: "Alice Tenant", role: "subscriber",
    } as any);
  });

  const postCallback = (payload: object, secret = CALLBACK_SECRET) =>
    fetch(`${server.url}/api/pipeline/n8n-callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ttml-callback-secret": secret,
      },
      body: JSON.stringify(payload),
    });

  it("returns 503 when N8N_CALLBACK_SECRET env var is not configured", async () => {
    const saved = process.env.N8N_CALLBACK_SECRET;
    delete process.env.N8N_CALLBACK_SECRET;
    const res = await postCallback(validPayload, "any-secret");
    expect(res.status).toBe(503);
    process.env.N8N_CALLBACK_SECRET = saved;
  });

  it("returns 401 when callback secret header is absent", async () => {
    const res = await fetch(`${server.url}/api/pipeline/n8n-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when callback secret header value is wrong", async () => {
    const res = await postCallback(validPayload, "wrong-secret-value");
    expect(res.status).toBe(401);
  });

  it("returns 400 when letterId is missing from payload", async () => {
    const res = await postCallback({ success: true, assembledLetter: "text" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/letterId/i);
  });

  it("returns 200 { received: true } for a valid 4-stage payload", async () => {
    const res = await postCallback(validPayload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.letterId).toBe(42);
  });

  it("response includes a provider tag string", async () => {
    const res = await postCallback(validPayload);
    const body = await res.json();
    expect(typeof body.provider).toBe("string");
    expect(body.provider.length).toBeGreaterThan(0);
  });

  it("returns 200 for a legacy flat-content payload", async () => {
    const res = await postCallback({
      letterId: 42,
      success: true,
      draftContent: "Dear Bob,\n\nLegacy draft.\n\nSincerely, Alice",
      provider: "n8n-legacy",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("tags a fully-vetted payload as n8n-4stage", async () => {
    const res = await postCallback(validPayload);
    const body = await res.json();
    expect(body.provider).toBe("n8n-4stage");
  });

  it("returns 200 for failed pipeline (success: false) — status reset, no letter created", async () => {
    const res = await postCallback({
      letterId: 42,
      success: false,
      error: "Anthropic rate limit exhausted",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. STRIPE WEBHOOK  POST /api/stripe/webhook
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/stripe/webhook", () => {
  let server: TestServer;

  const makeMockStripe = (event: object) => ({
    webhooks: {
      constructEvent: vi.fn().mockReturnValue(event),
    },
    customers: {
      retrieve: vi.fn().mockResolvedValue({ id: "cus_test", metadata: { user_id: "1" } }),
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_test",
        status: "active",
        metadata: { user_id: "1" },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_test" } }] },
        customer: "cus_test",
      }),
    },
  });

  beforeAll(async () => {
    const app = express();
    app.post(
      "/api/stripe/webhook",
      express.raw({ type: "application/json" }),
      stripeWebhookHandler
    );
    server = await startServer(app);
  });

  afterAll(() => server.close());

  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue(makeDbMock([]) as any);
    vi.mocked(activateSubscription).mockResolvedValue(undefined);
    vi.mocked(getUserById).mockResolvedValue(null);
  });

  const postWebhook = (body: string | Buffer, sig = "t=1,v1=test") =>
    fetch(`${server.url}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": sig },
      body,
    });

  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await fetch(`${server.url}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/stripe-signature/i);
  });

  it("returns 400 when Stripe signature verification throws", async () => {
    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => {
          throw new Error("Signature mismatch");
        }),
      },
    } as any);
    const res = await postWebhook(JSON.stringify({ type: "test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("returns { verified: true } for test events (evt_test_ prefix)", async () => {
    vi.mocked(getStripe).mockReturnValue(
      makeMockStripe({ id: "evt_test_12345", type: "checkout.session.completed", data: { object: {} } }) as any
    );
    const res = await postWebhook(JSON.stringify({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });

  it("returns { received: true, duplicate: true } for already-seen event IDs", async () => {
    vi.mocked(getStripe).mockReturnValue(
      makeMockStripe({ id: "evt_already_seen", type: "checkout.session.completed", data: { object: {} } }) as any
    );
    vi.mocked(getDb).mockResolvedValue(makeDbMock([{ eventId: "evt_already_seen" }]) as any);
    const res = await postWebhook(JSON.stringify({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
  });

  it("handles checkout.session.completed (subscription mode, no discount) → 200", async () => {
    vi.mocked(getStripe).mockReturnValue(
      makeMockStripe({
        id: "evt_checkout_sub_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test", mode: "subscription",
            metadata: { user_id: "5", plan_id: "monthly" },
            customer: "cus_test",
            subscription: { id: "sub_test" },
            payment_intent: null,
            amount_total: 2900,
          },
        },
      }) as any
    );
    const res = await postWebhook(JSON.stringify({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("handles customer.subscription.deleted → 200 with received:true", async () => {
    vi.mocked(getStripe).mockReturnValue(
      makeMockStripe({
        id: "evt_sub_deleted_1",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_test_deleted",
            customer: "cus_test",
            status: "canceled",
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: true,
            items: { data: [{ price: { id: "price_test" } }] },
          },
        },
      }) as any
    );
    const res = await postWebhook(JSON.stringify({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("handles invoice.payment_failed (no subscription_details) → 200", async () => {
    vi.mocked(getStripe).mockReturnValue(
      makeMockStripe({
        id: "evt_invoice_failed_1",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_test",
            customer: "cus_test",
            // No parent.subscription_details → subId will be undefined → skips email
          },
        },
      }) as any
    );
    const res = await postWebhook(JSON.stringify({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("handles unrecognized event type gracefully → 200", async () => {
    vi.mocked(getStripe).mockReturnValue(
      makeMockStripe({
        id: "evt_unknown_1",
        type: "some.unknown.event",
        data: { object: {} },
      }) as any
    );
    const res = await postWebhook(JSON.stringify({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. DRAFT PDF  GET /api/letters/:id/draft-pdf
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/letters/:id/draft-pdf", () => {
  let server: TestServer;

  const mockLetter = {
    id: 7,
    userId: 3,
    subject: "Security Deposit Recovery",
    letterType: "demand_letter",
    status: "pending_review",
    jurisdictionState: "CA",
    jurisdictionCountry: "US",
    intakeJson: { sender: { name: "Alice" }, recipient: { name: "Bob" } },
  };

  const mockVersion = {
    id: 11,
    letterRequestId: 7,
    versionType: "ai_draft",
    content: "Dear Bob,\n\nThis is the draft.\n\nSincerely, Alice",
  };

  const subscriberUser = { id: 3, role: "subscriber", email: "alice@test.com" };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerDraftPdfRoute(app);
    server = await startServer(app);
  });

  afterAll(() => server.close());

  beforeEach(() => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValue(null);
    vi.mocked(getLetterVersionsByRequestId).mockResolvedValue([]);
    vi.mocked(generateDraftPdfBuffer).mockResolvedValue(Buffer.from("%PDF-1.4 mock"));
    vi.mocked(checkTrpcRateLimit).mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/auth/i);
  });

  it("returns 403 when user role is not subscriber", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({ id: 99, role: "attorney" } as any);
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/subscriber/i);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(checkTrpcRateLimit).mockRejectedValueOnce(new Error("Too many requests"));
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many/i);
  });

  it("returns 400 when letterId is not a valid integer", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    const res = await fetch(`${server.url}/api/letters/not-a-number/draft-pdf`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid letter/i);
  });

  it("returns 404 when letter not found (ownership check)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when letter is in generated_locked but has no ai_draft version", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({
      ...mockLetter, status: "generated_locked",
    } as any);
    vi.mocked(getLetterVersionsByRequestId).mockResolvedValueOnce([]);
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when letter is in submitted status", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({
      ...mockLetter, status: "submitted",
    } as any);
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(403);
  });

  it("returns 403 when letter is in drafting status", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({
      ...mockLetter, status: "drafting",
    } as any);
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when letter has no ai_draft version content", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({
      ...mockLetter, status: "pending_review",
    } as any);
    vi.mocked(getLetterVersionsByRequestId).mockResolvedValueOnce([]);
    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/draft content/i);
  });

  it("returns 200 with application/pdf Content-Type for pending_review letter", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({
      ...mockLetter, status: "pending_review",
    } as any);
    vi.mocked(getLetterVersionsByRequestId).mockResolvedValueOnce([mockVersion] as any);
    vi.mocked(generateDraftPdfBuffer).mockResolvedValueOnce(Buffer.from("%PDF-1.4 test"));

    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment/i);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 200 for all allowed statuses", async () => {
    const statuses = [
      "generated_locked", "pending_review", "under_review", "needs_changes",
      "client_approval_pending", "client_revision_requested",
      "approved", "client_approved", "sent",
    ];
    for (const status of statuses) {
      vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
      vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({ ...mockLetter, status } as any);
      vi.mocked(getLetterVersionsByRequestId).mockResolvedValueOnce([mockVersion] as any);
      const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
      expect(res.status, `Expected 200 for status=${status}`).toBe(200);
    }
  });

  it("Content-Disposition filename contains the letterId", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(subscriberUser as any);
    vi.mocked(getLetterRequestSafeForSubscriber).mockResolvedValueOnce({
      ...mockLetter, status: "pending_review",
    } as any);
    vi.mocked(getLetterVersionsByRequestId).mockResolvedValueOnce([mockVersion] as any);

    const res = await fetch(`${server.url}/api/letters/7/draft-pdf`);
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("7");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. CRON: DRAFT REMINDERS  POST /api/cron/draft-reminders
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/cron/draft-reminders", () => {
  let server: TestServer;
  const CRON_SECRET = "super-secret-cron-token-123";

  // Shared mutable mock for the DB chain used by processDraftReminders
  let mockSelectResult: any[] = [];

  const buildMockDb = () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => Promise.resolve(mockSelectResult)),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  beforeAll(async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.mocked(getDb).mockImplementation(() => Promise.resolve(buildMockDb() as any));
    const app = express();
    app.use(express.json());
    registerDraftRemindersRoute(app);
    server = await startServer(app);
  });

  afterAll(async () => {
    delete process.env.CRON_SECRET;
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResult = [];
    vi.mocked(getDb).mockImplementation(() => Promise.resolve(buildMockDb() as any));
    vi.mocked(sendDraftReminderEmail).mockResolvedValue(undefined);
    vi.mocked(getUserById).mockResolvedValue(null);
  });

  const postCron = (authHeader?: string) =>
    fetch(`${server.url}/api/cron/draft-reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await postCron();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when Bearer token value is wrong", async () => {
    const res = await postCron("Bearer wrong-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is provided without 'Bearer ' prefix", async () => {
    const res = await postCron(CRON_SECRET); // missing "Bearer " prefix
    expect(res.status).toBe(401);
  });

  it("returns 200 { success: true } with correct secret and no eligible letters", async () => {
    mockSelectResult = [];
    const res = await postCron(`Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.sent).toBe(0);
  });

  it("result contains all required fields: processed, sent, skipped, errors, details", async () => {
    const res = await postCron(`Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result).toHaveProperty("processed");
    expect(result).toHaveProperty("sent");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.details)).toBe(true);
  });

  it("skips CRON_SECRET check when env var is not set, returns 200", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    mockSelectResult = [];

    const res = await postCron(); // no auth header
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    process.env.CRON_SECRET = saved;
  });

  it("sends reminder emails for eligible letters and returns sent:1", async () => {
    mockSelectResult = [
      {
        id: 100,
        userId: 5,
        subject: "Security Deposit",
        letterType: "demand_letter",
        status: "generated_locked",
        updatedAt: new Date(Date.now() - 50 * 60 * 60 * 1000), // 50 hours ago
        draftReminderSentAt: null,
      },
    ];
    vi.mocked(getUserById).mockResolvedValueOnce({
      id: 5, email: "subscriber@test.com", name: "Test User", role: "subscriber",
    } as any);
    vi.mocked(sendDraftReminderEmail).mockResolvedValueOnce(undefined);

    const res = await postCron(`Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.sent).toBe(1);
    expect(vi.mocked(sendDraftReminderEmail)).toHaveBeenCalledOnce();
  });

  it("skips letters where subscriber has no email", async () => {
    mockSelectResult = [
      {
        id: 101,
        userId: 6,
        subject: "No Email Case",
        letterType: "demand_letter",
        status: "generated_locked",
        updatedAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
        draftReminderSentAt: null,
      },
    ];
    // Return a user with no email
    vi.mocked(getUserById).mockResolvedValueOnce({
      id: 6, email: null, name: "No Email User", role: "subscriber",
    } as any);

    const res = await postCron(`Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(vi.mocked(sendDraftReminderEmail)).not.toHaveBeenCalled();
  });
});
