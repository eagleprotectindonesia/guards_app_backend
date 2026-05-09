import { LoadingBlock } from './loading-block';

type AdminListSkeletonProps = {
  fullPage?: boolean;
  rows?: number;
};

export function AdminListSkeleton({ fullPage = false, rows = 8 }: AdminListSkeletonProps) {
  return (
    <div className={fullPage ? 'mx-auto max-w-7xl space-y-6 py-8 animate-pulse' : 'space-y-4 animate-pulse'}>
      {fullPage && (
        <div className="space-y-2">
          <LoadingBlock className="h-8 w-64" />
          <LoadingBlock className="h-4 w-96" />
        </div>
      )}

      {fullPage && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <LoadingBlock className="h-10 w-full max-w-md" />
          <div className="flex gap-3">
            <LoadingBlock className="h-10 w-24" />
            <LoadingBlock className="h-10 w-32" />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <LoadingBlock className="h-5 w-44" />
          <LoadingBlock className="h-9 w-28" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
              <LoadingBlock className="h-4 w-3/4" />
              <LoadingBlock className="h-4 w-5/6" />
              <LoadingBlock className="h-4 w-2/3" />
              <LoadingBlock className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
