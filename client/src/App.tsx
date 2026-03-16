import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";

// Role-specific loading skeletons
import {
  PublicPageSkeleton,
  AuthPageSkeleton,
  OnboardingSkeleton,
  SubscriberDashboardSkeleton,
  SubmitLetterSkeleton,
  MyLettersSkeleton,
  LetterDetailSkeleton,
  BillingSkeleton,
  ReceiptsSkeleton,
  ProfileSkeleton,
  AttorneyDashboardSkeleton,
  ReviewQueueSkeleton,
  ReviewDetailSkeleton,
  EmployeeDashboardSkeleton,
  AdminDashboardSkeleton,
  AdminUsersSkeleton,
  AdminJobsSkeleton,
  AdminAllLettersSkeleton,
  AdminLetterDetailSkeleton,
  AdminAffiliateSkeleton,
} from "./components/skeletons";

// ─── Eagerly loaded (public landing + auth — needed on first paint) ───
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

// ─── Lazy-loaded: Auth secondary pages ───
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// ─── Lazy-loaded: Public pages ───
const Pricing = lazy(() => import("./pages/Pricing"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

// ─── Lazy-loaded: Subscriber pages ───
const SubscriberDashboard = lazy(() => import("./pages/subscriber/Dashboard"));
const SubmitLetter = lazy(() => import("./pages/subscriber/SubmitLetter"));
const MyLetters = lazy(() => import("./pages/subscriber/MyLetters"));
const LetterDetail = lazy(() => import("./pages/subscriber/LetterDetail"));
const Billing = lazy(() => import("./pages/subscriber/Billing"));
const Receipts = lazy(() => import("./pages/subscriber/Receipts"));
const Profile = lazy(() => import("./pages/subscriber/Profile"));

// ─── Lazy-loaded: Attorney pages (Review Center) ───
const AttorneyDashboard = lazy(() => import("./pages/attorney/Dashboard"));
const ReviewQueue = lazy(() => import("./pages/attorney/ReviewQueue"));
const ReviewDetail = lazy(() => import("./pages/attorney/ReviewDetail"));

// ─── Lazy-loaded: Employee/Affiliate pages ───
const EmployeeAffiliateDashboard = lazy(
  () => import("./pages/employee/AffiliateDashboard")
);

// ─── Lazy-loaded: Admin pages ───
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminJobs = lazy(() => import("./pages/admin/Jobs"));
const AdminAllLetters = lazy(() => import("./pages/admin/AllLetters"));
const AdminLetterDetail = lazy(() => import("./pages/admin/LetterDetail"));
const AdminAffiliate = lazy(() => import("./pages/admin/Affiliate"));

function Router() {
  return (
    <Switch>
      {/* ═══ Public ═══ */}
      <Route path="/" component={Home} />
      <Route path="/pricing">
        <Suspense fallback={<PublicPageSkeleton />}>
          <Pricing />
        </Suspense>
      </Route>
      <Route path="/faq">
        <Suspense fallback={<PublicPageSkeleton />}>
          <FAQ />
        </Suspense>
      </Route>
      <Route path="/terms">
        <Suspense fallback={<PublicPageSkeleton />}>
          <Terms />
        </Suspense>
      </Route>
      <Route path="/privacy">
        <Suspense fallback={<PublicPageSkeleton />}>
          <Privacy />
        </Suspense>
      </Route>

      {/* ═══ Auth ═══ */}
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password">
        <Suspense fallback={<AuthPageSkeleton />}>
          <ForgotPassword />
        </Suspense>
      </Route>
      <Route path="/verify-email">
        <Suspense fallback={<AuthPageSkeleton />}>
          <VerifyEmail />
        </Suspense>
      </Route>
      <Route path="/reset-password">
        <Suspense fallback={<AuthPageSkeleton />}>
          <ResetPassword />
        </Suspense>
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute>
          <Suspense fallback={<OnboardingSkeleton />}>
            <Onboarding />
          </Suspense>
        </ProtectedRoute>
      </Route>

      {/* ═══ Subscriber — role-gated ═══ */}
      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <Suspense fallback={<SubscriberDashboardSkeleton />}>
            <SubscriberDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/submit">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <Suspense fallback={<SubmitLetterSkeleton />}>
            <SubmitLetter />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/letters">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <Suspense fallback={<MyLettersSkeleton />}>
            <MyLetters />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/letters/:id">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <Suspense fallback={<LetterDetailSkeleton />}>
            <LetterDetail />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/subscriber/billing">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <Suspense fallback={<BillingSkeleton />}>
            <Billing />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/subscriber/receipts">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <Suspense fallback={<ReceiptsSkeleton />}>
            <Receipts />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute
          allowedRoles={["subscriber", "employee", "attorney", "admin"]}
        >
          <Suspense fallback={<ProfileSkeleton />}>
            <Profile />
          </Suspense>
        </ProtectedRoute>
      </Route>

      {/* ═══ Attorney — Review Center (attorney + admin) ═══ */}
      <Route path="/attorney">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<AttorneyDashboardSkeleton />}>
            <AttorneyDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/attorney/queue">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<ReviewQueueSkeleton />}>
            <ReviewQueue />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/attorney/:id">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail />
          </Suspense>
        </ProtectedRoute>
      </Route>
      {/* Backward-compatible /review/* aliases */}
      <Route path="/review">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<AttorneyDashboardSkeleton />}>
            <AttorneyDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/review/queue">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<ReviewQueueSkeleton />}>
            <ReviewQueue />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/review/:id">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail />
          </Suspense>
        </ProtectedRoute>
      </Route>

      {/* ═══ Employee/Affiliate ═══ */}
      <Route path="/employee">
        <ProtectedRoute allowedRoles={["employee", "admin"]}>
          <Suspense fallback={<EmployeeDashboardSkeleton />}>
            <EmployeeAffiliateDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/employee/referrals">
        <ProtectedRoute allowedRoles={["employee", "admin"]}>
          <Suspense fallback={<EmployeeDashboardSkeleton />}>
            <EmployeeAffiliateDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/employee/earnings">
        <ProtectedRoute allowedRoles={["employee", "admin"]}>
          <Suspense fallback={<EmployeeDashboardSkeleton />}>
            <EmployeeAffiliateDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>

      {/* ═══ Admin — role-gated ═══ */}
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminDashboardSkeleton />}>
            <AdminDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminUsersSkeleton />}>
            <AdminUsers />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/jobs">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminJobsSkeleton />}>
            <AdminJobs />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/letters">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminAllLettersSkeleton />}>
            <AdminAllLetters />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/letters/:id">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminLetterDetailSkeleton />}>
            <AdminLetterDetail />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/affiliate">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminAffiliateSkeleton />}>
            <AdminAffiliate />
          </Suspense>
        </ProtectedRoute>
      </Route>

      {/* ═══ Fallback ═══ */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
