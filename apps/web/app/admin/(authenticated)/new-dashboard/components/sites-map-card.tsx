'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { LngLatBounds } from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { MapPin, Maximize2, X } from 'lucide-react';
import { AttendanceStatus, AlertReason, Site } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import { PanicAlert } from '@repo/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useAlerts } from '../../context/alert-context';
import { useSession } from '../../context/session-context';
import { useAdminDashboardTab } from '../../context/admin-dashboard-tab-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { appendDashboardTabToHref, type AdminTabSlug } from '@/lib/admin-tab-routing';
import { MapDetailPanel, type SelectedMapItem } from './map-detail-panel';

type SitesMapCardProps = {
  sites: Serialized<Site>[];
  className?: string;
  panicAlerts?: PanicAlert[];
  selectedItem: SelectedMapItem | null;
  onMarkerSelect: (item: SelectedMapItem) => void;
  onMarkerDeselect: () => void;
};

const FALLBACK_CENTER: [number, number] = [118.0149, -2.5489];
const FALLBACK_ZOOM = 4;
const SINGLE_SITE_ZOOM = 12;
const LIGHT_MAP_STYLE_URL = (
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json'
).trim();

const DARK_MAP_STYLE_URL = (process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL_DARK ?? LIGHT_MAP_STYLE_URL).trim();

type PopupShiftInfo = {
  employeeName: string;
  employeeNumber: string | null;
  shiftStartsAt: string;
  shiftEndsAt: string;
  attendanceStatus: AttendanceStatus | null;
  lastCheckinAt: string | null;
  hasOpenAlert: boolean;
  alertReason: AlertReason | null;
  isPresent: boolean;
};

type PopupUpcomingInfo = {
  employeeName: string;
  employeeNumber: string | null;
  startsInMinutes: number;
  shiftStartsAt: string;
  shiftEndsAt: string;
};

export type MapSite = {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  status: boolean | null;
  markerStatus: 'none' | 'pending' | 'upcoming' | 'active' | 'late';
  shifts: PopupShiftInfo[];
  upcoming: PopupUpcomingInfo[];
};

const MARKER_COLORS: Record<MapSite['markerStatus'], string> = {
  none: '#6b7280',
  pending: '#f97316',
  upcoming: '#eab308',
  active: '#22c55e',
  late: '#f97316',
};

const MARKER_ICONS: Record<'active' | 'upcoming' | 'late' | 'pending', string> = {
  active: 'check',
  upcoming: 'clock',
  late: 'alert',
  pending: 'alert',
};

const ICON_SVG: Record<string, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert:
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
};

type MapFilter = 'all' | 'active' | 'late' | 'sos' | 'none' | 'upcoming';

const FILTER_TABS: { key: MapFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#94a3b8' },
  { key: 'active', label: 'Active Now', color: '#22c55e' },
  { key: 'late', label: 'Late/Missing', color: '#f97316' },
  { key: 'sos', label: 'SOS', color: '#ef4444' },
  { key: 'none', label: 'No shift active', color: '#6b7280' },
  { key: 'upcoming', label: 'Upcoming', color: '#eab308' },
];

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

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type SitesMapViewProps = {
  sites: MapSite[];
  panicAlerts: PanicAlert[];
  canEditSite: boolean;
  selectedTab: AdminTabSlug;
  onNavigate: (href: string) => void;
  now: number;
  className?: string;
  onMarkerSelect: (item: SelectedMapItem) => void;
  onMarkerDeselect: () => void;
  selectedItem: SelectedMapItem | null;
};

type MarkerEntry = {
  marker: maplibregl.Marker;
  id: string;
};

