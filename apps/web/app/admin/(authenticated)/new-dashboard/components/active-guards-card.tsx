import { ShieldCheck } from 'lucide-react';

type ActiveGuardsCardProps = {
  siteGuardsCount: number;
  patrolCount: number;
};

export function ActiveGuardsCard({ siteGuardsCount, patrolCount }: ActiveGuardsCardProps) {
  const total = siteGuardsCount + patrolCount;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Guards</p>
          <p className="text-2xl font-bold text-foreground">{total}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>Site Guards</span>
          <span className="font-semibold text-foreground">{siteGuardsCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span>Patrol</span>
          <span className="font-semibold text-foreground">{patrolCount}</span>
        </div>
      </div>
    </div>
  );
}
