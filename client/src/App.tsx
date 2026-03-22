import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";

function lazyRetry(importFn: () => Promise<any>) {
  return lazy(() =>
    importFn().catch((err: Error) => {
      const reloaded = sessionStorage.getItem("chunk_reload");
      if (!reloaded) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem("chunk_reload");
      throw err;
    })
  );
}

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
  AdminLearningSkeleton,
  DocumentAnalyzerSkeleton,
} from "./components/skeletons";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazyRetry(() => import("./pages/VerifyEmail"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));

const Pricing = lazyRetry(() => import("./pages/Pricing"));
const FAQ = lazyRetry(() => import("./pages/FAQ"));
const Terms = lazyRetry(() => import("./pages/Terms"));
const Privacy = lazyRetry(() => import("./pages/Privacy"));
const Onboarding = lazyRetry(() => import("./pages/Onboarding"));
const DocumentAnalyzer = lazyRetry(() => import("./pages/DocumentAnalyzer"));

const SubscriberDashboard = lazyRetry(() => import("./pages/subscriber/Dashboard"));
const SubmitLetter = lazyRetry(() => import("./pages/subscriber/SubmitLetter"));
const MyLetters = lazyRetry(() => import("./pages/subscriber/MyLetters"));
const LetterDetail = lazyRetry(() => import("./pages/subscriber/LetterDetail"));
const Billing = lazyRetry(() => import("./pages/subscriber/Billing"));
const Receipts = lazyRetry(() => import("./pages/subscriber/Receipts"));
const Profile = lazyRetry(() => import("./pages/subscriber/Profile"));

const AttorneyDashboard = lazyRetry(() => import("./pages/attorney/Dashboard"));
const ReviewQueue = lazyRetry(() => import("./pages/attorney/ReviewQueue"));
const ReviewDetail = lazyRetry(() => import("./pages/attorney/ReviewDetail"));

const EmployeeAffiliateDashboard = lazyRetry(
  () => import("./pages/employee/AffiliateDashboard")
);

const AdminDashboard = lazyRetry(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazyRetry(() => import("./pages/admin/Users"));
const AdminJobs = lazyRetry(() => import("./pages/admin/Jobs"));
const AdminAllLetters = lazyRetry(() => import("./pages/admin/AllLetters"));
const AdminLetterDetail = lazyRetry(() => import("./pages/admin/LetterDetail"));
const AdminAffiliate = lazyRetry(() => import("./pages/admin/Affiliate"));
const AdminLearning = lazyRetry(() => import("./pages/admin/Learning"));

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
      <Route path="/analyze">
        <Suspense fallback={<DocumentAnalyzerSkeleton />}>
          <DocumentAnalyzer />
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
      {/* /attorney/review/:id — admin "Claim & Review" redirect target (must be before /attorney/:id) */}
      <Route path="/attorney/review/:id">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <Suspense fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail />
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
      <Route path="/admin/learning">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<AdminLearningSkeleton />}>
            <AdminLearning />
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
