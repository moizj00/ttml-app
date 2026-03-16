import { Skeleton } from "@/components/ui/skeleton";

/**
 * ─── Shared skeleton building blocks ───
 * These compose into role-specific page skeletons that match
 * the actual layout of each page group for a seamless loading UX.
 */

function NavBarSkeleton() {
  return (
    <div className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="hidden md:flex items-center gap-6">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <Skeleton className="md:hidden h-8 w-8 rounded" />
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <aside className="hidden lg:flex w-64 flex-col bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </div>
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="space-y-1 flex-1">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </aside>
  );
}

function HeaderBarSkeleton() {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <Skeleton className="lg:hidden w-8 h-8 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
    </header>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="w-5 h-5 rounded" />
      </div>
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="p-4 border-b">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 p-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-4 ${c === 0 ? "w-32" : c === cols - 1 ? "w-16" : "w-24"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AppLayout wrapper skeleton (sidebar + header + content) ───
function AppLayoutSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      <SidebarSkeleton />
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <HeaderBarSkeleton />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC PAGE SKELETONS
// ═══════════════════════════════════════════════════════════════

/** Pricing / FAQ — public nav + centered content cards */
export function PublicPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <NavBarSkeleton />
      <div className="pt-24 pb-16 px-4 max-w-6xl mx-auto">
        {/* Hero */}
        <div className="text-center space-y-4 mb-12">
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>
        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-3 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH PAGE SKELETONS
// ═══════════════════════════════════════════════════════════════

/** ForgotPassword / VerifyEmail / ResetPassword — centered card */
export function AuthPageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="h-5 w-36" />
        </div>
        {/* Card */}
        <div className="rounded-xl border bg-card shadow-lg p-6 space-y-5">
          <div className="text-center space-y-2">
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="flex justify-center">
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIBER PAGE SKELETONS
// ═══════════════════════════════════════════════════════════════

/** Subscriber Dashboard — sidebar + stat cards + recent letters table */
export function SubscriberDashboardSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        {/* Welcome banner */}
        <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 p-6">
          <Skeleton className="h-6 w-48 bg-white/20" />
          <Skeleton className="h-4 w-72 mt-2 bg-white/15" />
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Recent letters */}
        <TableSkeleton rows={4} cols={4} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** SubmitLetter — sidebar + step progress + form */
export function SubmitLetterSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Step progress bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 flex-shrink-0">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-3 w-20" />
              {i < 4 && <Skeleton className="h-0.5 w-8" />}
            </div>
          ))}
        </div>
        {/* Form card */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>
    </AppLayoutSkeleton>
  );
}

/** MyLetters — sidebar + search bar + letter list */
export function MyLettersSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
        {/* Search/filter bar */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        {/* Letter cards */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </AppLayoutSkeleton>
  );
}

/** LetterDetail — sidebar + letter content + status panel */
export function LetterDetailSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Back button + title */}
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded" />
          <Skeleton className="h-6 w-64" />
        </div>
        {/* Status card */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        {/* Letter content */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-3">
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
    </AppLayoutSkeleton>
  );
}

/** Billing — sidebar + plan card + payment history */
export function BillingSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-7 w-24" />
        {/* Current plan */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
        {/* Payment history */}
        <TableSkeleton rows={4} cols={3} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Receipts — sidebar + receipt list */
export function ReceiptsSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-7 w-24" />
        <TableSkeleton rows={5} cols={4} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Profile — sidebar + profile form */
export function ProfileSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-7 w-24" />
        <div className="rounded-xl border bg-card p-6 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          {/* Form fields */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
    </AppLayoutSkeleton>
  );
}

// ═══════════════════════════════════════════════════════════════
// ATTORNEY PAGE SKELETONS
// ═══════════════════════════════════════════════════════════════

/** Attorney Dashboard — sidebar + stat cards + urgent queue + recent table */
export function AttorneyDashboardSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <Skeleton className="h-7 w-36" />
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Urgent queue */}
        <div className="rounded-xl border border-red-200 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-5 w-36" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="space-y-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          ))}
        </div>
        {/* Recent reviews table */}
        <TableSkeleton rows={4} cols={5} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** ReviewQueue — sidebar + filter tabs + letter queue list */
export function ReviewQueueSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
        {/* Queue items */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </AppLayoutSkeleton>
  );
}

/** ReviewDetail — sidebar + split pane (letter content + review panel) */
export function ReviewDetailSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-24 rounded-full ml-auto" />
        </div>
        {/* Split pane */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Letter content */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          {/* Right: Review panel */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-28" />
            {/* Notes */}
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-muted/30 p-3 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
            {/* Action buttons */}
            <div className="flex gap-3 pt-4">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 flex-1 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </AppLayoutSkeleton>
  );
}

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE PAGE SKELETONS
// ═══════════════════════════════════════════════════════════════

/** Employee Affiliate Dashboard — sidebar + stat cards + code + referral link + tables */
export function EmployeeDashboardSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        {/* Header banner */}
        <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
          <Skeleton className="h-6 w-48 bg-white/20" />
          <Skeleton className="h-4 w-72 mt-2 bg-white/15" />
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Discount code + referral link */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-20 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        {/* Commissions table */}
        <TableSkeleton rows={4} cols={4} />
      </div>
    </AppLayoutSkeleton>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN PAGE SKELETONS
// ═══════════════════════════════════════════════════════════════

/** Admin Dashboard — sidebar + stat cards + tables */
export function AdminDashboardSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <Skeleton className="h-7 w-40" />
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Recent activity */}
        <TableSkeleton rows={5} cols={4} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Admin Users — sidebar + search + user table */
export function AdminUsersSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Admin Jobs — sidebar + job queue table */
export function AdminJobsSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
        <TableSkeleton rows={5} cols={5} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Admin AllLetters — sidebar + filter bar + letters table */
export function AdminAllLettersSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <Skeleton className="h-7 w-28" />
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Admin LetterDetail — sidebar + letter detail + admin actions */
export function AdminLetterDetailSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        {/* Letter info cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 flex-1 rounded-md" />
              <Skeleton className="h-9 flex-1 rounded-md" />
            </div>
          </div>
        </div>
        {/* Audit log */}
        <TableSkeleton rows={4} cols={4} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Admin Affiliate — sidebar + tabs + performance/commissions/payouts tables */
export function AdminAffiliateSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        {/* Header banner */}
        <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
          <Skeleton className="h-6 w-48 bg-white/20" />
          <Skeleton className="h-4 w-72 mt-2 bg-white/15" />
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          {["Performance", "Codes", "Commissions", "Payouts"].map((tab) => (
            <Skeleton key={tab} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
        {/* Table content */}
        <TableSkeleton rows={5} cols={5} />
      </div>
    </AppLayoutSkeleton>
  );
}

/** Onboarding — centered card with steps */
export function OnboardingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="rounded-xl border bg-card shadow-lg p-8 space-y-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="w-8 h-8 rounded-full" />
            ))}
          </div>
          <div className="text-center space-y-2">
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
