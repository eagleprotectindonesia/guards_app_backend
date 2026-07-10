export type LatLng = { latitude: number; longitude: number };

export type SitePost = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type LocationPoint = {
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

export type ResolvedPoint = {
  timestamp: Date;
  pointName: string;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestPointName(point: LatLng, posts: SitePost[]): string | null {
  if (posts.length === 0) return null;
  let best: { name: string; distance: number } | null = null;
  for (const post of posts) {
    const d = haversineMeters(point, { latitude: post.latitude, longitude: post.longitude });
    if (best === null || d < best.distance) {
      best = { name: post.name, distance: d };
    }
  }
  return best?.name ?? null;
}

export function pickFirstAndLast(points: LocationPoint[]): { first: LocationPoint | null; last: LocationPoint | null } {
  if (points.length === 0) return { first: null, last: null };
  let first = points[0]!;
  let last = points[0]!;
  for (const p of points) {
    if (p.timestamp.getTime() < first.timestamp.getTime()) first = p;
    if (p.timestamp.getTime() > last.timestamp.getTime()) last = p;
  }
  return { first, last };
}

export function resolveNamedPoint(point: LocationPoint, posts: SitePost[]): ResolvedPoint {
  const name = nearestPointName(point, posts);
  return {
    timestamp: point.timestamp,
    pointName: name ?? 'On Site',
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

export type GeofenceSite = {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  enabled: boolean;
};

export type BoundarySite = {
  latitude: number | null;
  longitude: number | null;
  sitePosts: SitePost[];
  maxDistanceMeters: number;
  geofenceStatusEnabled: boolean;
};

/**
 * A shift is treated as "ended by the system" (the auto-completion worker
 * at shifts.ts:1489) when no Checkin with location occurs within this many
 * minutes of the shift's scheduled `endsAt`. In that case the last location
 * falls back to the most recent chat message with coordinates.
 */
export const LOCATION_END_GRACE_MINUTES = 5;

export type LocationSources = {
  attendancePoint: LocationPoint | null;
  checkinPoints: LocationPoint[];
  chatPoints: LocationPoint[];
};

export type FirstAndLast = {
  first: ResolvedPoint | null;
  last: ResolvedPoint | null;
};

/**
 * Picks the first and last location for the cover page.
 *
 *   first: Attendance location (if present) → earliest checkin (fallback) → null.
 *          We do NOT fall back to chat for the first location: the chat stream
 *          isn't a reliable start-of-shift signal.
 *
 *   last:  If at least one checkin is at or after (endsAt - LOCATION_END_GRACE_MINUTES)
 *          the shift was manually checked out → use the latest checkin.
 *          Otherwise (no checkin near the end, OR no checkins at all) the shift
 *          was system-ended → use the latest chat message with location.
 */
export function resolveFirstAndLastLocation(
  sources: LocationSources,
  sitePosts: SitePost[],
  shiftEndsAt: Date,
): FirstAndLast {
  const { attendancePoint, checkinPoints, chatPoints } = sources;

  let firstRaw: LocationPoint | null = null;
  if (attendancePoint) {
    firstRaw = attendancePoint;
  } else if (checkinPoints.length > 0) {
    firstRaw = pickEarliest(checkinPoints);
  }

  const graceMs = LOCATION_END_GRACE_MINUTES * 60_000;
  const graceCutoff = new Date(shiftEndsAt.getTime() - graceMs);
  const inWindow = checkinPoints.filter(p => p.timestamp.getTime() >= graceCutoff.getTime());

  let lastRaw: LocationPoint | null = null;
  if (inWindow.length > 0) {
    lastRaw = pickLatest(inWindow);
  } else if (chatPoints.length > 0) {
    lastRaw = pickLatest(chatPoints);
  }

  return {
    first: firstRaw ? resolveNamedPoint(firstRaw, sitePosts) : null,
    last: lastRaw ? resolveNamedPoint(lastRaw, sitePosts) : null,
  };
}

function pickEarliest(points: LocationPoint[]): LocationPoint {
  let best = points[0]!;
  for (const p of points) {
    if (p.timestamp.getTime() < best.timestamp.getTime()) best = p;
  }
  return best;
}

function pickLatest(points: LocationPoint[]): LocationPoint {
  let best = points[0]!;
  for (const p of points) {
    if (p.timestamp.getTime() > best.timestamp.getTime()) best = p;
  }
  return best;
}

export function summarizeGeofence(points: LocationPoint[], site: GeofenceSite): string {
  if (!site.enabled) {
    return 'Geofence monitoring disabled for this site.';
  }
  if (site.latitude == null || site.longitude == null) {
    return 'Site geofence coordinates are not configured.';
  }
  if (points.length === 0) {
    return 'No GPS records available for this shift.';
  }
  const center = { latitude: site.latitude, longitude: site.longitude };
  const outside = points.filter(p => haversineMeters(center, p) > site.radius).length;
  if (outside === 0) {
    return `All ${points.length} GPS records are within the expected site/escort boundary.`;
  }
  return `${outside} of ${points.length} GPS records are outside the expected site boundary.`;
}

/**
 * Boundary check matching the logic used by the attendance + checkin routes
 * (`findNearestAllowedSiteLocation` in `apps/web/lib/site-post-location.ts`):
 * a point is "within boundary" if it sits within `maxDistanceMeters` of any
 * active `SitePost`. Falls back to the single legacy `Site` center when no
 * posts are configured. `maxDistanceMeters` comes from the
 * `MAX_CHECKIN_DISTANCE_METERS` system setting (the same one the mobile
 * app reads when guards record attendance/checkin).
 */
export function summarizeSiteBoundary(points: LocationPoint[], site: BoundarySite): string {
  if (!site.geofenceStatusEnabled) {
    return 'Geofence monitoring disabled for this site.';
  }

  type Candidate = { latitude: number; longitude: number };
  const candidates: Candidate[] = site.sitePosts.length > 0
    ? site.sitePosts.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
    : site.latitude != null && site.longitude != null
      ? [{ latitude: site.latitude, longitude: site.longitude }]
      : [];

  if (candidates.length === 0) {
    return 'Site geofence coordinates are not configured.';
  }
  if (points.length === 0) {
    return 'No GPS records available for this shift.';
  }

  let outside = 0;
  for (const p of points) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const d = haversineMeters(p, c);
      if (d < nearest) nearest = d;
    }
    if (nearest > site.maxDistanceMeters) outside++;
  }

  if (outside === 0) {
    return `All ${points.length} GPS records are within the expected site/escort boundary.`;
  }
  return `${outside} of ${points.length} GPS records are outside the expected site boundary.`;
}

export type GeofenceResultLabel =
  | 'inside'
  | 'outside'
  | 'disabled'
  | 'unconfigured'
  | 'no-location';

export type GeofenceContext = {
  latitude: number | null;
  longitude: number | null;
  sitePosts: SitePost[];
  maxDistanceMeters: number;
  geofenceStatusEnabled: boolean;
};

/**
 * Per-photo geofence check used by the photo evidence page. Mirrors the
 * candidate-pool rules from `summarizeSiteBoundary`, but returns a discrete
 * label so the PDF table can render the result as a fixed string.
 */
export function computeGeofenceStatus(
  point: LatLng | null,
  site: GeofenceContext,
): GeofenceResultLabel {
  if (!point) return 'no-location';
  if (!site.geofenceStatusEnabled) return 'disabled';

  const candidates: LatLng[] = site.sitePosts.length > 0
    ? site.sitePosts.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
    : site.latitude != null && site.longitude != null
      ? [{ latitude: site.latitude, longitude: site.longitude }]
      : [];

  if (candidates.length === 0) return 'unconfigured';
  if (!Number.isFinite(site.maxDistanceMeters) || site.maxDistanceMeters <= 0) return 'unconfigured';

  let nearest = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = haversineMeters(point, c);
    if (d < nearest) nearest = d;
  }
  return nearest <= site.maxDistanceMeters ? 'inside' : 'outside';
}

export function geofenceStatusLabel(status: GeofenceResultLabel): string {
  switch (status) {
    case 'inside': return 'Inside assigned site boundary';
    case 'outside': return 'Outside assigned site boundary';
    case 'disabled': return 'Geofence monitoring disabled for this site.';
    case 'unconfigured': return 'Site geofence coordinates are not configured.';
    case 'no-location': return '-';
  }
}

/**
 * Resolves the human-readable location name for a photo:
 *   1. If the site has exactly one SitePost → "Main Site" (the post is the whole site).
 *   2. If the photo carries coordinates → nearest SitePost name, else "On Site".
 *   3. If there's no point, fall back to the attendance's stored `matchedLocation.name`.
 *   4. Final fallback: "On Site".
 */
export function resolveLocationName(
  point: LatLng | null,
  attendanceMatchedName: string | null,
  sitePosts: SitePost[],
  siteName: string | null = null,
): string {
  // 1. Attendance photo — use the pre-resolved post name from check-in time.
  if (attendanceMatchedName && attendanceMatchedName.trim().length > 0) {
    return attendanceMatchedName.trim();
  }
  // 2. Multi-post site: nearest SitePost by haversine.
  if (sitePosts.length >= 2 && point) {
    const name = nearestPointName(point, sitePosts);
    if (name) return name;
  }
  // 3. Fallback to site name for any unresolved case
  //    (0 posts, 1 post, no coords, out-of-range point).
  if (siteName && siteName.trim().length > 0) return siteName.trim();
  // 4. Defensive last-resort fallback.
  return 'On Site';
}

// ────────────────────────────────────────────────────────────────────────────
// Movement-trail helpers (used by the "Movement Summary" PDF page).
// ────────────────────────────────────────────────────────────────────────────

export type TrailPointType = 'attendance' | 'checkin' | 'photo' | 'location_share';

export type TrailPoint = {
  seq: number;
  timestamp: Date;
  type: TrailPointType;
  area: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  distanceFromNearestPostMeters: number | null;
  remarks: string | null;
};

export type TrailSourcePoint = LocationPoint & {
  remarks?: string | null;
  hasPhotoAttachment?: boolean;
};

export type TrailSources = {
  attendancePoint: TrailSourcePoint | null;
  checkinPoints: TrailSourcePoint[];
  chatPoints: TrailSourcePoint[];
};

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

const BBOX_PADDING_RATIO = 0.2;
const MIN_BBOX_SPAN_DEG = 0.00009;

export function computeBoundingBox(points: LatLng[]): BoundingBox | null {
  if (points.length === 0) return null;
  let minLat = points[0]!.latitude;
  let maxLat = points[0]!.latitude;
  let minLng = points[0]!.longitude;
  let maxLng = points[0]!.longitude;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }
  let latSpan = maxLat - minLat;
  let lngSpan = maxLng - minLng;
  if (latSpan < MIN_BBOX_SPAN_DEG) {
    const pad = MIN_BBOX_SPAN_DEG / 2;
    minLat -= pad;
    maxLat += pad;
    latSpan = MIN_BBOX_SPAN_DEG;
  }
  if (lngSpan < MIN_BBOX_SPAN_DEG) {
    const pad = MIN_BBOX_SPAN_DEG / 2;
    minLng -= pad;
    maxLng += pad;
    lngSpan = MIN_BBOX_SPAN_DEG;
  }
  const latPad = latSpan * BBOX_PADDING_RATIO;
  const lngPad = lngSpan * BBOX_PADDING_RATIO;
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

const MERCATOR_RANGE = 256;

function bboxToMercatorZoom(latSpan: number, lngSpan: number, imageWidth: number, imageHeight: number): number {
  const latFraction = latSpan / 360;
  const lngFraction = lngSpan / 360;
  const latZoom = Math.log2(MERCATOR_RANGE / (latFraction * imageHeight));
  const lngZoom = Math.log2(MERCATOR_RANGE / (lngFraction * imageWidth));
  return Math.min(latZoom, lngZoom);
}

export function bboxToZoomLevel(bbox: BoundingBox, imageWidth: number, imageHeight: number): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 17;
  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;
  if (latSpan <= 0 || lngSpan <= 0) return 17;
  const zoom = bboxToMercatorZoom(latSpan, lngSpan, imageWidth, imageHeight);
  if (!Number.isFinite(zoom)) return 17;
  return Math.max(1, Math.min(20, Math.floor(zoom)));
}

