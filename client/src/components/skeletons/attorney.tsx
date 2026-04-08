import { Skeleton } from "@/components/ui/skeleton";

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
      <nav className="flex-1 p-3 space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </nav>
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
              <Skeleton key={c} className={`h-4 ${c === 0 ? "w-32" : c === cols - 1 ? "w-16" : "w-24"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

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

export function AttorneyDashboardSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <Skeleton className="h-7 w-36" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
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
        <TableSkeleton rows={4} cols={5} />
      </div>
    </AppLayoutSkeleton>
  );
}

export function ReviewQueueSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
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

export function ReviewDetailSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-24 rounded-full ml-auto" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-muted/30 p-3 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
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

export function AffiliateDashboardSkeleton() {
  return (
    <AppLayoutSkeleton>
      <div className="space-y-6">
        <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
          <Skeleton className="h-6 w-48 bg-white/20" />
          <Skeleton className="h-4 w-72 mt-2 bg-white/15" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
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
        <TableSkeleton rows={4} cols={4} />
      </div>
    </AppLayoutSkeleton>
  );
}
