import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, UserCheck, CalendarDays, ClipboardList } from 'lucide-react';
import { cn } from '@repo/shared';

type HRMetricsProps = {
  totalEmployees: number;
  activeOnDutyCount: number;
  onLeaveTodayCount: number;
  pendingLeaveCount: number;
};

export function HRMetrics({
  totalEmployees,
  activeOnDutyCount,
  onLeaveTodayCount,
  pendingLeaveCount,
}: HRMetricsProps) {
  const metricsList = [
    {
      label: 'Total Employees',
      value: totalEmployees.toString(),
      hint: 'Registered staff members',
      hintTone: 'neutral',
      icon: Users,
      accentClass: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Active On-Duty',
      value: activeOnDutyCount.toString(),
      hint: '95.4% shift coverage today',
      hintTone: 'positive',
      icon: UserCheck,
      accentClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'On Leave Today',
      value: onLeaveTodayCount.toString(),
      hint: '5 planned, 3 unplanned',
      hintTone: 'neutral',
      icon: CalendarDays,
      accentClass: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Pending Leave Requests',
      value: pendingLeaveCount.toString(),
      hint: 'Requires manager review',
      hintTone: 'warning',
      icon: ClipboardList,
      accentClass: 'border-purple-500/20 bg-purple-500/10 text-purple-400',
      iconColor: 'text-purple-400',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metricsList.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.label} className="border-[#1f2432] bg-[#11141d] p-5 shadow-md hover:border-[#2f374c] transition-colors flex flex-col gap-0 justify-between">
            <div className="flex items-center gap-4">
              <div className={cn('rounded-xl border p-3 shrink-0', metric.accentClass)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">{metric.label}</p>
                <p className={cn('text-3xl font-extrabold tracking-tight', metric.iconColor)}>{metric.value}</p>
                <p className={cn(
                  'text-xs font-medium',
                  metric.hintTone === 'positive' && 'text-emerald-400',
                  metric.hintTone === 'warning' && 'text-amber-400',
                  metric.hintTone === 'critical' && 'text-rose-400',
                  metric.hintTone === 'neutral' && 'text-muted-foreground'
                )}>{metric.hint}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
