'use client';

import { Serialized } from '@/lib/utils';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { Site } from '@prisma/client';
import { format } from 'date-fns';

type Props = {
  site: Serialized<Site>;
};

function MapComponent({ position }: { position: { lat: number; lng: number } }) {
  return (
    <div className="h-96 w-full relative rounded-lg overflow-hidden border border-gray-200">
      <Map
        defaultCenter={position}
        defaultZoom={15}
        style={{ width: '100%', height: '100%' }}
        gestureHandling={'auto'}
        disableDefaultUI={false}
        mapId="DEMO_MAP_ID"
      >
        <Marker position={position} />
      </Map>
    </div>
  );
}

export default function SiteDetail({ site }: Props) {
  const defaultPosition = { lat: -8.643, lng: 115.158 }; // Default to Kuta Utara, Bali
  const currentPosition = {
    lat: site.latitude || defaultPosition.lat,
    lng: site.longitude || defaultPosition.lng,
  };

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Site Details</h1>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name Field */}
            <div>
              <label className="block font-medium text-foreground mb-1">Site Name</label>
              <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
                {site.name}
              </div>
            </div>

            {/* Client Name Field */}
            <div>
              <label className="block font-medium text-foreground mb-1">Client Name</label>
              <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
                {site.clientName}
              </div>
            </div>
          </div>

          {/* Address Display */}
          <div>
            <label className="block font-medium text-foreground mb-1">Address</label>
            <div className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground min-h-12">
              {site.address || 'No address provided'}
            </div>
          </div>

          {/* Map Integration */}
          <div>
            <label className="block font-medium text-foreground mb-2">Site Location</label>
            <div className="border border-border rounded-lg overflow-hidden">
              <MapComponent position={currentPosition} />
            </div>
            <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-border">
              <div className="text-xs text-muted-foreground mb-1">Coordinates</div>
              <div className="text-sm font-medium text-foreground">
                Latitude: {currentPosition.lat.toFixed(6)}, Longitude: {currentPosition.lng.toFixed(6)}
              </div>
            </div>
          </div>

          {/* Created At */}
          <div>
            <label className="block font-medium text-foreground mb-1">Created At</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {site.createdAt ? format(new Date(site.createdAt), 'MMM dd, yyyy h:mm a') : 'N/A'}
            </div>
          </div>

          {/* Updated At */}
          <div>
            <label className="block font-medium text-foreground mb-1">Updated At</label>
            <div className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-foreground flex items-center">
              {site.updatedAt ? format(new Date(site.updatedAt), 'MMM dd, yyyy h:mm a') : 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </APIProvider>
  );
}
