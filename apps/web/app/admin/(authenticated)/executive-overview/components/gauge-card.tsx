'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts';
import type { LucideIcon } from 'lucide-react';

type AccentColor = 'emerald' | 'purple';

type Props = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  expected: number;
  completed: number;
  missed: number;
  color: AccentColor;
};

const iconAccentStyles: Record<AccentColor, string> = {
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  purple: 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const gaugeColors: Record<AccentColor, string> = {
  emerald: '#10b981',
  purple: '#a855f7',
};

const completedAccentStyles: Record<AccentColor, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  purple: 'text-purple-600 dark:text-purple-400',
};

export function GaugeCard({ icon: TitleIcon, title, subtitle, expected, completed, missed, color }: Props) {
  const ratePct = expected > 0 ? (completed / expected) * 100 : 0;
  const chartData = [{ name: 'rate', value: Math.min(ratePct, 100), fill: gaugeColors[color] }];

  return (
    <Card className="border-border/60 bg-card shadow-md">
      <div className="border-b border-border/45 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={['rounded-xl border p-2.5 shrink-0', iconAccentStyles[color]].join(' ')}>
            <TitleIcon className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/80">{title}</p>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-2 pb-3">
        <div className="relative w-full" style={{ height: '120px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="100%"
              innerRadius="68%"
              outerRadius="350%"
              barSize={10}
              data={chartData}
              startAngle={180}
              endAngle={0}
            >
              <RadialBar dataKey="value" cornerRadius={5} background={{ fill: '#475569' }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-x-0 top-[32%] flex flex-col items-center">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums" style={{ color: gaugeColors[color] }}>
              {ratePct.toFixed(0)}%
            </span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Rate</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0">
        <div className="flex flex-col items-center py-2.5 border-r border-border/40">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Expected</span>
          <span className="text-lg font-extrabold text-foreground tabular-nums">{expected}</span>
        </div>
        <div className="flex flex-col items-center py-2.5 border-r border-border/40">
          <span
            className={['text-[9px] uppercase tracking-wider font-semibold', completedAccentStyles[color]].join(' ')}
          >
            Completed
          </span>
          <span className={['text-lg font-extrabold tabular-nums', completedAccentStyles[color]].join(' ')}>
            {completed}
          </span>
        </div>
        <div className="flex flex-col items-center py-2.5">
          <span className="text-[9px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold">
            Missed
          </span>
          <span className="text-lg font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">{missed}</span>
        </div>
      </div>
    </Card>
  );
}
