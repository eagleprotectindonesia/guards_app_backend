'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { cn } from '@repo/shared';

export type TrendData = {
  date: string;
  present: number;
  late: number;
  absent: number;
};

export type ChartType = 'area' | 'line' | 'bar' | 'stacked-percent' | 'heatmap';

type Props = {
  data: TrendData[];
  days: number;
  chart: ChartType;
  statusFilter: 'all' | 'present' | 'late' | 'absent';
  fullHeight?: boolean;
};

const COLORS = {
  present: '#14b8a6',
  late: '#f59e0b',
  absent: '#ef4444',
} as const;

function formatData(data: TrendData[], days: number) {
  return data.map((item) => {
    const parts = item.date.split(', ');
    const dateLabel = parts.length > 1 ? parts[1] : item.date;
    const weekdayLabel = parts[0];
    const total = item.present + item.late + item.absent;
    return {
      ...item,
      formattedDate: days === 7 ? weekdayLabel : dateLabel,
      total,
      presentPct: total > 0 ? Math.round((item.present / total) * 100) : 0,
      latePct: total > 0 ? Math.round((item.late / total) * 100) : 0,
      absentPct: total > 0 ? Math.round((item.absent / total) * 100) : 0,
    };
  });
}

export function AttendanceTrendRenderer({ data, days, chart, statusFilter, fullHeight }: Props) {
  const chartData = formatData(data, days);
  const isHeatmap = chart === 'heatmap';

  const commonProps = {
    data: chartData,
    margin: { top: 10, right: 10, left: -20, bottom: 0 } as const,
  };

  const axisProps = {
    stroke: '#64748b',
    fontSize: 10,
    tickLine: false,
    axisLine: false,
  } as const;

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: 'hsl(var(--popover))',
    borderColor: 'hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--popover-foreground))',
    fontSize: '11px',
  };

  const isHidden = (key: string) => statusFilter !== 'all' && statusFilter !== key;
  const dot = days === 30 || days === 15 ? false : ({ r: 3 } as const);
  const interval = days === 30 ? 4 : days === 15 ? 2 : 0;

  if (isHeatmap) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Heatmap view — requires monthly aggregation data (Phase 2)
      </div>
    );
  }

  const renderChart = () => {
    switch (chart) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="presentArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.present} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.present} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="lateArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.late} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.late} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="absentArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.absent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.absent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }} />
            <Area type="monotone" dataKey="present" name="Present" stroke={COLORS.present} strokeWidth={2} fill="url(#presentArea)" hide={isHidden('present')} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} stackId="1" />
            <Area type="monotone" dataKey="late" name="Late" stroke={COLORS.late} strokeWidth={2} fill="url(#lateArea)" hide={isHidden('late')} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} stackId="1" />
            <Area type="monotone" dataKey="absent" name="Absent" stroke={COLORS.absent} strokeWidth={2} fill="url(#absentArea)" hide={isHidden('absent')} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} stackId="1" />
          </AreaChart>
        );

      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }} />
            <Line type="monotone" dataKey="present" name="Present" stroke={COLORS.present} strokeWidth={2} hide={isHidden('present')} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="late" name="Late" stroke={COLORS.late} strokeWidth={2} hide={isHidden('late')} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="absent" name="Absent" stroke={COLORS.absent} strokeWidth={2} hide={isHidden('absent')} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }} />
            <Bar dataKey="present" name="Present" fill={COLORS.present} radius={[3, 3, 0, 0]} hide={isHidden('present')} isAnimationActive={false} />
            <Bar dataKey="late" name="Late" fill={COLORS.late} radius={[3, 3, 0, 0]} hide={isHidden('late')} isAnimationActive={false} />
            <Bar dataKey="absent" name="Absent" fill={COLORS.absent} radius={[3, 3, 0, 0]} hide={isHidden('absent')} isAnimationActive={false} />
          </BarChart>
        );

      case 'stacked-percent':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              formatter={(value) => [`${value}%`]}
            />
            <Bar dataKey="presentPct" name="Present" stackId="a" fill={COLORS.present} radius={[3, 3, 0, 0]} hide={isHidden('present')} isAnimationActive={false} />
            <Bar dataKey="latePct" name="Late" stackId="a" fill={COLORS.late} radius={[3, 3, 0, 0]} hide={isHidden('late')} isAnimationActive={false} />
            <Bar dataKey="absentPct" name="Absent" stackId="a" fill={COLORS.absent} radius={[3, 3, 0, 0]} hide={isHidden('absent')} isAnimationActive={false} />
          </BarChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className={fullHeight ? 'flex-1 min-h-0' : 'h-72 w-full'}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

type StatusFilterProps = {
  statusFilter: 'all' | 'present' | 'late' | 'absent';
  onStatusFilterChange: (filter: 'all' | 'present' | 'late' | 'absent') => void;
};

const statusOptions = [
  { key: 'all' as const, label: 'All', dotColor: '', activeClass: 'text-foreground' },
  { key: 'present' as const, label: 'Present', dotColor: 'bg-emerald-500', activeClass: 'text-emerald-600' },
  { key: 'late' as const, label: 'Late', dotColor: 'bg-amber-500', activeClass: 'text-amber-500' },
  { key: 'absent' as const, label: 'Absent', dotColor: 'bg-red-500', activeClass: 'text-red-500' },
];

export function StatusFilterLegend({ statusFilter, onStatusFilterChange }: StatusFilterProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-4 shrink-0">
      {statusOptions.map(({ key, label, dotColor, activeClass }) => (
        <button
          key={key}
          onClick={() => onStatusFilterChange(key)}
          className={cn(
            "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5",
            statusFilter === key
              ? cn("bg-background shadow-sm", activeClass)
              : "bg-muted/50 border border-border/40 text-muted-foreground hover:text-foreground"
          )}
        >
          {dotColor && <span className={cn("w-2 h-2 rounded-full", dotColor)} />}
          {label}
        </button>
      ))}
    </div>
  );
}
