import { format, isToday } from 'date-fns';
import { UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useNewDashboardStream, type NewDashboardLiveActivityItem } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

function activityVerb(item: NewDashboardLiveActivityItem): string {
  if (item.kind === 'attendance') {
    return 'recorded attendance in';
  }
  return 'checked in at';
}

export function LiveActivityFeedCard() {
  const { liveActivityFeed } = useNewDashboardStream();

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-64 flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Live Activity Feed</h3>
        <Link href="/admin/attendance" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
          See All
        </Link>
      </div>

      {(liveActivityFeed.status === 'loading' || liveActivityFeed.status === 'idle') && liveActivityFeed.data.length === 0 && (
        <div className="space-y-4">
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
      )}

      {liveActivityFeed.status === 'ready' && liveActivityFeed.data.length === 0 && (
        <div className="h-[calc(100%-2.5rem)] flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No recent activity
        </div>
      )}

      {liveActivityFeed.data.length > 0 && (
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {liveActivityFeed.data.slice(0, 10).map(item => {
            const occurredAt = new Date(item.occurredAt);
            const timestamp = isToday(occurredAt) ? format(occurredAt, 'hh:mm a') : format(occurredAt, 'MMM d');
            return (
              <div key={item.id} className="rounded-lg border border-border bg-muted/10 px-2.5 py-2">
                <p className="flex items-center gap-1.5 truncate text-xs text-foreground leading-4">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate font-semibold text-emerald-600 dark:text-emerald-400">{item.guardName}</span>{' '}
                  <span className="truncate">{activityVerb(item)}</span>
                </p>
                <p className="mt-0.5 flex items-center justify-between gap-2 text-[10px] leading-4">
                  <span className="min-w-0 truncate text-blue-600 dark:text-blue-400">{item.siteName}</span>
                  <span className="shrink-0 text-muted-foreground">{timestamp}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