export function bboxCenter(bbox: BoundingBox): LatLng {
  return {
    latitude: (bbox.minLat + bbox.maxLat) / 2,
    longitude: (bbox.minLng + bbox.maxLng) / 2,
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * Returns the set of trail-point indices whose adjacent segment is
 * > `threshold × median(segmentLengths)`. Both endpoints of every outlier
 * segment are included so the bbox can drop them. With fewer than 2 trail
 * points (no segments), or when the median is 0 (all points coincide), the
 * returned set is empty — outlier detection is skipped in those cases.
 */
export function findOutlierTrailIndices(
  trailPoints: LatLng[],
  threshold: number = 5,
): Set<number> {
  if (trailPoints.length < 2) return new Set();
  const segments: number[] = [];
  for (let i = 0; i < trailPoints.length - 1; i++) {
    segments.push(haversineMeters(trailPoints[i]!, trailPoints[i + 1]!));
  }
  const median = computeMedian(segments);
  if (median <= 0 || !Number.isFinite(median)) return new Set();
  const limit = median * threshold;
  const outliers = new Set<number>();
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]! > limit) {
      outliers.add(i);
      outliers.add(i + 1);
    }
  }
  return outliers;
}

/**
 * Bbox of site posts + trail points, with outlier trail endpoints dropped
 * (see `findOutlierTrailIndices`). Site posts are always included. The
 * returned bbox is meant for the map's `center` + `zoom` calculation only —
 * the full polyline is still drawn on top of the map using all trail
 * points, so outlier movements remain visible (just at the edge of the
 * frame).
 */
