'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@repo/shared';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

  const handleDaysChange = (days: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('days', days.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  // Format X-axis labels: for 7 days show weekday names, for 30 days show dates like "6/5"
  const chartData = data.map((item) => {
    const parts = item.date.split(', ');
    const dateLabel = parts.length > 1 ? parts[1] : item.date;
    const weekdayLabel = parts[0];
    return {
      ...item,
      formattedDate: currentDays === 30 ? dateLabel : weekdayLabel,
    };
  });

  return (
    <Card className="border-border/60 bg-card shadow-md w-full h-full">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/45 pb-4 gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground">Attendance Overview</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {currentDays}-day status distribution and check-in trend analysis.
          </CardDescription>
        </div>
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
            onClick={() => handleDaysChange(30)}
            className={cn(
              "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors",
              currentDays === 30 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            30 Days
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="h-72 w-full">
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
                interval={currentDays === 30 ? 4 : 0} // Skips tick labels to prevent overlap in 30 days
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
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', paddingTop: '15px' }}
              />
              <Line 
                type="monotone"
                dataKey="present" 
                name="Present" 
                stroke="#14b8a6" 
                strokeWidth={2}
                dot={currentDays === 30 ? false : { r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line 
                type="monotone"
                dataKey="late" 
                name="Late" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={currentDays === 30 ? false : { r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line 
                type="monotone"
                dataKey="absent" 
                name="Absent" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={currentDays === 30 ? false : { r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
