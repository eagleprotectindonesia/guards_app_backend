import { TrendingUp, TrendingDown } from 'lucide-react';
import { useNewDashboardStream } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

export function TotalAttendanceCard() {
  const { totalAttendance } = useNewDashboardStream();
  const isLoading =
    (totalAttendance.status === 'idle' || totalAttendance.status === 'loading') && totalAttendance.data.dateKey === '';

  const delta = totalAttendance.data.deltaVsYesterday;
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaClass =
    delta > 0
      ? 'text-green-600 dark:text-green-400'
      : delta < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Attendance Rate</p>

      {isLoading && (
        <div className="space-y-2">
          <LoadingBlock className="h-7 w-16" />
          <LoadingBlock className="h-3 w-24" />
          <LoadingBlock className="h-3 w-20" />
        </div>
      )}

      {!isLoading && (
        <>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{`${totalAttendance.data.attendanceRate}%`}</p>
          </div>
          <div className="flex items-center justify-between gap-1">
            <p className={`text-xs font-medium ${deltaClass}`}>{`${deltaLabel} pts vs yesterday`}</p>
            {delta > 0 ? (
              <TrendingUp className={`h-4 w-4 ${deltaClass}`} />
            ) : delta < 0 ? (
              <TrendingDown className={`h-4 w-4 ${deltaClass}`} />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{`${totalAttendance.data.attendedCount}/${totalAttendance.data.eligibleCount} shifts`}</p>
        </>
      )}
    </div>
  );
}

