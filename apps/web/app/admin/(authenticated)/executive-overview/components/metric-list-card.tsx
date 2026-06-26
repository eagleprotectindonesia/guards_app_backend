import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@repo/shared';
import type { LucideIcon } from 'lucide-react';

type RowAccent = 'sky' | 'emerald' | 'amber' | 'purple' | 'rose' | 'neutral';

type Row = {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  value: number;
  accent?: RowAccent;
  valueClassName?: string;
};

type Props = {
  icon: LucideIcon;
  iconAccent?: 'emerald' | 'sky' | 'purple' | 'amber';
  title: string;
  subtitle?: string;
  rows: Row[];
};

const iconAccentStyles: Record<string, string> = {
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  purple: 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const rowStyles: Record<RowAccent, { row: string; icon: string }> = {
  sky: {
    row: 'border-sky-500/10 bg-sky-500/5 hover:bg-sky-500/[0.07]',
    icon: 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400',
  },
  emerald: {
    row: 'border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/[0.07]',
    icon: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    row: 'border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/[0.07]',
    icon: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
  },
  purple: {
    row: 'border-purple-500/10 bg-purple-500/5 hover:bg-purple-500/[0.07]',
    icon: 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400',
  },
  rose: {
    row: 'border-rose-500/10 bg-rose-500/5 hover:bg-rose-500/[0.07]',
    icon: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',
  },
  neutral: {
    row: 'border-border/10 bg-muted/5 hover:bg-muted/[0.07]',
    icon: 'bg-muted/10 border-muted/20 text-muted-foreground',
  },
};

export function MetricListCard({ icon: TitleIcon, iconAccent = 'emerald', title, subtitle, rows }: Props) {
  return (
    <Card className="border-border/60 bg-card shadow-md flex flex-col">
      <div className="border-b border-border/45 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-xl border p-2.5 shrink-0',
              iconAccentStyles[iconAccent]
            )}
          >
            <TitleIcon className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/80">
              {title}
            </p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      <div className="p-5 grid gap-1.5">
        {rows.map((row, i) => {
          const s = rowStyles[row.accent ?? 'neutral'];
          return (
            <div
              key={i}
              className={cn('flex items-center justify-between p-2 rounded-xl border transition-all duration-200', s.row)}
            >
              <div className="flex items-center gap-2">
                <div className={cn('p-1 rounded-lg border', s.icon)}>
                  <row.icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">{row.label}</p>
                  {row.sublabel && (
                    <p className="text-[8px] text-muted-foreground">{row.sublabel}</p>
                  )}
                </div>
              </div>
              <span className={cn('text-xs font-extrabold', row.valueClassName ?? 'text-foreground')}>
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
