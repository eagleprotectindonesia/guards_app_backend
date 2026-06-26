import React from 'react';
import { Card } from '@/components/ui/card';
import { Ticket, Inbox, CheckCircle, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@repo/shared';

type Props = {
  open: number;
  inProgress: number;
  acknowledged: number;
  slaBreached: number;
  resolvedToday: number;
};

const tiles = [
  { key: 'open' as const, label: 'Open', icon: Inbox, badgeColor: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  { key: 'acknowledged' as const, label: 'Acknowledged', icon: CheckCircle, badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  { key: 'inProgress' as const, label: 'In Progress', icon: Clock, badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { key: 'slaBreached' as const, label: 'SLA Breached', icon: AlertTriangle, badgeColor: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  { key: 'resolvedToday' as const, label: 'Resolved Today', icon: CheckCircle2, badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
];

export function TicketSlaCard({ open, inProgress, acknowledged, slaBreached, resolvedToday }: Props) {
  const values: Record<string, number> = { open, acknowledged, inProgress, slaBreached, resolvedToday };

  return (
    <Card className="border-border/60 bg-card shadow-md flex flex-col">
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2 shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Ticket className="h-4 w-4" />
          </div>
          <p className="text-sm font-bold text-foreground">TICKET SLA HEALTH</p>
        </div>
      </div>

      <div className="px-5 pb-5">
        {tiles.map(({ key, label, icon: Icon, badgeColor }, i) => {
          const value = values[key];
          return (
            <div key={key} className={cn('flex items-center justify-between py-2.5', i < tiles.length - 1 && 'border-b border-border/40')}>
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </div>
              <span className={cn(
                'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold min-w-[2.5rem]',
                badgeColor
              )}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
