import React from 'react';
import { Card } from '@/components/ui/card';
import { Ticket } from 'lucide-react';
import { StatusBadge } from './status-badge';

type Props = {
  total: number;
  unassigned: number;
  inProgress: number;
  acknowledged: number;
};

export function OpenTicketsCard({ total, unassigned, inProgress, acknowledged }: Props) {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400 shrink-0">
          <Ticket className="h-4 w-4" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          Open Tickets
        </p>
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
          {total}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Total Open Tickets</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge count={unassigned} label="Unassigned" variant="sky" />
        <StatusBadge count={inProgress} label="In Progress" variant="amber" />
        <StatusBadge count={acknowledged} label="Acknowledged" variant="purple" />
      </div>
    </Card>
  );
}
