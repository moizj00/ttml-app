import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Shield, Briefcase, User, Scale, AlertCircle, Gavel } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

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

  // Use the base mutation without onSuccess/onError — we pass per-call callbacks
  // in the onClick handler so we can capture the values before state is cleared.
  const updateRole = trpc.admin.updateRole.useMutation();

  const handleConfirm = () => {
    if (!pendingRoleChange) return;

    // Capture all values NOW, before clearing state
    const { userId, newRoleValue, userName } = pendingRoleChange;

    // Clear state immediately so the dialog closes
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

  return (
    <AppLayout
      breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            {users?.length ?? 0} registered users
          </p>
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
        ) : (
          <div className="space-y-2">
            {(users ?? []).map(user => {
              const roleInfo =
                ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG] ??
                ROLE_CONFIG.subscriber;
              return (
                <Card key={user.id}>
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
                      </div>
                      <div className="flex items-center gap-2">
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
