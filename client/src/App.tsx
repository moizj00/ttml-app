import { lazy, Suspense, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
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

function SuspenseFade({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <div className="skeleton-crossfade">{children}</div>
    </Suspense>
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
  AffiliateDashboardSkeleton,
  AdminDashboardSkeleton,
  AdminUsersSkeleton,
  AdminJobsSkeleton,
  AdminAllLettersSkeleton,
  AdminLetterDetailSkeleton,
  AdminAffiliateSkeleton,
  AdminLearningSkeleton,
  DocumentAnalyzerSkeleton,
  TemplateGallerySkeleton,
} from "./components/skeletons";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazyRetry(() => import("./pages/VerifyEmail"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));
const AcceptInvitation = lazyRetry(() => import("./pages/AcceptInvitation"));

const Pricing = lazyRetry(() => import("./pages/Pricing"));
const FAQ = lazyRetry(() => import("./pages/FAQ"));
const Terms = lazyRetry(() => import("./pages/Terms"));
const Privacy = lazyRetry(() => import("./pages/Privacy"));
const Onboarding = lazyRetry(() => import("./pages/Onboarding"));
const DocumentAnalyzer = lazyRetry(() => import("./pages/DocumentAnalyzer"));
const ClientPortal = lazyRetry(() => import("./pages/ClientPortal"));

const SubscriberDashboard = lazyRetry(() => import("./pages/subscriber/Dashboard"));
const SubmitLetter = lazyRetry(() => import("./pages/subscriber/SubmitLetter"));
const TemplateGallery = lazyRetry(() => import("./pages/subscriber/TemplateGallery"));
const MyLetters = lazyRetry(() => import("./pages/subscriber/MyLetters"));
const LetterDetail = lazyRetry(() => import("./pages/subscriber/LetterDetail"));
const Billing = lazyRetry(() => import("./pages/subscriber/Billing"));
const Receipts = lazyRetry(() => import("./pages/subscriber/Receipts"));
const Profile = lazyRetry(() => import("./pages/subscriber/Profile"));
const IntakeFormTemplates = lazyRetry(() => import("./pages/subscriber/IntakeFormTemplates"));

const AttorneyDashboard = lazyRetry(() => import("./pages/attorney/Dashboard"));
const ReviewQueue = lazyRetry(() => import("./pages/attorney/ReviewQueue"));
const ReviewCentre = lazyRetry(() => import("./pages/attorney/ReviewCentre"));
const ReviewDetail = lazyRetry(() => import("./pages/attorney/ReviewDetail"));

const EmployeeAffiliateDashboard = lazyRetry(
  () => import("./pages/employee/AffiliateDashboard")
);

const AdminVerify2FA = lazyRetry(() => import("./pages/admin/Verify2FA"));
const AdminDashboard = lazyRetry(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazyRetry(() => import("./pages/admin/Users"));
const AdminJobs = lazyRetry(() => import("./pages/admin/Jobs"));
const AdminAllLetters = lazyRetry(() => import("./pages/admin/AllLetters"));
const AdminLetterDetail = lazyRetry(() => import("./pages/admin/LetterDetail"));
const AdminAffiliate = lazyRetry(() => import("./pages/admin/Affiliate"));
const AdminLearning = lazyRetry(() => import("./pages/admin/Learning"));
const AdminBlogEditor = lazyRetry(() => import("./pages/admin/BlogEditor"));
const AdminPipelineAnalytics = lazyRetry(() => import("./pages/admin/PipelineAnalytics"));
const AdminQualityDashboard = lazyRetry(() => import("./pages/admin/QualityDashboard"));
const AdminTemplates = lazyRetry(() => import("./pages/admin/Templates"));
const AdminSubmitLetter = lazyRetry(() => import("./pages/admin/AdminSubmitLetter"));

const BlogIndex = lazyRetry(() => import("./pages/BlogIndex"));
const BlogPost = lazyRetry(() => import("./pages/BlogPost"));
const ContentCalendar = lazyRetry(() => import("./pages/ContentCalendar"));
const NewsletterTemplate = lazyRetry(() => import("./pages/NewsletterTemplate"));

const ServicesIndex = lazyRetry(() => import("./pages/services/ServicesIndex"));
const ServiceRoute = lazyRetry(() => import("./pages/services/ServiceRoute"));

function Router() {
  return (
    <Switch>
      {/* ═══ Public ═══ */}
      <Route path="/" component={Home} />
      <Route path="/pricing">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <Pricing />
        </SuspenseFade>
      </Route>
      <Route path="/faq">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <FAQ />
        </SuspenseFade>
      </Route>
      <Route path="/terms">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <Terms />
        </SuspenseFade>
      </Route>
      <Route path="/privacy">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <Privacy />
        </SuspenseFade>
      </Route>
      <Route path="/analyze">
        <SuspenseFade fallback={<DocumentAnalyzerSkeleton />}>
          <DocumentAnalyzer />
        </SuspenseFade>
      </Route>
      {/* Public portal: recipient views their letter — no auth required */}
      <Route path="/portal/:token">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <ClientPortal />
        </SuspenseFade>
      </Route>
      <Route path="/blog">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <BlogIndex />
        </SuspenseFade>
      </Route>
      <Route path="/blog/:slug">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <BlogPost />
        </SuspenseFade>
      </Route>
      <Route path="/content-calendar">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <ContentCalendar />
        </SuspenseFade>
      </Route>
      <Route path="/newsletter-template">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <NewsletterTemplate />
        </SuspenseFade>
      </Route>
      <Route path="/services">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <ServicesIndex />
        </SuspenseFade>
      </Route>
      <Route path="/services/:slug">
        <SuspenseFade fallback={<PublicPageSkeleton />}>
          <ServiceRoute />
        </SuspenseFade>
      </Route>

      {/* ═══ Auth ═══ */}
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password">
        <SuspenseFade fallback={<AuthPageSkeleton />}>
          <ForgotPassword />
        </SuspenseFade>
      </Route>
      <Route path="/verify-email">
        <SuspenseFade fallback={<AuthPageSkeleton />}>
          <VerifyEmail />
        </SuspenseFade>
      </Route>
      <Route path="/reset-password">
        <SuspenseFade fallback={<AuthPageSkeleton />}>
          <ResetPassword />
        </SuspenseFade>
      </Route>
      <Route path="/accept-invitation">
        <SuspenseFade fallback={<AuthPageSkeleton />}>
          <AcceptInvitation />
        </SuspenseFade>
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute>
          <SuspenseFade fallback={<OnboardingSkeleton />}>
            <Onboarding />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>

      {/* ═══ Subscriber — role-gated ═══ */}
      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<SubscriberDashboardSkeleton />}>
            <SubscriberDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/submit">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<SubmitLetterSkeleton />}>
            <SubmitLetter />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/library">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<TemplateGallerySkeleton />}>
            <TemplateGallery />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/letters">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<MyLettersSkeleton />}>
            <MyLetters />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/letters/:id">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<LetterDetailSkeleton />}>
            <LetterDetail />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/subscriber/billing">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<BillingSkeleton />}>
            <Billing />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/subscriber/receipts">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<ReceiptsSkeleton />}>
            <Receipts />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/subscriber/intake-templates">
        <ProtectedRoute allowedRoles={["subscriber"]}>
          <SuspenseFade fallback={<BillingSkeleton />}>
            <IntakeFormTemplates />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute
          allowedRoles={["subscriber", "employee", "attorney", "admin"]}
        >
          <SuspenseFade fallback={<ProfileSkeleton />}>
            <Profile />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>

      {/* ═══ Attorney — Review Center (attorney + admin) ═══ */}
      <Route path="/attorney">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<AttorneyDashboardSkeleton />}>
            <AttorneyDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/attorney/queue">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewQueueSkeleton />}>
            <ReviewQueue />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/attorney/review-centre">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewQueueSkeleton />}>
            <ReviewCentre />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      {/* /attorney/review/:id — admin "Claim & Review" redirect target (must be before /attorney/:id) */}
      <Route path="/attorney/review/:id">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/attorney/:id">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      {/* Backward-compatible /review/* aliases */}
      <Route path="/review">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<AttorneyDashboardSkeleton />}>
            <AttorneyDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/review/queue">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewQueueSkeleton />}>
            <ReviewQueue />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/review/centre">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewQueueSkeleton />}>
            <ReviewCentre />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/review/:id">
        <ProtectedRoute allowedRoles={["attorney", "admin"]}>
          <SuspenseFade fallback={<ReviewDetailSkeleton />}>
            <ReviewDetail />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>

      {/* ═══ Employee/Affiliate ═══ */}
      <Route path="/employee/dashboard">
        {() => { window.location.replace("/employee"); return null; }}
      </Route>
      <Route path="/employee">
        <ProtectedRoute allowedRoles={["employee", "admin"]}>
          <SuspenseFade fallback={<AffiliateDashboardSkeleton />}>
            <EmployeeAffiliateDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/employee/referrals">
        <ProtectedRoute allowedRoles={["employee", "admin"]}>
          <SuspenseFade fallback={<AffiliateDashboardSkeleton />}>
            <EmployeeAffiliateDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/employee/earnings">
        <ProtectedRoute allowedRoles={["employee", "admin"]}>
          <SuspenseFade fallback={<AffiliateDashboardSkeleton />}>
            <EmployeeAffiliateDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>

      {/* ═══ Admin — 2FA verification ═══ */}
      <Route path="/admin/verify">
        <SuspenseFade fallback={<AuthPageSkeleton />}>
          <AdminVerify2FA />
        </SuspenseFade>
      </Route>

      {/* ═══ Admin — role-gated ═══ */}
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminDashboardSkeleton />}>
            <AdminDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminUsersSkeleton />}>
            <AdminUsers />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/jobs">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminJobsSkeleton />}>
            <AdminJobs />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/letters">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminAllLettersSkeleton />}>
            <AdminAllLetters />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/letters/:id">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminLetterDetailSkeleton />}>
            <AdminLetterDetail />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/affiliate">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminAffiliateSkeleton />}>
            <AdminAffiliate />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/learning">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminLearningSkeleton />}>
            <AdminLearning />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/blog">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminDashboardSkeleton />}>
            <AdminBlogEditor />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/pipeline">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminDashboardSkeleton />}>
            <AdminPipelineAnalytics />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quality">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminDashboardSkeleton />}>
            <AdminQualityDashboard />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/templates">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<AdminDashboardSkeleton />}>
            <AdminTemplates />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/submit">
        <ProtectedRoute allowedRoles={["admin"]}>
          <SuspenseFade fallback={<SubmitLetterSkeleton />}>
            <AdminSubmitLetter />
          </SuspenseFade>
        </ProtectedRoute>
      </Route>

      {/* ═══ Fallback ═══ */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

const ORGANIZATION_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Talk to My Lawyer",
  "url": "https://www.talk-to-my-lawyer.com",
  "logo": "https://www.talk-to-my-lawyer.com/logo-main.png",
  "sameAs": [],
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "support@talk-to-my-lawyer.com",
    "contactType": "customer service",
  },
  "description": "Professional attorney-reviewed legal letters. Demand letters, cease and desist, breach of contract, and more — structured drafting, reviewed by licensed attorneys.",
});

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Helmet>
            <script type="application/ld+json">{ORGANIZATION_JSONLD}</script>
          </Helmet>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
