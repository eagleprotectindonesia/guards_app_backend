import React from 'react';
import { Card } from '@/components/ui/card';
import { UserCheck } from 'lucide-react';
import { ProgressBar } from './progress-bar';

type Props = {
  activeGuardsOnDuty: number;
  scheduledShiftsToday: number;
};

export function ActiveGuardsCard({ activeGuardsOnDuty, scheduledShiftsToday }: Props) {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
          <UserCheck className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          Active Guards
        </p>
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight text-foreground">
          <span className="text-emerald-600 dark:text-emerald-400">{activeGuardsOnDuty}</span>
          <span className="text-muted-foreground/50 mx-1.5">/</span>
          <span>{scheduledShiftsToday}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">On Duty / Scheduled Today</p>
      </div>
      {scheduledShiftsToday > 0 && (
        <div className="space-y-1">
          <ProgressBar pct={(activeGuardsOnDuty / scheduledShiftsToday) * 100} color="emerald" />
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            {((activeGuardsOnDuty / scheduledShiftsToday) * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </Card>
  );
}
