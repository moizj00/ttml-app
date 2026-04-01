import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  FileText,
  Users,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { getRoleDashboard } from "@/components/ProtectedRoute";
import BrandLogo from "@/components/shared/BrandLogo";
import { useMounted, useReducedMotion } from "@/hooks/useAnimations";

// Role is now determined at signup (user → subscriber, affiliate → employee)
// Onboarding no longer has role selection — just profile setup
type SelectedRole = "subscriber" | "employee";

const ROLE_OPTIONS: {
  role: SelectedRole;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    role: "subscriber",
    label: "I Need Legal Help",
    description:
      "Submit letter requests and get legal letters drafted and reviewed by real attorneys.",
    icon: <FileText className="w-8 h-8 text-indigo-600" />,
  },
  {
    role: "employee",
    label: "I'm an Affiliate Partner",
    description:
      "Earn commissions by referring clients. Get a unique discount code to share.",
    icon: <Users className="w-8 h-8 text-emerald-600" />,
  },
];

const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Onboarding now skips role selection — role is determined at signup
  // Use the user's current role from auth context
  const [step, setStep] = useState<"profile">("profile");
  const selectedRole = (user?.role === "subscriber" || user?.role === "employee") ? user.role : "subscriber";
  const [jurisdiction, setJurisdiction] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const mounted = useMounted();
  const reduced = useReducedMotion();

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation({
    onSuccess: data => {
      utils.auth.me.invalidate();
      toast.success("Profile saved", {
        description:
          data.message ||
          "Your account is ready. Redirecting to your dashboard.",
      });
      navigate(getRoleDashboard(data.role));
    },
    onError: err => {
      toast.error("Could not save profile", {
        description: err.message || "Please try again.",
      });
      setLoading(false);
    },
  });

  // Role selection removed — onboarding now only handles profile setup

  const handleComplete = () => {
    setLoading(true);
    completeOnboarding.mutate({
      role: selectedRole,
      jurisdiction: jurisdiction || undefined,
      companyName: companyName || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-4 sm:mx-auto">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo size="lg" className="justify-center mb-4" />
          <p className="text-slate-600">
            {user?.name ? `Welcome, ${user.name}!` : "Welcome!"} Let's set up
            your account.
          </p>
        </div>

        {step === "profile" && (
          <Card className="animate-dashboard-fade-up">
            <CardHeader>
              <CardTitle>
                {selectedRole === "subscriber" && "Almost there!"}
                {selectedRole === "employee" && "Affiliate Profile"}
              </CardTitle>
              <CardDescription>
                {selectedRole === "subscriber" &&
                  "Confirm your details to get started."}
                {selectedRole === "employee" &&
                  "Tell us a bit about yourself to set up your affiliate account."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Jurisdiction — all roles */}
              <div>
                <Label htmlFor="jurisdiction">
                  Primary State / Jurisdiction
                </Label>
                <Select value={jurisdiction} onValueChange={setJurisdiction}>
                  <SelectTrigger id="jurisdiction" data-testid="select-jurisdiction">
                    <SelectValue placeholder="Select your state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Affiliate-specific fields */}
              {selectedRole === "employee" && (
                <div>
                  <Label htmlFor="companyName">
                    Company / Organization (optional)
                  </Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="e.g., Acme Legal Services"
                    data-testid="input-company-name"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  className="flex-1"
                  onClick={handleComplete}
                  disabled={loading}
                  data-testid="button-complete-onboarding"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
