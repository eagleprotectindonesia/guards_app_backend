'use client';

import { useAlerts } from '../context/alert-context';
import { NewDashboardSkeleton } from '../components/loading/new-dashboard-skeleton';
import { LoadingBlock } from '../components/loading/loading-block';
import {
  ActiveGuardsCard,
  ActiveSitesCard,
  CriticalAlertsCard,
  GuardStatusCard,
  InternalChatLiveCard,
  LiveActivityFeedCard,
  PlaceholderCard,
  PlaceholderTopCard,
  ShiftOverviewCard,
  SystemStatusCard,
  TodaysSummaryCard,
  TopSitesByActivityCard,
  TotalAttendanceCard,
  TotalIncidentsCard,
} from './components';

export default function NewDashboardClient() {
  const { activeSites, isDashboardInitialized } = useAlerts();

  if (!isDashboardInitialized) {
    return <NewDashboardSkeleton />;
  }

  const activeSitesCount = activeSites.length;
  const onDutyCount = activeSites.reduce(
    (acc, site) =>
      acc +
      site.shifts.filter(shift => shift.employee && shift.attendance && shift.attendance.status !== 'absent').length,
    0
  );

  return (
    <div className="w-full space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <ActiveGuardsCard onDutyCount={onDutyCount} />

        <ActiveSitesCard activeSitesCount={activeSitesCount} />

        <PlaceholderTopCard />
        <PlaceholderTopCard />
        <PlaceholderTopCard />
        <PlaceholderTopCard />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 lg:col-span-3">
          <ShiftOverviewCard />

          <GuardStatusCard onDutyCount={onDutyCount} />

          <TopSitesByActivityCard />
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-6">
          <PlaceholderCard className="h-125 p-1" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LiveActivityFeedCard />
            <PlaceholderCard className="h-64" />
          </div>
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-3">
          <CriticalAlertsCard />
          <InternalChatLiveCard />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <TodaysSummaryCard />
        <TotalIncidentsCard />
        <TotalAttendanceCard />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <LoadingBlock className="h-3 w-24" />
            <div className="flex items-end justify-between">
              <div className="space-y-2">
                <LoadingBlock className="h-6 w-12" />
                <LoadingBlock className="h-3 w-20" />
              </div>
              <LoadingBlock className="h-8 w-24 rounded" />
            </div>
          </div>
        ))}
        <SystemStatusCard />
      </div>
    </div>
  );
}
