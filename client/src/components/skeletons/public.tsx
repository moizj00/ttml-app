import { Skeleton } from "@/components/ui/skeleton";

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

export function DocumentAnalyzerSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <NavBarSkeleton />
      <div className="pt-24 pb-16 px-4 max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <Skeleton className="h-10 w-72 mx-auto" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>
        <div className="rounded-xl border bg-card p-10 flex flex-col items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-full" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function PublicPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <NavBarSkeleton />
      <div className="pt-24 pb-16 px-4 max-w-6xl mx-auto">
        <div className="text-center space-y-4 mb-12">
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>
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
