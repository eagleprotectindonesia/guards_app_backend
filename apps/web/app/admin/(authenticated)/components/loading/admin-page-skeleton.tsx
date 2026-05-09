import { LoadingBlock } from './loading-block';

export function AdminPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8 animate-pulse">
      <div className="space-y-2">
        <LoadingBlock className="h-8 w-64" />
        <LoadingBlock className="h-4 w-96" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <LoadingBlock className="h-10 w-full max-w-md" />
        <LoadingBlock className="h-10 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <LoadingBlock className="h-4 w-24" />
            <LoadingBlock className="mt-3 h-8 w-20" />
            <LoadingBlock className="mt-4 h-4 w-32" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <LoadingBlock className="h-5 w-44" />
        </div>
        <div className="space-y-4 p-4">
          <LoadingBlock className="h-4 w-full" />
          <LoadingBlock className="h-4 w-11/12" />
          <LoadingBlock className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
