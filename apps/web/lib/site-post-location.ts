function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceMeters(
  fromLat?: number | null,
  fromLng?: number | null,
  toLat?: number | null,
  toLng?: number | null,
) {
  if (
    fromLat == null ||
    fromLng == null ||
    toLat == null ||
    toLng == null ||
    Number.isNaN(fromLat) ||
    Number.isNaN(fromLng) ||
    Number.isNaN(toLat) ||
    Number.isNaN(toLng)
  ) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

type LatLng = {
  lat: number;
  lng: number;
};

type LegacySiteLike = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type SitePostLike = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status?: boolean | null;
  deletedAt?: Date | string | null;
};

type SiteWithPostsLike = LegacySiteLike & {
  posts?: SitePostLike[];
};

type MatchedSiteLocation = {
  type: 'post' | 'legacy_site' | 'escort_end';
  id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

export function isEndOfShiftWindow(
  now: Date,
  endsAt: Date,
  intervalMins: number,
  graceMins: number
): boolean {
  const lateWindowMs = (intervalMins + graceMins) * 60000;
  const lateWindowStart = endsAt.getTime() - lateWindowMs;
  const nowMs = now.getTime();
  return nowMs >= lateWindowStart;
}

type CandidateSiteLocation = Omit<MatchedSiteLocation, 'distanceMeters'>;

export function findNearestAllowedSiteLocation(params: {
  site: SiteWithPostsLike;
  employeeLocation: LatLng;
  maxDistanceMeters: number;
  calculateDistance: (lat1: number, lng1: number, lat2: number, lng2: number) => number;
  extraCandidates?: CandidateSiteLocation[];
}): {
  matchedLocation: MatchedSiteLocation | null;
  nearestLocation: MatchedSiteLocation | null;
} {
  const { site, employeeLocation, maxDistanceMeters, calculateDistance, extraCandidates } = params;

  const activePosts = (site.posts ?? []).filter(post => post.status !== false && !post.deletedAt);

  const candidates: CandidateSiteLocation[] = [
    ...(activePosts.length > 0
      ? activePosts.map(post => ({
          type: 'post' as const,
          id: post.id,
          name: post.name,
          latitude: post.latitude,
          longitude: post.longitude,
        }))
      : site.latitude != null && site.longitude != null
        ? [
            {
              type: 'legacy_site' as const,
              id: null,
              name: site.name,
              latitude: site.latitude,
              longitude: site.longitude,
            },
          ]
        : []),
    ...(extraCandidates ?? []),
  ];

  if (candidates.length === 0) {
    return { matchedLocation: null, nearestLocation: null };
  }

  let nearestLocation: MatchedSiteLocation | null = null;

  for (const candidate of candidates) {
    const distanceMeters = calculateDistance(
      employeeLocation.lat,
      employeeLocation.lng,
      candidate.latitude,
      candidate.longitude
    );

    if (!nearestLocation || distanceMeters < nearestLocation.distanceMeters) {
      nearestLocation = {
        ...candidate,
        distanceMeters,
      };
    }
  }

  if (!nearestLocation) {
    return { matchedLocation: null, nearestLocation: null };
  }

  const matchedLocation = nearestLocation.distanceMeters <= maxDistanceMeters ? nearestLocation : null;
  return { matchedLocation, nearestLocation };
}

export type NearestPunchTarget = {
  type: 'post' | 'legacy_site';
  id: string | null;
  name: string;
  latitude: number;
  longitude: number;
};

export function getNearestActivePunchTarget(
  site: {
    id?: string;
    name?: string;
    latitude: number | null;
    longitude: number | null;
    posts?:
      | Array<{
          id: string;
          name: string;
          latitude: number;
          longitude: number;
          status?: boolean | null;
          deletedAt?: Date | string | null;
        }>
      | null;
  },
  employeeLat: number | null | undefined,
  employeeLng: number | null | undefined,
  calculateDistance: (lat1: number, lng1: number, lat2: number, lng2: number) => number | null,
): { target: NearestPunchTarget; distanceMeters: number } | null {
  if (employeeLat == null || employeeLng == null) {
    return null;
  }

  const activePosts = (site.posts ?? []).filter(post => post.status !== false && !post.deletedAt);

  const candidates: NearestPunchTarget[] =
    activePosts.length > 0
      ? activePosts.map(post => ({
          type: 'post' as const,
          id: post.id,
          name: post.name,
          latitude: post.latitude,
          longitude: post.longitude,
        }))
      : site.latitude != null && site.longitude != null
        ? [
            {
              type: 'legacy_site' as const,
              id: null,
              name: '',
              latitude: site.latitude,
              longitude: site.longitude,
            },
          ]
        : [];

  if (candidates.length === 0) {
    return null;
  }

  let best: { target: NearestPunchTarget; distanceMeters: number } | null = null;

  for (const candidate of candidates) {
    const distanceMeters = calculateDistance(employeeLat, employeeLng, candidate.latitude, candidate.longitude);
    if (distanceMeters == null) {
      continue;
    }
    if (!best || distanceMeters < best.distanceMeters) {
      best = { target: candidate, distanceMeters };
    }
  }

  return best;
}

export type AttendanceMetadata = {
  location?: { lat?: number; lng?: number };
  matchedLocation?: {
    type?: 'post' | 'legacy_site' | 'escort_end';
    id?: string | null;
    name?: string;
    distanceMeters?: number;
  };
};

export function resolvePunchDistance(params: {
  site: Parameters<typeof getNearestActivePunchTarget>[0];
  metadata: AttendanceMetadata | null;
  calculateDistance: (lat1: number, lng1: number, lat2: number, lng2: number) => number | null;
}): { distanceMeters: number | null; postName: string | null } {
  const { site, metadata, calculateDistance } = params;

  const stored = metadata?.matchedLocation;
  if (stored && typeof stored.distanceMeters === 'number') {
    return {
      distanceMeters: stored.distanceMeters,
      postName: stored.name ?? null,
    };
  }

  const loc = metadata?.location;
  const helperResult = getNearestActivePunchTarget(site, loc?.lat, loc?.lng, calculateDistance);

  return {
    distanceMeters: helperResult?.distanceMeters ?? null,
    postName: helperResult?.target.name || null,
  };
}

