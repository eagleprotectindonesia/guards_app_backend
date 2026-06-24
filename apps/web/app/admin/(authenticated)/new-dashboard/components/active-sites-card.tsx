import { Building2 } from 'lucide-react';

type ActiveSitesCardProps = {
  activeSitesCount: number;
  totalSites: number;
};

export function ActiveSitesCard({ activeSitesCount, totalSites }: ActiveSitesCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Sites</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground">{activeSitesCount}</span>
            <span className="text-sm font-medium text-muted-foreground/70">/ {totalSites}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
