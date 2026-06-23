import { useNewDashboardStream } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

export function TotalAttendanceCard() {
  const { totalAttendance } = useNewDashboardStream();
  const isLoading =
    (totalAttendance.status === 'idle' || totalAttendance.status === 'loading') && totalAttendance.data.dateKey === '';

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Attendance Rate</p>

      {isLoading && (
        <div className="space-y-2">
          <LoadingBlock className="h-7 w-16" />
          <LoadingBlock className="h-3 w-20" />
        </div>
      )}

      {!isLoading && (
        <>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{`${totalAttendance.data.attendanceRate}%`}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span>Site Guards</span>
              <span className="font-semibold text-foreground">{totalAttendance.data.attendanceRateSiteGuards}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Patrol</span>
              <span className="font-semibold text-foreground">{totalAttendance.data.attendanceRatePatrol}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

