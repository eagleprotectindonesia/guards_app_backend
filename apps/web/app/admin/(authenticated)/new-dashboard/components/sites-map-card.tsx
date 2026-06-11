'use client';

import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { LngLatBounds } from 'maplibre-gl';
import { MapPin } from 'lucide-react';
import { Site } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import { PanicAlert } from '@repo/types';

type SitesMapCardProps = {
  sites: Serialized<Site>[];
  className?: string;
  panicAlerts?: PanicAlert[];
};

const FALLBACK_CENTER: [number, number] = [118.0149, -2.5489];
const FALLBACK_ZOOM = 4;
const SINGLE_SITE_ZOOM = 12;
const MAP_STYLE_URL = (
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json'
).trim();

type MapSite = {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  status: boolean | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

export function SitesMapCard({ sites, className = '', panicAlerts = [] }: SitesMapCardProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (mappableSites.length === 0 && mappablePanics.length === 0) {
      map.flyTo({ center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM, essential: true });
      return;
    }

    const bounds = new LngLatBounds();

    // Add standard site markers
    mappableSites.forEach(site => {
      bounds.extend([site.longitude, site.latitude]);
      const statusLabel = site.status === false ? 'Inactive' : 'Active';
      const siteName = escapeHtml(site.name);
      const clientName = site.clientName ? escapeHtml(site.clientName) : null;
      const address = site.address ? escapeHtml(site.address) : null;

      const popupHtml = `
        <div style="min-width: 180px; font-size: 12px; line-height: 1.4;">
          <div style="font-weight: 700; margin-bottom: 4px;">${siteName}</div>
          <div><strong>Status:</strong> ${statusLabel}</div>
          ${clientName ? `<div><strong>Client:</strong> ${clientName}</div>` : ''}
          ${address ? `<div><strong>Address:</strong> ${address}</div>` : ''}
          <div><strong>Coord:</strong> ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}</div>
        </div>
      `;

      const marker = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([site.longitude, site.latitude])
        .setPopup(new maplibregl.Popup({ offset: 14, className: 'sites-map-popup' }).setHTML(popupHtml))
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Add SOS Alert markers with a custom pulsing element
    mappablePanics.forEach(panic => {
      bounds.extend([panic.longitude, panic.latitude]);
      const clientName = escapeHtml(`${panic.firstName} ${panic.lastName}`);
      const statusLabel = escapeHtml(panic.status.replace(/_/g, ' '));
      const formattedTime = new Date(panic.createdAt).toLocaleString();
      const popupHtml = `
        <div style="min-width: 180px; font-size: 12px; line-height: 1.4;">
          <div style="font-weight: 700; margin-bottom: 4px; color: #ea580c;">🚨 SOS ALERT</div>
          <div><strong>Client:</strong> ${clientName}</div>
          <div><strong>Status:</strong> ${statusLabel}</div>
          <div><strong>Time:</strong> ${formattedTime}</div>
          <div><strong>Coord:</strong> ${panic.latitude.toFixed(6)}, ${panic.longitude.toFixed(6)}</div>
        </div>
      `;

      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center h-8 w-8';
      el.innerHTML = `
        <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 bg-red-600 border border-white"></span>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([panic.longitude, panic.latitude])
        .setPopup(new maplibregl.Popup({ offset: 14, className: 'sites-map-popup' }).setHTML(popupHtml))
        .addTo(map);

      markersRef.current.push(marker);
    });

    const totalCount = mappableSites.length + mappablePanics.length;
    if (totalCount === 1) {
      const onlyItem = mappableSites[0] || mappablePanics[0];
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
  }, [mappableSites, mappablePanics]);

  const totalMapped = mappableSites.length + mappablePanics.length;

  return (
    <div className={`rounded-xl border border-border bg-card shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-foreground">Active Sites Map</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {mappableSites.length} sites{mappablePanics.length > 0 ? ` · ${mappablePanics.length} SOS` : ''} mapped
        </span>
      </div>
      <div className="px-3 pb-3">
        <div ref={mapContainerRef} className="h-[28.5rem] w-full rounded-lg border border-border bg-muted/20" />
        {sites.length === 0 && panicAlerts.length === 0 ? (
          <p className="pt-2 text-xs text-muted-foreground">No active sites or SOS alerts found.</p>
        ) : totalMapped === 0 ? (
          <p className="pt-2 text-xs text-muted-foreground">
            Active elements exist, but none have valid coordinates yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
