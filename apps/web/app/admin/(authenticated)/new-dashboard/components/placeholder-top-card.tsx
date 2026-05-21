import { LoadingBlock } from '../../components/loading/loading-block';

export function PlaceholderTopCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <LoadingBlock className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <LoadingBlock className="h-3 w-20" />
          <LoadingBlock className="h-6 w-12" />
        </div>
      </div>
      <LoadingBlock className="mt-3 h-3 w-16" />
    </div>
  );
}
