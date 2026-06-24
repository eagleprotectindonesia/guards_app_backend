import { useNewDashboardStream } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

export function TotalAttendanceCard() {
  const { totalAttendance } = useNewDashboardStream();
  const isLoading =
    (totalAttendance.status === 'idle' || totalAttendance.status === 'loading') && totalAttendance.data.dateKey === '';

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance Rate</p>
        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{`${totalAttendance.data.attendanceRate}%`}</p>
      </div>

      {isLoading && (
        <div className="mt-2 space-y-2">
          <LoadingBlock className="h-7 w-16" />
          <LoadingBlock className="h-3 w-20" />
        </div>
      )}

      {!isLoading && (
        <>
          <div className="border-t border-border/40 mt-1.5 pt-1.5 grid grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Site Guards</p>
              <p className="text-2xl font-extrabold tracking-tight leading-none text-foreground">
                {totalAttendance.data.attendanceRateSiteGuards}%
              </p>
            </div>
            <div className="pl-2 rounded-sm bg-slate-500/4 dark:bg-slate-400/4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Control</p>
              <p className="text-2xl font-extrabold tracking-tight leading-none text-slate-500 dark:text-slate-400">
                {totalAttendance.data.attendanceRatePatrol}%
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

