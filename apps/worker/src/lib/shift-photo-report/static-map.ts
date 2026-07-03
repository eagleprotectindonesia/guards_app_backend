import sharp from 'sharp';

const STATIC_MAP_BASE_URL = 'https://maps.googleapis.com/maps/api/staticmap';
const DEFAULT_TIMEOUT_MS = 5_000;
/** Google's Maps Static API hard limit on the `size` parameter per axis. */
const GOOGLE_STATIC_MAP_MAX_DIM = 640;
let warnedMissingKey = false;

export type StaticMapLatLng = { latitude: number; longitude: number };

export type SitePostLike = {
  name: string;
  latitude: number;
  longitude: number;
};

export type TrailMapPoint = StaticMapLatLng & { seq: number };

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

// ──────────────────────────────────────────────────────────────────────────
// Trail-map helpers (used by the "Movement Summary" PDF page).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Computes the Google Static Maps `path=` fragment for the site boundary.
 *  - 2+ posts: rectangle enclosing all posts (with a translucent fill).
 *  - 1 post:   small circle around the post.
 *  - 0 posts + center + radius: circle around the legacy Site center.
 *  - 0 posts and no center: returns `null` (caller should skip the boundary).
 */
export function buildSiteBoundaryPath(params: {
  sitePosts: SitePostLike[];
  siteCenter?: StaticMapLatLng | null;
  siteRadius?: number | null;
}): string | null {
  const { sitePosts, siteCenter, siteRadius } = params;
  if (sitePosts.length >= 2) {
    const lats = sitePosts.map(p => p.latitude);
    const lngs = sitePosts.map(p => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const corners: StaticMapLatLng[] = [
      { latitude: minLat, longitude: minLng },
      { latitude: minLat, longitude: maxLng },
      { latitude: maxLat, longitude: maxLng },
      { latitude: maxLat, longitude: minLng },
      { latitude: minLat, longitude: minLng },
    ];
    const encoded = encodePath(corners);
    return `color:0x1e3a8a|weight:2|fillcolor:0x1e3a8a33|${encoded}`;
  }
  if (sitePosts.length === 1) {
    const post = sitePosts[0]!;
    return `color:0x1e3a8a|weight:2|fillcolor:0x1e3a8a33|${post.latitude},${post.longitude}`;
  }
  if (siteCenter && siteRadius && siteRadius > 0) {
    return `color:0x1e3a8a|weight:2|fillcolor:0x1e3a8a33|${siteCenter.latitude},${siteCenter.longitude}`;
  }
  return null;
}

/**
 * Computes the Google Static Maps `path=` fragment for the trail polyline.
 * Returns `null` when there are fewer than 2 points (a polyline needs ≥2).
 */
export function buildTrailPath(points: TrailMapPoint[]): string | null {
  if (points.length < 2) return null;
  const encoded = encodePath(points);
  return `color:0x2563eb|weight:5|${encoded}`;
}

/**
 * Computes the Google Static Maps `markers=` fragment for numbered waypoints.
 * Google draws a small blue dot at each real coordinate; the sequence number
 * is rendered via our SVG overlay (see `overlayNumberedMarkers`).
 */
export function buildNumberedMarkers(points: TrailMapPoint[]): string | null {
  if (points.length === 0) return null;
  return points
    .map(p => `markers=color:blue|size:tiny|${p.latitude},${p.longitude}`)
    .join('&');
}

function encodePath(points: StaticMapLatLng[]): string {
  return points.map(p => `${p.latitude},${p.longitude}`).join('|');
}

export type FetchTrailMapPngParams = {
  trailPoints: TrailMapPoint[];
  sitePosts: SitePostLike[];
  siteCenter?: StaticMapLatLng | null;
  siteRadius?: number | null;
  center?: StaticMapLatLng | null;
  zoom?: number | null;
  width: number;
  height: number;
  apiKey?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * Builds the Google Static Maps URL for a trail map. Exported for unit tests
 * so the URL construction logic can be verified without a network call.
 */
export function buildTrailMapUrl(params: FetchTrailMapPngParams & { apiKey: string }): URL {
  const url = new URL(STATIC_MAP_BASE_URL);
  const center = params.center;
  const zoom = params.zoom;
  url.searchParams.set('size', `${Math.round(params.width)}x${Math.round(params.height)}`);
  if (center) url.searchParams.set('center', `${center.latitude},${center.longitude}`);
  if (zoom != null && Number.isFinite(zoom)) url.searchParams.set('zoom', String(zoom));
  const boundary = buildSiteBoundaryPath({
    sitePosts: params.sitePosts,
    siteCenter: params.siteCenter ?? null,
    siteRadius: params.siteRadius ?? null,
  });
  if (boundary) url.searchParams.append('path', boundary);
  const trail = buildTrailPath(params.trailPoints);
  if (trail) url.searchParams.append('path', trail);
  const markers = buildNumberedMarkers(params.trailPoints);
  if (markers) {
    for (const m of markers.split('&')) {
      const eq = m.indexOf('=');
      if (eq > 0) url.searchParams.append(m.slice(0, eq), m.slice(eq + 1));
    }
  }
  url.searchParams.set('key', params.apiKey);
  return url;
}

/**
 * Fetches a Google Static Maps PNG showing the guard's trail across a shift
 * (polyline + numbered waypoints) with the site boundary overlaid, then
 * composites directional arrows along the polyline. Returns `null` when no
 * API key is configured, the input is invalid, or the request fails.
 *
 * The arrow overlay is best-effort: if rendering fails the base map buffer
 * is still returned (with arrows omitted). To disable arrows, pass a single
 * trail point.
 */
export async function fetchTrailMapPng(params: FetchTrailMapPngParams): Promise<Buffer | null> {
  const apiKey = params.apiKey ?? resolveGoogleMapsApiKey();
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn('[ShiftPhotoReport] No Google Maps API key configured; skipping trail map fetch.');
      warnedMissingKey = true;
    }
    return null;
  }
  if (params.width <= 0 || params.height <= 0) return null;
  if (params.trailPoints.length === 0) return null;

  // Clamp to Google's hard limit so the returned image matches our expected
  // dimensions (the arrow overlay must be composited at the same size).
  const clampedWidth = Math.min(Math.round(params.width), GOOGLE_STATIC_MAP_MAX_DIM);
  const clampedHeight = Math.min(Math.round(params.height), GOOGLE_STATIC_MAP_MAX_DIM);
  const clampedParams = { ...params, width: clampedWidth, height: clampedHeight };

  const url = buildTrailMapUrl({ ...clampedParams, apiKey });

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = params.signal
    ? composeAbortSignals(params.signal, controller.signal)
    : controller.signal;
  let baseBuffer: Buffer;
  try {
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    baseBuffer = Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!params.center || params.zoom == null || !Number.isFinite(params.zoom)) return baseBuffer;

  // Plan marker placements (may stagger overlapping markers)
  const placements = planMarkerPlacement({
    trailPoints: params.trailPoints,
    center: params.center,
    zoom: params.zoom,
    imageWidth: clampedWidth,
    imageHeight: clampedHeight,
  });

  let result = baseBuffer;

  // Overlay directional arrows (for 2+ trail points)
  if (params.trailPoints.length >= 2) {
    result = await overlayDirectionArrows({
      mapBuffer: result,
      trailPoints: params.trailPoints,
      center: params.center,
      zoom: params.zoom,
      imageWidth: clampedWidth,
      imageHeight: clampedHeight,
    });
  }

  // Overlay numbered markers
  if (placements.length > 0) {
    result = await overlayNumberedMarkers({
      mapBuffer: result,
      placements,
      imageWidth: clampedWidth,
      imageHeight: clampedHeight,
    });
  }

  return result;
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

// ──────────────────────────────────────────────────────────────────────────
// Directional arrow overlay
// ──────────────────────────────────────────────────────────────────────────

const TILE_SIZE = 256;

export type PixelPoint = { x: number; y: number };

/**
 * Web Mercator projection at a given zoom. Returns absolute pixel
 * coordinates on the global 256×2^zoom tile grid.
 */
function latLngToWorldPixel(lat: number, lng: number, zoom: number): PixelPoint {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Projects a list of trail points to image-pixel space (top-left origin)
 * using the same center+zoom that built the static map. The result aligns
 * with where Google actually rendered the points on the PNG.
 */
export function projectTrailToPixels(params: {
  trailPoints: TrailMapPoint[];
  center: StaticMapLatLng;
  zoom: number;
  imageWidth: number;
  imageHeight: number;
}): PixelPoint[] {
  const { trailPoints, center, zoom, imageWidth, imageHeight } = params;
  if (trailPoints.length === 0 || !Number.isFinite(zoom)) return [];
  const centerWorld = latLngToWorldPixel(center.latitude, center.longitude, zoom);
  const scaleX = imageWidth / TILE_SIZE;
  const scaleY = imageHeight / TILE_SIZE;
  return trailPoints.map(p => {
    const world = latLngToWorldPixel(p.latitude, p.longitude, zoom);
    return {
      x: imageWidth / 2 + (world.x - centerWorld.x) * scaleX,
      y: imageHeight / 2 + (world.y - centerWorld.y) * scaleY,
    };
  });
}

export type ArrowStyle = {
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  minSegmentPx?: number;
};

const DEFAULT_ARROW_STYLE: Required<ArrowStyle> = {
  size: 14,
  fill: '#FFFFFF',
  stroke: '#1E3A8A',
  strokeWidth: 1.2,
  minSegmentPx: 18,
};

/**
 * Builds an SVG string with one filled triangle per trail segment, pointing
 * in the direction of travel. Segments shorter than `minSegmentPx` are
 * skipped to avoid clutter. Exported for unit testing.
 */
export function buildArrowOverlaySvg(
  pixels: PixelPoint[],
  imageWidth: number,
  imageHeight: number,
  style: ArrowStyle = {},
): string {
  const s = { ...DEFAULT_ARROW_STYLE, ...style };
  const triangles: string[] = [];
  for (let i = 0; i < pixels.length - 1; i++) {
    const a = pixels[i]!;
    const b = pixels[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < s.minSegmentPx) continue;
    const angle = Math.atan2(dy, dx);
    // Place the arrow 55% along the segment so the next segment's arrow
    // doesn't visually overlap.
    const cx = a.x + dx * 0.55;
    const cy = a.y + dy * 0.55;
    const half = s.size / 2;
    // Triangle vertices in local space (apex at +x, base perpendicular).
    const verts: [number, number][] = [
      [s.size / 2, 0],
      [-s.size / 2, -half],
      [-s.size / 2, half],
    ];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotated = verts.map(([vx, vy]) => ({
      x: cx + vx * cos - vy * sin,
      y: cy + vx * sin + vy * cos,
    }));
    const points = rotated.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    triangles.push(
      `<polygon points="${points}" fill="${s.fill}" fill-opacity="0.92" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linejoin="round" />`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">${triangles.join('')}</svg>`;
}

/**
 * Composites a directional-arrow overlay onto an existing map PNG buffer.
 * Returns the original buffer when there are fewer than 2 trail points, the
 * center/zoom is missing, or the overlay render fails (so the caller still
 * gets a usable map).
 *
 * The arrow SVG is created at the **actual** buffer dimensions (read via
 * sharp metadata), not the requested `imageWidth`/`imageHeight`. This handles
 * cases where Google returns a smaller image (e.g. their 640px hard limit)
 * than what was requested, or when a caller passes a pre-scaled buffer.
 */
export async function overlayDirectionArrows(params: {
  mapBuffer: Buffer;
  trailPoints: TrailMapPoint[];
  center: StaticMapLatLng | null | undefined;
  zoom: number | null | undefined;
  imageWidth: number;
  imageHeight: number;
  style?: ArrowStyle;
}): Promise<Buffer> {
  const { mapBuffer, trailPoints, center, zoom, style } = params;
  if (trailPoints.length < 2) return mapBuffer;
  if (!center || zoom == null || !Number.isFinite(zoom)) return mapBuffer;

  // Use the actual buffer dimensions, which may differ from the requested
  // imageWidth/imageHeight when Google clamps to its hard limit.
  let actualWidth = params.imageWidth;
  let actualHeight = params.imageHeight;
  try {
    const meta = await sharp(mapBuffer).metadata();
    if (meta.width && meta.height && meta.width > 0 && meta.height > 0) {
      actualWidth = meta.width;
      actualHeight = meta.height;
    }
  } catch {
    // Fall through with the requested dimensions — the projection will be
    // slightly off but the composite will succeed.
  }
  if (actualWidth <= 0 || actualHeight <= 0) return mapBuffer;

  const pixels = projectTrailToPixels({
    trailPoints,
    center,
    zoom,
    imageWidth: actualWidth,
    imageHeight: actualHeight,
  });
  if (pixels.length < 2) return mapBuffer;

  const svg = buildArrowOverlaySvg(pixels, actualWidth, actualHeight, style);
  const arrowPng = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(mapBuffer)
    .composite([{ input: arrowPng, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ──────────────────────────────────────────────────────────────────────────
// Numbered-marker overlay
// ──────────────────────────────────────────────────────────────────────────

export type MarkerPlacement = {
  seq: number;
  realX: number;
  realY: number;
  labelX: number;
  labelY: number;
  isStaggered: boolean;
};

const MARKER_STAGGER_THRESHOLD_PX = 28;
const MARKER_STAGGER_OFFSET_PX = 14;
const MARKER_CIRCLE_RADIUS = 12;

/**
 * Plans the placement of numbered markers on the trail map.
 *
 * Projects trail points to pixel space, then detects pairs whose projected
 * distance is below `MARKER_STAGGER_THRESHOLD_PX` (28 px). Markers in such
 * pairs are staggered by `MARKER_STAGGER_OFFSET_PX` (14 px) away from the
 * cluster centroid, and a thin leader line is drawn from the offset label
 * back to the real projected coordinate.
 *
 * When all items in the cluster share nearly the same pixel position
 * (dist < 1 px), markers are spread radially around the cluster centroid.
 * Edge-clamping ensures no label is pushed off the image.
 */
export function planMarkerPlacement(params: {
  trailPoints: TrailMapPoint[];
  center: StaticMapLatLng;
  zoom: number;
  imageWidth: number;
  imageHeight: number;
}): MarkerPlacement[] {
  const { trailPoints, center, zoom, imageWidth, imageHeight } = params;
  if (trailPoints.length === 0) return [];

  const pixels = projectTrailToPixels({ trailPoints, center, zoom, imageWidth, imageHeight });
  if (pixels.length === 0) return [];

  if (pixels.length === 1) {
    return [{
      seq: trailPoints[0]!.seq,
      realX: pixels[0]!.x,
      realY: pixels[0]!.y,
      labelX: pixels[0]!.x,
      labelY: pixels[0]!.y,
      isStaggered: false,
    }];
  }

  const needsStagger = new Set<number>();
  for (let i = 0; i < pixels.length; i++) {
    for (let j = i + 1; j < pixels.length; j++) {
      if (Math.hypot(pixels[j]!.x - pixels[i]!.x, pixels[j]!.y - pixels[i]!.y) < MARKER_STAGGER_THRESHOLD_PX) {
        needsStagger.add(i);
        needsStagger.add(j);
      }
    }
  }

  if (needsStagger.size === 0) {
    return trailPoints.map((p, i) => ({
      seq: p.seq,
      realX: pixels[i]!.x,
      realY: pixels[i]!.y,
      labelX: pixels[i]!.x,
      labelY: pixels[i]!.y,
      isStaggered: false,
    }));
  }

  // Staggered markers: offset away from the cluster centroid
  const clusterIndices = [...needsStagger].sort((a, b) => a - b);
  const centroidX = clusterIndices.reduce((s, i) => s + pixels[i]!.x, 0) / clusterIndices.length;
  const centroidY = clusterIndices.reduce((s, i) => s + pixels[i]!.y, 0) / clusterIndices.length;

  const margin = MARKER_STAGGER_OFFSET_PX + MARKER_CIRCLE_RADIUS;

  return trailPoints.map((p, i) => {
    if (!needsStagger.has(i)) {
      return {
        seq: p.seq,
        realX: pixels[i]!.x,
        realY: pixels[i]!.y,
        labelX: pixels[i]!.x,
        labelY: pixels[i]!.y,
        isStaggered: false,
      };
    }

    const dx = pixels[i]!.x - centroidX;
    const dy = pixels[i]!.y - centroidY;
    const dist = Math.hypot(dx, dy);

    let offsetX: number;
    let offsetY: number;

    if (dist < 1) {
      // All points at virtually the same pixel — radial spread
      const angle = (2 * Math.PI * clusterIndices.indexOf(i)) / clusterIndices.length;
      offsetX = Math.cos(angle) * MARKER_STAGGER_OFFSET_PX;
      offsetY = Math.sin(angle) * MARKER_STAGGER_OFFSET_PX;
    } else {
      const normX = dx / dist;
      const normY = dy / dist;
      offsetX = normX * MARKER_STAGGER_OFFSET_PX;
      offsetY = normY * MARKER_STAGGER_OFFSET_PX;
    }

    // Try the primary direction; if it clips, try three fallback directions
    const directions: [number, number][] = [
      [offsetX, offsetY],
      [-offsetX, -offsetY],
      [offsetX, -offsetY],
      [-offsetX, offsetY],
    ];

    let labelX = pixels[i]!.x + offsetX;
    let labelY = pixels[i]!.y + offsetY;

    for (const [dxx, dyy] of directions) {
      const lx = pixels[i]!.x + dxx;
      const ly = pixels[i]!.y + dyy;
      if (lx >= margin && lx <= imageWidth - margin && ly >= margin && ly <= imageHeight - margin) {
        labelX = lx;
        labelY = ly;
        break;
      }
    }

    labelX = Math.max(margin, Math.min(imageWidth - margin, labelX));
    labelY = Math.max(margin, Math.min(imageHeight - margin, labelY));

    return {
      seq: p.seq,
      realX: pixels[i]!.x,
      realY: pixels[i]!.y,
      labelX,
      labelY,
      isStaggered: true,
    };
  });
}

export type NumberedMarkerStyle = {
  circleRadius?: number;
  circleFill?: string;
  circleStroke?: string;
  circleStrokeWidth?: number;
  textFont?: string;
  textColor?: string;
  textSize?: number;
  leaderColor?: string;
  leaderWidth?: number;
  leaderOpacity?: number;
};

const DEFAULT_MARKER_STYLE: Required<NumberedMarkerStyle> = {
  circleRadius: MARKER_CIRCLE_RADIUS,
  circleFill: '#FFFFFF',
  circleStroke: '#1E3A8A',
  circleStrokeWidth: 1.5,
  textFont: 'Arial, sans-serif',
  textColor: '#1E3A8A',
  textSize: 10,
  leaderColor: '#1E3A8A',
  leaderWidth: 1,
  leaderOpacity: 0.6,
};

/**
 * Builds an SVG string with numbered circles and optional leader lines for
 * the trail-map marker overlay. Exported for unit testing.
 */
export function buildNumberedMarkersSvg(
  placements: MarkerPlacement[],
  imageWidth: number,
  imageHeight: number,
  style: NumberedMarkerStyle = {},
): string {
  const s = { ...DEFAULT_MARKER_STYLE, ...style };
  const lines: string[] = [];
  const circles: string[] = [];

  for (const p of placements) {
    if (p.isStaggered) {
      lines.push(
        `<line x1="${p.realX.toFixed(1)}" y1="${p.realY.toFixed(1)}" x2="${p.labelX.toFixed(1)}" y2="${p.labelY.toFixed(1)}" stroke="${s.leaderColor}" stroke-width="${s.leaderWidth}" stroke-opacity="${s.leaderOpacity}" stroke-linecap="round" />`,
      );
    }
    circles.push(
      `<circle cx="${p.labelX.toFixed(1)}" cy="${p.labelY.toFixed(1)}" r="${s.circleRadius}" fill="${s.circleFill}" stroke="${s.circleStroke}" stroke-width="${s.circleStrokeWidth}" />`,
      `<text x="${p.labelX.toFixed(1)}" y="${p.labelY.toFixed(1)}" fill="${s.textColor}" font-family="${s.textFont}" font-size="${s.textSize}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${p.seq}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">${lines.join('')}${circles.join('')}</svg>`;
}

/**
 * Composites a numbered-marker overlay onto an existing map PNG buffer.
 * Returns the original buffer when the placements array is empty or the
 * overlay render fails (so the caller still gets a usable map).
 *
 * Like `overlayDirectionArrows`, the SVG is created at the **actual** buffer
 * dimensions (read via sharp metadata), not the requested `imageWidth`/
 * `imageHeight`, which handles Google's 640px clamp.
 */
export async function overlayNumberedMarkers(params: {
  mapBuffer: Buffer;
  placements: MarkerPlacement[];
  imageWidth: number;
  imageHeight: number;
  style?: NumberedMarkerStyle;
}): Promise<Buffer> {
  const { mapBuffer, placements, style } = params;
  if (placements.length === 0) return mapBuffer;

  let actualWidth = params.imageWidth;
  let actualHeight = params.imageHeight;
  try {
    const meta = await sharp(mapBuffer).metadata();
    if (meta.width && meta.height && meta.width > 0 && meta.height > 0) {
      actualWidth = meta.width;
      actualHeight = meta.height;
    }
  } catch {
    // Fall through with the requested dimensions
  }
  if (actualWidth <= 0 || actualHeight <= 0) return mapBuffer;

  const svg = buildNumberedMarkersSvg(placements, actualWidth, actualHeight, style);
  try {
    const markerPng = await sharp(Buffer.from(svg)).png().toBuffer();
    return sharp(mapBuffer)
      .composite([{ input: markerPng, top: 0, left: 0 }])
      .png()
      .toBuffer();
  } catch {
    return mapBuffer;
  }
}
