import { LoadingBlock } from './loading-block';

export function NewDashboardSkeleton() {
  return (
    <div className="mx-auto max-w-400 space-y-4 p-4 animate-pulse">
      {/* Top KPI Row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <LoadingBlock className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <LoadingBlock className="h-3 w-20" />
                <LoadingBlock className="h-6 w-12" />
              </div>
            </div>
            <LoadingBlock className="mt-3 h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Middle Section */}
      <div className="grid grid-cols-12 gap-4">
        {/* Main Column */}
        <div className="col-span-12 space-y-4 lg:col-span-9">
          {/* Live Operations Map */}
          <div className="rounded-xl border border-border bg-card shadow-sm h-175 relative overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-1.5">
                <LoadingBlock className="h-4 w-4 rounded" />
                <LoadingBlock className="h-4 w-28" />
                <LoadingBlock className="mx-1 h-3.5 w-px" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <LoadingBlock key={i} className="h-5 w-16 rounded" />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <LoadingBlock className="h-3 w-20" />
                <LoadingBlock className="h-7 w-7 rounded-lg" />
              </div>
            </div>
            <LoadingBlock className="mx-3 mb-3 h-[calc(100%-3rem)] rounded-lg" />
          </div>
          {/* Bottom Split */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Live Activity Feed */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-64">
              <div className="flex justify-between items-center">
                <LoadingBlock className="h-4 w-32" />
                <LoadingBlock className="h-4 w-16" />
              </div>
              <div className="mt-4 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <LoadingBlock className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <LoadingBlock className="h-3 w-full" />
                      <LoadingBlock className="h-2 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Shift Overview */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <LoadingBlock className="h-4 w-32" />
              <div className="mt-6 flex justify-center">
                <LoadingBlock className="h-44 w-44 rounded-full border-12 border-muted/20" />
              </div>
              <div className="mt-6 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <LoadingBlock className="h-2 w-2 rounded-full" />
                      <LoadingBlock className="h-3 w-16" />
                    </div>
                    <LoadingBlock className="h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-12 space-y-4 lg:col-span-3">
          {/* Critical Alerts */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-100">
            <div className="flex justify-between items-center">
              <LoadingBlock className="h-4 w-28" />
              <LoadingBlock className="h-3 w-16" />
            </div>
            <div className="mt-4 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-muted/20 p-3 space-y-2">
                  <div className="flex justify-between">
                    <LoadingBlock className="h-3 w-20" />
                    <LoadingBlock className="h-3 w-12" />
                  </div>
                  <LoadingBlock className="h-4 w-32" />
                  <div className="flex justify-between items-center">
                    <LoadingBlock className="h-3 w-24" />
                    <LoadingBlock className="h-3 w-10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Internal Chat */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-90 flex flex-col">
            <div className="flex justify-between items-center">
              <LoadingBlock className="h-4 w-28" />
              <LoadingBlock className="h-3 w-16" />
            </div>
            <div className="mt-4 flex-1 space-y-4 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <LoadingBlock className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <LoadingBlock className="h-3 w-20" />
                      <LoadingBlock className="h-2 w-12" />
                    </div>
                    <LoadingBlock className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex gap-2">
              <LoadingBlock className="h-10 flex-1 rounded-lg" />
              <LoadingBlock className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
