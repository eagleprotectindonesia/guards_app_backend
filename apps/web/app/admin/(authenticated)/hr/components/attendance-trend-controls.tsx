'use client';

import React, { useState } from 'react';
import { ChartArea, ChartLine, BarChart3, ChartBarStacked, Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@repo/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const currentOption = chartOptions.find((o) => o.key === chart);
  const CurrentIcon = currentOption?.Icon;

  const handleSelect = (key: ChartType) => {
    onChartChange(key);
    setPopoverOpen(false);
  };

  const now = new Date();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Chart type popover selector */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-normal gap-1.5 border-border/60"
          >
            {CurrentIcon && <CurrentIcon className="h-3.5 w-3.5" />}
            {currentOption?.label}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="start">
          <div className="space-y-0.5">
            {chartOptions.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left",
                  chart === key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

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
            disabled={
              heatmapMonth.year > now.getFullYear() ||
              (heatmapMonth.year === now.getFullYear() && heatmapMonth.month > now.getMonth() + 1)
            }
            className="px-2 py-1 text-[11px] font-semibold rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
