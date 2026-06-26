'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Props = {
  onsite: number;
  control: number;
  office: number;
  total: number;
};

export function WorkforceBreakdownCard({ onsite, control, office, total }: Props) {
  const onsitePct = total > 0 ? (onsite / total) * 100 : 0;
  const controlPct = total > 0 ? (control / total) * 100 : 0;
  const officePct = total > 0 ? (office / total) * 100 : 0;

  const hasData = total > 0;
  const chartData = hasData
    ? [
        { name: 'On-Site Guards', value: onsite, color: '#0ea5e9' },
        { name: 'Control Guards', value: control, color: '#10b981' },
        { name: 'Office Employees', value: office, color: '#f59e0b' },
      ]
    : [{ name: 'No Employees', value: 1, color: 'hsl(var(--muted))' }];

  return (
    <Card className="border-border/60 bg-card shadow-md">
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2 shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Users className="h-4 w-4" />
          </div>
          <p className="text-sm font-bold text-foreground">WORKFORCE BREAKDOWN</p>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-13 gap-3 items-center">
          <div className="relative h-48 w-full flex items-center justify-center lg:col-span-7">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={64}
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
              <span className="text-2xl font-extrabold text-foreground tracking-tight tabular-nums">{total}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Employees
              </span>
            </div>
          </div>

          <div className="grid gap-3 lg:col-span-6">
            <div className="flex items-center gap-2.5">
              <div className="h-3 w-3 rounded-full bg-sky-500 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">On-Site Guards</p>
                <p className="text-sm font-bold text-foreground">
                  {onsite}{' '}
                  <span className="text-[10px] font-medium text-muted-foreground">({onsitePct.toFixed(1)}%)</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Control Guards</p>
                <p className="text-sm font-bold text-foreground">
                  {control}{' '}
                  <span className="text-[10px] font-medium text-muted-foreground">({controlPct.toFixed(1)}%)</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Office Employees</p>
                <p className="text-sm font-bold text-foreground">
                  {office}{' '}
                  <span className="text-[10px] font-medium text-muted-foreground">({officePct.toFixed(1)}%)</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2 border-t border-border/40">
              <div className="h-3 w-3 rounded-full bg-purple-500 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Total</p>
                <p className="text-sm font-bold text-foreground">
                  {total} <span className="text-[10px] font-medium text-muted-foreground">(100%)</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
