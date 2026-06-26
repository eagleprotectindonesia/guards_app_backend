import React from 'react';
import { Card } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';
import { cn } from '@repo/shared';

type Props = {
  employeesPresent: number;
  totalEmployees: number;
  activeGuardsOnDuty: number;
  scheduledShiftsToday: number;
  activeSites: number;
  totalSites: number;
  openTickets: number;
  className?: string;
};

function pctColor(pct: number) {
  return pct < 50
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-emerald-600 dark:text-emerald-400';
}

export function TodaysSnapshotCard({
  employeesPresent,
  totalEmployees,
  activeGuardsOnDuty,
  scheduledShiftsToday,
  activeSites,
  totalSites,
  openTickets,
  className,
}: Props) {
  const empPct = totalEmployees > 0 ? (employeesPresent / totalEmployees) * 100 : 0;
  const guardPct = scheduledShiftsToday > 0 ? (activeGuardsOnDuty / scheduledShiftsToday) * 100 : 0;
  const sitePct = totalSites > 0 ? (activeSites / totalSites) * 100 : 0;

  return (
    <Card className={cn('border-border/60 bg-card shadow-md flex flex-col', className)}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2 shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ClipboardList className="h-4 w-4" />
          </div>
          <p className="text-sm font-bold text-foreground">TODAY&apos;S SNAPSHOT</p>
        </div>
      </div>

      <div className="px-5 pb-5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/10 bg-muted/5 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Employees Present
          </p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">
            <span className="text-sky-600 dark:text-sky-400">{employeesPresent}</span>
            <span className="text-muted-foreground/50 mx-1">/</span>
            <span>{totalEmployees}</span>
          </p>
          <p className={cn('text-[11px] font-semibold', pctColor(empPct))}>
            {empPct.toFixed(1)}%
          </p>
        </div>

        <div className="rounded-xl border border-border/10 bg-muted/5 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Guards On Duty
          </p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">{activeGuardsOnDuty}</span>
            <span className="text-muted-foreground/50 mx-1">/</span>
            <span>{scheduledShiftsToday}</span>
          </p>
          <p className={cn('text-[11px] font-semibold', pctColor(guardPct))}>
            {guardPct.toFixed(1)}%
          </p>
        </div>

        <div className="rounded-xl border border-border/10 bg-muted/5 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Sites Online
          </p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">
            <span className="text-purple-600 dark:text-purple-400">{activeSites}</span>
            <span className="text-muted-foreground/50 mx-1">/</span>
            <span>{totalSites}</span>
          </p>
          <p className={cn('text-[11px] font-semibold', pctColor(sitePct))}>
            {sitePct.toFixed(1)}%
          </p>
        </div>

        <div className="rounded-xl border border-border/10 bg-muted/5 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Open Tickets
          </p>
          <p className="text-2xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
            {openTickets}
          </p>
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Pending
          </p>
        </div>
      </div>
    </Card>
  );
}
