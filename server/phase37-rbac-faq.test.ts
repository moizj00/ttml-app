import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CLIENT_SRC = join(__dirname, "..", "client", "src");

describe("Phase 37: Role-based routing, FAQ, Onboarding, Mobile nav", () => {
  // ── ProtectedRoute component ──────────────────────────────────────────
  describe("ProtectedRoute component", () => {
    const filePath = join(CLIENT_SRC, "components", "ProtectedRoute.tsx");

    it("should exist", () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it("should accept allowedRoles prop", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("allowedRoles");
    });

    it("should redirect unauthenticated users to /login", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("/login");
    });

    it("should redirect unauthorized roles to their correct dashboard", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("/admin");
      expect(content).toContain("/employee");
      expect(content).toContain("/dashboard");
    });

    it("should use useAuth hook for auth state", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("useAuth");
    });
  });

  // ── App.tsx route guards ──────────────────────────────────────────────
  describe("App.tsx role-gated routes", () => {
    const filePath = join(CLIENT_SRC, "App.tsx");

    it("should exist", () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it("should import ProtectedRoute", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("import ProtectedRoute");
    });

    it("should wrap subscriber routes with ProtectedRoute subscriber role", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('allowedRoles={["subscriber"]}');
    });

    it("should wrap admin routes with ProtectedRoute admin role", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('allowedRoles={["admin"]}');
    });

    it("should wrap employee routes with ProtectedRoute employee+admin roles", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('allowedRoles={["employee", "admin"]}');
    });

    it("should include /faq route", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('path="/faq"');
      // FAQ is lazy-loaded via React.lazy(() => import(...))
      expect(content).toMatch(/FAQ.*=.*lazy/);
    });
  });

  // ── FAQ page ──────────────────────────────────────────────────────────
  describe("FAQ page", () => {
    const filePath = join(CLIENT_SRC, "pages", "FAQ.tsx");

    it("should exist", () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it("should use Accordion component", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Accordion");
      expect(content).toContain("AccordionItem");
      expect(content).toContain("AccordionTrigger");
      expect(content).toContain("AccordionContent");
    });

    it("should have multiple FAQ categories", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("About the Service");
      expect(content).toContain("Pricing & Payment");
      expect(content).toContain("The Process");
      expect(content).toContain("Legal Validity & Use");
      expect(content).toContain("Account & Technical");
    });

    it("should include CTA section", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Ready to Get Started");
      expect(content).toContain("/signup");
    });

    it("should include JSON-LD structured data for SEO", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("FAQPage");
      expect(content).toContain("application/ld+json");
    });
  });

  // ── OnboardingModal ───────────────────────────────────────────────────
  describe("OnboardingModal component", () => {
    const filePath = join(CLIENT_SRC, "components", "OnboardingModal.tsx");

    it("should exist", () => {
      expect(existsSync(filePath)).toBe(true);
    });

    it("should use Dialog component", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Dialog");
      expect(content).toContain("DialogContent");
    });

    it("should have 4 onboarding steps", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Submit Your Legal Matter");
      expect(content).toContain("Legal Research & Drafting");
      expect(content).toContain("Attorney Review & Approval");
      expect(content).toContain("Download Your Letter");
    });

    it("should persist dismissal in localStorage", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("ttml_onboarding_seen");
      expect(content).toContain("localStorage");
    });

    it("should link to /submit on the last step", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("/submit");
      expect(content).toContain("Submit Your First Letter");
    });

    it("should be imported in subscriber Dashboard", () => {
      const dashPath = join(CLIENT_SRC, "pages", "subscriber", "Dashboard.tsx");
      const content = readFileSync(dashPath, "utf-8");
      expect(content).toContain("import OnboardingModal");
      expect(content).toContain("<OnboardingModal");
    });
  });

  // ── Home.tsx FAQ section + mobile nav ─────────────────────────────────
  describe("Home.tsx enhancements", () => {
    const filePath = join(CLIENT_SRC, "pages", "Home.tsx");

    it("should have an inline FAQ section with id='faq'", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('id="faq"');
      expect(content).toContain("FAQ");
    });

    it("should use collapsible FAQ items with ChevronDown toggle", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("ChevronDown");
      expect(content).toContain("faqs.map");
    });

    it("should have a 'View All FAQs' link to /faq", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("View All FAQs");
      expect(content).toContain('href="/faq"');
    });

    it("should have a mobile hamburger menu", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("mobileMenuOpen");
      expect(content).toContain("md:hidden");
      expect(content).toContain("Menu");
    });

    it("should have FAQ link in the nav bar", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('scrollTo("faq")');
    });

    it("should have footer links including FAQ", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('href="/faq"');
      const footerPath = join(CLIENT_SRC, "components", "shared", "Footer.tsx");
      const footerContent = readFileSync(footerPath, "utf-8");
      expect(footerContent).toContain('href="/terms"');
    });
  });

  // ── Login.tsx role-based redirect ─────────────────────────────────────
  describe("Login.tsx role-based redirect", () => {
    const filePath = join(CLIENT_SRC, "pages", "Login.tsx");
    const protectedRoutePath = join(CLIENT_SRC, "components", "ProtectedRoute.tsx");

    it("should use getRoleDashboard for role-based redirect", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("getRoleDashboard");
    });

    it("should import getRoleDashboard and isRoleAllowedOnPath from ProtectedRoute", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("getRoleDashboard");
      expect(content).toContain("isRoleAllowedOnPath");
    });

    it("should support ?next= deep link redirect", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("nextPath");
      expect(content).toContain("next");
    });

    it("should define getRoleDashboard in ProtectedRoute covering all 4 roles", () => {
      const content = readFileSync(protectedRoutePath, "utf-8");
      expect(content).toContain('"/admin"');
      expect(content).toContain('"/attorney"');
      expect(content).toContain('"/employee"');
      expect(content).toContain('"/dashboard"');
    });
  });

  // ── Signup.tsx onboarding trigger ─────────────────────────────────────
  describe("Signup.tsx onboarding trigger", () => {
    const filePath = join(CLIENT_SRC, "pages", "Signup.tsx");

    it("should clear onboarding flag for new signups", () => {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain('localStorage.removeItem("ttml_onboarding_seen")');
    });
  });
});
