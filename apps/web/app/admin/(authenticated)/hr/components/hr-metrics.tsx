import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, UserCheck, CalendarDays, Clock, UserX } from 'lucide-react';
import { cn } from '@repo/shared';

type HRMetricsProps = {
  officeEmployeeCount: number;
  onsiteEmployeeCount: number;
  officePresentCount: number;
  onsitePresentCount: number;
  officeLateCount: number;
  onsiteLateCount: number;
  officeAbsentCount: number;
  onsiteAbsentCount: number;
  officeOnLeaveCount: number;
  onsiteOnLeaveCount: number;
};

export function HRMetrics(props: HRMetricsProps) {
  const metrics = [
    {
      label: 'Total Employees',
      office: props.officeEmployeeCount,
      onsite: props.onsiteEmployeeCount,
      icon: Users,
      accentClass: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      iconColor: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Present Today',
      office: props.officePresentCount,
      onsite: props.onsitePresentCount,
      icon: UserCheck,
      accentClass: 'border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400',
      iconColor: 'text-teal-600 dark:text-teal-400',
    },
    {
      label: 'Late Today',
      office: props.officeLateCount,
      onsite: props.onsiteLateCount,
      icon: Clock,
      accentClass: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      iconColor: 'text-amber-600 dark:text-amber-500',
    },
    {
      label: 'Absent Today',
      office: props.officeAbsentCount,
      onsite: props.onsiteAbsentCount,
      icon: UserX,
      accentClass: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400',
      iconColor: 'text-rose-600 dark:text-rose-500',
    },
    {
      label: 'On Leave Today',
      office: props.officeOnLeaveCount,
      onsite: props.onsiteOnLeaveCount,
      icon: CalendarDays,
      accentClass: 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {metrics.map(m => {
        const Icon = m.icon;
        return (
          <Card key={m.label} className="border-border/60 bg-card p-2.5 shadow-sm flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', m.accentClass)}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>
                <p className="text-2xl font-bold text-foreground">{m.office + m.onsite}</p>
              </div>
            </div>
            <div className="border-t border-border/40 mt-1.5 pt-1.5 grid grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Office</p>
                <p className={cn('text-2xl font-extrabold tracking-tight leading-none', m.iconColor)}>{m.office}</p>
              </div>
              <div className="pl-2 rounded-sm bg-slate-500/4 dark:bg-slate-400/4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Onsite
                </p>
                <p className="text-2xl font-extrabold tracking-tight leading-none text-slate-500 dark:text-slate-400">
                  {m.onsite}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
