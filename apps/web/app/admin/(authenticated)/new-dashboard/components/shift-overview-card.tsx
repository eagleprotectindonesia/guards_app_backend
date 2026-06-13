import { useNewDashboardStream } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';

export function ShiftOverviewCard() {
  const { shiftOverview } = useNewDashboardStream();

  if (shiftOverview.status === 'idle' || shiftOverview.status === 'loading') {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <LoadingBlock className="h-4 w-32" />
        <div className="mt-6 flex justify-center">
          <LoadingBlock className="h-48 w-48 rounded-full border-12 border-muted/20" />
        </div>
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LoadingBlock className="h-2 w-2 rounded-full" />
                <LoadingBlock className="h-3 w-16" />
              </div>
              <LoadingBlock className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const data = shiftOverview.data;
  const total = Math.max(data.total, 0);
  const onDutyPct = total > 0 ? (data.onDuty / total) * 100 : 0;
  const upcomingPct = total > 0 ? (data.upcoming / total) * 100 : 0;
  const completedPct = total > 0 ? (data.completed / total) * 100 : 0;
  const donutBackground =
    total > 0
      ? `conic-gradient(
        #22c55e 0% ${onDutyPct}%,
        #3b82f6 ${onDutyPct}% ${onDutyPct + upcomingPct}%,
        #94a3b8 ${onDutyPct + upcomingPct}% ${onDutyPct + upcomingPct + completedPct}%,
        #ef4444 ${onDutyPct + upcomingPct + completedPct}% 100%
      )`
      : 'conic-gradient(#334155 0% 100%)';

  const legend = [
    { label: 'On Duty', count: data.onDuty, color: 'bg-green-500' },
    { label: 'Upcoming', count: data.upcoming, color: 'bg-blue-500' },
    { label: 'Completed', count: data.completed, color: 'bg-slate-400' },
    { label: 'Absent', count: data.absent, color: 'bg-red-500' },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Shift Overview</h3>
      <div className="mt-5 flex justify-center">
        <div className="relative flex h-44 w-44 items-center justify-center rounded-full" style={{ background: donutBackground }}>
          <div className="flex h-30 w-30 flex-col items-center justify-center rounded-full bg-card text-center">
            <p className="text-4xl font-bold text-foreground">{total}</p>
            <p className="text-sm text-muted-foreground">Total Shifts</p>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {legend.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