function SitesMapView({
  sites,
  panicAlerts,
  canEditSite,
  selectedTab,
  onNavigate,
  now,
  className = '',
  onMarkerSelect,
  onMarkerDeselect,
  selectedItem,
}: SitesMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<MarkerEntry[]>([]);

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }
    if (theme === undefined) {
      return;
    }

    const initialStyle = isDark ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    return () => {
      markersRef.current.forEach(entry => entry.marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [theme, isDark]);

  useEffect(() => {
    if (theme === undefined) {
      return;
    }
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.setStyle(isDark ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL);
  }, [isDark, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach(entry => entry.marker.remove());
    markersRef.current = [];

    if (sites.length === 0 && panicAlerts.length === 0) {
      map.flyTo({ center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM, essential: true });
      return;
    }

    const bounds = new LngLatBounds();

    sites.forEach(site => {
      bounds.extend([site.longitude, site.latitude]);

      const editHref = canEditSite ? appendDashboardTabToHref(`/admin/sites/${site.id}/edit`, selectedTab) : null;

      const color = MARKER_COLORS[site.markerStatus];
      const el = document.createElement('div');
      el.className = 'relative cursor-pointer';
      let marker: maplibregl.Marker;
      if (site.markerStatus === 'none') {
        el.innerHTML = `
          <svg viewBox="0 0 24 24" width="30" height="30" class="drop-shadow-md" style="color:${color}">
            <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
              ${ICON_SVG.pin}
            </g>
          </svg>
        `;
        marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([site.longitude, site.latitude])
          .addTo(map);
      } else {
        const iconKey = MARKER_ICONS[site.markerStatus];
        el.innerHTML = `
          <svg viewBox="0 0 30 38" width="34" height="42" class="drop-shadow-md">
            <path d="M15 0a15 15 0 00-15 15c0 11.25 15 22.5 15 22.5s15-11.25 15-22.5A15 15 0 0015 0z" fill="${color}"/>
            <circle cx="15" cy="15" r="10" fill="white"/>
            <g transform="translate(7 7) scale(0.67)" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
              ${ICON_SVG[iconKey]}
            </g>
          </svg>
        `;
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([site.longitude, site.latitude])
          .addTo(map);
      }

      el.addEventListener('click', () => {
        if (selectedItem?.kind === 'site' && selectedItem.site.id === site.id) {
          onMarkerDeselect();
          return;
        }
        onMarkerSelect({ kind: 'site', site, editHref });
      });

      markersRef.current.push({ marker, id: site.id });
    });

    panicAlerts.forEach(panic => {
      bounds.extend([panic.longitude, panic.latitude]);

      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center h-8 w-8';
      el.innerHTML = `
        <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 bg-red-600 border border-white"></span>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([panic.longitude, panic.latitude])
        .addTo(map);

      el.addEventListener('click', () => {
        if (selectedItem?.kind === 'panic' && selectedItem.panic.id === panic.id) {
          onMarkerDeselect();
          return;
        }
        onMarkerSelect({ kind: 'panic', panic });
      });

      markersRef.current.push({ marker, id: `panic-${panic.id}` });
    });

    const totalCount = sites.length + panicAlerts.length;
    if (totalCount === 1) {
      const onlyItem = sites[0] || panicAlerts[0];
      map.flyTo({
        center: [onlyItem.longitude, onlyItem.latitude],
        zoom: SINGLE_SITE_ZOOM,
        essential: true,
      });
      return;
    }

    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: 13,
      duration: 500,
    });
  }, [sites, panicAlerts, canEditSite, selectedTab, onNavigate, onMarkerSelect, onMarkerDeselect]);

  useEffect(() => {
    markersRef.current.forEach(entry => {
      const el = entry.marker.getElement();
      el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');

      const isSelected =
        selectedItem &&
        ((selectedItem.kind === 'site' && entry.id === selectedItem.site.id) ||
          (selectedItem.kind === 'panic' && entry.id === `panic-${selectedItem.panic.id}`));

      if (isSelected) {
        el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      }
    });
  }, [selectedItem]);

  return <div ref={mapContainerRef} className={className} />;
}

export function SitesMapCard({
  sites,
  className = '',
  panicAlerts = [],
  selectedItem,
  onMarkerSelect,
  onMarkerDeselect,
}: SitesMapCardProps) {
  const [maximized, setMaximized] = useState(false);
  const { hasPermission } = useSession();
  const { selectedTab } = useAdminDashboardTab();
  const { activeSites, alerts, upcomingShifts } = useAlerts();
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

    const alertedSiteIds = new Set<string>();
    for (const alert of alerts) {
      if (alert.reason === 'missed_checkin' || alert.reason === 'missed_attendance') {
        const id = alert.siteId ?? alert.site?.id ?? alert.shift?.siteId;
        if (id) alertedSiteIds.add(id);
      }
    }

    for (const { site, shifts } of activeSites) {
      const hasLateAttendance = shifts.some(s => s.attendance?.status === 'late');
      const hasAlert = alertedSiteIds.has(site.id);
      const hasActiveCheckin = shifts.some(
        s => s.attendance && s.attendance.status !== 'absent' && s.attendance.status !== 'pending_verification'
      );

      if (hasLateAttendance || hasAlert) {
        map.set(site.id, 'late');
      } else if (hasActiveCheckin) {
        map.set(site.id, 'active');
      } else {
        map.set(site.id, 'pending');
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
  }, [activeSites, alerts, upcomingShifts, now]);

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
        employeeName: s.employee?.nickname ?? s.employee?.fullName?.split(' ')[0] ?? 'Unknown',
        employeeNumber: s.employee?.employeeNumber ?? null,
        shiftStartsAt: s.startsAt,
        shiftEndsAt: s.endsAt,
        attendanceStatus: s.attendance?.status ?? null,
        lastCheckinAt: s.attendance?.recordedAt ?? null,
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
      late: mappableSites.filter(s => s.markerStatus === 'late' || s.markerStatus === 'pending').length,
      sos: mappablePanics.length,
      none: mappableSites.filter(s => s.markerStatus === 'none').length,
      upcoming: mappableSites.filter(s => s.markerStatus === 'upcoming').length,
    }),
    [mappableSites, mappablePanics]
  );

  const { visibleSites, visiblePanics } = useMemo(() => {
    if (filter === 'all') return { visibleSites: mappableSites, visiblePanics: mappablePanics };
    if (filter === 'sos') return { visibleSites: [], visiblePanics: mappablePanics };
    const filtered = mappableSites.filter(
      s => s.markerStatus === filter || (filter === 'late' && s.markerStatus === 'pending')
    );
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
            <div className="flex items-center gap-0">
              {FILTER_TABS.map(tab => {
                const active = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium transition-colors rounded ${
                      active
                        ? 'bg-red-600/10 text-red-600 dark:text-red-400'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tab.color }} />
                    {tab.label} ({counts[tab.key]})
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {mappableSites.length} sites{mappablePanics.length > 0 ? ` · ${mappablePanics.length} SOS` : ''} mapped
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMaximized(true)}
              title="Maximize"
              aria-label="Maximize map"
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

      <Dialog open={maximized} onOpenChange={setMaximized}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-full sm:max-w-full max-h-full rounded-none p-0 gap-0 border-0"
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
          <div className="flex h-full">
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
              <div className="w-80 border-l border-border overflow-y-auto p-4">
                <MapDetailPanel
                  selectedItem={selectedItem}
                  onClose={onMarkerDeselect}
                  onNavigate={handleNavigate}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
