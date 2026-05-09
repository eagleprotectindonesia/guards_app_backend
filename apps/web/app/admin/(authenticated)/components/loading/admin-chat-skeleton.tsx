import { LoadingBlock } from './loading-block';

export function AdminChatSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] py-8 animate-pulse">
      <div className="flex h-[calc(100vh-180px)] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="w-1/3 border-r border-border p-4 space-y-4">
          <LoadingBlock className="h-8 w-40" />
          <LoadingBlock className="h-10 w-full" />
          <LoadingBlock className="h-10 w-full" />
          <div className="space-y-3 pt-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <LoadingBlock className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <LoadingBlock className="h-4 w-3/4" />
                  <LoadingBlock className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-6 p-6">
          <LoadingBlock className="h-6 w-48" />
          <div className="flex-1 rounded-xl border border-border bg-muted/20 p-6 space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={index % 2 === 0 ? 'flex justify-start' : 'flex justify-end'}>
                <LoadingBlock className={`h-14 w-3/5 rounded-2xl ${index % 2 === 0 ? 'rounded-bl-md' : 'rounded-br-md'}`} />
              </div>
            ))}
          </div>
          <LoadingBlock className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
