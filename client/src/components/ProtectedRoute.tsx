import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

type Role = "subscriber" | "employee" | "admin" | "attorney";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export function getRoleDashboard(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "attorney") return "/attorney";
  if (role === "employee") return "/employee";
  return "/dashboard";
}

export function isRoleAllowedOnPath(role: string, path: string): boolean {
  if (role === "admin") return true;
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

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const [admin2FAChecked, setAdmin2FAChecked] = useState(false);
  const [admin2FAVerified, setAdmin2FAVerified] = useState(false);

  const isAdminRoute = allowedRoles?.includes("admin") && allowedRoles.length === 1;

  useEffect(() => {
    if (loading || !user || user.role !== "admin" || !isAdminRoute) {
      setAdmin2FAChecked(true);
      return;
    }
    fetch("/api/auth/admin-2fa/status", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setAdmin2FAVerified(data.verified === true);
        setAdmin2FAChecked(true);
      })
      .catch((err) => {
        console.error("[ProtectedRoute] Failed to check admin 2FA status:", err);
        setAdmin2FAChecked(true);
      });
  }, [loading, user, isAdminRoute]);

  useEffect(() => {
    if (loading || !admin2FAChecked) return;

    if (!isAuthenticated || !user) {
      const next = encodeURIComponent(location);
      navigate(`/login?next=${next}`);
      return;
    }

    if (user.role !== "admin" && !(user as any).emailVerified) {
      navigate("/verify-email");
      return;
    }

    if (user.role === "admin" && isAdminRoute && !admin2FAVerified) {
      navigate("/admin/verify");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
      navigate(getRoleDashboard(user.role));
    }
  }, [loading, isAuthenticated, user, allowedRoles, navigate, location, admin2FAChecked, admin2FAVerified, isAdminRoute]);

  if (loading || !admin2FAChecked) {
    return <DashboardLayoutSkeleton />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.role !== "admin" && !(user as any).emailVerified) {
    return null;
  }

  if (user.role === "admin" && isAdminRoute && !admin2FAVerified) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
    return null;
  }

  return <>{children}</>;
}
