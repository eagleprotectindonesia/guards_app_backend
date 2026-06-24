import { AlertTriangle } from 'lucide-react';
import { useNewDashboardStream } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

export function TotalIncidentsCard() {
  const { totalIncidents } = useNewDashboardStream();

  const isLoading =
    (totalIncidents.status === 'idle' || totalIncidents.status === 'loading') && totalIncidents.data.dateKey === '';
  const total = totalIncidents.data.total;
  const attendance = totalIncidents.data.attendance;
  const checkin = totalIncidents.data.checkin;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <LoadingBlock className="h-10 w-10 rounded-lg" />
          <div className="space-y-1.5">
            <LoadingBlock className="h-3 w-32" />
            <LoadingBlock className="h-7 w-12" />
          </div>
        </div>
        <div className="mt-1.5 pt-1.5 border-t border-border/40 grid grid-cols-2">
          <LoadingBlock className="h-3 w-16" />
          <LoadingBlock className="h-3 w-12" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Attendance/Checkin Alerts</p>
          <p className="text-2xl font-bold text-foreground">{total}</p>
        </div>
      </div>
      <div className="border-t border-border/40 mt-1.5 pt-1.5 grid grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Attendance</p>
          <p className="text-2xl font-extrabold tracking-tight leading-none text-foreground">{attendance}</p>
        </div>
        <div className="pl-2 rounded-sm bg-slate-500/4 dark:bg-slate-400/4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Check-in</p>
          <p className="text-2xl font-extrabold tracking-tight leading-none text-slate-500 dark:text-slate-400">{checkin}</p>
        </div>
      </div>
    </div>
  );
}
