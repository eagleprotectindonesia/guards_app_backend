'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { APIProvider, Map, Marker, useMap, useMapsLibrary, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  createTicketAction,
  createTicketAttachmentUploadUrlAction,
  attachUploadedFilesToTicketAction,
} from '../actions';
import { toast } from 'react-hot-toast';
import { uploadFileWithPresignedPost } from '@/lib/s3-presigned-post-upload';
import PhoneInput from '@/components/ui/phone-input';
import { TinyMceEditor } from '@/components/ui/tinymce-editor';
import { stripHtmlToText, ticketResolutionTargetHourOptions } from '@repo/validations';
import { TICKET_DEPARTMENT_OPTIONS, type TicketDepartment } from '@/lib/ticket-department-roles';
import Modal from '../../components/modal';

type Props = {
  adminName: string;
};

const DEFAULT_LOCATION_POSITION = { lat: -8.643, lng: 115.158 };

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
    if (!map || !shouldUpdate) return;

    map.panTo(center);
    map.setZoom(zoom);
  }, [map, center, zoom, shouldUpdate]);

  return null;
}

function ClientLocationAutocompleteInput({
  value,
  onChange,
  onPlaceSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'name', 'geometry'],
      types: ['establishment', 'geocode'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const address = place.formatted_address || place.name || inputRef.current?.value || '';
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      onChange(address);
      if (typeof lat === 'number' && typeof lng === 'number') {
        onPlaceSelect(address, lat, lng);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [placesLib, onChange, onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500"
      placeholder="Enter location / site name"
      autoComplete="off"
    />
  );
}

function ClientLocationMapPreview({
  address,
  position,
  onPlaceSelect,
}: {
  address: string;
  position: google.maps.LatLngLiteral | null;
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
}) {
  const geocodingLib = useMapsLibrary('geocoding');
  const markerPosition = position ?? DEFAULT_LOCATION_POSITION;

  const geocodeLatLng = useCallback(
    async (latLng: google.maps.LatLngLiteral) => {
      if (!geocodingLib) {
        onPlaceSelect(address || '', latLng.lat, latLng.lng);
        return;
      }

      const geocoder = new geocodingLib.Geocoder();
      try {
        const response = await geocoder.geocode({ location: latLng });
        const nextAddress = response.results[0]?.formatted_address || address || '';
        onPlaceSelect(nextAddress, latLng.lat, latLng.lng);
      } catch (error) {
        console.error('Geocoder failed due to:', error);
        onPlaceSelect(address || '', latLng.lat, latLng.lng);
      }
    },
    [address, geocodingLib, onPlaceSelect]
  );

  const onMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (!event.detail.latLng) return;

      const nextPosition = {
        lat: event.detail.latLng.lat,
        lng: event.detail.latLng.lng,
      };
      void geocodeLatLng(nextPosition);
    },
    [geocodeLatLng]
  );

  return (
    <div className="space-y-2">
      <div className="h-72 overflow-hidden rounded-lg border border-border bg-muted/30">
        <Map
          defaultCenter={markerPosition}
          defaultZoom={position ? 15 : 10}
          onClick={onMapClick}
          style={{ width: '100%', height: '100%' }}
          gestureHandling="auto"
          disableDefaultUI={false}
          mapId="DEMO_MAP_ID"
        >
          {position && <Marker position={markerPosition} />}
          <MapUpdater center={markerPosition} zoom={15} shouldUpdate={Boolean(position)} />
        </Map>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        <span>{address ? `Selected: ${address}` : 'Select a place to preview it on the map.'}</span>
        <span>{position ? 'Preview updated' : 'No coordinates yet'}</span>
      </div>
    </div>
  );
}

