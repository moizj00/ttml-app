import AppLayout from "@/components/shared/AppLayout";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, Briefcase, User, Scale, AlertCircle, Gavel, CreditCard, ArrowUpDown, X, Mail, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";

const ROLE_CONFIG = {
  admin: {
    label: "Super Admin",
    icon: <Shield className="w-3.5 h-3.5" />,
    color: "text-red-700 bg-red-100",
  },
  attorney: {
    label: "Attorney",
    icon: <Scale className="w-3.5 h-3.5" />,
    color: "text-purple-700 bg-purple-100",
  },
  employee: {
    label: "Affiliate",
    icon: <Briefcase className="w-3.5 h-3.5" />,
    color: "text-blue-700 bg-blue-100",
  },
  subscriber: {
    label: "Subscriber",
    icon: <User className="w-3.5 h-3.5" />,
    color: "text-green-700 bg-green-100",
  },
};

type SortKey = "name-asc" | "name-desc" | "email-asc" | "email-desc" | "role" | "subscription";
type RoleFilter = "all" | "admin" | "attorney" | "employee" | "subscriber";
type SubFilter = "all" | "paid" | "free";

const ROLE_ORDER: Record<string, number> = { admin: 0, attorney: 1, employee: 2, subscriber: 3 };

export default function AdminUsers() {
  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = trpc.admin.users.useQuery({});

  const [pendingRoleChange, setPendingRoleChange] = useState<{
    userId: number;
    userName: string;
    currentRole: string;
    newRole: string;
    newRoleValue: string;
  } | null>(null);

  const [filterRole, setFilterRole] = useState<RoleFilter>("all");
  const [filterSub, setFilterSub] = useState<SubFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name-asc");

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const updateRole = trpc.admin.updateRole.useMutation();

  const inviteAttorney = trpc.admin.inviteAttorney.useMutation({
    onSuccess: (data) => {
      toast.success("Attorney invitation sent", {
        description: data.message,
        duration: 8000,
      });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteName("");
      refetch();
    },
    onError: (e) => {
      toast.error("Invitation failed", { description: e.message });
    },
  });

  const markAsPaid = trpc.admin.markAsPaid.useMutation({
    onSuccess: () => {
      toast.success("Subscription activated", {
        description: "The user's subscription has been marked as paid.",
      });
      refetch();
    },
    onError: e => toast.error("Failed to activate subscription", { description: e.message }),
  });

  const handleConfirm = () => {
    if (!pendingRoleChange) return;
    const { userId, newRoleValue, userName } = pendingRoleChange;
    setPendingRoleChange(null);
    updateRole.mutate(
      { userId, role: newRoleValue as any },
      {
        onSuccess: () => {
          if (newRoleValue === "attorney") {
            toast.success(`${userName} promoted to Attorney`, {
              description:
                "They need to refresh their browser (or log out and back in) to access the Review Center and see the letter queue.",
              duration: 10000,
            });
          } else {
            const roleLabel =
              ROLE_CONFIG[newRoleValue as keyof typeof ROLE_CONFIG]?.label ??
              newRoleValue;
            toast.success("Role updated", {
              description: `${userName}'s role has been changed to ${roleLabel}.`,
            });
          }
          refetch();
        },
        onError: e => {
          toast.error("Role update failed", { description: e.message });
        },
      }
    );
  };

  const displayedUsers = useMemo(() => {
    if (!users) return [];

    let result = [...users];

    if (filterRole !== "all") {
      result = result.filter(u => u.role === filterRole);
    }

    if (filterSub === "paid") {
      result = result.filter(u => u.subscriptionStatus === "active");
    } else if (filterSub === "free") {
      result = result.filter(u => u.subscriptionStatus !== "active");
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
        case "name-desc":
          return (b.name ?? b.email ?? "").localeCompare(a.name ?? a.email ?? "");
        case "email-asc":
          return (a.email ?? "").localeCompare(b.email ?? "");
        case "email-desc":
          return (b.email ?? "").localeCompare(a.email ?? "");
        case "role":
          return (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
        case "subscription":
          return (a.subscriptionStatus === "active" ? 0 : 1) - (b.subscriptionStatus === "active" ? 0 : 1);
        default:
          return 0;
      }
    });

    return result;
  }, [users, filterRole, filterSub, sortBy]);

  const hasActiveFilters = filterRole !== "all" || filterSub !== "all";

  const clearFilters = () => {
    setFilterRole("all");
    setFilterSub("all");
  };

  return (
    <AppLayout
      breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : (
                hasActiveFilters
                  ? `${displayedUsers.length} of ${users?.length ?? 0} users`
                  : `${users?.length ?? 0} registered users`
              )}
            </p>
          </div>
          <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
            setInviteDialogOpen(open);
            if (!open) { setInviteEmail(""); setInviteName(""); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 gap-1.5" data-testid="button-invite-attorney">
                <UserPlus className="w-4 h-4" />
                Invite Attorney
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Attorney</DialogTitle>
                <DialogDescription>
                  Send an invitation email to a new attorney. They will receive a link to set their password and access the Review Center.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!inviteEmail.trim()) return;
                  inviteAttorney.mutate({
                    email: inviteEmail.trim(),
                    name: inviteName.trim() || undefined,
                  });
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="attorney@example.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      required
                      disabled={inviteAttorney.isPending}
                      className="pl-9"
                      data-testid="input-invite-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-name">Name (optional)</Label>
                  <Input
                    id="invite-name"
                    type="text"
                    placeholder="Jane Doe"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    disabled={inviteAttorney.isPending}
                    data-testid="input-invite-name"
                  />
                </div>
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <p className="text-xs text-purple-800">
                    <strong>What happens next:</strong> The attorney will receive a branded email
                    with a link to set their password. Once they set it, they can log in and
                    access the Review Center immediately.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInviteDialogOpen(false)}
                    disabled={inviteAttorney.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={inviteAttorney.isPending || !inviteEmail.trim()}
                    data-testid="button-send-invitation"
                  >
                    {inviteAttorney.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send Invitation"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Attorney promotion notice */}
        <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
          <Gavel className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
          <p className="text-xs text-purple-800">
            <strong>Attorney role is admin-only.</strong>{" "}
            Use the dropdown below to promote any user to Attorney. They must
            refresh their browser after the change to access the Review Center
            and claim letters.
          </p>
        </div>

        {/* Filter + Sort toolbar */}
        {!isLoading && !error && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Role filter pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {(["all", "admin", "attorney", "employee", "subscriber"] as RoleFilter[]).map(role => {
                const isActive = filterRole === role;
                const label =
                  role === "all" ? "All Roles"
                  : role === "employee" ? "Affiliate"
                  : role === "admin" ? "Admin"
                  : role === "attorney" ? "Attorney"
                  : "Subscriber";
                return (
                  <button
                    key={role}
                    data-testid={`filter-role-${role}`}
                    onClick={() => setFilterRole(role)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

            {/* Subscription filter */}
            <Select value={filterSub} onValueChange={v => setFilterSub(v as SubFilter)}>
              <SelectTrigger className="h-7 w-28 text-xs" data-testid="filter-subscription">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="free">Free</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-7 w-36 text-xs" data-testid="sort-users">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A → Z</SelectItem>
                  <SelectItem value="name-desc">Name Z → A</SelectItem>
                  <SelectItem value="email-asc">Email A → Z</SelectItem>
                  <SelectItem value="email-desc">Email Z → A</SelectItem>
                  <SelectItem value="role">Role</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                data-testid="button-clear-filters"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        )}

        <SectionErrorBoundary label="User List">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {error.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetch()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : displayedUsers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <User className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No users match the current filters</p>
              <button
                onClick={clearFilters}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {displayedUsers.map(user => {
              const roleInfo =
                ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG] ??
                ROLE_CONFIG.subscriber;
              return (
                <Card key={user.id} data-testid={`card-user-${user.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-semibold text-sm">
                          {(user.name ?? user.email ?? "U")[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {user.name ?? "Unnamed User"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.email ?? "No email"}
                        </p>
                        {(user.subscriberId || user.employeeId || user.attorneyId) && (
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {user.subscriberId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200" data-testid={`text-sub-id-${user.id}`}>
                                {user.subscriberId}
                              </span>
                            )}
                            {user.employeeId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" data-testid={`text-emp-id-${user.id}`}>
                                {user.employeeId}
                              </span>
                            )}
                            {user.attorneyId && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200" data-testid={`text-att-id-${user.id}`}>
                                {user.attorneyId}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Subscription badge */}
                        {user.subscriptionStatus === "active" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-green-700 bg-green-100">
                            <CreditCard className="w-3 h-3" />
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-gray-500 bg-gray-100">
                            <CreditCard className="w-3 h-3" />
                            Free
                          </span>
                        )}
                        {/* Mark as Paid button for free users */}
                        {user.subscriptionStatus !== "active" && (
                          <button
                            data-testid={`button-mark-paid-${user.id}`}
                            className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                            onClick={() => markAsPaid.mutate({ userId: user.id })}
                            disabled={markAsPaid.isPending}
                          >
                            Mark as Paid
                          </button>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${roleInfo.color}`}
                        >
                          {roleInfo.icon}
                          {roleInfo.label}
                        </span>
                        {/* Dropdown hidden for admin users to prevent accidental changes */}
                        {user.role !== "admin" && (
                          <Select
                            value=""
                            onValueChange={newRole => {
                              if (!newRole || newRole === user.role) return;
                              setPendingRoleChange({
                                userId: user.id,
                                userName:
                                  user.name ?? user.email ?? "this user",
                                currentRole: (
                                  ROLE_CONFIG[
                                    user.role as keyof typeof ROLE_CONFIG
                                  ] ?? ROLE_CONFIG.subscriber
                                ).label,
                                newRole: ROLE_CONFIG.attorney.label,
                                newRoleValue: newRole,
                              });
                            }}
                          >
                            <SelectTrigger
                              className="w-36 h-7 text-xs"
                              disabled={user.role === "attorney"}
                            >
                              <SelectValue
                                placeholder={
                                  user.role === "attorney"
                                    ? "Already Attorney"
                                    : "Promote to…"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="attorney">
                                <span className="flex items-center gap-1.5">
                                  <Scale className="w-3.5 h-3.5 text-purple-600" />
                                  Attorney
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </SectionErrorBoundary>
      </div>

      <AlertDialog
        open={!!pendingRoleChange}
        onOpenChange={open => {
          if (!open) setPendingRoleChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change User Role</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to change{" "}
                  <strong>{pendingRoleChange?.userName}</strong>'s role from{" "}
                  <strong>{pendingRoleChange?.currentRole}</strong> to{" "}
                  <strong>{pendingRoleChange?.newRole}</strong>?
                </p>
                {pendingRoleChange?.newRoleValue === "attorney" && (
                  <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                    After confirming, ask the user to{" "}
                    <strong>refresh their browser</strong> or log out and back
                    in. They will then see the Review Center and can claim
                    letters to begin reviewing.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
