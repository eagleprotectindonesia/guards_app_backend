'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Site } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import { useAlerts } from '../context/alert-context';
import { NewDashboardSkeleton } from '../components/loading/new-dashboard-skeleton';
import { useSocketEvent } from '@/hooks/use-socket-event';
import { PanicAlert } from '@repo/types';
import {
  ActiveGuardsCard,
  ActiveSitesCard,
  CriticalAlertsCard,
  InternalChatLiveCard,
  LiveActivityFeedCard,
  SitesMapCard,
  ShiftOverviewCard,
  TotalAttendanceCard,
  TotalIncidentsCard,
  SOSAlertsCard,
  MapDetailPanel,
} from './components';
import type { SelectedMapItem } from './components';

type NewDashboardClientProps = {
  initialSites: Serialized<Site>[];
  initialPanicAlerts?: PanicAlert[];
};

export default function NewDashboardClient({ initialSites, initialPanicAlerts = [] }: NewDashboardClientProps) {
  const { activeSites, isDashboardInitialized } = useAlerts();
  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>(initialPanicAlerts);
  const [selectedMapItem, setSelectedMapItem] = useState<SelectedMapItem | null>(null);
  const router = useRouter();

  const handleNavigate = useMemo(() => (href: string) => router.push(href), [router]);

  useSocketEvent('new_dashboard:panic_alerts', payload => {
    if (payload && Array.isArray(payload.unresolvedPanics)) {
      const unresolved = payload.unresolvedPanics.filter((p: PanicAlert) => p.status === 'unresolved');
      setPanicAlerts(unresolved);
    }
  });

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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <ActiveGuardsCard onDutyCount={onDutyCount} />

        <ActiveSitesCard activeSitesCount={activeSitesCount} />

        <SOSAlertsCard count={panicAlerts.length} />

        <TotalIncidentsCard panicAlerts={panicAlerts} />

        <TotalAttendanceCard />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 lg:col-span-9">
          <SitesMapCard
            sites={initialSites}
            panicAlerts={panicAlerts}
            className="h-175 p-1"
            selectedItem={selectedMapItem}
            onMarkerSelect={setSelectedMapItem}
            onMarkerDeselect={() => setSelectedMapItem(null)}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LiveActivityFeedCard />
            <CriticalAlertsCard panicAlerts={panicAlerts} />
          </div>
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-3">
          {selectedMapItem && (
            <div
              key={selectedMapItem.kind === 'site' ? selectedMapItem.site.id : `panic-${selectedMapItem.panic.id}`}
              className="animate-panel-enter"
            >
              <MapDetailPanel
                selectedItem={selectedMapItem}
                onClose={() => setSelectedMapItem(null)}
                onNavigate={handleNavigate}
              />
            </div>
          )}
          <ShiftOverviewCard />
          <InternalChatLiveCard />
        </div>
      </div>
    </div>
  );
}
