import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/shared/AppLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  User,
  Shield,
  Mail,
  Key,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  Calendar,
  AlertTriangle,
} from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  subscriber: { label: "Client", color: "bg-blue-100 text-blue-800" },
  employee: { label: "Employee", color: "bg-green-100 text-green-800" },
  attorney: { label: "Attorney", color: "bg-purple-100 text-purple-800" },
  admin: { label: "Admin", color: "bg-red-100 text-red-800" },
};

// ─── Resend Verification Button ───────────────────────────────────────────
function ResendVerificationButton({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="text-green-700 text-xs font-medium mt-2">
        Verification email sent! Check your inbox.
      </p>
    );
  }

  return (
    <button
      type="button"
      disabled={loading || !email}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/auth/resend-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const d = await res.json();
          setSent(true);
          toast.success("Verification email sent", {
            description: d.message || "Check your inbox.",
          });
        } catch {
          toast.error("Could not resend email", {
            description: "Please try again.",
          });
        } finally {
          setLoading(false);
        }
      }}
      className="mt-2 text-indigo-700 hover:underline text-xs font-medium disabled:opacity-50 flex items-center gap-1"
    >
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Sending…
        </>
      ) : (
        "Resend verification email"
      )}
    </button>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Profile edit state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  // Email change state
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword] = useState(false);

  // Password change state
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const updateProfile = trpc.profile.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      setEditingName(false);
      utils.auth.me.invalidate();
    },
    onError: err => toast.error(err.message || "Failed to update profile"),
  });

  const changeEmail = trpc.profile.changeEmail.useMutation({
    onSuccess: data => {
      toast.success(
        data.message ||
          "Email updated. Please check your new email for a verification link."
      );
      setChangingEmail(false);
      setNewEmail("");
      setEmailPassword("");
      utils.auth.me.invalidate();
    },
    onError: err => toast.error(err.message || "Failed to change email"),
  });

  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: err => toast.error(err.message || "Failed to change password"),
  });

  const handleSaveName = () => {
    if (!newName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    updateProfile.mutate({ name: newName.trim() });
  };

  const handleChangeEmail = () => {
    if (!newEmail.trim()) {
      toast.error("Please enter a new email address");
      return;
    }
    if (!emailPassword) {
      toast.error("Please enter your password to confirm the change");
      return;
    }
    if (newEmail.toLowerCase() === user?.email?.toLowerCase()) {
      toast.error("New email is the same as your current email");
      return;
    }
    changeEmail.mutate({
      newEmail: newEmail.trim(),
      currentPassword: emailPassword,
    });
  };

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (currentPassword === newPassword) {
      toast.error("New password must be different from current password");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  const roleInfo = ROLE_LABELS[user?.role || "subscriber"];
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <AppLayout>
      <div className="container max-w-3xl py-8 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Profile Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your account information and security
          </p>
        </div>

        {/* Re-verification Banner */}
        {user && user.emailVerified === false && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">
                Email verification required
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Your email address has not been verified. Please check your
                inbox for a verification link. Some features may be limited
                until your email is verified.
              </p>
              <ResendVerificationButton email={user.email || ""} />
            </div>
          </div>
        )}

        {/* Account Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Overview
            </CardTitle>
            <CardDescription>Your account details and role</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Role
                </Label>
                <div>
                  <Badge className={roleInfo.color}>{roleInfo.label}</Badge>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Member Since
                </Label>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {memberSince}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Email
                </Label>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {user?.email || "—"}
                  {user?.emailVerified ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-300 text-amber-700"
                    >
                      Unverified
                    </Badge>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Account Status
                </Label>
                <div>
                  <Badge
                    variant="outline"
                    className="border-green-300 text-green-700"
                  >
                    Active
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Name Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Display Name
            </CardTitle>
            <CardDescription>
              Update the name shown on your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!editingName ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{user?.name || "Not set"}</p>
                  <p className="text-sm text-muted-foreground">
                    This name appears on your letters and account
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewName(user?.name || "");
                    setEditingName(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Enter your full name"
                    maxLength={200}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveName}
                    disabled={updateProfile.isPending}
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />{" "}
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingName(false)}
                    disabled={updateProfile.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Email Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Address
            </CardTitle>
            <CardDescription>
              Change your email address — requires password confirmation and
              re-verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!changingEmail ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    {user?.email || "Not set"}
                    {user?.emailVerified ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Verified
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Unverified
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Used for login and notifications
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewEmail("");
                    setEmailPassword("");
                    setChangingEmail(true);
                  }}
                >
                  Change Email
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  Changing your email will require you to verify the new address
                  before you can continue using the platform. You will need to
                  enter your current password to confirm this change.
                </div>

                {/* New Email */}
                <div className="space-y-2">
                  <Label htmlFor="new-email">New Email Address</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="Enter your new email address"
                  />
                </div>

                {/* Password Confirmation */}
                <div className="space-y-2">
                  <Label htmlFor="email-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="email-password"
                      type={showEmailPassword ? "text" : "password"}
                      value={emailPassword}
                      onChange={e => setEmailPassword(e.target.value)}
                      placeholder="Enter your password to confirm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={
                        showNewPassword
                          ? "Hide new password"
                          : "Show new password"
                      }
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={handleChangeEmail}
                    disabled={
                      changeEmail.isPending ||
                      !newEmail.trim() ||
                      !emailPassword
                    }
                  >
                    {changeEmail.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />{" "}
                        Updating...
                      </>
                    ) : (
                      "Update Email"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChangingEmail(false);
                      setNewEmail("");
                      setEmailPassword("");
                    }}
                    disabled={changeEmail.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Password
            </CardTitle>
            <CardDescription>Change your account password</CardDescription>
          </CardHeader>
          <CardContent>
            {!changingPassword ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">••••••••</p>
                  <p className="text-sm text-muted-foreground">
                    Last changed: Unknown
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangingPassword(true)}
                >
                  Change Password
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Current Password */}
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
                      aria-label={
                        showCurrentPassword
                          ? "Hide current password"
                          : "Show current password"
                      }
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {newPassword.length > 0 && newPassword.length < 6 && (
                    <p className="text-xs text-destructive">
                      Password must be at least 6 characters
                    </p>
                  )}
                </div>

                {/* Confirm New Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type={showNewPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                  {confirmPassword.length > 0 &&
                    confirmPassword !== newPassword && (
                      <p className="text-xs text-destructive">
                        Passwords do not match
                      </p>
                    )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={
                      changePassword.isPending ||
                      !currentPassword ||
                      newPassword.length < 6 ||
                      newPassword !== confirmPassword
                    }
                  >
                    {changePassword.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />{" "}
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChangingPassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={changePassword.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
