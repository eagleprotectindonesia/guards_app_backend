import { LoadingBlock } from '../../components/loading/loading-block';

export function PlaceholderCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}>
      <LoadingBlock className="h-full w-full" />
    </div>
  );
}
