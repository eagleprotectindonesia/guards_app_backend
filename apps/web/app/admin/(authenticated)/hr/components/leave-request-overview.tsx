import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ClipboardList, CheckCircle, XCircle, Calendar } from 'lucide-react';

type Props = {
  pendingCount: number;
  approvedTodayCount: number;
  rejectedTodayCount: number;
  onLeaveTodayCount: number;
};

export function LeaveRequestOverview({
  pendingCount,
  approvedTodayCount,
  rejectedTodayCount,
  onLeaveTodayCount,
}: Props) {
  const statsList = [
    {
      label: 'Pending Approval',
      value: pendingCount,
      icon: ClipboardList,
      color: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Approved Today',
      value: approvedTodayCount,
      icon: CheckCircle,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Rejected Today',
      value: rejectedTodayCount,
      icon: XCircle,
      color: 'text-rose-600 dark:text-rose-400',
      bgClass: 'bg-rose-500/10 border-rose-500/20',
    },
    {
      label: 'On Leave Today',
      value: onLeaveTodayCount,
      icon: Calendar,
      color: 'text-sky-600 dark:text-sky-400',
      bgClass: 'bg-sky-500/10 border-sky-500/20',
    },
  ];

  return (
    <Card className="border-border/60 bg-card shadow-md w-full h-full min-h-[320px] flex flex-col justify-between">
      <CardHeader className="border-b border-border/45 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground">Leave Requests</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Daily leave request metrics and approvals.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="py-4 flex-1 flex flex-col justify-center gap-4">
        {statsList.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`flex items-center justify-between p-3.5 rounded-xl border ${stat.bgClass} transition-colors hover:bg-white/[0.01]`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] shrink-0">
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-foreground truncate">
                    {stat.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground/65">
                    {stat.label === 'Pending Approval' ? 'Requires action' : 'Active today'}
                  </span>
                </div>
              </div>
              <div className="flex items-baseline gap-0.5 shrink-0">
                <span className="text-lg font-extrabold text-foreground tabular-nums">
                  {stat.value}
                </span>
                <span className="text-[9px] text-muted-foreground/60">reqs</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
