'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@repo/shared';
import { Maximize, Maximize2, X } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type TrendData = {
  date: string;
  present: number;
  late: number;
  absent: number;
};

type Props = {
  data: TrendData[];
  currentDays: number;
};

export function AttendanceTrendChart({ data, currentDays }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [partialMaximized, setPartialMaximized] = useState(false);

  const handleDaysChange = (days: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('days', days.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const chartData = data.map((item) => {
    const parts = item.date.split(', ');
    const dateLabel = parts.length > 1 ? parts[1] : item.date;
    const weekdayLabel = parts[0];
    return {
      ...item,
      formattedDate: currentDays === 7 ? weekdayLabel : dateLabel,
    };
  });

  const renderChartContent = (fullHeight?: boolean) => (
    <>
      <div className={fullHeight ? 'flex-1 min-h-0' : 'h-72 w-full'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="stroke-border/40" vertical={false} />
            <XAxis
              dataKey="formattedDate"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={currentDays === 30 ? 4 : currentDays === 15 ? 2 : 0}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--popover-foreground))',
                fontSize: '11px',
              }}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
            />
            <Line
              type="monotone"
              dataKey="present"
              name="Present"
              stroke="#14b8a6"
              strokeWidth={2}
              hide={statusFilter !== 'all' && statusFilter !== 'present'}
              dot={currentDays === 30 || currentDays === 15 ? false : { r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="late"
              name="Late"
              stroke="#f59e0b"
              strokeWidth={2}
              hide={statusFilter !== 'all' && statusFilter !== 'late'}
              dot={currentDays === 30 || currentDays === 15 ? false : { r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="absent"
              name="Absent"
              stroke="#ef4444"
              strokeWidth={2}
              hide={statusFilter !== 'all' && statusFilter !== 'absent'}
              dot={currentDays === 30 || currentDays === 15 ? false : { r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-1.5 pt-4">
        {([
          { key: 'all' as const, label: 'All', dotColor: '', activeClass: 'text-foreground' },
          { key: 'present' as const, label: 'Present', dotColor: 'bg-emerald-500', activeClass: 'text-emerald-600' },
          { key: 'late' as const, label: 'Late', dotColor: 'bg-amber-500', activeClass: 'text-amber-500' },
          { key: 'absent' as const, label: 'Absent', dotColor: 'bg-red-500', activeClass: 'text-red-500' },
        ]).map(({ key, label, dotColor, activeClass }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
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
    </>
  );

  return (
    <>
      <Card className="border-border/60 bg-card shadow-md w-full h-full">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/45 pb-4 gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold text-foreground">Attendance Overview</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {currentDays}-day status distribution and check-in trend analysis.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border/40">
              <button
                onClick={() => handleDaysChange(7)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  currentDays === 7 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                7 Days
              </button>
              <button
                onClick={() => handleDaysChange(15)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  currentDays === 15 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                15 Days
              </button>
              <button
                onClick={() => handleDaysChange(30)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  currentDays === 30 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                30 Days
              </button>
            </div>
            <span className="mx-1 h-3.5 w-px bg-border" />
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPartialMaximized(true)}
                title="Maximize (75%)"
                aria-label="Maximize chart to 75%"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => window.open('/admin/hr/attendance-trend', '_blank')}
                title="Maximize fullscreen"
                aria-label="Maximize chart fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {renderChartContent()}
        </CardContent>
      </Card>
      <Dialog open={partialMaximized} onOpenChange={setPartialMaximized}>
        <DialogContent
          showCloseButton={false}
          className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] max-w-[75vw] sm:max-w-[75vw] h-[75vh] max-h-[75vh] sm:max-h-[75vh] rounded-xl p-0 gap-0 border-border shadow-2xl flex flex-col"
        >
          <DialogClose asChild>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 left-4 z-10 h-10 w-10 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-md hover:bg-card"
              title="Close"
              aria-label="Close maximized chart"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogClose>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 pl-14 border-b border-border shrink-0">
            <h3 className="text-sm font-bold text-foreground">Attendance Overview</h3>
            <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border/40">
              <button
                onClick={() => handleDaysChange(7)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  currentDays === 7 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                7 Days
              </button>
              <button
                onClick={() => handleDaysChange(15)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  currentDays === 15 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                15 Days
              </button>
              <button
                onClick={() => handleDaysChange(30)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
                  currentDays === 30 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                30 Days
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            {renderChartContent(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
