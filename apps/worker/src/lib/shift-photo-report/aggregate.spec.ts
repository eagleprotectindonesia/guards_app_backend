import {
  resolveFirstAndLastLocation,
  summarizeSiteBoundary,
  type LocationPoint,
  type SitePost,
  type LocationSources,
} from './aggregate';

const SITE_POSTS: SitePost[] = [
  { id: 'p1', name: 'Main Gate', latitude: -8.655812, longitude: 115.219442 },
  { id: 'p2', name: 'Handover Point', latitude: -8.655844, longitude: 115.219500 },
];

const SHIFT_ENDS_AT = new Date('2026-06-29T07:00:00Z');

const at = (iso: string) => new Date(iso);
const pt = (iso: string, lat: number, lng: number): LocationPoint => ({
  timestamp: at(iso),
  latitude: lat,
  longitude: lng,
});

describe('resolveFirstAndLastLocation', () => {
  test('first: attendance location is preferred when present', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -1, -1),
      checkinPoints: [pt('2026-06-28T14:00:00Z', -2, -2)],
      chatPoints: [pt('2026-06-28T13:00:00Z', -3, -3)],
    };
    const { first } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first?.latitude).toBe(-1);
    expect(first?.longitude).toBe(-1);
    expect(first?.timestamp).toEqual(at('2026-06-28T15:30:00Z'));
  });

  test('first: falls back to earliest checkin when no attendance', () => {
    const sources: LocationSources = {
      attendancePoint: null,
      checkinPoints: [
        pt('2026-06-28T16:00:00Z', -2, -2),
        pt('2026-06-28T14:00:00Z', -4, -4),
      ],
      chatPoints: [pt('2026-06-28T13:00:00Z', -3, -3)],
    };
    const { first } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first?.latitude).toBe(-4);
    expect(first?.longitude).toBe(-4);
  });

  test('first: returns null when no attendance and no checkins', () => {
    const sources: LocationSources = {
      attendancePoint: null,
      checkinPoints: [],
      chatPoints: [pt('2026-06-28T13:00:00Z', -3, -3)],
    };
    const { first } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first).toBeNull();
  });

  test('first: chat messages are NOT used as first location fallback', () => {
    const sources: LocationSources = {
      attendancePoint: null,
      checkinPoints: [],
      chatPoints: [pt('2026-06-28T13:00:00Z', -3, -3)],
    };
    const { first } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first).toBeNull();
  });

  test('last: uses latest checkin when one is within the 5-min grace of endsAt', () => {
    const sources: LocationSources = {
      attendancePoint: null,
      checkinPoints: [
        pt('2026-06-29T05:00:00Z', -1, -1),
        pt('2026-06-29T06:58:00Z', -2, -2), // 2 min before endsAt — within grace
        pt('2026-06-29T07:05:00Z', -5, -5), // 5 min after endsAt — also valid
      ],
      chatPoints: [pt('2026-06-29T08:00:00Z', -3, -3)],
    };
    const { last } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(last?.latitude).toBe(-5);
    expect(last?.longitude).toBe(-5);
  });

  test('last: falls back to latest chat when no checkin is near endsAt (system-ended)', () => {
    const sources: LocationSources = {
      attendancePoint: null,
      checkinPoints: [
        pt('2026-06-29T05:00:00Z', -1, -1), // 2h before endsAt — way outside grace
      ],
      chatPoints: [
        pt('2026-06-29T06:30:00Z', -2, -2),
        pt('2026-06-29T06:55:00Z', -3, -3),
      ],
    };
    const { last } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(last?.latitude).toBe(-3);
    expect(last?.longitude).toBe(-3);
  });

  test('last: falls back to latest chat when there are no checkins at all', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -1, -1),
      checkinPoints: [],
      chatPoints: [pt('2026-06-29T06:55:00Z', -2, -2)],
    };
    const { last } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(last?.latitude).toBe(-2);
    expect(last?.longitude).toBe(-2);
  });

  test('last: returns null when no checkin and no chat', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -1, -1),
      checkinPoints: [],
      chatPoints: [],
    };
    const { last } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(last).toBeNull();
  });

  test('resolveNamedPoint: maps location to nearest SitePost', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -8.655812, 115.219442),
      checkinPoints: [],
      chatPoints: [],
    };
    const { first } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first?.pointName).toBe('Main Gate');
  });

  test('resolveNamedPoint: falls back to "On Site" when no posts', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -1, -1),
      checkinPoints: [],
      chatPoints: [],
    };
    const { first } = resolveFirstAndLastLocation(sources, [], SHIFT_ENDS_AT);
    expect(first?.pointName).toBe('On Site');
  });

  test('combined: attendance + checkin in window yields first=attendance, last=checkin', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -1, -1),
      checkinPoints: [
        pt('2026-06-29T06:58:00Z', -2, -2),
      ],
      chatPoints: [pt('2026-06-29T06:55:00Z', -3, -3)],
    };
    const { first, last } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first?.latitude).toBe(-1);
    expect(last?.latitude).toBe(-2);
  });

  test('combined: attendance + system-ended → first=attendance, last=latest chat', () => {
    const sources: LocationSources = {
      attendancePoint: pt('2026-06-28T15:30:00Z', -1, -1),
      checkinPoints: [pt('2026-06-29T03:00:00Z', -2, -2)],
      chatPoints: [pt('2026-06-29T06:55:00Z', -3, -3)],
    };
    const { first, last } = resolveFirstAndLastLocation(sources, SITE_POSTS, SHIFT_ENDS_AT);
    expect(first?.latitude).toBe(-1);
    expect(last?.latitude).toBe(-3);
  });
});

