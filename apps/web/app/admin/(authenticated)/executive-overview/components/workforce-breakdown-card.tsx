'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShieldCheck, UserCog, Building2 } from 'lucide-react';
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
      <CardHeader className="border-b border-border/45 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground">Workforce Breakdown</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Total Employees: {total}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
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
                Employees
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:col-span-7">
            <div className="flex items-center justify-between p-2 rounded-xl border border-sky-500/10 bg-sky-500/5 hover:bg-sky-500/[0.07] transition-all duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">On-Site Guards</p>
                  <p className="text-[8px] text-muted-foreground">Security Standby</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold text-foreground">{onsite}</span>
                <span className="text-[8px] text-muted-foreground block font-medium">{onsitePct.toFixed(1)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl border border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/[0.07] transition-all duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <UserCog className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">Control Guards</p>
                  <p className="text-[8px] text-muted-foreground">Other On-Site Roles</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold text-foreground">{control}</span>
                <span className="text-[8px] text-muted-foreground block font-medium">{controlPct.toFixed(1)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl border border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/[0.07] transition-all duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">Office Employees</p>
                  <p className="text-[8px] text-muted-foreground">Office Role</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold text-foreground">{office}</span>
                <span className="text-[8px] text-muted-foreground block font-medium">{officePct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
