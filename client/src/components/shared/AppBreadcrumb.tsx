import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Home,
  FileText,
  PlusCircle,
  CreditCard,
  LayoutDashboard,
  Users,
  AlertCircle,
  ClipboardList,
  Briefcase,
  Receipt,
  Scale,
  ChevronRight,
} from "lucide-react";

/**
 * Route-to-breadcrumb label + icon mapping.
 * Supports exact paths and pattern segments.
 * Dynamic segments (e.g. letter IDs) are resolved at render time.
 */
const ROUTE_MAP: Record<string, { label: string; icon?: React.ReactNode }> = {
  // Subscriber
  "/dashboard": { label: "Dashboard", icon: <LayoutDashboard className="size-3.5" /> },
  "/submit": { label: "Submit Letter", icon: <PlusCircle className="size-3.5" /> },
  "/letters": { label: "My Letters", icon: <FileText className="size-3.5" /> },
  "/subscriber": { label: "Account" },
  "/subscriber/billing": { label: "Billing", icon: <CreditCard className="size-3.5" /> },
  "/subscriber/receipts": { label: "Receipts", icon: <Receipt className="size-3.5" /> },

  // Attorney / Review Center
  "/attorney": { label: "Review Center", icon: <Scale className="size-3.5" /> },
  "/attorney/queue": { label: "Queue", icon: <ClipboardList className="size-3.5" /> },
  "/review": { label: "Review Center", icon: <Scale className="size-3.5" /> },
  "/review/queue": { label: "Queue", icon: <ClipboardList className="size-3.5" /> },

  // Employee / Affiliate
  "/employee": { label: "Affiliate Dashboard", icon: <Briefcase className="size-3.5" /> },
  "/employee/referrals": { label: "My Referrals", icon: <Users className="size-3.5" /> },
  "/employee/earnings": { label: "Earnings", icon: <CreditCard className="size-3.5" /> },

  // Admin
  "/admin": { label: "Admin Dashboard", icon: <LayoutDashboard className="size-3.5" /> },
  "/admin/letters": { label: "All Letters", icon: <FileText className="size-3.5" /> },
  "/admin/users": { label: "Users", icon: <Users className="size-3.5" /> },
  "/admin/jobs": { label: "Failed Jobs", icon: <AlertCircle className="size-3.5" /> },
  "/admin/affiliate": { label: "Affiliate Program", icon: <Briefcase className="size-3.5" /> },
};

/**
 * Determines the "home" root for a given role so the first breadcrumb
 * always links back to the user's dashboard.
 */
function getRoleHome(role: string): { path: string; label: string } {
  switch (role) {
    case "subscriber":
      return { path: "/dashboard", label: "Dashboard" };
    case "attorney":
      return { path: "/attorney", label: "Review Center" };
    case "employee":
      return { path: "/employee", label: "Affiliate" };
    case "admin":
      return { path: "/admin", label: "Admin" };
    default:
      return { path: "/", label: "Home" };
  }
}

/**
 * Checks if a path segment looks like a dynamic ID
 * (numeric or UUID-like strings).
 */
function isDynamicSegment(segment: string): boolean {
  return /^\d+$/.test(segment) || /^[a-f0-9-]{8,}$/i.test(segment);
}

interface AppBreadcrumbProps {
  /** User role for determining the home root */
  role: string;
  /** Optional manual overrides — if provided, these replace auto-generated crumbs */
  overrides?: { label: string; href?: string }[];
  /** Optional label for a dynamic segment (e.g., "Letter #42") */
  dynamicLabel?: string;
}

export default function AppBreadcrumb({ role, overrides, dynamicLabel }: AppBreadcrumbProps) {
  const [location] = useLocation();

  // If manual overrides are provided, render those instead
  if (overrides && overrides.length > 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
          {overrides.map((crumb, i) => (
            <BreadcrumbItem
              key={i}
              className={`${i < overrides.length - 2 ? "hidden sm:inline-flex" : "inline-flex"} min-w-0 items-center`}
            >
              {i > 0 && <BreadcrumbSeparator className={i < overrides.length - 2 ? "hidden sm:inline-flex" : ""}><ChevronRight className="size-3" /></BreadcrumbSeparator>}
              {crumb.href && i < overrides.length - 1 ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href} className="flex min-w-0 items-center gap-1.5 truncate">
                    <span className="truncate">{crumb.label}</span>
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  // Auto-generate breadcrumbs from the current URL
  const segments = location.split("/").filter(Boolean);
  const roleHome = getRoleHome(role);

  // Build breadcrumb items from path segments
  const crumbs: { label: string; href?: string; icon?: React.ReactNode }[] = [];

  // Always start with the role home
  crumbs.push({
    label: roleHome.label,
    href: roleHome.path,
    icon: <Home className="size-3.5" />,
  });

  // Build cumulative path and resolve each segment
  let cumulativePath = "";
  for (let i = 0; i < segments.length; i++) {
    cumulativePath += "/" + segments[i];
    const mapped = ROUTE_MAP[cumulativePath];

    // Skip if this is the same as the role home (avoid duplicate)
    if (cumulativePath === roleHome.path) continue;

    // Skip intermediate segments that are just role prefixes (e.g., "/subscriber" in "/subscriber/billing")
    if (
      !mapped &&
      !isDynamicSegment(segments[i]) &&
      i < segments.length - 1
    ) {
      continue;
    }

    if (isDynamicSegment(segments[i])) {
      // Dynamic segment — use provided label or format as "Item #ID"
      const label = dynamicLabel || `#${segments[i]}`;
      crumbs.push({ label });
    } else if (mapped) {
      const isLast = i === segments.length - 1;
      crumbs.push({
        label: mapped.label,
        href: isLast ? undefined : cumulativePath,
        icon: mapped.icon,
      });
    }
  }

  // Don't render breadcrumbs if we're on the role home page (just one crumb)
  if (crumbs.length <= 1) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
        {crumbs.map((crumb, i) => (
          <BreadcrumbItem
            key={i}
            className={`${i < crumbs.length - 2 ? "hidden sm:inline-flex" : "inline-flex"} min-w-0 items-center`}
          >
            {i > 0 && (
              <BreadcrumbSeparator className={i < crumbs.length - 2 ? "hidden sm:inline-flex" : ""}>
                <ChevronRight className="size-3" />
              </BreadcrumbSeparator>
            )}
            {crumb.href ? (
              <BreadcrumbLink asChild>
                <Link href={crumb.href} className="flex min-w-0 items-center gap-1.5 truncate">
                  {crumb.icon}
                  <span className="truncate">{crumb.label}</span>
                </Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="flex min-w-0 items-center gap-1.5">
                {crumb.icon}
                <span className="truncate">{crumb.label}</span>
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