export function computeTrailBoundingBox(params: {
  trailPoints: LatLng[];
  sitePosts: LatLng[];
  threshold?: number;
}): BoundingBox | null {
  const { trailPoints, sitePosts, threshold = 5 } = params;
  const outliers = findOutlierTrailIndices(trailPoints, threshold);
  const kept: LatLng[] = trailPoints.filter((_, i) => !outliers.has(i));
  return computeBoundingBox([...sitePosts, ...kept]);
}

function distanceToNearestPostMeters(point: LatLng, posts: SitePost[], fallbackCenter: LatLng | null): number | null {
  if (posts.length === 0) {
    return fallbackCenter ? haversineMeters(point, fallbackCenter) : null;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const post of posts) {
    const d = haversineMeters(point, { latitude: post.latitude, longitude: post.longitude });
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}

function resolveTrailAreaName(
  point: LatLng,
  sitePosts: SitePost[],
  siteName: string | null,
): string {
  if (sitePosts.length >= 2) {
    const name = nearestPointName(point, sitePosts);
    if (name) return name;
  }
  if (siteName && siteName.trim().length > 0) return siteName.trim();
  return 'On Site';
}

/**
 * Merges attendance, check-in, and chat-message location points into a single
 * chronologically sorted trail. Each entry resolves to a human-readable area
 * name (nearest post for multi-post sites, site name otherwise) and the
 * distance to the nearest site post (or site center if no posts).
 */
export function buildLocationTrail(
  sources: TrailSources,
  sitePosts: SitePost[],
  options: {
    siteName?: string | null;
    siteCenter?: LatLng | null;
  } = {},
): TrailPoint[] {
  const siteName = options.siteName ?? null;
  const siteCenter = options.siteCenter ?? null;

  type Tagged = TrailSourcePoint & { type: TrailPointType };
  const tagged: Tagged[] = [];
  if (sources.attendancePoint) tagged.push({ ...sources.attendancePoint, type: 'attendance' });
  for (const p of sources.checkinPoints) tagged.push({ ...p, type: 'checkin' });
  for (const p of sources.chatPoints) tagged.push({ ...p, type: p.hasPhotoAttachment ? 'photo' : 'location_share' });

  tagged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return tagged.map((p, idx) => {
    const latlng: LatLng = { latitude: p.latitude, longitude: p.longitude };
    return {
      seq: idx + 1,
      timestamp: p.timestamp,
      type: p.type,
      area: resolveTrailAreaName(latlng, sitePosts, siteName),
      latitude: p.latitude,
      longitude: p.longitude,
      accuracyMeters: p.accuracyMeters ?? null,
      distanceFromNearestPostMeters: distanceToNearestPostMeters(latlng, sitePosts, siteCenter),
      remarks: p.remarks ?? null,
    };
  });
}

export function trailPointTypeLabel(type: TrailPointType): string {
  switch (type) {
    case 'attendance': return 'Attendance';
    case 'checkin': return 'Check-in';
    case 'photo': return 'Photo evidence';
    case 'location_share': return 'Location share';
  }
}
