import { format } from 'date-fns';
import { Calendar } from 'lucide-react';

export function TodaysSummaryCard() {
  const date = new Date();
  const dateStr = format(date, 'd MMM yyyy');
  const dayName = format(date, 'EEEE');

  return (
    <div className="flex h-full flex-col items-center gap-4 justify-center rounded-xl border border-border bg-card p-4 shadow-sm text-center">
      <Calendar className="h-5 w-5" />
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 leading-tight">
          Today&apos;s Summary
        </p>
        <p className="text-sm font-bold text-foreground leading-tight">{dateStr}</p>
        <p className="text-[10px] font-medium text-muted-foreground leading-tight">{dayName}</p>
      </div>
    </div>
  );
}
