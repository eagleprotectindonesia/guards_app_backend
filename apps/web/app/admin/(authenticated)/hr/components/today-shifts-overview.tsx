'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { CheckCircle2, PlayCircle, CalendarClock } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Props = {
  completed: number;
  ongoing: number;
  upcoming: number;
};

export function TodayShiftsOverview({ completed, ongoing, upcoming }: Props) {
  const total = completed + ongoing + upcoming;
  const completedPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const ongoingPercentage = total > 0 ? Math.round((ongoing / total) * 100) : 0;
  const upcomingPercentage = total > 0 ? Math.round((upcoming / total) * 100) : 0;

  // Chart data setup. If total is 0, show a placeholder gray ring.
  const hasData = total > 0;
  const chartData = hasData
    ? [
        { name: 'Completed', value: completed, color: '#10b981' }, // emerald-500
        { name: 'Ongoing', value: ongoing, color: '#0ea5e9' },    // sky-500
        { name: 'Upcoming', value: upcoming, color: '#f59e0b' },   // amber-500
      ]
    : [{ name: 'No Shifts', value: 1, color: '#1c2130' }];

  return (
    <Card className="border-[#1f2432] bg-[#11141d] shadow-md">
      <CardHeader className="border-b border-[#1f2432] pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground">{"Today's Shift Overview"}</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Real-time status breakdown of guard shifts scheduled for today.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          {/* Donut Chart Visual (Left - 5 cols) */}
          <div className="relative h-36 w-full flex items-center justify-center sm:col-span-5">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={56}
                  paddingAngle={hasData ? 3 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-extrabold text-foreground tracking-tight tabular-nums">
                {total}
              </span>
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">
                Shifts
              </span>
            </div>
          </div>

          {/* Stats List (Right - 7 cols) */}
          <div className="grid gap-2 sm:col-span-7">
            {/* Completed */}
            <div className="flex items-center justify-between p-2 rounded-xl border border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/[0.07] transition-all duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">Completed</p>
                  <p className="text-[8px] text-muted-foreground">Shifts finished</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold text-foreground">{completed}</span>
                <span className="text-[8px] text-muted-foreground block font-medium">{completedPercentage}%</span>
              </div>
            </div>

            {/* Ongoing */}
            <div className="flex items-center justify-between p-2 rounded-xl border border-sky-500/10 bg-sky-500/5 hover:bg-sky-500/[0.07] transition-all duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <PlayCircle className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">Ongoing</p>
                  <p className="text-[8px] text-muted-foreground">Active now</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold text-foreground">{ongoing}</span>
                <span className="text-[8px] text-muted-foreground block font-medium">{ongoingPercentage}%</span>
              </div>
            </div>

            {/* Upcoming */}
            <div className="flex items-center justify-between p-2 rounded-xl border border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/[0.07] transition-all duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <CalendarClock className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">Upcoming</p>
                  <p className="text-[8px] text-muted-foreground">Starting later</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold text-foreground">{upcoming}</span>
                <span className="text-[8px] text-muted-foreground block font-medium">{upcomingPercentage}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
