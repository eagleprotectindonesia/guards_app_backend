import { useNewDashboardStream } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

export function TopSitesByActivityCard() {
  const { topSitesActivity } = useNewDashboardStream();
  const isLoading =
    (topSitesActivity.status === 'idle' || topSitesActivity.status === 'loading') && topSitesActivity.data.windowEnd === '';

  const maxTotal = Math.max(1, ...topSitesActivity.data.sites.map(site => site.total));

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Top Sites by Activity</h3>
      <p className="mt-1 text-xs text-muted-foreground">Last 24h • Critical incidents</p>

      {isLoading && (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <LoadingBlock className="h-3 w-28" />
                <LoadingBlock className="h-3 w-14" />
              </div>
              <LoadingBlock className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && topSitesActivity.data.sites.length === 0 && (
        <div className="mt-4 flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No critical incidents in the last 24 hours
        </div>
      )}

      {!isLoading && topSitesActivity.data.sites.length > 0 && (
        <div className="mt-4 space-y-3">
          {topSitesActivity.data.sites.map(site => {
            const barPct = Math.max(8, Math.round((site.total / maxTotal) * 100));
            return (
              <div key={site.siteId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{site.siteName}</p>
                  <span className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">{`${site.total} Alerts`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full bg-red-500/90" style={{ width: `${barPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
