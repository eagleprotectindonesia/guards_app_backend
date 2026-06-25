'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Maximize, Maximize2, X } from 'lucide-react';
import { AlertReason, Site } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import { PanicAlert } from '@repo/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useAlerts } from '../../context/alert-context';
import { useSession } from '../../context/session-context';
import { useAdminDashboardTab } from '../../context/admin-dashboard-tab-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { MapDetailPanel, type SelectedMapItem } from './map-detail-panel';
import { SitesMapView, type PopupShiftInfo, type PopupUpcomingInfo, type MapSite } from './sites-map-view';
import { MapFilterTabs, FILTER_TABS, type MapFilter } from './sites-map-filter-tabs';

type SitesMapCardProps = {
  sites: Serialized<Site>[];
  className?: string;
  panicAlerts?: PanicAlert[];
  selectedItem: SelectedMapItem | null;
  onMarkerSelect: (item: SelectedMapItem) => void;
  onMarkerDeselect: () => void;
};

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

export function SitesMapCard({
  sites,
  className = '',
  panicAlerts = [],
  selectedItem,
  onMarkerSelect,
  onMarkerDeselect,
}: SitesMapCardProps) {
  const [partialMaximized, setPartialMaximized] = useState(false);
  const { hasPermission } = useSession();
  const { selectedTab } = useAdminDashboardTab();
  const { activeSites, alerts, upcomingShifts, missedShiftIds, missedSiteIds } = useAlerts();
  const router = useRouter();
  const canEditSite = hasPermission(PERMISSIONS.SITES.EDIT);

  const handleNavigate = useMemo(() => (href: string) => router.push(href), [router]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const siteStatusMap = useMemo(() => {
    const map = new Map<string, MapSite['markerStatus']>();

    for (const { site, shifts } of activeSites) {
      const hasLate = shifts.some(s => {
        const startedAt = new Date(s.startsAt).getTime();
        return !s.attendance && startedAt <= now;
      });
      const hasAttended = shifts.some(s => !!s.attendance);
      const hasMissing = shifts.some(s => missedShiftIds.has(s.id));

      if (hasLate) {
        map.set(site.id, 'late');
      } else if (hasAttended) {
        map.set(site.id, 'active');
      } else if (hasMissing) {
        map.set(site.id, 'missing');
      }
    }

    for (const siteId of missedSiteIds) {
      if (!map.has(siteId)) {
        map.set(siteId, 'missing');
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
  }, [activeSites, upcomingShifts, missedShiftIds, missedSiteIds, now]);

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
        shiftId: s.id,
        shiftStatus: s.status,
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

  return (
    <>
      <div className={`rounded-xl border border-border bg-card shadow-sm ${className}`}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-foreground">Active Sites Map</h3>
            <span className="mx-1 h-3.5 w-px bg-border" />
            <MapFilterTabs value={filter} onChange={setFilter} counts={counts} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {mappableSites.length} sites{mappablePanics.length > 0 ? ` · ${mappablePanics.length} SOS` : ''} mapped
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPartialMaximized(true)}
              title="Maximize (75%)"
              aria-label="Maximize map to 75%"
            >
              <Maximize className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => window.open('/admin/sites-map', '_blank')}
              title="Maximize fullscreen"
              aria-label="Maximize map fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="px-3 pb-3">
          <SitesMapView
            sites={visibleSites}
            panicAlerts={visiblePanics}
            canEditSite={canEditSite}
            selectedTab={selectedTab}
            onNavigate={handleNavigate}
            now={now}
            className="h-150 w-full rounded-lg border border-border bg-muted/20"
            selectedItem={selectedItem}
            onMarkerSelect={onMarkerSelect}
            onMarkerDeselect={onMarkerDeselect}
          />
          {filter !== 'all' && visibleSites.length === 0 && visiblePanics.length === 0 ? (
            <p className="pt-2 text-xs text-muted-foreground">
              No sites match the {FILTER_TABS.find(t => t.key === filter)?.label ?? filter} filter.
            </p>
          ) : sites.length === 0 && panicAlerts.length === 0 ? (
            <p className="pt-2 text-xs text-muted-foreground">No active sites or SOS alerts found.</p>
          ) : mappableSites.length === 0 && mappablePanics.length === 0 ? (
            <p className="pt-2 text-xs text-muted-foreground">
              Active elements exist, but none have valid coordinates yet.
            </p>
          ) : null}
        </div>
      </div>

      <Dialog open={partialMaximized} onOpenChange={setPartialMaximized}>
        <DialogContent
          showCloseButton={false}
          className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] max-w-[75vw] sm:max-w-[75vw] h-[75vh] max-h-[75vh] sm:max-h-[75vh] rounded-xl p-0 gap-0 border-border shadow-2xl flex flex-col"
        >
          <DialogClose asChild>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 left-4 z-10 h-10 w-10 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-md hover:bg-card"
              title="Close"
              aria-label="Close map"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogClose>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 pl-14 border-b border-border shrink-0">
            <MapFilterTabs value={filter} onChange={setFilter} counts={counts} />
            <span className="text-xs text-muted-foreground shrink-0">
              {mappableSites.length} sites{mappablePanics.length > 0 ? ` · ${mappablePanics.length} SOS` : ''} mapped
            </span>
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
                onMarkerSelect={onMarkerSelect}
                onMarkerDeselect={onMarkerDeselect}
              />
            </div>
            {selectedItem && (
              <div className="w-80 border-l border-border overflow-y-auto p-4 shrink-0">
                <MapDetailPanel selectedItem={selectedItem} onClose={onMarkerDeselect} onNavigate={handleNavigate} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
