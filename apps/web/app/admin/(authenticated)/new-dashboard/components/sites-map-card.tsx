'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { LngLatBounds } from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { MapPin, Maximize2, Pencil, X } from 'lucide-react';
import { Site } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import { PanicAlert } from '@repo/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useSession } from '../../context/session-context';
import { useAdminDashboardTab } from '../../context/admin-dashboard-tab-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { appendDashboardTabToHref, type AdminTabSlug } from '@/lib/admin-tab-routing';

type SitesMapCardProps = {
  sites: Serialized<Site>[];
  className?: string;
  panicAlerts?: PanicAlert[];
};

const FALLBACK_CENTER: [number, number] = [118.0149, -2.5489];
const FALLBACK_ZOOM = 4;
const SINGLE_SITE_ZOOM = 12;
const LIGHT_MAP_STYLE_URL = (
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json'
).trim();

const DARK_MAP_STYLE_URL = (process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL_DARK ?? LIGHT_MAP_STYLE_URL).trim();

type MapSite = {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  status: boolean | null;
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

function SitePopup({ site, editHref, onNavigate }: { site: MapSite; editHref: string | null; onNavigate: (href: string) => void }) {
  return (
    <div className="min-w-[180px] text-xs leading-relaxed">
      <div className="font-bold mb-1">{site.name}</div>
      <div>
        <strong>Status:</strong> {site.status === false ? 'Inactive' : 'Active'}
      </div>
      {site.clientName && (
        <div>
          <strong>Client:</strong> {site.clientName}
        </div>
      )}
      {site.address && (
        <div>
          <strong>Address:</strong> {site.address}
        </div>
      )}
      <div>
        <strong>Coord:</strong> {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
      </div>
      {editHref && (
        <a
          href={editHref}
          onClick={event => {
            if (event.defaultPrevented) return;
            if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onNavigate(editHref);
          }}
          className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 bg-red-600 text-white text-[11px] font-semibold rounded hover:bg-red-700 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Edit site
        </a>
      )}
    </div>
  );
}

function PanicPopup({ panic }: { panic: PanicAlert }) {
  return (
    <div className="min-w-[180px] text-xs leading-relaxed">
      <div className="font-bold mb-1" style={{ color: '#ea580c' }}>
        🚨 SOS ALERT
      </div>
      <div>
        <strong>Client:</strong> {`${panic.firstName} ${panic.lastName}`}
      </div>
      <div>
        <strong>Status:</strong> {panic.status.replace(/_/g, ' ')}
      </div>
      <div>
        <strong>Time:</strong> {new Date(panic.createdAt).toLocaleString()}
      </div>
      <div>
        <strong>Coord:</strong> {panic.latitude.toFixed(6)}, {panic.longitude.toFixed(6)}
      </div>
    </div>
  );
}

type SitesMapViewProps = {
  sites: MapSite[];
  panicAlerts: PanicAlert[];
  canEditSite: boolean;
  selectedTab: AdminTabSlug;
  onNavigate: (href: string) => void;
  className?: string;
};

function SitesMapView({ sites, panicAlerts, canEditSite, selectedTab, onNavigate, className = '' }: SitesMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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
      markersRef.current.forEach(marker => marker.remove());
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

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (sites.length === 0 && panicAlerts.length === 0) {
      map.flyTo({ center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM, essential: true });
      return;
    }

    const bounds = new LngLatBounds();

    // Add standard site markers
    sites.forEach(site => {
      bounds.extend([site.longitude, site.latitude]);

      const mountNode = document.createElement('div');
      const popup = new maplibregl.Popup({ offset: 14, className: 'sites-map-popup' });
      popup.setDOMContent(mountNode);
      const root = createRoot(mountNode);
      const editHref = canEditSite ? appendDashboardTabToHref(`/admin/sites/${site.id}/edit`, selectedTab) : null;
      root.render(<SitePopup site={site} editHref={editHref} onNavigate={onNavigate} />);
      popup.on('close', () => root.unmount());

      const marker = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([site.longitude, site.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Add SOS Alert markers with a custom pulsing element
    panicAlerts.forEach(panic => {
      bounds.extend([panic.longitude, panic.latitude]);

      const mountNode = document.createElement('div');
      const popup = new maplibregl.Popup({ offset: 14, className: 'sites-map-popup' });
      popup.setDOMContent(mountNode);
      const root = createRoot(mountNode);
      root.render(<PanicPopup panic={panic} />);
      popup.on('close', () => root.unmount());

      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center h-8 w-8';
      el.innerHTML = `
        <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 bg-red-600 border border-white"></span>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([panic.longitude, panic.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
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
  }, [sites, panicAlerts, canEditSite, selectedTab, onNavigate]);

  return <div ref={mapContainerRef} className={className} />;
}

export function SitesMapCard({ sites, className = '', panicAlerts = [] }: SitesMapCardProps) {
  const [maximized, setMaximized] = useState(false);
  const { hasPermission } = useSession();
  const { selectedTab } = useAdminDashboardTab();
  const router = useRouter();
  const canEditSite = hasPermission(PERMISSIONS.SITES.EDIT);

  const handleNavigate = useMemo(() => (href: string) => router.push(href), [router]);

  const mappableSites = useMemo<MapSite[]>(
    () =>
      sites.filter(hasCoordinates).map(site => ({
        id: site.id,
        name: site.name,
        clientName: site.clientName ?? null,
        address: site.address ?? null,
        latitude: site.latitude,
        longitude: site.longitude,
        status: site.status ?? null,
      })),
    [sites]
  );

  const mappablePanics = useMemo<PanicAlert[]>(() => panicAlerts.filter(hasPanicCoordinates), [panicAlerts]);

  return (
    <>
      <div className={`rounded-xl border border-border bg-card shadow-sm ${className}`}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-foreground">Active Sites Map</h3>
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
            sites={mappableSites}
            panicAlerts={mappablePanics}
            canEditSite={canEditSite}
            selectedTab={selectedTab}
            onNavigate={handleNavigate}
            className="h-114 w-full rounded-lg border border-border bg-muted/20"
          />
          {sites.length === 0 && panicAlerts.length === 0 ? (
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
          <SitesMapView
            sites={mappableSites}
            panicAlerts={mappablePanics}
            canEditSite={canEditSite}
            selectedTab={selectedTab}
            onNavigate={handleNavigate}
            className="w-full h-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
