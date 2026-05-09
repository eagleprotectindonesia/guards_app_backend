import { LoadingBlock } from './loading-block';

export function AdminDashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8 animate-pulse">
      <div className="space-y-2">
        <LoadingBlock className="h-8 w-64" />
        <LoadingBlock className="h-4 w-96" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <LoadingBlock className="h-4 w-24" />
            <LoadingBlock className="mt-3 h-10 w-24" />
            <LoadingBlock className="mt-4 h-4 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoadingBlock className="h-5 w-40" />
          <LoadingBlock className="mt-6 h-72 w-full" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoadingBlock className="h-5 w-36" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <LoadingBlock className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <LoadingBlock className="h-4 w-3/4" />
                  <LoadingBlock className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
