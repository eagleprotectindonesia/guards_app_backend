const STATIC_MAP_BASE_URL = 'https://maps.googleapis.com/maps/api/staticmap';
const DEFAULT_TIMEOUT_MS = 5_000;
let warnedMissingKey = false;

export function resolveGoogleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_STATIC_API_KEY
    ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    ?? null;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export async function fetchStaticMapPng(params: {
  lat: number;
  lng: number;
  width: number;
  height: number;
  apiKey?: string | null;
  zoom?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<Buffer | null> {
  const apiKey = params.apiKey ?? resolveGoogleMapsApiKey();
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn('[ShiftPhotoReport] No Google Maps API key configured; skipping static map fetch.');
      warnedMissingKey = true;
    }
    return null;
  }
  if (!Number.isFinite(params.lat) || !Number.isFinite(params.lng)) return null;
  if (params.width <= 0 || params.height <= 0) return null;

  const url = new URL(STATIC_MAP_BASE_URL);
  url.searchParams.set('center', `${params.lat},${params.lng}`);
  url.searchParams.set('zoom', String(params.zoom ?? 17));
  url.searchParams.set('size', `${Math.round(params.width)}x${Math.round(params.height)}`);
  url.searchParams.set('markers', `color:red|${params.lat},${params.lng}`);
  url.searchParams.set('key', apiKey);

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = params.signal
    ? composeAbortSignals(params.signal, controller.signal)
    : controller.signal;
  try {
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function composeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}
