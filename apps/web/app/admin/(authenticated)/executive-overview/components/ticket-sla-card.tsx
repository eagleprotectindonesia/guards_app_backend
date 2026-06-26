import React from 'react';
import { Card } from '@/components/ui/card';
import { Ticket } from 'lucide-react';
import { cn } from '@repo/shared';

type Props = {
  open: number;
  inProgress: number;
  acknowledged: number;
  slaBreached: number;
  resolvedToday: number;
};

const tiles = [
  { key: 'open' as const, label: 'Open', accent: 'sky' as const },
  { key: 'acknowledged' as const, label: 'Acknowledged', accent: 'purple' as const },
  { key: 'inProgress' as const, label: 'In Progress', accent: 'amber' as const },
  { key: 'slaBreached' as const, label: 'SLA Breached', accent: 'rose' as const },
  { key: 'resolvedToday' as const, label: 'Resolved Today', accent: 'emerald' as const },
];

const accentStyles: Record<string, { text: string; border: string }> = {
  sky: { text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/20' },
  purple: { text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/20' },
  amber: { text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
  rose: { text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/20' },
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
};

export function TicketSlaCard({ open, inProgress, acknowledged, slaBreached, resolvedToday }: Props) {
  const values: Record<string, number> = { open, acknowledged, inProgress, slaBreached, resolvedToday };

  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-2.5 text-sky-600 dark:text-sky-400 shrink-0">
          <Ticket className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Ticket SLA Health
          </p>
          <p className="text-[10px] text-muted-foreground">Service Level Status</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {tiles.map(({ key, label, accent }) => {
          const value = values[key];
          const style = accentStyles[accent];
          return (
            <div
              key={key}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border p-3 gap-0.5 bg-card',
                style.border
              )}
            >
              <span className={cn('text-2xl font-extrabold tracking-tight tabular-nums', style.text)}>
                {value}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center leading-tight">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
