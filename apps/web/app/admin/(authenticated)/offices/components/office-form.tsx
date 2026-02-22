'use client';

import { Serialized } from '@/lib/utils';
import { updateOffice } from '../actions';
import { ActionState } from '@/types/actions';
import { UpdateOfficeInput } from '@/lib/validations';
import { useActionState, useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { APIProvider, Map, Marker, useMapsLibrary, MapMouseEvent, useMap } from '@vis.gl/react-google-maps';
import { Office } from '@prisma/client';
import { useRouter } from 'next/navigation';

type Props = {
  office: Serialized<Office>; // Always an edit form — offices come from external sync
};

// MapUpdater component to update map position externally
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

// MapComponent handles the Google Map rendering and interactions
function MapComponent({
  initialPosition,
  onPlaceSelect,
}: {
  initialPosition: { lat: number; lng: number };
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
  initialAddress: string | null;
}) {
  const [markerPosition, setMarkerPosition] = useState(initialPosition);
  const [shouldUpdate, setShouldUpdate] = useState(false);
  const geocodingLib = useMapsLibrary('geocoding');

  const geocodeLatLng = useCallback(
    async (latLng: google.maps.LatLngLiteral) => {
      if (!geocodingLib) return;
      const geocoder = new geocodingLib.Geocoder();
      try {
        const response = await geocoder.geocode({ location: latLng });
        if (response.results[0]) {
          const newAddress = response.results[0].formatted_address;
          onPlaceSelect(newAddress, latLng.lat, latLng.lng);
        }
      } catch (error) {
        console.error('Geocoder failed due to:', error);
        onPlaceSelect('', latLng.lat, latLng.lng);
      }
    },
    [geocodingLib, onPlaceSelect]
  );

  const onMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (event.detail.latLng) {
        const newPos = { lat: event.detail.latLng.lat, lng: event.detail.latLng.lng };
        setMarkerPosition(newPos);
        geocodeLatLng(newPos);
        setShouldUpdate(false);
      }
    },
    [geocodeLatLng]
  );

  useEffect(() => {
    setMarkerPosition(initialPosition);
  }, [initialPosition]);

  useEffect(() => {
    setMarkerPosition(initialPosition);
    setShouldUpdate(true);
  }, [initialPosition.lat, initialPosition.lng]);

  return (
    <div className="h-96 w-full relative rounded-lg overflow-hidden border border-border">
      <Map
        defaultCenter={markerPosition}
        defaultZoom={10}
        onClick={onMapClick}
        style={{ width: '100%', height: '100%' }}
        gestureHandling={'auto'}
        disableDefaultUI={false}
        mapId="DEMO_MAP_ID"
      >
        <Marker position={markerPosition} />
        <MapUpdater center={markerPosition} zoom={15} shouldUpdate={shouldUpdate} />
      </Map>
    </div>
  );
}

// LocationSearchInput component for the autocomplete functionality
function LocationSearchInput({
  onPlaceSelect,
  initialAddress,
}: {
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
  initialAddress: string | null;
  initialPosition: { lat: number; lng: number };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    if (initialAddress && inputRef.current) {
      inputRef.current.value = initialAddress;
    }

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['geometry', 'formatted_address', 'name'],
      types: ['establishment', 'geocode'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const newAddress = place.formatted_address || place.name || '';
        onPlaceSelect(newAddress, lat, lng);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [placesLib, onPlaceSelect, initialAddress]);

  return (
    <input
      ref={inputRef}
      type="text"
      id="locationSearch"
      placeholder="Search for a location..."
      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
      defaultValue={initialAddress || ''}
    />
  );
}

export default function OfficeForm({ office }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<UpdateOfficeInput>, FormData>(
    updateOffice.bind(null, office.id),
    { success: false }
  );

  const defaultPosition = { lat: -8.643, lng: 115.158 }; // Default to Kuta Utara, Bali
  const [currentAddress, setCurrentAddress] = useState(office?.address || null);
  const [currentLatitude, setCurrentLatitude] = useState(office?.latitude || defaultPosition.lat);
  const [currentLongitude, setCurrentLongitude] = useState(office?.longitude || defaultPosition.lng);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Office updated successfully!');
      router.push('/admin/offices');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, router]);

  const handlePlaceSelect = useCallback((address: string, lat: number, lng: number) => {
    setCurrentAddress(address);
    setCurrentLatitude(lat);
    setCurrentLongitude(lng);
  }, []);

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Edit Office</h1>
        <div className="mb-6 p-3 rounded-lg bg-muted border border-border flex items-center gap-3">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
              Office Name (from external system)
            </div>
            <div className="text-base font-semibold text-foreground">{office.name}</div>
          </div>
          <span
            className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              office.status
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
            }`}
          >
            {office.status ? 'Active' : 'Inactive'}
          </span>
        </div>

        <form action={formAction} className="space-y-6">
          {/* Location Search Input */}
          <div className="relative">
            <label htmlFor="locationSearch" className="block font-medium text-foreground mb-1">
              Search for a location
            </label>
            <LocationSearchInput
              onPlaceSelect={handlePlaceSelect}
              initialAddress={currentAddress}
              initialPosition={{ lat: currentLatitude, lng: currentLongitude }}
            />
          </div>

          {/* Map Integration */}
          <div>
            <label className="block font-medium text-foreground mb-2">Office Location</label>
            <div className="border border-border rounded-lg overflow-hidden">
              <MapComponent
                initialPosition={{ lat: currentLatitude, lng: currentLongitude }}
                onPlaceSelect={handlePlaceSelect}
                initialAddress={currentAddress}
              />
            </div>
            <input type="hidden" name="address" value={currentAddress || ''} />
            <input type="hidden" name="latitude" value={currentLatitude || ''} />
            <input type="hidden" name="longitude" value={currentLongitude || ''} />
            {state.errors?.address && <p className="text-red-500 text-xs mt-1">{state.errors.address[0]}</p>}
            {state.errors?.latitude && <p className="text-red-500 text-xs mt-1">{state.errors.latitude[0]}</p>}
            {state.errors?.longitude && <p className="text-red-500 text-xs mt-1">{state.errors.longitude[0]}</p>}
            <div className="mt-3 p-3 bg-muted rounded-lg border border-border">
              <div className="text-xs text-muted-foreground mb-1">Selected Address</div>
              <div className="text-sm font-medium text-foreground">{currentAddress || 'No address selected'}</div>
            </div>
          </div>

          {/* Note Field */}
          <div>
            <label htmlFor="note" className="block font-medium text-foreground mb-1">
              Note
            </label>
            <textarea
              name="note"
              id="note"
              defaultValue={office?.note || ''}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none placeholder:text-muted-foreground"
              placeholder="Add any additional information about the office..."
            />
            {state.errors?.note && <p className="text-red-500 text-xs mt-1">{state.errors.note[0]}</p>}
          </div>

          {/* Error Message */}
          {state.message && !state.success && (
            <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
              {state.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => router.push('/admin/offices')}
              className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/20"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </APIProvider>
  );
}
