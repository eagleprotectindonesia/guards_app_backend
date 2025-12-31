'use client';

import { Serialized } from '@/lib/utils';
import { createSite, updateSite, ActionState } from '../actions';
import { useActionState, useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { APIProvider, Map, Marker, useMapsLibrary, MapMouseEvent, useMap } from '@vis.gl/react-google-maps';
import { Site } from '@prisma/client';
import { useRouter } from 'next/navigation';

type Props = {
  site?: Serialized<Site>; // If provided, it's an edit form
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
  const [shouldUpdate, setShouldUpdate] = useState(false); // Controls whether to zoom to location
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
        onPlaceSelect('', latLng.lat, latLng.lng); // Still update lat/lng even if address fails
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
        setShouldUpdate(false); // Don't zoom when clicking on map
      }
    },
    [geocodeLatLng]
  );

  // Update marker position when initial position changes, only on mount/initial load
  useEffect(() => {
    setMarkerPosition(initialPosition);
  }, [initialPosition]);

  // Effect to handle external position updates (from search) with zoom
  useEffect(() => {
    setMarkerPosition(initialPosition);
    setShouldUpdate(true); // This will trigger zoom only when position comes from search
  }, [initialPosition.lat, initialPosition.lng]); // Only when coordinates change, not on address changes

  return (
    <div className="h-96 w-full relative rounded-lg overflow-hidden border border-gray-200">
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

    // Set initial value if we have an address
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

        onPlaceSelect(newAddress, lat, lng); // Update using the parent form state
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
      className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
      defaultValue={initialAddress || ''}
    />
  );
}

export default function SiteForm({ site }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    site ? updateSite.bind(null, site.id) : createSite,
    { success: false }
  );

  const defaultPosition = { lat: -8.643, lng: 115.158 }; // Default to Kuta Utara, Bali
  const [currentAddress, setCurrentAddress] = useState(site?.address || null);
  const [currentLatitude, setCurrentLatitude] = useState(site?.latitude || defaultPosition.lat);
  const [currentLongitude, setCurrentLongitude] = useState(site?.longitude || defaultPosition.lng);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (site ? 'Site updated successfully!' : 'Site created successfully!'));
      router.push('/admin/sites');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, site, router]);

  const handlePlaceSelect = useCallback((address: string, lat: number, lng: number) => {
    setCurrentAddress(address);
    setCurrentLatitude(lat);
    setCurrentLongitude(lng);
  }, []);

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{site ? 'Edit Site' : 'Create New Site'}</h1>
        <form action={formAction} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block font-medium text-gray-700 mb-1">
                Site Name
              </label>
              <input
                type="text"
                name="name"
                id="name"
                defaultValue={site?.name || ''}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                placeholder="e.g. Warehouse A"
                minLength={4}
              />
              {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
            </div>

            {/* Client Name Field */}
            <div>
              <label htmlFor="clientName" className="block font-medium text-gray-700 mb-1">
                Client Name
              </label>
              <input
                type="text"
                name="clientName"
                id="clientName"
                defaultValue={site?.clientName || ''}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                placeholder="e.g. Acme Corp"
                minLength={2}
              />
              {state.errors?.clientName && <p className="text-red-500 text-xs mt-1">{state.errors.clientName[0]}</p>}
            </div>

            {/* Status Field */}
            <div>
              <label htmlFor="status" className="block font-medium text-gray-700 mb-1">
                Status
              </label>
              <div className="flex items-center space-x-4 h-10">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="true"
                    defaultChecked={site?.status !== false}
                    className="text-red-500 focus:ring-red-500"
                  />
                  <span className="ml-2 text-gray-700">Active</span>
                </label>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="false"
                    defaultChecked={site?.status === false}
                    className="text-red-500 focus:ring-red-500"
                  />
                  <span className="ml-2 text-gray-700">Inactive</span>
                </label>
              </div>
            </div>
          </div>

          {/* Location Search Input */}
          <div className="relative">
            <label htmlFor="locationSearch" className="block font-medium text-gray-700 mb-1">
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
            <label className="block font-medium text-gray-700 mb-2">Site Location</label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
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
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Selected Address</div>
              <div className="text-sm font-medium text-gray-900">{currentAddress || 'No address selected'}</div>
            </div>
          </div>

          {/* Error Message */}
          {state.message && !state.success && (
            <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => router.push('/admin/sites')}
              className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-500 active:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
            >
              {isPending ? 'Saving...' : site ? 'Save Changes' : 'Create Site'}
            </button>
          </div>
        </form>
      </div>
    </APIProvider>
  );
}
