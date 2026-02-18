'use client';

import { useState, useMemo, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Alert, Site, Shift } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';
import { Serialized } from '@/lib/utils';
import { format } from 'date-fns';

type SiteWithOptionalRelations = Serialized<Site>;
type ShiftWithOptionalRelations = Serialized<Shift> & {
  employee?: Serialized<EmployeeWithRelations> | null;
};
type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
};

interface AlertMapProps {
  alerts: AlertWithRelations[];
}

function MapUpdater({ center, alerts }: { center: google.maps.LatLngLiteral; alerts: AlertWithRelations[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // If we have alerts, fit bounds
    if (alerts.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      alerts.forEach(alert => {
        if (alert.site?.latitude && alert.site?.longitude) {
          bounds.extend({ lat: alert.site.latitude, lng: alert.site.longitude });
        }
      });
      map.fitBounds(bounds);

      // Adjust zoom if too zoomed in (e.g. single point)
      const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom()! > 15) {
          map.setZoom(15);
        }
      });
      return () => {
        google.maps.event.removeListener(listener);
      };
    } else {
      map.setCenter(center);
      map.setZoom(10);
    }
  }, [map, alerts, center]);

  return null;
}

export default function AlertMap({ alerts }: AlertMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [selectedAlert, setSelectedAlert] = useState<AlertWithRelations | null>(null);

  // Filter alerts with valid coordinates
  const validAlerts = useMemo(
    () => alerts.filter(a => a.site?.latitude && a.site?.longitude && !a.resolvedAt),
    [alerts]
  );

  const defaultCenter = { lat: -8.409518, lng: 115.188919 };

  if (!apiKey) {
    return (
      <div className="h-64 w-full bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 border border-gray-200">
        <div className="text-center">
          <p className="font-medium">Map Unavailable</p>
          <p className="text-sm">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full rounded-xl overflow-hidden shadow-sm border border-gray-100 mb-6">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={10}
          mapId="DEMO_MAP_ID"
          gestureHandling="cooperative"
          disableDefaultUI={false}
          className="w-full h-full"
        >
          <MapUpdater center={defaultCenter} alerts={validAlerts} />

          {validAlerts.map(alert => (
            <AdvancedMarker
              key={alert.id}
              position={{ lat: alert.site!.latitude!, lng: alert.site!.longitude! }}
              onClick={() => setSelectedAlert(alert)}
            >
              <Pin
                background={alert.severity === 'critical' ? '#EF4444' : '#F59E0B'}
                borderColor={'#FFF'}
                glyphColor={'#FFF'}
              />
            </AdvancedMarker>
          ))}

          {selectedAlert && selectedAlert.site && (
            <InfoWindow
              position={{ lat: selectedAlert.site.latitude!, lng: selectedAlert.site.longitude! }}
              onCloseClick={() => setSelectedAlert(null)}
            >
              <div className="p-2 min-w-[200px]">
                <h3 className="font-bold text-gray-900 mb-1">{selectedAlert.site.name}</h3>
                <div className="text-sm text-gray-600 mb-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedAlert.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {selectedAlert.reason.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{format(new Date(selectedAlert.createdAt), 'PP p')}</p>
                {selectedAlert.shift?.employee && (
                  <p className="text-xs text-gray-500 mt-1">Employee: {selectedAlert.shift.employee.fullName}</p>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
