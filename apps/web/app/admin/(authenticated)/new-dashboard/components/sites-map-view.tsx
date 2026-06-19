'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { LngLatBounds } from 'maplibre-gl';
import { useTheme } from 'next-themes';
import { AttendanceStatus, AlertReason } from '@prisma/client';
import { PanicAlert } from '@repo/types';
import type { AdminTabSlug } from '@/lib/admin-tab-routing';
import { appendDashboardTabToHref } from '@/lib/admin-tab-routing';
import type { SelectedMapItem } from './map-detail-panel';

export type PopupShiftInfo = {
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

export type PopupUpcomingInfo = {
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

const FALLBACK_CENTER: [number, number] = [118.0149, -2.5489];
const FALLBACK_ZOOM = 4;
const SINGLE_SITE_ZOOM = 12;
const LIGHT_MAP_STYLE_URL = (
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json'
).trim();

const DARK_MAP_STYLE_URL = (process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL_DARK ?? LIGHT_MAP_STYLE_URL).trim();

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

export function SitesMapView({
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
      const inner = document.createElement('div');
      inner.className = 'origin-bottom';
      inner.style.transform = 'scale(1)';
      inner.style.transition = 'transform 200ms ease-out';
      let marker: maplibregl.Marker;
      if (site.markerStatus === 'none') {
        inner.innerHTML = `
          <svg viewBox="0 0 24 24" width="30" height="30" class="drop-shadow-md" style="color:${color}">
            <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
              ${ICON_SVG.pin}
            </g>
          </svg>
        `;
        el.appendChild(inner);
        marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([site.longitude, site.latitude])
          .addTo(map);
      } else {
        const iconKey = MARKER_ICONS[site.markerStatus];
        inner.innerHTML = `
          <svg viewBox="0 0 30 38" width="34" height="42" class="drop-shadow-md">
            <path d="M15 0a15 15 0 00-15 15c0 11.25 15 22.5 15 22.5s15-11.25 15-22.5A15 15 0 0015 0z" fill="${color}"/>
            <circle cx="15" cy="15" r="10" fill="white"/>
            <g transform="translate(7 7) scale(0.67)" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
              ${ICON_SVG[iconKey]}
            </g>
          </svg>
        `;
        el.appendChild(inner);
        marker = new maplibregl.Marker({ element: el }).setLngLat([site.longitude, site.latitude]).addTo(map);
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
      const inner = document.createElement('div');
      inner.className = 'origin-center';
      inner.style.transform = 'scale(1)';
      inner.style.transition = 'transform 200ms ease-out';
      inner.innerHTML = `
        <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 bg-red-600 border border-white"></span>
      `;
      el.appendChild(inner);

      const marker = new maplibregl.Marker({ element: el }).setLngLat([panic.longitude, panic.latitude]).addTo(map);

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
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;
      inner.style.transform = 'scale(1)';

      const isSelected =
        selectedItem &&
        ((selectedItem.kind === 'site' && entry.id === selectedItem.site.id) ||
          (selectedItem.kind === 'panic' && entry.id === `panic-${selectedItem.panic.id}`));

      if (isSelected) {
        inner.style.transform = 'scale(2)';
      }
    });
  }, [selectedItem]);

  return <div ref={mapContainerRef} className={className} />;
}
