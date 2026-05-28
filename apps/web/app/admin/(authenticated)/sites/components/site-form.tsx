'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Serialized } from '@/lib/server-utils';
import { createSite, updateSite } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateSiteInput } from '@repo/validations';
import { startTransition, useActionState, useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { APIProvider, Map, Marker, useMapsLibrary, MapMouseEvent, useMap } from '@vis.gl/react-google-maps';
import { Site } from '@prisma/client';
import { useAdminRouter } from '../../context/admin-router';

type SitePostFormValue = {
  id?: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sortOrder: number;
};

type Props = {
  site?: Serialized<Site & { posts?: SitePostFormValue[] }>;
  isMonitoringEnabled?: boolean;
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

  // Effect to handle external position updates (from search) with zoom
  useEffect(() => {
    startTransition(() => {
      setMarkerPosition(initialPosition);
      setShouldUpdate(true); // This will trigger zoom only when position comes from search
    });
  }, [initialPosition.lat, initialPosition.lng]); // Only when coordinates change, not on address changes

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

function PostAddressAutocompleteInput({
  value,
  onFocus,
  onChange,
  onPlaceSelect,
}: {
  value: string;
  onFocus: () => void;
  onChange: (value: string) => void;
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['geometry', 'formatted_address', 'name'],
      types: ['establishment', 'geocode'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const address = place.formatted_address || place.name || '';
      onPlaceSelect(address, lat, lng);
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [placesLib, onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
      value={value}
      onFocus={onFocus}
      onChange={e => onChange(e.target.value)}
      placeholder="Address"
    />
  );
}

export default function SiteForm({ site, isMonitoringEnabled = true }: Props) {
  const router = useAdminRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateSiteInput>, FormData>(
    site ? updateSite.bind(null, site.id) : createSite,
    { success: false }
  );

  const defaultPosition = { lat: -8.643, lng: 115.158 }; // Default to Kuta Utara, Bali
  const [currentAddress, setCurrentAddress] = useState(site?.address || null);
  const [currentLatitude, setCurrentLatitude] = useState(site?.latitude || defaultPosition.lat);
  const [currentLongitude, setCurrentLongitude] = useState(site?.longitude || defaultPosition.lng);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [pendingFocusPostIndex, setPendingFocusPostIndex] = useState<number | null>(null);
  const [posts, setPosts] = useState<SitePostFormValue[]>(
    site?.posts && site.posts.length > 0
      ? site.posts.map((p, idx) => ({ ...p, sortOrder: p.sortOrder ?? idx }))
      : [{ name: 'Main Post', address: '', latitude: null, longitude: null, sortOrder: 0 }]
  );

  const focusPost = useCallback((index: number) => {
    setSelectedPostIndex(index);
    const target = posts[index];
    if (!target) return;
    if (target.latitude != null && target.longitude != null) {
      setCurrentAddress(target.address || '');
      setCurrentLatitude(target.latitude);
      setCurrentLongitude(target.longitude);
    }
  }, [posts]);

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
    setPosts(prev =>
      prev.map((p, idx) => (idx === selectedPostIndex ? { ...p, address, latitude: lat, longitude: lng } : p))
    );
  }, [selectedPostIndex]);

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">{site ? 'Edit Site' : 'Create New Site'}</h1>
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="postsPayload" value={JSON.stringify(posts)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block font-medium text-foreground mb-1">
                Site Name
              </label>
              <input
                type="text"
                name="name"
                id="name"
                defaultValue={site?.name || ''}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                placeholder="e.g. Warehouse A"
                minLength={4}
              />
              {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
            </div>

            {/* Client Name Field */}
            <div>
              <label htmlFor="clientName" className="block font-medium text-foreground mb-1">
                Client Name
              </label>
              <input
                type="text"
                name="clientName"
                id="clientName"
                defaultValue={site?.clientName || ''}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                placeholder="e.g. Acme Corp"
                minLength={2}
              />
              {state.errors?.clientName && <p className="text-red-500 text-xs mt-1">{state.errors.clientName[0]}</p>}
            </div>

            {/* Status Field */}
            <div>
              <label htmlFor="status" className="block font-medium text-foreground mb-1">
                Status
              </label>
              <div className="flex items-center space-x-4 h-10">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="true"
                    defaultChecked={site?.status !== false}
                    className="text-red-600 focus:ring-red-600"
                  />
                  <span className="ml-2 text-foreground">Active</span>
                </label>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="false"
                    defaultChecked={site?.status === false}
                    className="text-red-600 focus:ring-red-600"
                  />
                  <span className="ml-2 text-foreground">Inactive</span>
                </label>
              </div>
            </div>

            {/* Geofence Radius Field */}
            {isMonitoringEnabled && (
              <div>
                <label htmlFor="geofenceRadius" className="block font-medium text-foreground mb-1">
                  Geofence Radius (meters)
                </label>
                <input
                  type="number"
                  name="geofenceRadius"
                  id="geofenceRadius"
                  defaultValue={site?.geofenceRadius || 100}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground"
                  placeholder="e.g. 100"
                  min={10}
                  step={1}
                />
                {state.errors?.geofenceRadius && (
                  <p className="text-red-500 text-xs mt-1">{state.errors.geofenceRadius[0]}</p>
                )}
              </div>
            )}
          </div>

          {/* Posts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block font-medium text-foreground">Site Posts</label>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-foreground text-sm font-medium transition-colors"
                onClick={() =>
                  setPosts(prev => {
                    const nextIndex = prev.length;
                    setSelectedPostIndex(nextIndex);
                    setPendingFocusPostIndex(nextIndex);
                    return [
                      ...prev,
                      {
                        name: `Post ${prev.length + 1}`,
                        address: '',
                        latitude: null,
                        longitude: null,
                        sortOrder: prev.length,
                      },
                    ];
                  })
                }
              >
                <Plus className="w-4 h-4" />
                Add Post
              </button>
            </div>
            {posts.map((post, idx) => (
              <div
                key={post.id || idx}
                className={`grid grid-cols-1 md:grid-cols-12 gap-3 p-4 border rounded-xl transition-all ${
                  selectedPostIndex === idx
                    ? 'border-red-500 bg-red-50/5 dark:bg-red-500/5 shadow-sm shadow-red-500/10'
                    : 'border-border bg-card'
                }`}
              >
                <div className="md:col-span-2">
                  <input
                    ref={
                      pendingFocusPostIndex === idx
                        ? element => {
                            if (!element) return;
                            element.focus();
                            setPendingFocusPostIndex(null);
                          }
                        : undefined
                    }
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                    value={post.name || ''}
                    onFocus={() => focusPost(idx)}
                    onChange={e =>
                      setPosts(prev => prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)))
                    }
                    placeholder="Post Name"
                  />
                </div>
                <div className="md:col-span-5">
                  <PostAddressAutocompleteInput
                    value={post.address || ''}
                    onFocus={() => focusPost(idx)}
                    onChange={nextValue =>
                      setPosts(prev => prev.map((p, i) => (i === idx ? { ...p, address: nextValue } : p)))
                    }
                    onPlaceSelect={(address, lat, lng) => {
                      setSelectedPostIndex(idx);
                      setCurrentAddress(address);
                      setCurrentLatitude(lat);
                      setCurrentLongitude(lng);
                      setPosts(prev =>
                        prev.map((p, i) => (i === idx ? { ...p, address, latitude: lat, longitude: lng } : p))
                      );
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                    type="number"
                    value={post.latitude ?? ''}
                    onFocus={() => focusPost(idx)}
                    onChange={e =>
                      setPosts(prev =>
                        prev.map((p, i) => (i === idx ? { ...p, latitude: e.target.value === '' ? null : Number(e.target.value) } : p))
                      )
                    }
                    placeholder="Latitude"
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                    type="number"
                    value={post.longitude ?? ''}
                    onFocus={() => focusPost(idx)}
                    onChange={e =>
                      setPosts(prev =>
                        prev.map((p, i) => (i === idx ? { ...p, longitude: e.target.value === '' ? null : Number(e.target.value) } : p))
                      )
                    }
                    placeholder="Longitude"
                  />
                </div>
                <div className="md:col-span-1 flex items-center justify-end">
                  <button
                    type="button"
                    className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors flex-shrink-0"
                    title="Remove Post"
                    onClick={() => {
                      if (posts.length <= 1) return;
                      setPosts(prev => prev.filter((_, i) => i !== idx));
                      setSelectedPostIndex(prevSelected => {
                        if (idx < prevSelected) return prevSelected - 1;
                        if (idx === prevSelected) return Math.max(0, prevSelected - 1);
                        return prevSelected;
                      });
                    }}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Map Integration */}
          <div>
            <label className="block font-medium text-foreground mb-2">Selected Post Location</label>
            <div className="border border-border rounded-lg overflow-hidden">
              <MapComponent
                initialPosition={{ lat: currentLatitude, lng: currentLongitude }}
                onPlaceSelect={handlePlaceSelect}
                initialAddress={currentAddress}
              />
            </div>
            <input type="hidden" name="address" value={posts[0]?.address || currentAddress || ''} />
            <input type="hidden" name="latitude" value={posts[0]?.latitude ?? currentLatitude ?? ''} />
            <input type="hidden" name="longitude" value={posts[0]?.longitude ?? currentLongitude ?? ''} />
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
              defaultValue={site?.note || ''}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none placeholder:text-muted-foreground"
              placeholder="Add any additional information about the site..."
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
              onClick={() => router.push('/admin/sites')}
              className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/20"
            >
              {isPending ? 'Saving...' : site ? 'Save Changes' : 'Create Site'}
            </button>
          </div>
        </form>
      </div>
    </APIProvider>
  );
}
