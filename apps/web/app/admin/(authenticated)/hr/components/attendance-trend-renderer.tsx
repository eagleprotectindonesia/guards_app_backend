'use client';

import React, { useMemo } from 'react';
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
import { startOfMonth, endOfMonth, eachDayOfInterval, format as dfFormat } from 'date-fns';

export type TrendData = {
  date: string;
  present: number;
  late: number;
  absent: number;
  isoDate?: string;
};

export type HeatmapDay = TrendData & { rate?: number };

export type ChartType = 'area' | 'line' | 'bar' | 'stacked-percent' | 'heatmap';

type Props = {
  data: HeatmapDay[];
  days: number;
  chart: ChartType;
  statusFilter: 'all' | 'present' | 'late' | 'absent';
  fullHeight?: boolean;
  heatmapYear?: number;
  heatmapMonth?: number;
  onDayClick?: (dateLabel: string) => void;
};

const COLORS = {
  present: '#14b8a6',
  late: '#f59e0b',
  absent: '#ef4444',
} as const;

const HEATMAP_COLORS = {
  high: 'bg-emerald-500',
  medium: 'bg-lime-500',
  low: 'bg-amber-500',
  poor: 'bg-red-500',
  none: 'bg-muted/30',
} as const;

function getHeatmapColor(rate: number | undefined): string {
  if (rate === undefined) return HEATMAP_COLORS.none;
  if (rate >= 90) return HEATMAP_COLORS.high;
  if (rate >= 70) return HEATMAP_COLORS.medium;
  if (rate >= 50) return HEATMAP_COLORS.low;
  return HEATMAP_COLORS.poor;
}

