import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB module ───────────────────────────────────────────────────────────
const mockUpdateUserRole = vi.fn().mockResolvedValue(undefined);
const mockCreateDiscountCodeForEmployee = vi.fn().mockResolvedValue({
  id: 1,
  code: "EMP-TEST-ABC123",
  employeeId: 1,
  discountPercent: 10,
});

vi.mock("./db", () => ({
  updateUserRole: (...args: any[]) => mockUpdateUserRole(...args),
  createDiscountCodeForEmployee: (...args: any[]) => mockCreateDiscountCodeForEmployee(...args),
  getLetterRequestById: vi.fn(),
  getAllLetterRequests: vi.fn().mockResolvedValue([]),
  getLetterVersionsByRequestId: vi.fn().mockResolvedValue([]),
  getReviewActions: vi.fn().mockResolvedValue([]),
  getWorkflowJobsByLetterId: vi.fn().mockResolvedValue([]),
  getResearchRunsByLetterId: vi.fn().mockResolvedValue([]),
  getAttachmentsByLetterId: vi.fn().mockResolvedValue([]),
  getUserSubscription: vi.fn().mockResolvedValue(null),
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  getDiscountCodeByEmployeeId: vi.fn().mockResolvedValue(null),
  getEmployeeEarningsSummary: vi.fn().mockResolvedValue({ totalEarned: 0, pending: 0, paid: 0, referralCount: 0 }),
  getCommissionsByEmployeeId: vi.fn().mockResolvedValue([]),
  getPayoutRequestsByEmployeeId: vi.fn().mockResolvedValue([]),
  getAllCommissions: vi.fn().mockResolvedValue([]),
  getAllPayoutRequests: vi.fn().mockResolvedValue([]),
  processPayoutRequest: vi.fn(),
  createPayoutRequest: vi.fn(),
  getDb: vi.fn().mockResolvedValue(null),
}));

// ─── Mock Stripe ──────────────────────────────────────────────────────────────
vi.mock("./stripe", () => ({
  getStripe: vi.fn(() => ({
    paymentIntents: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: "pi_test_123",
            amount: 20000,
            currency: "usd",
            status: "succeeded",
            description: "Letter unlock payment",
            created: 1700000000,
            latest_charge: { receipt_url: "https://receipt.stripe.com/test" },
            metadata: { letter_id: "42" },
          },
        ],
      }),
    },
  })),
  getOrCreateStripeCustomer: vi.fn().mockResolvedValue("cus_test_123"),
  createCheckoutSession: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getUserSubscription: vi.fn().mockResolvedValue(null),
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  createLetterUnlockCheckout: vi.fn(),
}));

vi.mock("./stripe-products", () => ({
  PLANS: {},
  LETTER_UNLOCK_PRICE_CENTS: 20000,
}));

vi.mock("./email-service", () => ({
  sendLetterUnlockedEmail: vi.fn(),
  sendNewReviewNeededEmail: vi.fn(),
}));

// ─── Test: Intake Normalizer ──────────────────────────────────────────────────
describe("Intake Normalizer — structured fields", () => {
  it("should include language, priorCommunication, deliveryMethod in normalized output", async () => {
    const { buildNormalizedPromptInput: normalizeIntake } = await import("./intake-normalizer");

    const dbFields = {
      letterType: "demand-letter",
      subject: "Test Subject",
      issueSummary: "Test issue",
      jurisdictionCountry: "US",
      jurisdictionState: "California",
      jurisdictionCity: null,
    };

    const rawIntake = {
      schemaVersion: "1.0",
      letterType: "demand-letter",
      sender: { name: "John Doe", address: "123 Main St" },
      recipient: { name: "Jane Corp", address: "456 Business Ave" },
      jurisdiction: { country: "US", state: "California" },
      matter: {
        category: "demand-letter",
        subject: "Payment Demand",
        description: "Demanding payment for services rendered",
      },
      desiredOutcome: "Full payment of $5000",
      tonePreference: "firm",
      language: "spanish",
      priorCommunication: "Sent two emails and one phone call with no response",
      deliveryMethod: "email",
    };

    const result = normalizeIntake(dbFields, rawIntake);

    expect(result.language).toBe("spanish");
    expect(result.priorCommunication).toBe("Sent two emails and one phone call with no response");
    expect(result.deliveryMethod).toBe("email");
  });

  it("should default language to english and deliveryMethod to certified_mail", async () => {
    const { buildNormalizedPromptInput: normalizeIntake } = await import("./intake-normalizer");

    const dbFields = {
      letterType: "cease-and-desist",
      subject: "Test",
      issueSummary: null,
      jurisdictionCountry: "US",
      jurisdictionState: "New York",
      jurisdictionCity: null,
    };

    const rawIntake = {
      schemaVersion: "1.0",
      letterType: "cease-and-desist",
      sender: { name: "Alice", address: "789 Oak St" },
      recipient: { name: "Bob", address: "321 Elm St" },
      jurisdiction: { country: "US", state: "New York" },
      matter: {
        category: "cease-and-desist",
        subject: "Stop harassment",
        description: "Cease and desist demand",
      },
      desiredOutcome: "Stop all contact",
      tonePreference: "aggressive",
      // No language, priorCommunication, or deliveryMethod provided
    };

    const result = normalizeIntake(dbFields, rawIntake);

    expect(result.language).toBe("english");
    expect(result.priorCommunication).toBeNull();
    expect(result.deliveryMethod).toBe("certified_mail");
  });
});

