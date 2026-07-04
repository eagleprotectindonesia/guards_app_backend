'use client';

import { useCallback, useEffect, useState, startTransition } from 'react';
import { APIProvider, Map, Marker, useMapsLibrary, useMap, MapMouseEvent } from '@vis.gl/react-google-maps';

function MapUpdater({
  center,
  zoom,
  shouldUpdate,
}: {
  center: google.maps.LatLngLiteral;
  zoom: number;
  shouldUpdate: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (map && shouldUpdate) {
      map.panTo(center);
      map.setZoom(zoom);
    }
  }, [map, center, zoom, shouldUpdate]);

  return null;
}

function MapContent({
  position,
  onLocationChange,
  onAddressChange,
}: {
  position: { lat: number; lng: number };
  onLocationChange: (lat: number, lng: number) => void;
  onAddressChange?: (address: string) => void;
}) {
  const [markerPosition, setMarkerPosition] = useState(position);
  const [shouldUpdate, setShouldUpdate] = useState(false);
  const geocodingLib = useMapsLibrary('geocoding');

  const geocodeLatLng = useCallback(
    async (latLng: google.maps.LatLngLiteral) => {
      if (!geocodingLib) return;
      const geocoder = new geocodingLib.Geocoder();
      try {
        const response = await geocoder.geocode({ location: latLng });
        if (response.results[0]) {
          onAddressChange?.(response.results[0].formatted_address);
        }
      } catch {}
      onLocationChange(latLng.lat, latLng.lng);
    },
    [geocodingLib, onLocationChange, onAddressChange]
  );

  const onMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (event.detail.latLng) {
        const newPos = { lat: event.detail.latLng.lat, lng: event.detail.latLng.lng };
        setMarkerPosition(newPos);
        setShouldUpdate(false);
        geocodeLatLng(newPos);
      }
    },
    [geocodeLatLng]
  );

  const onMarkerDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      setMarkerPosition(newPos);
      setShouldUpdate(false);
      geocodeLatLng(newPos);
    },
    [geocodeLatLng]
  );

  useEffect(() => {
    startTransition(() => {
      setMarkerPosition(position);
      setShouldUpdate(true);
    });
  }, [position.lat, position.lng]);

  return (
    <Map
      defaultCenter={position}
      defaultZoom={10}
      onClick={onMapClick}
      style={{ width: '100%', height: '100%' }}
      gestureHandling="auto"
      disableDefaultUI={false}
      mapId="DEMO_MAP_ID"
    >
      <Marker position={markerPosition} draggable={true} onDragEnd={onMarkerDragEnd} />
      <MapUpdater center={markerPosition} zoom={15} shouldUpdate={shouldUpdate} />
    </Map>
  );
}

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function AddressMapPreview({
  latitude,
  longitude,
  onLocationChange,
  onAddressChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (lat: number, lng: number) => void;
  onAddressChange?: (address: string) => void;
}) {
  const center = { lat: latitude ?? -8.643, lng: longitude ?? 115.158 };
  return (
    <APIProvider apiKey={apiKey}>
      <div className="h-36 w-full relative rounded-lg overflow-hidden border border-border">
        <MapContent position={center} onLocationChange={onLocationChange} onAddressChange={onAddressChange} />
      </div>
    </APIProvider>
  );
}
