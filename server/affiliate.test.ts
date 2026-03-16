import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

function getMockDiscountCode() {
  return {
    id: 1,
    employeeId: 10,
    code: "JOHN-A1B2C3",
    discountPercent: 20,
    usageCount: 5,
    maxUses: null,
    isActive: true,
    expiresAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-15"),
  };
}

function getMockEarnings() {
  return {
    totalEarned: 5000,
    pending: 3000,
    paid: 2000,
    referralCount: 5,
  };
}

function getMockCommissions() {
  return [
    {
      id: 1,
      employeeId: 10,
      letterRequestId: 100,
      subscriberId: 50,
      discountCodeId: 1,
      stripePaymentIntentId: "pi_test_123",
      saleAmount: 20000,
      commissionRate: 500,
      commissionAmount: 1000,
      status: "pending",
      paidAt: null,
      createdAt: new Date("2026-02-01"),
    },
  ];
}

function getMockPayoutRequests() {
  return [
    {
      id: 1,
      employeeId: 10,
      amount: 2000,
      paymentMethod: "bank_transfer",
      paymentDetails: null,
      status: "pending",
      processedAt: null,
      processedBy: null,
      rejectionReason: null,
      createdAt: new Date("2026-02-10"),
      updatedAt: new Date("2026-02-10"),
    },
  ];
}

// Mock the db module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
    getDiscountCodeByEmployeeId: vi.fn().mockImplementation(async () => getMockDiscountCode()),
    createDiscountCodeForEmployee: vi.fn().mockImplementation(async () => getMockDiscountCode()),
    getDiscountCodeByCode: vi.fn().mockImplementation(async (code: string) => {
      const base = getMockDiscountCode();
      if (code === "JOHN-A1B2C3") return base;
      if (code === "EXPIRED-CODE") return { ...base, expiresAt: new Date("2025-01-01") };
      if (code === "INACTIVE-CODE") return { ...base, isActive: false };
      if (code === "MAXED-CODE") return { ...base, maxUses: 5, usageCount: 5 };
      return undefined;
    }),
    getEmployeeEarningsSummary: vi.fn().mockImplementation(async () => getMockEarnings()),
    getCommissionsByEmployeeId: vi.fn().mockImplementation(async () => getMockCommissions()),
    getPayoutRequestsByEmployeeId: vi.fn().mockImplementation(async () => getMockPayoutRequests()),
    createPayoutRequest: vi.fn().mockResolvedValue({ insertId: 2 }),
    getAllDiscountCodes: vi.fn().mockImplementation(async () => [getMockDiscountCode()]),
    getAllCommissions: vi.fn().mockImplementation(async () => getMockCommissions()),
    getAllEmployeeEarnings: vi.fn().mockImplementation(async () => [
      { employeeId: 10, ...getMockEarnings() },
    ]),
    getAllPayoutRequests: vi.fn().mockImplementation(async () => getMockPayoutRequests()),
    getPayoutRequestById: vi.fn().mockImplementation(async () => getMockPayoutRequests()[0]),
    processPayoutRequest: vi.fn().mockResolvedValue(undefined),
    markCommissionsPaid: vi.fn().mockResolvedValue(undefined),
    updateDiscountCode: vi.fn().mockResolvedValue(undefined),
    incrementDiscountCodeUsage: vi.fn().mockResolvedValue(undefined),
    createCommission: vi.fn().mockResolvedValue({ insertId: 2 }),
    getEmployees: vi.fn().mockResolvedValue([
      { id: 10, name: "John Doe", email: "john@example.com", role: "employee" },
    ]),
  };
});

