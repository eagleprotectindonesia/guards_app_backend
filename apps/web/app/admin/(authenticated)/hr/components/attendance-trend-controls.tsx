'use client';

import React from 'react';
import { ChartArea, ChartLine, BarChart3, ChartBarStacked, Calendar } from 'lucide-react';
import { cn } from '@repo/shared';
import type { ChartType } from './attendance-trend-renderer';

type Props = {
  chart: ChartType;
  onChartChange: (chart: ChartType) => void;
  days: 7 | 15 | 30;
  onDaysChange: (days: number) => void;
  heatmapMonth?: { year: number; month: number };
  onMonthChange?: (year: number, month: number) => void;
};

const chartOptions: { key: ChartType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'area', label: 'Area', Icon: ChartArea },
  { key: 'line', label: 'Line', Icon: ChartLine },
  { key: 'bar', label: 'Bar', Icon: BarChart3 },
  { key: 'stacked-percent', label: 'Stacked %', Icon: ChartBarStacked },
  { key: 'heatmap', label: 'Heatmap', Icon: Calendar },
];

export function AttendanceTrendControls({
  chart,
  onChartChange,
  days,
  onDaysChange,
  heatmapMonth,
  onMonthChange,
}: Props) {
  const isHeatmap = chart === 'heatmap';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Chart type selector */}
      <div className="flex items-center gap-0.5 bg-muted p-1 rounded-lg border border-border/40">
        {chartOptions.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onChartChange(key)}
            className={cn(
              "px-2 py-1 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1",
              chart === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label === 'Stacked %' ? '%' : label}</span>
          </button>
        ))}
      </div>

      {/* Days selector (hidden for heatmap) */}
      {!isHeatmap && (
        <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border/40">
          {([7, 15, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={cn(
                "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                days === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d} Days
            </button>
          ))}
        </div>
      )}

      {/* Month navigator (only for heatmap) */}
      {isHeatmap && heatmapMonth && onMonthChange && (
        <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border/40">
          <button
            onClick={() => {
              const d = new Date(heatmapMonth.year, heatmapMonth.month - 2);
              onMonthChange(d.getFullYear(), d.getMonth() + 1);
            }}
            className="px-2 py-1 text-[11px] font-semibold rounded-md text-muted-foreground hover:text-foreground"
          >
            ‹
          </button>
          <span className="px-2 py-1 text-[11px] font-semibold text-foreground min-w-[100px] text-center">
            {new Date(heatmapMonth.year, heatmapMonth.month - 1).toLocaleString('default', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            onClick={() => {
              const d = new Date(heatmapMonth.year, heatmapMonth.month);
              onMonthChange(d.getFullYear(), d.getMonth() + 1);
            }}
            className="px-2 py-1 text-[11px] font-semibold rounded-md text-muted-foreground hover:text-foreground"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
