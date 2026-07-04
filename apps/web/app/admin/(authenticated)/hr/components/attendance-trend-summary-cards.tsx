'use client';

import React from 'react';
import { cn } from '@repo/shared';
import { TrendingUp, TrendingDown } from 'lucide-react';

export type DayStatsData = {
  present: number;
  late: number;
  absent: number;
  rate: number;
};

type Props = {
  today: DayStatsData;
  yesterday: DayStatsData;
};

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const isUp = diff > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium',
      diff > 0 ? 'text-emerald-600' : 'text-red-500'
    )}>
      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(diff)}
    </span>
  );
}

export function AttendanceTrendSummaryCards({ today, yesterday }: Props) {
  const cards = [
    {
      label: 'Attendance Rate',
      value: `${today.rate}%`,
      current: today.rate,
      previous: yesterday.rate,
      formatter: (v: number) => `${v}%`,
    },
    {
      label: 'Present',
      value: today.present.toLocaleString(),
      current: today.present,
      previous: yesterday.present,
    },
    {
      label: 'Late',
      value: today.late.toLocaleString(),
      current: today.late,
      previous: yesterday.late,
    },
    {
      label: 'Absent',
      value: today.absent.toLocaleString(),
      current: today.absent,
      previous: yesterday.absent,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(({ label, value, current, previous }) => (
        <div
          key={label}
          className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/40 bg-muted/20 text-center"
        >
          <span className="text-[20px] font-bold text-foreground">{value}</span>
          <span className="text-[11px] text-muted-foreground mt-0.5">{label}</span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-muted-foreground">vs yesterday</span>
            <DeltaBadge current={current} previous={previous} />
          </div>
        </div>
      ))}
    </div>
  );
}
