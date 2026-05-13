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
    subscriptions: {
      retrieve: vi.fn(),
    },
  }),
  activateSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./stripe/subscriptions", () => ({
  activateSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/billing", () => ({
  fulfillLetterUnlock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
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
  createCommission: vi.fn().mockResolvedValue({ id: 22, insertId: 22, created: true }),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
  notifyAllAttorneys: vi.fn().mockResolvedValue(undefined),
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
      plan_id: "single_letter",
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
    amount_total: 20000, // $200
    payment_intent: null,
    customer: "cus_test_xyz",
    client_reference_id: "5",
    success_url: "https://www.talk-to-my-lawyer.com/billing?success=true",
    metadata: {
      user_id: "5",
      plan_id: "monthly",
      discount_code: "ALICE20",
      ...metaOverrides,
    },
  };
}

function makeStripeSubscription(metaOverrides: Record<string, any> = {}): any {
  return {
    id: "sub_test_123",
    customer: "cus_test_xyz",
    status: "active",
    current_period_start: 1778688000,
    current_period_end: 1781366400,
    cancel_at_period_end: false,
    metadata: {
      user_id: "5",
      plan_id: "monthly",
      discount_code: "ALICE20",
      employee_id: "10",
      discount_code_id: "3",
      ...metaOverrides,
    },
  };
}

function makeInvoice(overrides: Record<string, any> = {}): any {
  return {
    id: "in_test_123",
    amount_paid: 20000,
    billing_reason: "subscription_create",
    payment_intent: "pi_invoice_123",
    parent: {
      subscription_details: {
        subscription: "sub_test_123",
      },
    },
    ...overrides,
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
    vi.mocked(dbModule.createCommission).mockResolvedValue({
      id: 22,
      insertId: 22,
      created: true,
    } as any);
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
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(makeStripeSubscription()),
      },
    } as any);
  });

  function setupConstructEvent(
    event: any,
    subscription: any = makeStripeSubscription()
  ) {
    vi.mocked(stripeModule.getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(event),
      },
      customers: {
        retrieve: vi.fn().mockResolvedValue({ deleted: false, metadata: { userId: "5" } }),
      },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(subscription),
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
        planName: "single_letter",
        commissionAmount: "$10.00", // 5% of $200
        discountCode: "ALICE20",
      })
    );
  });

  it("does NOT send subscription commission email from checkout.session.completed", async () => {
    const session = makeSubscriptionSession();
    const event = makeWebhookEvent("checkout.session.completed", session);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(dbModule.createCommission)).not.toHaveBeenCalled();
    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).not.toHaveBeenCalled();
  });

  it("sends commission email to employee after initial subscription invoice.paid", async () => {
    const invoice = makeInvoice();
    const event = makeWebhookEvent("invoice.paid", invoice);
    const { req, res } = makeMockReqRes(event);
    setupConstructEvent(event);

    await handleStripeWebhook(req, res);

    expect(vi.mocked(dbModule.createCommission)).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 10,
        subscriberId: 5,
        stripeInvoiceId: "in_test_123",
        saleAmount: 20000,
      })
    );
    expect(vi.mocked(dbModule.incrementDiscountCodeUsage)).toHaveBeenCalledWith(3);
    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(emailModule.sendEmployeeCommissionEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@lawfirm.com",
        name: "Alice Johnson",
        subscriberName: "John Doe",
        planName: "Monthly",
        commissionAmount: "$10.00", // 5% of $200
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
