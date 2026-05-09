import { LoadingBlock } from './loading-block';

type AdminFormSkeletonProps = {
  fullPage?: boolean;
  sections?: number;
};

export function AdminFormSkeleton({ fullPage = false, sections = 3 }: AdminFormSkeletonProps) {
  return (
    <div className={fullPage ? 'mx-auto max-w-4xl space-y-6 py-8 animate-pulse' : 'space-y-4 animate-pulse'}>
      {fullPage && (
        <div className="space-y-2">
          <LoadingBlock className="h-8 w-56" />
          <LoadingBlock className="h-4 w-80" />
        </div>
      )}

      <div className="space-y-4">
        {Array.from({ length: sections }).map((_, sectionIndex) => (
          <div key={sectionIndex} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <LoadingBlock className="h-5 w-40" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 4 }).map((__, fieldIndex) => (
                <div key={fieldIndex} className="space-y-2">
                  <LoadingBlock className="h-4 w-28" />
                  <LoadingBlock className="h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        <LoadingBlock className="h-10 w-24" />
        <LoadingBlock className="h-10 w-32" />
      </div>
    </div>
  );
}
