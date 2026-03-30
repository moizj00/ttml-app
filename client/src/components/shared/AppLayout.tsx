import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Users,
  X,
  AlertCircle,
  ClipboardList,
  PlusCircle,
  Briefcase,
  CreditCard,
  Brain,
  BookOpen,
  BarChart3,
  Library,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getRoleDashboard } from "@/components/ProtectedRoute";
import AppBreadcrumb from "./AppBreadcrumb";
import BrandLogo from "./BrandLogo";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

function getNavItems(role: string): NavItem[] {
  if (role === "subscriber") {
    return [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        label: "Template Gallery",
        href: "/templates",
        icon: <Library className="w-4 h-4" />,
      },
      {
        label: "Submit Letter",
        href: "/submit",
        icon: <PlusCircle className="w-4 h-4" />,
      },
      {
        label: "My Letters",
        href: "/letters",
        icon: <FileText className="w-4 h-4" />,
      },
      {
        label: "Billing",
        href: "/subscriber/billing",
        icon: <CreditCard className="w-4 h-4" />,
      },
      {
        label: "Receipts",
        href: "/subscriber/receipts",
        icon: <FileText className="w-4 h-4" />,
      },
      {
        label: "Settings",
        href: "/profile",
        icon: <Settings className="w-4 h-4" />,
      },
    ];
  }
  if (role === "employee") {
    return [
      {
        label: "Dashboard",
        href: "/employee",
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        label: "My Referrals",
        href: "/employee/referrals",
        icon: <Users className="w-4 h-4" />,
      },
      {
        label: "Earnings",
        href: "/employee/earnings",
        icon: <CreditCard className="w-4 h-4" />,
      },
      {
        label: "Settings",
        href: "/profile",
        icon: <Settings className="w-4 h-4" />,
      },
    ];
  }
  if (role === "attorney") {
    return [
      {
        label: "Review Center",
        href: "/attorney",
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        label: "Queue",
        href: "/attorney/queue",
        icon: <ClipboardList className="w-4 h-4" />,
      },
      {
        label: "Settings",
        href: "/profile",
        icon: <Settings className="w-4 h-4" />,
      },
    ];
  }
  if (role === "admin") {
    return [
      {
        label: "Dashboard",
        href: "/admin",
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        label: "All Letters",
        href: "/admin/letters",
        icon: <FileText className="w-4 h-4" />,
      },
      {
        label: "Users",
        href: "/admin/users",
        icon: <Users className="w-4 h-4" />,
      },
      {
        label: "Attorney Queue",
        href: "/attorney/queue",
        icon: <ClipboardList className="w-4 h-4" />,
      },
      {
        label: "Affiliate Program",
        href: "/admin/affiliate",
        icon: <Briefcase className="w-4 h-4" />,
      },
      {
        label: "Pipeline Analytics",
        href: "/admin/pipeline",
        icon: <BarChart3 className="w-4 h-4" />,
      },
      {
        label: "Failed Jobs",
        href: "/admin/jobs",
        icon: <AlertCircle className="w-4 h-4" />,
      },
      {
        label: "Learning",
        href: "/admin/learning",
        icon: <Brain className="w-4 h-4" />,
      },
      {
        label: "Blog",
        href: "/admin/blog",
        icon: <BookOpen className="w-4 h-4" />,
      },
      {
        label: "Settings",
        href: "/profile",
        icon: <Settings className="w-4 h-4" />,
      },
    ];
  }
  return [];
}

function getRoleLabel(role: string): { label: string; color: string } {
  if (role === "admin")
    return { label: "Super Admin", color: "bg-red-100 text-red-700" };
  if (role === "attorney")
    return { label: "Attorney", color: "bg-purple-100 text-purple-700" };
  if (role === "employee")
    return { label: "Affiliate", color: "bg-blue-100 text-blue-700" };
  return { label: "Subscriber", color: "bg-green-100 text-green-700" };
}

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: { label: string; href?: string }[];
  /** Optional label for dynamic breadcrumb segments (e.g., "Letter #42") */
  dynamicLabel?: string;
}

