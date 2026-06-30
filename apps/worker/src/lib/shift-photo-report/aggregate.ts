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
