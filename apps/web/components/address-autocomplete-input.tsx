'use client';

import { useEffect, useRef } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';

function AutocompleteInput({
  value,
  placeholder,
  onFocus,
  onChange,
  onPlaceSelect,
}: {
  value: string;
  placeholder?: string;
  onFocus?: () => void;
  onChange: (value: string) => void;
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');
  const onPlaceSelectRef = useRef(onPlaceSelect);

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

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
      onPlaceSelectRef.current(address, lat, lng);
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [placesLib]);

  return (
    <input
      ref={inputRef}
      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
      value={value}
      onFocus={onFocus}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || 'Enter address...'}
    />
  );
}

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function AddressAutocompleteInput(props: {
  value: string;
  placeholder?: string;
  onFocus?: () => void;
  onChange: (value: string) => void;
  onPlaceSelect: (address: string, lat: number, lng: number) => void;
}) {
  return (
    <APIProvider apiKey={apiKey}>
      <AutocompleteInput {...props} />
    </APIProvider>
  );
}
