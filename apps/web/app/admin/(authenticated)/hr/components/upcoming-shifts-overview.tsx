import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calendar, CalendarDays, CalendarClock } from 'lucide-react';

type Props = {
  todayUpcoming: number;
  tomorrow: number;
  next7Days: number;
};

export function UpcomingShiftsOverview({
  todayUpcoming,
  tomorrow,
  next7Days,
}: Props) {
  const statsList = [
    {
      label: 'Today Upcoming',
      value: todayUpcoming,
      icon: CalendarClock,
      color: 'text-amber-400',
      bgClass: 'bg-amber-500/10 border-amber-500/20',
      desc: 'Remaining shifts today',
    },
    {
      label: 'Tomorrow',
      value: tomorrow,
      icon: Calendar,
      color: 'text-sky-400',
      bgClass: 'bg-sky-500/10 border-sky-500/20',
      desc: 'Scheduled for tomorrow',
    },
    {
      label: 'Next 7 Days',
      value: next7Days,
      icon: CalendarDays,
      color: 'text-purple-400',
      bgClass: 'bg-purple-500/10 border-purple-500/20',
      desc: 'Weekly total shifts',
    },
  ];

  return (
    <Card className="border-[#1f2432] bg-[#11141d] shadow-md w-full h-full min-h-[320px] flex flex-col justify-between">
      <CardHeader className="border-b border-[#1f2432] pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground">Upcoming Shifts</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Overview of upcoming guard shift assignments.</CardDescription>
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
                    {stat.desc}
                  </span>
                </div>
              </div>
              <div className="flex items-baseline gap-0.5 shrink-0">
                <span className="text-lg font-extrabold text-foreground tabular-nums">
                  {stat.value}
                </span>
                <span className="text-[9px] text-muted-foreground/60">shifts</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
