import { ShieldAlert } from 'lucide-react';

type SOSAlertsCardProps = {
  count: number;
};

export function SOSAlertsCard({ count }: SOSAlertsCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SOS Alerts</p>
          <p className="text-2xl font-bold text-foreground">{count}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Unresolved Panics</p>
    </div>
  );
}
