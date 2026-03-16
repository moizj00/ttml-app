/**
 * Phase 80: Employee Commission Email
 * Tests that sendEmployeeCommissionEmail is called when a commission is created
 * after a successful Stripe checkout.session.completed event.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── All vi.mock calls must use inline factories (no top-level vars) ──────────

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: vi.fn() },
    customers: {
      retrieve: vi.fn().mockResolvedValue({
        deleted: false,
        metadata: { userId: "5" },
      }),
    },
  })),
}));

vi.mock("./stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: { constructEvent: vi.fn() },
    customers: {
      retrieve: vi.fn().mockResolvedValue({
        deleted: false,
        metadata: { userId: "5" },
      }),
    },
  }),
  activateSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  updateLetterStatus: vi.fn().mockResolvedValue(undefined),
  logReviewAction: vi.fn().mockResolvedValue(undefined),
  getLetterRequestById: vi.fn().mockResolvedValue({
    id: 99,
    userId: 5,
    subject: "Breach of Contract",
    status: "generated_locked",
  }),
  getUserById: vi.fn().mockImplementation(async (id: number) => {
    if (id === 10) return { id: 10, name: "Alice Johnson", email: "alice@lawfirm.com", role: "employee" };
    if (id === 5) return { id: 5, name: "John Doe", email: "john@example.com", role: "subscriber" };
    return undefined;
  }),
  createNotification: vi.fn().mockResolvedValue(undefined),
  getDiscountCodeByCode: vi.fn().mockResolvedValue({
    id: 3,
    code: "ALICE20",
    employeeId: 10,
    isActive: true,
    discountPercent: 20,
  }),
  incrementDiscountCodeUsage: vi.fn().mockResolvedValue(undefined),
  createCommission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./email", () => ({
  sendLetterApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterUnlockedEmail: vi.fn().mockResolvedValue(undefined),
  sendEmployeeCommissionEmail: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { stripeWebhookHandler as handleStripeWebhook } from "./stripeWebhook";
import * as emailModule from "./email";
import * as dbModule from "./db";
import * as stripeModule from "./stripe";

// ─── Session factories ────────────────────────────────────────────────────────
function makePerLetterSession(metaOverrides: Record<string, any> = {}): any {
  return {
    id: "cs_test_123",
    mode: "payment",
    amount_total: 20000, // $200
    payment_intent: "pi_test_abc",
    customer: "cus_test_xyz",
    client_reference_id: "5",
    success_url: "https://www.talk-to-my-lawyer.com/letters/99?success=true",
    metadata: {
      user_id: "5",
      plan_id: "per_letter",
      letter_id: "99",
      unlock_type: "letter_unlock",
      discount_code: "ALICE20",
      ...metaOverrides,
    },
  };
}

function makeSubscriptionSession(metaOverrides: Record<string, any> = {}): any {
  return {
    id: "cs_test_456",
    mode: "subscription",
    amount_total: 49900, // $499
    payment_intent: null,
    customer: "cus_test_xyz",
    client_reference_id: "5",
    success_url: "https://www.talk-to-my-lawyer.com/billing?success=true",
    metadata: {
      user_id: "5",
      plan_id: "monthly_basic",
      discount_code: "ALICE20",
      ...metaOverrides,
    },
  };
}

function makeWebhookEvent(type: string, session: any): any {
  return { id: "evt_real_001", type, data: { object: session } };
}

function makeMockReqRes(event: any) {
  const req = {
    headers: { "stripe-signature": "sig_test" },
    body: Buffer.from(JSON.stringify(event)),
  } as any;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as any;
  return { req, res };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("stripeWebhook — employee commission email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock implementations after clearAllMocks
    vi.mocked(dbModule.getUserById).mockImplementation(async (id: number) => {
      if (id === 10) return { id: 10, name: "Alice Johnson", email: "alice@lawfirm.com", role: "employee" } as any;
      if (id === 5) return { id: 5, name: "John Doe", email: "john@example.com", role: "subscriber" } as any;
      return undefined;
    });
    vi.mocked(dbModule.getDiscountCodeByCode).mockResolvedValue({
      id: 3, code: "ALICE20", employeeId: 10, isActive: true, discountPercent: 20,
    } as any);
    vi.mocked(dbModule.getLetterRequestById).mockResolvedValue({
      id: 99, userId: 5, subject: "Breach of Contract", status: "generated_locked",
    } as any);
    vi.mocked(dbModule.incrementDiscountCodeUsage).mockResolvedValue(undefined);
    vi.mocked(dbModule.createCommission).mockResolvedValue(undefined);
    vi.mocked(dbModule.updateLetterStatus).mockResolvedValue(undefined);
    vi.mocked(dbModule.logReviewAction).mockResolvedValue(undefined);
    vi.mocked(dbModule.createNotification).mockResolvedValue(undefined);
    vi.mocked(emailModule.sendLetterUnlockedEmail).mockResolvedValue(undefined);
    vi.mocked(emailModule.sendEmployeeCommissionEmail).mockResolvedValue(undefined);
    // Wire constructEvent to return the event passed in req.body
    vi.mocked(stripeModule.getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockImplementation((_body: any, _sig: any, _secret: any) => {
          // Will be overridden per-test
          throw new Error("constructEvent not set up");
        }),
      },
      customers: {
        retrieve: vi.fn().mockResolvedValue({ deleted: false, metadata: { userId: "5" } }),
      },
    } as any);
  });

  function setupConstructEvent(event: any) {
    vi.mocked(stripeModule.getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(event),
      },
      customers: {
        retrieve: vi.fn().mockResolvedValue({ deleted: false, metadata: { userId: "5" } }),
      },
    } as any);
  }

  it("sends commission email to employee after per-letter payment with discount code", async () => {
    const session = makePerLetterSession();
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@lawfirm.com",
        name: "Alice Johnson",
        subscriberName: "John Doe",
        planName: "Pay Per Letter",
        commissionAmount: "$10.00", // 5% of $200
        discountCode: "ALICE20",
      })
    );
  });

  it("sends commission email to employee after subscription payment with discount code", async () => {
    const session = makeSubscriptionSession();
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@lawfirm.com",
        name: "Alice Johnson",
        subscriberName: "John Doe",
        planName: "Monthly Basic",
        commissionAmount: "$24.95", // 5% of $499
        discountCode: "ALICE20",
      })
    );
  });

  it("does NOT send commission email when no discount code is used", async () => {
    const session = makePerLetterSession();
    delete session.metadata.discount_code;
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).not.toHaveBeenCalled();
  });

  it("does NOT send commission email when discount code is inactive", async () => {
    vi.mocked(dbModule.getDiscountCodeByCode).mockResolvedValue({
      id: 3, code: "ALICE20", employeeId: 10, isActive: false, discountPercent: 20,
    } as any);

    const session = makePerLetterSession();
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).not.toHaveBeenCalled();
  });

  it("does NOT send commission email when employee has no email (graceful degradation)", async () => {
    vi.mocked(dbModule.getUserById).mockImplementation(async (id: number) => {
      if (id === 10) return { id: 10, name: "Alice Johnson", email: null, role: "employee" } as any;
      if (id === 5) return { id: 5, name: "John Doe", email: "john@example.com", role: "subscriber" } as any;
      return undefined;
    });

    const session = makePerLetterSession();
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).not.toHaveBeenCalled();
    // Commission should still be created even without email
    expect(vi.mocked(dbModule.createCommission)).toHaveBeenCalled();
  });

  it("returns 200 even if commission email throws (fire-and-forget)", async () => {
    vi.mocked(emailModule.sendEmployeeCommissionEmail).mockRejectedValueOnce(
      new Error("SMTP timeout")
    );

    const session = makePerLetterSession();
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    // Should not throw — email errors are caught
    await expect(handleStripeWebhook(req, res)).resolves.not.toThrow();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ received: true }));
  });
});
