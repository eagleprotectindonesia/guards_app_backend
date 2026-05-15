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
  type: 'post' | 'legacy_site';
  id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

type CandidateSiteLocation = Omit<MatchedSiteLocation, 'distanceMeters'>;

export function findNearestAllowedSiteLocation(params: {
  site: SiteWithPostsLike;
  employeeLocation: LatLng;
  maxDistanceMeters: number;
  calculateDistance: (lat1: number, lng1: number, lat2: number, lng2: number) => number;
}): {
  matchedLocation: MatchedSiteLocation | null;
  nearestLocation: MatchedSiteLocation | null;
} {
  const { site, employeeLocation, maxDistanceMeters, calculateDistance } = params;

  const activePosts = (site.posts ?? []).filter(post => post.status !== false && !post.deletedAt);

  const candidates: CandidateSiteLocation[] =
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
              name: site.name,
              latitude: site.latitude,
              longitude: site.longitude,
            },
          ]
        : [];

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

