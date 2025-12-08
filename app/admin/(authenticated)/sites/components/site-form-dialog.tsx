'use client';

import Modal from '../../components/modal';
import { createSite, updateSite, ActionState } from '../actions';
import { useActionState, useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { APIProvider, Map, AdvancedMarker, Pin, useMapsLibrary } from '@vis.gl/react-google-maps';

type Site = {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  site?: Site; // If provided, it's an edit form
  isOpen: boolean;
  onClose: () => void;
};

// MapComponent handles the Google Map rendering and interactions
function MapComponent({ initialPosition, onPlaceSelect, initialAddress }: { initialPosition: { lat: number; lng: number; }; onPlaceSelect: (address: string, lat: number, lng: number) => void; initialAddress: string | null; }) {
  const [markerPosition, setMarkerPosition] = useState(initialPosition);
  const [address, setAddress] = useState(initialAddress);
  const mapRef = useRef<google.maps.Map | null>(null);
  const places = useMapsLibrary('places'); // Load places library

  useEffect(() => {
    if (initialPosition) {
      setMarkerPosition(initialPosition);
      setAddress(initialAddress);
    }
  }, [initialPosition, initialAddress]);

  const geocodeLatLng = useCallback(async (latLng: google.maps.LatLngLiteral) => {
    if (!places) return;
    const geocoder = new (places as any).Geocoder(); // Using 'any' due to PlacesLibrary type issue
    try {
      const response = await geocoder.geocode({ location: latLng });
      if (response.results[0]) {
        const newAddress = response.results[0].formatted_address;
        setAddress(newAddress);
        onPlaceSelect(newAddress, latLng.lat, latLng.lng);
      }
    } catch (error) {
      console.error('Geocoder failed due to:', error);
      setAddress('');
      onPlaceSelect('', latLng.lat, latLng.lng); // Still update lat/lng even if address fails
    }
  }, [places, onPlaceSelect]);

  const onMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    if (event.latLng) {
      const newPos = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      setMarkerPosition(newPos);
      geocodeLatLng(newPos);
    }
  }, [geocodeLatLng]);

  return (
    <div className="h-80 w-full relative mb-4">
      <Map
        ref={mapRef}
        center={markerPosition}
        zoom={10}
        mapId={'YOUR_MAP_ID'} // Replace with your Map ID
        onClick={onMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        <AdvancedMarker position={markerPosition}>
          <Pin background={'#FBBC04'} glyphColor={'#000'} borderColor={'#000'} />
        </AdvancedMarker>
      </Map>
      <input type="hidden" name="address" value={address || ''} />
      <input type="hidden" name="latitude" value={markerPosition?.lat || ''} />
      <input type="hidden" name="longitude" value={markerPosition?.lng || ''} />
    </div>
  );
}


export default function SiteFormDialog({ site, isOpen, onClose }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    site ? updateSite.bind(null, site.id) : createSite,
    { success: false }
  );

  const defaultPosition = { lat: 34.052235, lng: -118.243683 }; // Default to Los Angeles
  const [currentAddress, setCurrentAddress] = useState(site?.address || null);
  const [currentLatitude, setCurrentLatitude] = useState(site?.latitude || defaultPosition.lat);
  const [currentLongitude, setCurrentLongitude] = useState(site?.longitude || defaultPosition.lng);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (site ? 'Site updated successfully!' : 'Site created successfully!'));
      onClose();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, onClose, site]);

  const handlePlaceSelect = useCallback((address: string, lat: number, lng: number) => {
    setCurrentAddress(address);
    setCurrentLatitude(lat);
    setCurrentLongitude(lng);
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={site ? 'Edit Site' : 'Create New Site'}>
      <form action={formAction} className="space-y-4 p-4">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Site Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={site?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. Warehouse A"
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Client Name Field */}
        <div>
          <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
            Client Name
          </label>
          <input
            type="text"
            name="clientName"
            id="clientName"
            defaultValue={site?.clientName || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. Acme Corp"
          />
          {state.errors?.clientName && <p className="text-red-500 text-xs mt-1">{state.errors.clientName[0]}</p>}
        </div>

        {/* Map Integration */}
        <div className="pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Site Location
          </label>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
              <MapComponent
                initialPosition={{ lat: currentLatitude, lng: currentLongitude }}
                onPlaceSelect={handlePlaceSelect}
                initialAddress={currentAddress}
              />
            </APIProvider>
          </div>
          {state.errors?.address && <p className="text-red-500 text-xs mt-1">{state.errors.address[0]}</p>}
          {state.errors?.latitude && <p className="text-red-500 text-xs mt-1">{state.errors.latitude[0]}</p>}
          {state.errors?.longitude && <p className="text-red-500 text-xs mt-1">{state.errors.longitude[0]}</p>}
          <div className="mt-2 text-sm text-gray-600">
            Selected Address: {currentAddress || 'None'}
          </div>
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4"> {/* Adjusted padding-top here */}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Saving...' : site ? 'Save Changes' : 'Create Site'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