export function TicketCreateForm({ adminName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<TicketDepartment>(TICKET_DEPARTMENT_OPTIONS[0]);
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientLocation, setClientLocation] = useState('');
  const [clientLocationLatitude, setClientLocationLatitude] = useState<number | null>(null);
  const [clientLocationLongitude, setClientLocationLongitude] = useState<number | null>(null);
  const [resolutionTargetHours, setResolutionTargetHours] =
    useState<(typeof ticketResolutionTargetHourOptions)[number]>(4);
  const [currentDateTime] = useState(() => new Date().toLocaleString());
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [files, setFiles] = useState<File[]>([]);
  const [activePreview, setActivePreview] = useState<{ file: File; url: string } | null>(null);
  const clientLocationPosition = useMemo(
    () =>
      clientLocationLatitude != null && clientLocationLongitude != null
        ? { lat: clientLocationLatitude, lng: clientLocationLongitude }
        : null,
    [clientLocationLatitude, clientLocationLongitude]
  );
  const previews = useMemo(
    () =>
      files.map(file => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach(preview => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const removeFile = useCallback((indexToRemove: number) => {
    setFiles(prev => prev.filter((_, i) => i !== indexToRemove));
  }, []);

  async function uploadFile(file: File, ticketId: string) {
    const policy = await createTicketAttachmentUploadUrlAction({
      ticketId,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    });
    await uploadFileWithPresignedPost(policy, file);

    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      s3Key: policy.key,
      s3Bucket: policy.fields.bucket,
    };
  }

  const handleClientLocationChange = useCallback((value: string) => {
    setClientLocation(value);
    setClientLocationLatitude(null);
    setClientLocationLongitude(null);
  }, []);

  const handleClientLocationSelect = useCallback((address: string, lat: number, lng: number) => {
    setClientLocation(address);
    setClientLocationLatitude(lat);
    setClientLocationLongitude(lng);
  }, []);

  function submit() {
    const descriptionText = stripHtmlToText(description);
    if (!descriptionText) {
      toast.error('Description / Problem is required');
      return;
    }

    const digits = clientContact.replace(/\D/g, '');
    if (digits.length < 7) {
      toast.error('Client contact number must contain at least 7 digits');
      return;
    }

    let generatedTitle = descriptionText.split('\n')[0]?.trim().slice(0, 80) || 'New Ticket';
    if (generatedTitle.length < 3) {
      generatedTitle = generatedTitle.padEnd(3, '.');
    }

    startTransition(() => {
      void (async () => {
        try {
          const ticket = await createTicketAction({
            title: generatedTitle,
            description,
            department: selectedDepartment,
            clientName,
            clientContact,
            clientLocation,
            resolutionTargetHours,
            priority,
          });

          if (files.length > 0) {
            const uploaded = await Promise.all(files.map(file => uploadFile(file, ticket.id)));
            await attachUploadedFilesToTicketAction(ticket.id, uploaded);
          }

          toast.success('Ticket created');
          router.push(`/admin/ticket/all?ticket=${ticket.id}`);
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to create ticket');
        }
      })();
    });
  }

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="max-w-4xl mx-auto space-y-6 px-4 py-8">
        {/* Header section (Title & Breadcrumbs) */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Create Ticket</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Ticket Command Center</span>
            <span className="text-muted-foreground/60">&gt;</span>
            <span className="text-indigo-400">Create Ticket</span>
          </div>
        </div>

        {/* Form Card */}
        <Card className="p-6 bg-card border-border text-foreground shadow-xl">
          {/* CREATE TICKET SECTION */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Create Ticket</div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Created By</span>
                <input
                  value={adminName}
                  readOnly
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">
                  Department <span className="text-red-500">*</span>
                </span>
                <select
                  value={selectedDepartment}
                  onChange={e => setSelectedDepartment(e.target.value as TicketDepartment)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500"
                >
                  {TICKET_DEPARTMENT_OPTIONS.map(department => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Priority</span>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">
                  Promised Resolution Time <span className="text-red-500">*</span>
                </span>
                <select
                  value={String(resolutionTargetHours)}
                  onChange={e =>
                    setResolutionTargetHours(
                      Number(e.target.value) as (typeof ticketResolutionTargetHourOptions)[number]
                    )
                  }
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500"
                >
                  {ticketResolutionTargetHourOptions.map(hours => (
                    <option key={hours} value={hours}>
                      {hours} {hours === 1 ? 'hour' : 'hours'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Date</span>
                <input
                  value={currentDateTime}
                  disabled
                  readOnly
                  className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                />
              </label>
            </div>
          </div>

          {/* CLIENT INFORMATION SECTION */}
          <div className="mt-8 pt-6 border-t border-border space-y-4">
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Client Information</div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">
                  Client Name <span className="text-red-500">*</span>
                </span>
                <input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500"
                  placeholder="Enter client name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">
                  Client Contact Number <span className="text-red-500">*</span>
                </span>
                <PhoneInput
                  inputName="clientContact"
                  defaultValue={clientContact}
                  onChange={value => setClientContact(value || '')}
                  placeholder="Enter contact number"
                  maxLength={18}
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-xs text-muted-foreground font-medium">
                  Client Location <span className="text-red-500">*</span>
                </span>
                <ClientLocationAutocompleteInput
                  value={clientLocation}
                  onChange={handleClientLocationChange}
                  onPlaceSelect={handleClientLocationSelect}
                />
              </label>
              <div className="col-span-2 space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Map Preview</span>
                <ClientLocationMapPreview
                  address={clientLocation}
                  position={clientLocationPosition}
                  onPlaceSelect={handleClientLocationSelect}
                />
              </div>
            </div>
          </div>

          {/* PROBLEM INFORMATION SECTION */}
          <div className="mt-8 pt-6 border-t border-border space-y-4">
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Problem Information</div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1 col-span-2">
                <span className="text-xs text-muted-foreground font-medium">
                  Problem <span className="text-red-500">*</span>
                </span>
                <TinyMceEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Describe the problem in detail..."
                  className="w-full"
                />
              </label>
              <div className="col-span-2 space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Attachments</span>
                <div className="border border-dashed border-border rounded-lg p-6 bg-background/50 hover:bg-background transition cursor-pointer flex flex-col items-center justify-center gap-2 relative">
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf"
                    onChange={e => {
                      const selected = Array.from(e.target.files ?? []);
                      setFiles(prev => [...prev, ...selected]);
                      e.target.value = '';
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <svg
                    className="w-8 h-8 text-muted-foreground/60"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <div className="text-sm font-medium text-foreground/80">Click to upload or drag and drop</div>
                  <div className="text-xs text-muted-foreground/60">Images, Videos, PDF (Max 10MB)</div>
                </div>

                {previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {previews.map(({ file, url }, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="rounded-md border border-border bg-background p-2 space-y-2 relative group cursor-pointer hover:border-indigo-500 hover:shadow-sm transition-all"
                        onClick={() => setActivePreview({ file, url })}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition shadow-sm z-10"
                          title="Remove file"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        {file.type.startsWith('image/') && (
                          <img src={url} alt={file.name} className="h-24 w-full object-cover rounded" />
                        )}
                        {file.type.startsWith('video/') && (
                          <video src={url} controls className="h-24 w-full object-cover rounded" />
                        )}
                        {!file.type.startsWith('image/') && !file.type.startsWith('video/') && (
                          <div className="h-24 w-full rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                            PDF Preview
                          </div>
                        )}
                        <p className="text-[11px] text-foreground truncate pr-6" title={file.name}>
                          {file.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => router.push('/admin/ticket/all')}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Ticket
            </Button>
          </div>
         </Card>
      </div>

      {activePreview && (
        <Modal
          isOpen={!!activePreview}
          onClose={() => setActivePreview(null)}
          title={activePreview.file.name}
          maxWidthClassName="max-w-3xl"
        >
          <div className="p-6 flex flex-col items-center justify-center bg-background text-foreground min-h-[300px]">
            {activePreview.file.type.startsWith('image/') && (
              <img
                src={activePreview.url}
                alt={activePreview.file.name}
                className="max-h-[60vh] object-contain rounded-lg border border-border bg-muted/20"
              />
            )}
            {activePreview.file.type.startsWith('video/') && (
              <video
                src={activePreview.url}
                controls
                className="max-h-[60vh] w-full object-contain rounded-lg border border-border bg-black"
              />
            )}
            {!activePreview.file.type.startsWith('image/') && !activePreview.file.type.startsWith('video/') && (
              <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-lg bg-muted/10 w-full">
                <svg className="w-16 h-16 text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-center break-all">{activePreview.file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">({Math.round(activePreview.file.size / 1024)} KB)</p>
                <a
                  href={activePreview.url}
                  download={activePreview.file.name}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition"
                >
                  Download File
                </a>
              </div>
            )}
            <div className="w-full flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                className="border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setActivePreview(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </APIProvider>
  );
}
