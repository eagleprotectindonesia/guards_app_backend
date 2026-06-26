import React from 'react';
import { Card } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export function SystemStatusCard() {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
          <Activity className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          System Status
        </p>
      </div>
      <div>
        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Operational</p>
        <p className="mt-0.5 text-xs text-muted-foreground">All Systems Running</p>
      </div>
      <div className="mt-auto flex items-baseline gap-1.5 border-t border-border/40 pt-2 text-xs">
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Uptime</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">99.9%</span>
        <span className="text-muted-foreground">(30 Days)</span>
      </div>
    </Card>
  );
}