export default function AppLayout({
  children,
  title,
  breadcrumb,
  dynamicLabel,
}: AppLayoutProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);

  const closeSidebar = () => {
    setSidebarClosing(true);
    setTimeout(() => {
      setSidebarOpen(false);
      setSidebarClosing(false);
    }, 200);
  };

  const isAdmin = user?.role === "admin";
  const { data: notifications } = trpc.notifications.list.useQuery(
    { unreadOnly: isAdmin ? false : true },
    { enabled: isAuthenticated, refetchInterval: isAdmin ? 10000 : 15000 }
  );
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      toast.success("Notifications cleared", {
        description: "All notifications have been marked as read.",
      });
    },
    onError: () =>
      toast.error("Could not clear notifications", {
        description: "Please try again in a moment.",
      }),
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  // ─── Role-change detector ────────────────────────────────────────────────
  // When the server promotes this user (e.g. subscriber → attorney), a
  // role_updated notification arrives in the next poll cycle (≤15 s).
  // We immediately invalidate auth.me so ProtectedRoute sees the new role
  // and redirects the user to their correct dashboard without a manual
  // refresh — works identically for Google OAuth and email users because
  // auth.me always reads the role from the DB, never from the JWT.
  const seenRoleUpdateRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!notifications || !user) return;
    const roleNotif = notifications.find(
      n => n.type === "role_updated" && !seenRoleUpdateRef.current.has(n.id)
    );
    if (!roleNotif) return;
    seenRoleUpdateRef.current.add(roleNotif.id);
    // Invalidate auth.me — the server cache was already cleared by
    // invalidateUserCache() in the updateRole mutation, so this fetch
    // will always get the fresh role from the DB.
    utils.auth.me.invalidate().then(() => {
      // After auth.me resolves with the new role, navigate to the
      // correct dashboard. We read from utils to get the latest data.
      const freshUser = utils.auth.me.getData();
      if (freshUser?.role) {
        const dest = roleNotif.link ?? getRoleDashboard(freshUser.role);
        navigate(dest);
      }
    });
  }, [notifications, user, utils, navigate]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Authentication Required
          </h2>
          <p className="text-muted-foreground mb-6">
            Please sign in to access this page.
          </p>
          <div className="flex gap-3">
            <Button asChild size="lg" variant="outline" className="flex-1">
              <a href="/login">Sign In</a>
            </Button>
            <Button
              asChild
              size="lg"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              <a href="/signup">Create Account</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = getNavItems(user.role);
  const roleInfo = getRoleLabel(user.role);

  const Sidebar = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <BrandLogo href="/" variant="sidebar" size="md" />
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
            <span className="text-sidebar-foreground font-semibold text-sm">
              {(user.name ?? user.email ?? "U")[0].toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sidebar-foreground font-medium text-sm truncate">
              {user.name ?? "User"}
            </p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleInfo.color}`}
            >
              {roleInfo.label}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(item => {
          const matches =
            location === item.href || location.startsWith(item.href + "/");
          const isActive =
            matches &&
            !navItems.some(
              other =>
                other.href !== item.href &&
                (location === other.href ||
                  location.startsWith(other.href + "/")) &&
                other.href.startsWith(item.href + "/")
            );
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => closeSidebar()}
              className={`sidebar-nav-item sidebar-active-indicator flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground is-active"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span className="sidebar-nav-icon inline-flex">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={() => {
            toast.info("Signing out", {
              description: "You are being securely logged out.",
            });
            logout();
          }}
          className="sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent w-full"
        >
          <span className="sidebar-nav-icon inline-flex"><LogOut className="w-4 h-4" /></span>
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className={`fixed inset-0 bg-black/50 ${sidebarClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
            onClick={closeSidebar}
          />
          <aside className={`relative flex h-full w-[min(18rem,calc(100vw-2rem))] max-w-full flex-col bg-sidebar shadow-xl ${sidebarClosing ? "animate-sidebar-out" : "animate-sidebar-in"}`}>
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-4 text-sidebar-foreground hover:text-sidebar-primary"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex h-12 sm:h-14 items-center justify-between gap-2 sm:gap-3 border-b border-border bg-card px-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 overflow-hidden">
              <AppBreadcrumb
                role={user.role}
                overrides={breadcrumb}
                dynamicLabel={dynamicLabel}
              />
            </div>
            {title && !breadcrumb && (
              <h1 className="text-sm font-semibold text-foreground hidden">
                {title}
              </h1>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`relative ${unreadCount > 0 ? "bell-ping-indicator" : ""}`}
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="font-semibold text-sm">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllRead.mutate()}
                      className="text-xs text-primary hover:underline"
                      aria-label="Mark all notifications as read"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications && notifications.length > 0 ? (
                  notifications.slice(0, isAdmin ? 15 : 5).map((n, idx) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={`notification-stagger-item flex flex-col items-start gap-0.5 py-3 cursor-pointer ${n.readAt ? "opacity-60" : ""}`}
                      style={{ animationDelay: `${idx * 50}ms` }}
                      onClick={() => {
                        if (!n.readAt) markRead.mutate({ id: n.id });
                        if (n.link) {
                          navigate(n.link);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{n.title}</span>
                        {n.category && n.category !== "general" && (
                          <span
                            data-testid={`badge-category-${n.category}`}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                              n.category === "users"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                : n.category === "letters"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                : n.category === "employee"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                          >
                            {n.category === "users" ? "Users" : n.category === "letters" ? "Letters" : n.category === "employee" ? "Affiliate" : n.category}
                          </span>
                        )}
                      </div>
                      {n.body && (
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No new notifications
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" key={location} className="flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6 animate-page-enter">
          {children}
        </main>
      </div>
    </div>
  );
}