describe('summarizeSiteBoundary', () => {
  // A point ~150m north of Main Gate (-8.655812, 115.219442). 1 degree of lat ≈ 111_000m.
  const nearMainGate = pt('2026-06-28T16:00:00Z', -8.654462, 115.219442);
  const farAway = pt('2026-06-28T17:00:00Z', -8.640000, 115.219442);

  test('all points within the max distance to any active SitePost → "All N within"', () => {
    const result = summarizeSiteBoundary([nearMainGate], {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('All 1 GPS records are within the expected site/escort boundary.');
  });

  test('points farther than max distance to any SitePost count as outside', () => {
    const result = summarizeSiteBoundary([farAway], {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('1 of 1 GPS records are outside the expected site boundary.');
  });

  test('uses the NEAREST SitePost when there are multiple', () => {
    // Place a point 50m from p1 (Main Gate) and 500m from p2 (Handover Point).
    // With maxDistance 100, the point is "inside" via Main Gate.
    const closeToGate = pt('2026-06-28T16:00:00Z', -8.655362, 115.219442);
    const result = summarizeSiteBoundary([closeToGate], {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 100,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('All 1 GPS records are within the expected site/escort boundary.');
  });

  test('falls back to Site.latitude/longitude when no SitePosts are configured', () => {
    const result = summarizeSiteBoundary([nearMainGate], {
      latitude: -8.655812,
      longitude: 115.219442,
      sitePosts: [],
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('All 1 GPS records are within the expected site/escort boundary.');
  });

  test('mixed inside/outside reports the count of outside points', () => {
    const result = summarizeSiteBoundary([nearMainGate, farAway], {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('1 of 2 GPS records are outside the expected site boundary.');
  });

  test('disables when Site.geofenceStatus is false', () => {
    const result = summarizeSiteBoundary([nearMainGate, farAway], {
      latitude: -8.655812,
      longitude: 115.219442,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: false,
    });
    expect(result).toBe('Geofence monitoring disabled for this site.');
  });

  test('reports "not configured" when no posts and no Site center', () => {
    const result = summarizeSiteBoundary([nearMainGate], {
      latitude: null,
      longitude: null,
      sitePosts: [],
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('Site geofence coordinates are not configured.');
  });

  test('reports "no GPS records" when points is empty', () => {
    const result = summarizeSiteBoundary([], {
      latitude: -8.655812,
      longitude: 115.219442,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('No GPS records available for this shift.');
  });

  test('maxDistanceMeters = 0 disables the check (everything is "outside")', () => {
    const result = summarizeSiteBoundary([nearMainGate], {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 0,
      geofenceStatusEnabled: true,
    });
    expect(result).toBe('1 of 1 GPS records are outside the expected site boundary.');
  });
});
