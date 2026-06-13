import { Ticket } from 'lucide-react';

type OpenTicketsCardProps = {
  openTicketsCount: number;
};

export function OpenTicketsCard({ openTicketsCount }: OpenTicketsCardProps) {
  const getHint = (count: number) => {
    if (count >= 10) {
      return {
        hint: 'Queue requires immediate action',
        className: 'text-rose-600 dark:text-rose-400 font-medium',
      };
    }
    if (count >= 5) {
      return {
        hint: 'Queue needs attention',
        className: 'text-amber-600 dark:text-amber-400 font-medium',
      };
    }
    return {
      hint: 'Queue under control',
      className: 'text-emerald-600 dark:text-emerald-400 font-medium',
    };
  };

  const { hint, className } = getHint(openTicketsCount);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Ticket className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open Tickets</p>
          <p className="text-2xl font-bold text-foreground">{openTicketsCount}</p>
        </div>
      </div>
      <p className={`mt-3 text-xs ${className}`}>{hint}</p>
    </div>
  );
}