function formatData(data: TrendData[], days: number) {
  return data.map(item => {
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

export function AttendanceTrendRenderer({
  data,
  days,
  chart,
  statusFilter,
  fullHeight,
  heatmapYear,
  heatmapMonth,
  onDayClick,
}: Props) {
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
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--popover-foreground))',
    fontSize: '11px',
    opacity: 1,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  };

  const wrapperStyle: React.CSSProperties = {
    opacity: 1,
    outline: 'none',
  };

  const isHidden = (key: string) => statusFilter !== 'all' && statusFilter !== key;
  const dot = days === 30 || days === 15 ? false : ({ r: 3 } as const);
  const interval = days === 30 ? 4 : days === 15 ? 2 : 0;

  const hmYear = heatmapYear ?? new Date().getFullYear();
  const hmMonth = heatmapMonth ?? new Date().getMonth() + 1;

  const calendarDays = useMemo(() => {
    if (!isHeatmap) return [];
    const firstDay = startOfMonth(new Date(hmYear, hmMonth - 1));
    const lastDay = endOfMonth(new Date(hmYear, hmMonth - 1));
    const daysInMonth = eachDayOfInterval({ start: firstDay, end: lastDay });

    const dayOfWeek = firstDay.getDay();
    const padStart = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const padEnd = (7 - ((padStart + daysInMonth.length) % 7)) % 7;

    const allCells: (Date | null)[] = [];
    for (let i = 0; i < padStart; i++) allCells.push(null);
    for (const d of daysInMonth) allCells.push(d);
    for (let i = 0; i < padEnd; i++) allCells.push(null);
    return allCells;
  }, [isHeatmap, hmYear, hmMonth]);

  const dataMap = useMemo(() => {
    if (!isHeatmap) return new Map<string, HeatmapDay>();
    const map = new Map<string, HeatmapDay>();
    for (const item of data) {
      map.set(item.date, item);
    }
    return map;
  }, [isHeatmap, data]);

  if (isHeatmap) {
    const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const { totalRate, daysWithData } = data.reduce(
      (acc, d) => {
        const total = d.present + d.late + d.absent;
        if (total > 0) {
          acc.totalRate += d.present / total;
          acc.daysWithData++;
        }
        return acc;
      },
      { totalRate: 0, daysWithData: 0 }
    );
    const avgRate = daysWithData > 0 ? Math.round((totalRate / daysWithData) * 100) : 0;

    return (
      <div className={cn('flex flex-col', fullHeight ? 'flex-1 min-h-0' : 'h-72')}>
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Avg: {avgRate}%</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            {[
              { label: '≥90%', color: HEATMAP_COLORS.high },
              { label: '≥70%', color: HEATMAP_COLORS.medium },
              { label: '≥50%', color: HEATMAP_COLORS.low },
              { label: '<50%', color: HEATMAP_COLORS.poor },
              { label: 'No data', color: HEATMAP_COLORS.none },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1">
                <span className={cn('w-2.5 h-2.5 rounded', color)} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 grid auto-rows-fr">
          <div className="grid grid-cols-7 gap-px">
            {dayHeaders.map(h => (
              <div key={h} className="text-[10px] text-muted-foreground font-medium text-center pb-1">
                {h}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              if (!day) {
                return <div key={`empty-${i}`} />;
              }
              const dateStr = dfFormat(day, 'EEE, MMM d');
              const dayData = dataMap.get(dateStr);
              const present = dayData?.present ?? 0;
              const late = dayData?.late ?? 0;
              const absent = dayData?.absent ?? 0;
              const total = present + late + absent;
              const rate = total > 0 ? Math.round((present / total) * 100) : undefined;
              const isToday = dfFormat(day, 'yyyy-MM-dd') === dfFormat(new Date(), 'yyyy-MM-dd');
              const clickDate = dayData?.isoDate || dayData?.date;

              return (
                <div
                  key={i}
                  onClick={() => clickDate && onDayClick?.(clickDate)}
                  className={cn(
                    'flex flex-col items-center justify-center rounded p-0.5 cursor-pointer hover:ring-1 hover:ring-border transition-all',
                    isToday && 'ring-1 ring-blue-400'
                  )}
                  title={`${dfFormat(day, 'MMM d')} — ${present} present, ${late} late, ${absent} absent${rate !== undefined ? ` (${rate}%)` : ' (no data)'}`}
                >
                  <span className="text-[10px] text-muted-foreground">{dfFormat(day, 'd')}</span>
                  <span className={cn('w-full h-2.5 rounded-sm mt-0.5', getHeatmapColor(rate))} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const handleChartClick = (...args: unknown[]) => {
    if (!onDayClick) return;
    const state = args[0] as { activePayload?: Array<{ payload: Record<string, unknown> }> } | undefined;
    const payload = state?.activePayload?.[0]?.payload;
    const isoDate = payload?.isoDate;
    const date = payload?.date;
    if (typeof isoDate === 'string') onDayClick(isoDate);
    else if (typeof date === 'string') onDayClick(date);
  };

  const renderChart = () => {
    switch (chart) {
      case 'area':
        return (
          <AreaChart {...commonProps} onClick={handleChartClick}>
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
            <Tooltip
              contentStyle={tooltipStyle}
              wrapperStyle={wrapperStyle}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
            />
            <Area
              type="monotone"
              dataKey="present"
              name="Present"
              stroke={COLORS.present}
              strokeWidth={2}
              fill="url(#presentArea)"
              hide={isHidden('present')}
              dot={dot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="late"
              name="Late"
              stroke={COLORS.late}
              strokeWidth={2}
              fill="url(#lateArea)"
              hide={isHidden('late')}
              dot={dot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="absent"
              name="Absent"
              stroke={COLORS.absent}
              strokeWidth={2}
              fill="url(#absentArea)"
              hide={isHidden('absent')}
              dot={dot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              stackId="1"
            />
          </AreaChart>
        );

      case 'line':
        return (
          <LineChart {...commonProps} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={tooltipStyle}
              wrapperStyle={wrapperStyle}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
            />
            <Line
              type="monotone"
              dataKey="present"
              name="Present"
              stroke={COLORS.present}
              strokeWidth={2}
              hide={isHidden('present')}
              dot={dot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="late"
              name="Late"
              stroke={COLORS.late}
              strokeWidth={2}
              hide={isHidden('late')}
              dot={dot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="absent"
              name="Absent"
              stroke={COLORS.absent}
              strokeWidth={2}
              hide={isHidden('absent')}
              dot={dot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={tooltipStyle}
              wrapperStyle={wrapperStyle}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
            />
            <Bar
              dataKey="present"
              name="Present"
              fill={COLORS.present}
              radius={[3, 3, 0, 0]}
              hide={isHidden('present')}
              isAnimationActive={false}
            />
            <Bar
              dataKey="late"
              name="Late"
              fill={COLORS.late}
              radius={[3, 3, 0, 0]}
              hide={isHidden('late')}
              isAnimationActive={false}
            />
            <Bar
              dataKey="absent"
              name="Absent"
              fill={COLORS.absent}
              radius={[3, 3, 0, 0]}
              hide={isHidden('absent')}
              isAnimationActive={false}
            />
          </BarChart>
        );

      case 'stacked-percent':
        return (
          <BarChart {...commonProps} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis dataKey="formattedDate" {...axisProps} interval={interval} />
            <YAxis {...axisProps} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
            <Tooltip
              contentStyle={tooltipStyle}
              wrapperStyle={wrapperStyle}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              formatter={value => [`${value}%`]}
            />
            <Bar
              dataKey="presentPct"
              name="Present"
              stackId="a"
              fill={COLORS.present}
              radius={[3, 3, 0, 0]}
              hide={isHidden('present')}
              isAnimationActive={false}
            />
            <Bar
              dataKey="latePct"
              name="Late"
              stackId="a"
              fill={COLORS.late}
              radius={[3, 3, 0, 0]}
              hide={isHidden('late')}
              isAnimationActive={false}
            />
            <Bar
              dataKey="absentPct"
              name="Absent"
              stackId="a"
              fill={COLORS.absent}
              radius={[3, 3, 0, 0]}
              hide={isHidden('absent')}
              isAnimationActive={false}
            />
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
            'px-3 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5',
            statusFilter === key
              ? cn('bg-background shadow-sm', activeClass)
              : 'bg-muted/50 border border-border/40 text-muted-foreground hover:text-foreground'
          )}
        >
          {dotColor && <span className={cn('w-2 h-2 rounded-full', dotColor)} />}
          {label}
        </button>
      ))}
    </div>
  );
}