// ─── Context Helpers ─────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: string, userId = 10): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `user-${userId}`,
    email: `user${userId}@example.com`,
    name: "Test User",
    loginMethod: "email",
    role: role as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: { host: "localhost:3000" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as any,
  };
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { host: "localhost:3000" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as any,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Affiliate System", () => {
  describe("affiliate.myCode", () => {
    it("returns existing discount code for employee", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      const code = await caller.affiliate.myCode();
      expect(code).toBeDefined();
      expect(code.code).toBe("JOHN-A1B2C3");
      expect(code.discountPercent).toBe(20);
      expect(code.isActive).toBe(true);
    });

    it("rejects subscriber access", async () => {
      const caller = appRouter.createCaller(createContext("subscriber"));
      await expect(caller.affiliate.myCode()).rejects.toThrow();
    });

    it("allows admin access", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const code = await caller.affiliate.myCode();
      expect(code).toBeDefined();
    });
  });

  describe("affiliate.myEarnings", () => {
    it("returns earnings summary for employee", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      const earnings = await caller.affiliate.myEarnings();
      expect(earnings.totalEarned).toBe(5000);
      expect(earnings.pending).toBe(3000);
      expect(earnings.paid).toBe(2000);
      expect(earnings.referralCount).toBe(5);
    });
  });

  describe("affiliate.myCommissions", () => {
    it("returns commission history for employee", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      const commissions = await caller.affiliate.myCommissions();
      expect(commissions).toHaveLength(1);
      expect(commissions[0].commissionAmount).toBe(1000);
      expect(commissions[0].commissionRate).toBe(500);
    });
  });

  describe("affiliate.requestPayout", () => {
    it("creates payout request when balance is sufficient", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      const result = await caller.affiliate.requestPayout({
        amount: 2000, // $20.00 — within $30 pending
        paymentMethod: "bank_transfer",
      });
      expect(result.success).toBe(true);
      expect(result.payoutRequestId).toBe(2);
    });

    it("rejects payout when balance is insufficient", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      await expect(
        caller.affiliate.requestPayout({
          amount: 500000, // $5000 — way over $30 pending
          paymentMethod: "bank_transfer",
        })
      ).rejects.toThrow(/Insufficient pending balance/);
    });

    it("rejects payout below minimum ($10)", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      await expect(
        caller.affiliate.requestPayout({
          amount: 500, // $5 — below $10 minimum
          paymentMethod: "bank_transfer",
        })
      ).rejects.toThrow();
    });
  });

  describe("affiliate.myPayouts", () => {
    it("returns payout history for employee", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      const payouts = await caller.affiliate.myPayouts();
      expect(payouts).toHaveLength(1);
      expect(payouts[0].amount).toBe(2000);
      expect(payouts[0].status).toBe("pending");
    });
  });

  describe("affiliate.validateCode", () => {
    it("validates an active discount code", async () => {
      const caller = appRouter.createCaller(createAnonymousContext());
      const result = await caller.affiliate.validateCode({ code: "JOHN-A1B2C3" });
      expect(result.valid).toBe(true);
      expect(result.discountPercent).toBe(20);
    });

    it("rejects an unknown code", async () => {
      const caller = appRouter.createCaller(createAnonymousContext());
      const result = await caller.affiliate.validateCode({ code: "NONEXISTENT" });
      expect(result.valid).toBe(false);
    });

    it("rejects an expired code", async () => {
      const caller = appRouter.createCaller(createAnonymousContext());
      const result = await caller.affiliate.validateCode({ code: "EXPIRED-CODE" });
      expect(result.valid).toBe(false);
    });

    it("rejects an inactive code", async () => {
      const caller = appRouter.createCaller(createAnonymousContext());
      const result = await caller.affiliate.validateCode({ code: "INACTIVE-CODE" });
      expect(result.valid).toBe(false);
    });

    it("rejects a maxed-out code", async () => {
      const caller = appRouter.createCaller(createAnonymousContext());
      const result = await caller.affiliate.validateCode({ code: "MAXED-CODE" });
      expect(result.valid).toBe(false);
    });
  });

  describe("Admin Affiliate Procedures", () => {
    it("admin can view all discount codes", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const codes = await caller.affiliate.adminAllCodes();
      expect(codes).toHaveLength(1);
    });

    it("admin can view all commissions", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const commissions = await caller.affiliate.adminAllCommissions();
      expect(commissions).toHaveLength(1);
    });

    it("admin can view all payouts", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const payouts = await caller.affiliate.adminAllPayouts();
      expect(payouts).toHaveLength(1);
    });

    it("admin can view employee performance", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const perf = await caller.affiliate.adminEmployeePerformance();
      expect(perf).toHaveLength(1);
      expect(perf[0].name).toBe("John Doe");
      expect(perf[0].totalEarned).toBe(5000);
    });

    it("admin can toggle discount code active status", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const result = await caller.affiliate.adminUpdateCode({
        id: 1,
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it("admin can approve a payout", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const result = await caller.affiliate.adminProcessPayout({
        payoutId: 1,
        action: "completed",
      });
      expect(result.success).toBe(true);
    });

    it("admin can reject a payout with reason", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      const result = await caller.affiliate.adminProcessPayout({
        payoutId: 1,
        action: "rejected",
        rejectionReason: "Invalid payment details provided",
      });
      expect(result.success).toBe(true);
    });

    it("non-admin cannot access admin affiliate procedures", async () => {
      const caller = appRouter.createCaller(createContext("subscriber"));
      await expect(caller.affiliate.adminAllCodes()).rejects.toThrow();
      await expect(caller.affiliate.adminAllCommissions()).rejects.toThrow();
      await expect(caller.affiliate.adminAllPayouts()).rejects.toThrow();
    });

    it("employee cannot access admin affiliate procedures", async () => {
      const caller = appRouter.createCaller(createContext("employee"));
      await expect(caller.affiliate.adminAllCodes()).rejects.toThrow();
      await expect(caller.affiliate.adminAllCommissions()).rejects.toThrow();
    });
  });
});

describe("Commission Calculation", () => {
  it("calculates 5% commission correctly", () => {
    const saleAmount = 20000; // $200.00
    const commissionRate = 500; // 5% in basis points
    const commissionAmount = Math.round(saleAmount * commissionRate / 10000);
    expect(commissionAmount).toBe(1000); // $10.00
  });

  it("handles small amounts without rounding errors", () => {
    const saleAmount = 999; // $9.99
    const commissionRate = 500;
    const commissionAmount = Math.round(saleAmount * commissionRate / 10000);
    expect(commissionAmount).toBe(50); // $0.50
  });

  it("handles large amounts", () => {
    const saleAmount = 100000; // $1000.00
    const commissionRate = 500;
    const commissionAmount = Math.round(saleAmount * commissionRate / 10000);
    expect(commissionAmount).toBe(5000); // $50.00
  });

  it("handles different commission rates", () => {
    const saleAmount = 20000; // $200.00
    // 10% = 1000 basis points
    expect(Math.round(saleAmount * 1000 / 10000)).toBe(2000); // $20.00
    // 2.5% = 250 basis points
    expect(Math.round(saleAmount * 250 / 10000)).toBe(500); // $5.00
  });
});
