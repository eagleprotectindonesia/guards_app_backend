'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@repo/shared';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { AttendanceTrendFilters } from '../components/attendance-trend-filters';
import type { FilterOptions } from '@repo/database';

type TrendData = {
  date: string;
  present: number;
  late: number;
  absent: number;
};

type Props = {
  data: TrendData[];
  currentDays: number;
  filterOptions: FilterOptions;
  selectedDepartments: string[];
  selectedOfficeIds: string[];
  selectedSiteIds: string[];
};

export default function AttendanceTrendFullscreen({
  data,
  currentDays,
  filterOptions,
  selectedDepartments,
  selectedOfficeIds,
  selectedSiteIds,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-bold text-foreground">Attendance Overview</h3>
          <span className="mx-1 h-3.5 w-px bg-border" />
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
        <Button
          variant="secondary"
          size="icon"
          onClick={() => window.close()}
          title="Close tab"
          aria-label="Close tab"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="px-4 pt-2 pb-1 border-b border-border/30 shrink-0">
        <AttendanceTrendFilters
          departments={filterOptions.departments}
          locations={filterOptions.locations}
          selectedDepartments={selectedDepartments}
          selectedOfficeIds={selectedOfficeIds}
          selectedSiteIds={selectedSiteIds}
        />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="flex-1 min-h-0">
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
        <div className="flex items-center justify-center gap-1.5 pt-4 shrink-0">
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
      </div>
    </div>
  );
}
