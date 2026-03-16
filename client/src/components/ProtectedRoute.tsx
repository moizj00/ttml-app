import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

type Role = "subscriber" | "employee" | "admin" | "attorney";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If provided, only users with one of these roles can access this route */
  allowedRoles?: Role[];
}

/**
 * Returns the default home path for a given role.
 */
export function getRoleDashboard(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "attorney") return "/attorney";
  if (role === "employee") return "/employee";
  return "/dashboard"; // subscriber default
}

/**
 * Returns true if the given role is permitted on the given path.
 * Used to validate ?next= redirects after login so a user cannot
 * be bounced into a portal they don't have access to.
 */
export function isRoleAllowedOnPath(role: string, path: string): boolean {
  if (role === "admin") return true; // admin can access everything
  if (role === "subscriber") {
    return (
      path.startsWith("/dashboard") ||
      path.startsWith("/submit") ||
      path.startsWith("/letters") ||
      path.startsWith("/subscriber")
    );
  }
  if (role === "employee") {
    return path.startsWith("/employee");
  }
  if (role === "attorney") {
    return path.startsWith("/attorney") || path.startsWith("/review");
  }
  return false;
}

/**
 * ProtectedRoute — wraps pages that require authentication.
 *
 * Behaviour:
 * - Unauthenticated → redirect to /login?next=<current-path>
 * - Authenticated but email unverified → redirect to /verify-email
 * - Authenticated but wrong role → redirect to the user's correct dashboard
 * - Authenticated + correct role → render children
 */
export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !user) {
      // Preserve the intended destination so we can return after login
      const next = encodeURIComponent(location);
      navigate(`/login?next=${next}`);
      return;
    }

    // Gate: email must be verified before accessing the app
    // Admins are always pre-verified; skip gate for them
    if (user.role !== "admin" && !(user as any).emailVerified) {
      navigate("/verify-email");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
      // Redirect to the user's correct dashboard
      navigate(getRoleDashboard(user.role));
    }
  }, [loading, isAuthenticated, user, allowedRoles, navigate, location]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  // Block unverified users (non-admin)
  if (user.role !== "admin" && !(user as any).emailVerified) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
    return null;
  }

  return <>{children}</>;
}