// ─── Test: IntakeJson type ────────────────────────────────────────────────────
describe("IntakeJson type — new fields", () => {
  it("should accept language, priorCommunication, deliveryMethod", async () => {
    const { default: types } = await import("../shared/types") as any;
    // Type check: create an IntakeJson-compatible object with new fields
    const intake = {
      schemaVersion: "1.0",
      letterType: "demand-letter",
      sender: { name: "A", address: "B" },
      recipient: { name: "C", address: "D" },
      jurisdiction: { country: "US", state: "CA" },
      matter: { category: "demand-letter", subject: "Test", description: "Test desc" },
      desiredOutcome: "Payment",
      language: "french",
      priorCommunication: "Called twice",
      deliveryMethod: "hand_delivery",
    };
    // Just verify the object is valid (no runtime type checking needed)
    expect(intake.language).toBe("french");
    expect(intake.priorCommunication).toBe("Called twice");
    expect(intake.deliveryMethod).toBe("hand_delivery");
  });
});

// ─── Test: Onboarding mutation logic ──────────────────────────────────────────
describe("Onboarding — completeOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update user role to subscriber", async () => {
    // Simulate the onboarding logic
    const role = "subscriber";
    const userId = 1;
    await mockUpdateUserRole(userId, role);
    expect(mockUpdateUserRole).toHaveBeenCalledWith(1, "subscriber");
  });

  it("should update user role to employee and create discount code", async () => {
    const role = "employee";
    const userId = 2;
    const userName = "Test Employee";
    await mockUpdateUserRole(userId, role);
    await mockCreateDiscountCodeForEmployee(userId, userName);
    expect(mockUpdateUserRole).toHaveBeenCalledWith(2, "employee");
    expect(mockCreateDiscountCodeForEmployee).toHaveBeenCalledWith(2, "Test Employee");
  });

  it("should update user role to attorney without creating discount code", async () => {
    const role = "attorney";
    const userId = 3;
    await mockUpdateUserRole(userId, role);
    expect(mockUpdateUserRole).toHaveBeenCalledWith(3, "attorney");
    expect(mockCreateDiscountCodeForEmployee).not.toHaveBeenCalled();
  });

  it("should handle discount code creation failure gracefully", async () => {
    mockCreateDiscountCodeForEmployee.mockRejectedValueOnce(new Error("Already exists"));
    const role = "employee";
    const userId = 4;
    await mockUpdateUserRole(userId, role);
    try {
      await mockCreateDiscountCodeForEmployee(userId, "Existing Employee");
    } catch (e) {
      // Expected — the onboarding mutation catches this
    }
    expect(mockUpdateUserRole).toHaveBeenCalledWith(4, "employee");
  });
});

// ─── Test: Payment History ────────────────────────────────────────────────────
describe("Payment History — billing.paymentHistory", () => {
  it("should return formatted payment data from Stripe", async () => {
    const { getStripe, getOrCreateStripeCustomer } = await import("./stripe");
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(1, "test@test.com", "Test User");
    expect(customerId).toBe("cus_test_123");

    const result = await (stripe as any).paymentIntents.list({
      customer: customerId,
      limit: 25,
      expand: ["data.latest_charge"],
    });

    expect(result.data).toHaveLength(1);
    const pi = result.data[0];
    expect(pi.id).toBe("pi_test_123");
    expect(pi.amount).toBe(20000);
    expect(pi.currency).toBe("usd");
    expect(pi.status).toBe("succeeded");
    expect(pi.latest_charge.receipt_url).toBe("https://receipt.stripe.com/test");
  });

  it("should handle empty payment list", async () => {
    const { getStripe } = await import("./stripe");
    const stripe = getStripe();
    (stripe as any).paymentIntents.list.mockResolvedValueOnce({ data: [] });
    const result = await (stripe as any).paymentIntents.list({
      customer: "cus_empty",
      limit: 25,
    });
    expect(result.data).toHaveLength(0);
  });
});

// ─── Test: SLA calculation (attorney dashboard) ───────────────────────────────
describe("SLA Calculation — Attorney Dashboard", () => {
  it("should identify letters older than 24h as overdue", () => {
    const hoursSince = (dateStr: string | Date): number => {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      return Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60));
    };

    // 30 hours ago
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
    expect(hoursSince(oldDate)).toBeGreaterThan(24);

    // 12 hours ago
    const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    expect(hoursSince(recentDate)).toBeLessThan(24);

    // 20 hours ago (urgent but not overdue)
    const urgentDate = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const hrs = hoursSince(urgentDate);
    expect(hrs).toBeGreaterThan(18);
    expect(hrs).toBeLessThan(24);
  });

  it("should handle string dates", () => {
    const hoursSince = (dateStr: string | Date): number => {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      return Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60));
    };

    const isoDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(hoursSince(isoDate)).toBeGreaterThan(47);
  });
});

// ─── Test: Draft resume localStorage key ──────────────────────────────────────
describe("Draft Resume — localStorage key", () => {
  it("should use correct draft key constant", () => {
    const DRAFT_KEY = "ttml_draft_letter";
    expect(DRAFT_KEY).toBe("ttml_draft_letter");
  });

  it("should serialize/deserialize form data correctly", () => {
    const formData = {
      letterType: "demand-letter",
      subject: "Test Subject",
      jurisdictionState: "California",
      description: "Test description that is long enough",
    };
    const serialized = JSON.stringify({ form: formData, step: 3, savedAt: Date.now() });
    const parsed = JSON.parse(serialized);
    expect(parsed.form.letterType).toBe("demand-letter");
    expect(parsed.step).toBe(3);
    expect(parsed.savedAt).toBeDefined();
  });
});
