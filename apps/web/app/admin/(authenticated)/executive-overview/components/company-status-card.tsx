import React from 'react';
import { Card } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export function CompanyStatusCard() {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          Company Status
        </p>
      </div>
      <div>
        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">HEALTHY</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Operations running normally</p>
      </div>
    </Card>
  );
}
