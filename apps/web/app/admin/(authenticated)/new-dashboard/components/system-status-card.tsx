import { ShieldCheck } from 'lucide-react';

export function SystemStatusCard() {
  return (
    <div className="flex h-full pt-6 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg  text-green-600 dark:text-green-400">
        <ShieldCheck className="h-8 w-8" />
      </div>
      <div className="flex flex-col gap-8 mt-2">
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">System Status</p>
        <p className="text-xs font-semibold text-green-600 dark:text-green-400">All Systems Operational</p>
      </div>
    </div>
  );
}
