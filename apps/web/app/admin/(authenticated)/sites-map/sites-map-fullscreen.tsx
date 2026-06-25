'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, X } from 'lucide-react';
import { AlertReason } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import type { Site } from '@prisma/client';
import { PanicAlert } from '@repo/types';
import { Button } from '@/components/ui/button';
import { useAlerts } from '../context/alert-context';
import toast from 'react-hot-toast';
import { useSession } from '../context/session-context';
import { useAdminDashboardTab } from '../context/admin-dashboard-tab-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { MapDetailPanel, type SelectedMapItem, type ChatLaunchPayload } from '../new-dashboard/components/map-detail-panel';
import { SitesMapView, type PopupShiftInfo, type PopupUpcomingInfo, type MapSite } from '../new-dashboard/components/sites-map-view';
import { MapFilterTabs, type MapFilter } from '../new-dashboard/components/sites-map-filter-tabs';

function hasCoordinates(site: Serialized<Site>): site is Serialized<Site> & { latitude: number; longitude: number } {
  return (
    typeof site.latitude === 'number' &&
    Number.isFinite(site.latitude) &&
    typeof site.longitude === 'number' &&
    Number.isFinite(site.longitude)
  );
}

function hasPanicCoordinates(panic: PanicAlert): panic is PanicAlert & { latitude: number; longitude: number } {
  return (
    typeof panic.latitude === 'number' &&
    Number.isFinite(panic.latitude) &&
    typeof panic.longitude === 'number' &&
    Number.isFinite(panic.longitude)
  );
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

type SitesMapFullscreenProps = {
  sites: Serialized<Site>[];
  initialPanicAlerts: PanicAlert[];
};

export default function SitesMapFullscreen({ sites, initialPanicAlerts }: SitesMapFullscreenProps) {
  const { hasPermission } = useSession();
  const { selectedTab } = useAdminDashboardTab();
  const { activeSites, alerts, upcomingShifts } = useAlerts();
  const router = useRouter();
  const canEditSite = hasPermission(PERMISSIONS.SITES.EDIT);

  const [panicAlerts, setPanicAlerts] = useState<PanicAlert[]>(initialPanicAlerts);
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const siteStatusMap = useMemo(() => {
    const map = new Map<string, MapSite['markerStatus']>();

    for (const { site, shifts } of activeSites) {
      const hasAttended = shifts.some(s => s.status === 'in_progress' && !!s.attendance);
      const hasLate = shifts.some(s => s.status === 'in_progress' && !s.attendance);
      const hasMissing = shifts.some(s => s.status === 'missed' && !s.attendance);

      if (hasAttended) {
        map.set(site.id, 'active');
      } else if (hasLate) {
        map.set(site.id, 'late');
      } else if (hasMissing) {
        map.set(site.id, 'missing');
      }
    }

    const UPCOMING_WINDOW_MS = 30 * 60 * 1000;
    for (const shift of upcomingShifts) {
      const siteId = shift.site?.id ?? shift.siteId;
      if (!siteId || map.has(siteId)) continue;
      const startsAt = new Date(shift.startsAt).getTime();
      if (startsAt > now && startsAt - now <= UPCOMING_WINDOW_MS) {
        map.set(siteId, 'upcoming');
      }
    }

    return map;
  }, [activeSites, upcomingShifts, now]);

  const popupDataBySiteId = useMemo(() => {
    const data = new Map<string, { shifts: PopupShiftInfo[]; upcoming: PopupUpcomingInfo[] }>();

    const alertedShifts = new Map<string, AlertReason>();
    for (const alert of alerts) {
      if (alert.reason === 'missed_checkin' || alert.reason === 'missed_attendance') {
        alertedShifts.set(alert.shiftId, alert.reason);
      }
    }

    for (const { site, shifts } of activeSites) {
      const infos: PopupShiftInfo[] = shifts.map(s => ({
        employeeId: s.employee?.id ?? null,
        employeeName: s.employee?.nickname ?? s.employee?.fullName?.split(' ')[0] ?? 'Unknown',
        employeeNumber: s.employee?.employeeNumber ?? null,
        shiftStartsAt: s.startsAt,
        shiftEndsAt: s.endsAt,
        attendanceStatus: s.attendance?.status ?? null,
        lastCheckinAt: maxIsoDate(s.attendance?.recordedAt ?? null, s.checkins?.[0]?.at ?? null),
        hasOpenAlert: alertedShifts.has(s.id),
        alertReason: alertedShifts.get(s.id) ?? null,
        isPresent: s.attendance?.status === 'present' || s.attendance?.status === 'late',
      }));
      data.set(site.id, { shifts: infos, upcoming: [] });
    }

    const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;
    for (const shift of upcomingShifts) {
      const siteId = shift.site?.id ?? shift.siteId;
      if (!siteId) continue;
      const startsAt = new Date(shift.startsAt).getTime();
      if (startsAt > now && startsAt - now <= UPCOMING_WINDOW_MS) {
        const entry = data.get(siteId);
        const employeeName = shift.employee?.nickname ?? shift.employee?.fullName?.split(' ')[0] ?? 'Unknown';
        const info: PopupUpcomingInfo = {
          employeeId: shift.employee?.id ?? null,
          employeeName,
          employeeNumber: shift.employee?.employeeNumber ?? null,
          startsInMinutes: Math.round((startsAt - now) / 60000),
          shiftStartsAt: shift.startsAt,
          shiftEndsAt: shift.endsAt,
        };
        if (entry) {
          entry.upcoming.push(info);
        } else {
          data.set(siteId, { shifts: [], upcoming: [info] });
        }
      }
    }

    return data;
  }, [activeSites, alerts, upcomingShifts, now]);

  const mappableSites = useMemo<MapSite[]>(
    () =>
      sites
        .filter(site => site.status !== false)
        .filter(hasCoordinates)
        .map(site => {
          const popupData = popupDataBySiteId.get(site.id);
          return {
            id: site.id,
            name: site.name,
            clientName: site.clientName ?? null,
            address: site.address ?? null,
            latitude: site.latitude,
            longitude: site.longitude,
            status: site.status ?? null,
            markerStatus: siteStatusMap.get(site.id) ?? 'none',
            shifts: popupData?.shifts ?? [],
            upcoming: popupData?.upcoming ?? [],
          };
        }),
    [sites, siteStatusMap, popupDataBySiteId]
  );

  const mappablePanics = useMemo<PanicAlert[]>(() => panicAlerts.filter(hasPanicCoordinates), [panicAlerts]);

  const [filter, setFilter] = useState<MapFilter>('all');

  const counts = useMemo(
    () => ({
      all: mappableSites.length + mappablePanics.length,
      active: mappableSites.filter(s => s.markerStatus === 'active').length,
      late: mappableSites.filter(s => s.markerStatus === 'late').length,
      missing: mappableSites.filter(s => s.markerStatus === 'missing').length,
      sos: mappablePanics.length,
      none: mappableSites.filter(s => s.markerStatus === 'none').length,
      upcoming: mappableSites.filter(s => s.markerStatus === 'upcoming').length,
    }),
    [mappableSites, mappablePanics]
  );

  const { visibleSites, visiblePanics } = useMemo(() => {
    if (filter === 'all') return { visibleSites: mappableSites, visiblePanics: mappablePanics };
    if (filter === 'sos') return { visibleSites: [], visiblePanics: mappablePanics };
    const filtered = mappableSites.filter(s => s.markerStatus === filter);
    return { visibleSites: filtered, visiblePanics: [] };
  }, [filter, mappableSites, mappablePanics]);

  const handleNavigate = useMemo(() => (href: string) => router.push(href), [router]);

  const handleChat = (payload: ChatLaunchPayload) => {
    if (window.opener) {
      window.opener.postMessage({ type: 'open-admin-chat', payload }, window.location.origin);
    }
    toast(
      <div>
        <p className="text-sm">
          Chat with <strong>{payload.employeeName}</strong> is ready in the main admin tab.
        </p>
        {!window.opener && <p className="mt-1 text-xs">Open this page from the dashboard to enable in-tab chat.</p>}
      </div>,
      { duration: 6000 }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-foreground">Active Sites Map</h3>
          <span className="mx-1 h-3.5 w-px bg-border" />
          <MapFilterTabs value={filter} onChange={setFilter} counts={counts} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {mappableSites.length} sites{mappablePanics.length > 0 ? ` · ${mappablePanics.length} SOS` : ''} mapped
          </span>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => window.close()}
            title="Close tab"
            aria-label="Close tab"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <SitesMapView
            sites={visibleSites}
            panicAlerts={visiblePanics}
            canEditSite={canEditSite}
            selectedTab={selectedTab}
            onNavigate={handleNavigate}
            now={now}
            className="w-full h-full"
            selectedItem={selectedItem}
            onMarkerSelect={setSelectedItem}
            onMarkerDeselect={() => setSelectedItem(null)}
          />
        </div>
        {selectedItem && (
          <div className="w-80 border-l border-border overflow-y-auto p-4 shrink-0">
            <MapDetailPanel
              selectedItem={selectedItem}
              onClose={() => setSelectedItem(null)}
              onNavigate={(href) => {
                if (window.opener) {
                  window.opener.location.assign(href);
                  window.opener.focus();
                  window.close();
                } else {
                  router.push(href);
                }
              }}
              onOpenChat={handleChat}
              showExternalHint
            />
          </div>
        )}
      </div>
    </div>
  );
}
