import {
  resolveFirstAndLastLocation,
  summarizeSiteBoundary,
  resolveLocationName,
  computeGeofenceStatus,
  geofenceStatusLabel,
  buildLocationTrail,
  computeBoundingBox,
  bboxToZoomLevel,
  bboxCenter,
  trailPointTypeLabel,
  findOutlierTrailIndices,
  computeTrailBoundingBox,
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

describe('resolveLocationName', () => {
  const SINGLE_POST: SitePost[] = [
    { id: 'p1', name: 'Only Post', latitude: -8.655812, longitude: 115.219442 },
  ];
  const nearMainGate = { latitude: -8.655812, longitude: 115.219442 };
  const nearHandover = { latitude: -8.655844, longitude: 115.219500 };

  // ── Attendance photo (attendanceMatchedName wins) ──
  test('attendance matched name wins over everything', () => {
    expect(resolveLocationName(null, 'Main Gate', SITE_POSTS, 'Lilu Rental')).toBe('Main Gate');
    expect(resolveLocationName(nearMainGate, 'Main Gate', SITE_POSTS, 'Lilu Rental')).toBe('Main Gate');
  });

  test('ignores blank attendance matched names', () => {
    expect(resolveLocationName(nearMainGate, '   ', SITE_POSTS, 'Lilu Rental')).toBe('Main Gate');
  });

  // ── Multi-post site (≥2 posts + point) ──
  test('returns the nearest post name when the site has multiple posts and a point is given', () => {
    expect(resolveLocationName(nearMainGate, null, SITE_POSTS, 'Lilu')).toBe('Main Gate');
    expect(resolveLocationName(nearHandover, null, SITE_POSTS, 'Lilu')).toBe('Handover Point');
  });

  // ── 1 post — skip the post, use site name ──
  test('uses site name when the site has exactly one post', () => {
    expect(resolveLocationName(nearMainGate, null, SINGLE_POST, 'Lilu Rental')).toBe('Lilu Rental');
    expect(resolveLocationName(null, null, SINGLE_POST, 'Lilu Rental')).toBe('Lilu Rental');
  });

  test('falls back to "On Site" when site has 1 post but no site name', () => {
    expect(resolveLocationName(nearMainGate, null, SINGLE_POST, null)).toBe('On Site');
    expect(resolveLocationName(nearMainGate, null, SINGLE_POST, '')).toBe('On Site');
  });

  // ── 0 posts — use site name ──
  test('uses site name when no posts exist', () => {
    expect(resolveLocationName(nearMainGate, null, [], 'Lilu Rental')).toBe('Lilu Rental');
    expect(resolveLocationName(null, null, [], 'Lilu Rental')).toBe('Lilu Rental');
  });

  test('falls back to "On Site" when no posts and no site name', () => {
    expect(resolveLocationName(null, null, [])).toBe('On Site');
    expect(resolveLocationName(nearMainGate, null, [])).toBe('On Site');
  });

});

describe('computeGeofenceStatus', () => {
  const point = { latitude: -8.655812, longitude: 115.219442 };
  const farAway = { latitude: 0, longitude: 0 };

  test('returns "no-location" when the point is null', () => {
    expect(computeGeofenceStatus(null, {
      latitude: -8.655812,
      longitude: 115.219442,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    })).toBe('no-location');
  });

  test('returns "disabled" when geofence monitoring is off', () => {
    expect(computeGeofenceStatus(point, {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: false,
    })).toBe('disabled');
  });

  test('returns "unconfigured" when no posts and no site center', () => {
    expect(computeGeofenceStatus(point, {
      latitude: null,
      longitude: null,
      sitePosts: [],
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    })).toBe('unconfigured');
  });

  test('returns "unconfigured" when maxDistanceMeters is 0', () => {
    expect(computeGeofenceStatus(point, {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 0,
      geofenceStatusEnabled: true,
    })).toBe('unconfigured');
  });

  test('returns "inside" when within maxDistanceMeters of any post', () => {
    expect(computeGeofenceStatus(point, {
      latitude: null,
      longitude: null,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    })).toBe('inside');
  });

  test('returns "outside" when far from all posts and the site center', () => {
    expect(computeGeofenceStatus(farAway, {
      latitude: -8.655812,
      longitude: 115.219442,
      sitePosts: SITE_POSTS,
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    })).toBe('outside');
  });

  test('falls back to the Site center when no posts exist', () => {
    expect(computeGeofenceStatus(point, {
      latitude: -8.655812,
      longitude: 115.219442,
      sitePosts: [],
      maxDistanceMeters: 200,
      geofenceStatusEnabled: true,
    })).toBe('inside');
  });
});

describe('geofenceStatusLabel', () => {
  test('returns the human-readable status string', () => {
    expect(geofenceStatusLabel('inside')).toBe('Inside assigned site boundary');
    expect(geofenceStatusLabel('outside')).toBe('Outside assigned site boundary');
    expect(geofenceStatusLabel('disabled')).toBe('Geofence monitoring disabled for this site.');
    expect(geofenceStatusLabel('unconfigured')).toBe('Site geofence coordinates are not configured.');
    expect(geofenceStatusLabel('no-location')).toBe('-');
  });
});

describe('computeBoundingBox', () => {
  test('returns null for an empty input', () => {
    expect(computeBoundingBox([])).toBeNull();
  });

  test('encloses a single point with minimum padding', () => {
    const bbox = computeBoundingBox([{ latitude: -8.5, longitude: 115.2 }]);
    expect(bbox).not.toBeNull();
    const span = bbox!.maxLat - bbox!.minLat;
    expect(span).toBeGreaterThan(0);
  });

  test('encloses multiple points with padding', () => {
    const bbox = computeBoundingBox([
      { latitude: 0, longitude: 0 },
      { latitude: 0.01, longitude: 0.01 },
    ])!;
    // 20% padding on each side → 0.01 + 2 * 0.002 = 0.014
    const padded = bbox.maxLat - bbox.minLat;
    expect(padded).toBeCloseTo(0.014, 5);
    expect(bbox.minLat).toBeCloseTo(-0.002, 5);
    expect(bbox.maxLat).toBeCloseTo(0.012, 5);
  });
});

describe('bboxToZoomLevel', () => {
  test('returns a value in [1, 20]', () => {
    const bbox = {
      minLat: -8.5, maxLat: -8.499, minLng: 115.2, maxLng: 115.201,
    };
    const zoom = bboxToZoomLevel(bbox, 800, 600);
    expect(zoom).toBeGreaterThanOrEqual(1);
    expect(zoom).toBeLessThanOrEqual(20);
  });

  test('returns a higher zoom for a smaller bbox', () => {
    const tiny = bboxToZoomLevel(
      { minLat: -8.5, maxLat: -8.4999, minLng: 115.2, maxLng: 115.2001 },
      800, 600,
    );
    const wide = bboxToZoomLevel(
      { minLat: -8.5, maxLat: -8.0, minLng: 115.0, maxLng: 115.5 },
      800, 600,
    );
    expect(tiny).toBeGreaterThan(wide);
  });

  test('returns 17 for invalid dimensions', () => {
    const bbox = { minLat: 0, maxLat: 0.01, minLng: 0, maxLng: 0.01 };
    expect(bboxToZoomLevel(bbox, 0, 0)).toBe(17);
  });

  test('new floor (0.00009 deg) allows much higher zoom for tight clusters', () => {
    // A 0.0001 deg span (~11 m) bbox was capped to the old 0.0005 deg floor,
    // which gave zoom ~17. Now the floor is 0.00009 deg, so this bbox resolves
    // to a zoom in the 19–20 range (building-level).
    const bbox = { minLat: -8.5, maxLat: -8.4999, minLng: 115.2, maxLng: 115.2001 };
    const zoom = bboxToZoomLevel(bbox, 640, 480);
    expect(zoom).toBeGreaterThanOrEqual(19);
    expect(zoom).toBeLessThanOrEqual(20);
  });
});

describe('bboxCenter', () => {
  test('returns the mid-point of the bbox', () => {
    const center = bboxCenter({ minLat: 0, maxLat: 2, minLng: 4, maxLng: 6 });
    expect(center.latitude).toBe(1);
    expect(center.longitude).toBe(5);
  });
});

describe('trailPointTypeLabel', () => {
  test('returns the canonical label for each type', () => {
    expect(trailPointTypeLabel('attendance')).toBe('Attendance');
    expect(trailPointTypeLabel('checkin')).toBe('Check-in');
    expect(trailPointTypeLabel('photo')).toBe('Photo evidence');
  });
});

describe('buildLocationTrail', () => {
  const SITE_POSTS: SitePost[] = [
    { id: 'p1', name: 'Main Gate', latitude: -8.655812, longitude: 115.219442 },
    { id: 'p2', name: 'Lobby', latitude: -8.655900, longitude: 115.219500 },
  ];

  test('returns an empty list for empty sources', () => {
    const result = buildLocationTrail(
      { attendancePoint: null, checkinPoints: [], chatPoints: [] },
      SITE_POSTS,
      { siteName: 'Lilu Rental' },
    );
    expect(result).toEqual([]);
  });

  test('merges and sorts all 3 sources chronologically with sequence numbers', () => {
    const result = buildLocationTrail(
      {
        attendancePoint: {
          timestamp: new Date('2026-06-28T14:00:00Z'),
          latitude: -8.655812,
          longitude: 115.219442,
        },
        checkinPoints: [
          {
            timestamp: new Date('2026-06-28T15:00:00Z'),
            latitude: -8.655900,
            longitude: 115.219500,
          },
        ],
        chatPoints: [
          {
            timestamp: new Date('2026-06-28T16:00:00Z'),
            latitude: -8.655812,
            longitude: 115.219442,
            remarks: 'all clear',
          },
        ],
      },
      SITE_POSTS,
      { siteName: 'Lilu Rental' },
    );
    expect(result.length).toBe(3);
    expect(result.map(r => r.seq)).toEqual([1, 2, 3]);
    expect(result.map(r => r.type)).toEqual(['attendance', 'checkin', 'photo']);
    expect(result[2]!.remarks).toBe('all clear');
  });

  test('resolves the area name from the nearest post for multi-post sites', () => {
    const result = buildLocationTrail(
      {
        attendancePoint: null,
        checkinPoints: [
          {
            timestamp: new Date('2026-06-28T14:00:00Z'),
            latitude: -8.655812,
            longitude: 115.219442,
          },
        ],
        chatPoints: [],
      },
      SITE_POSTS,
    );
    expect(result[0]!.area).toBe('Main Gate');
  });

  test('falls back to the site name for 0- or 1-post sites', () => {
    const result = buildLocationTrail(
      {
        attendancePoint: null,
        checkinPoints: [
          {
            timestamp: new Date('2026-06-28T14:00:00Z'),
            latitude: 0,
            longitude: 0,
          },
        ],
        chatPoints: [],
      },
      [],
      { siteName: 'Lilu Rental' },
    );
    expect(result[0]!.area).toBe('Lilu Rental');
  });

  test('computes distance from the nearest post in meters', () => {
    const result = buildLocationTrail(
      {
        attendancePoint: null,
        checkinPoints: [
          {
            timestamp: new Date('2026-06-28T14:00:00Z'),
            latitude: -8.655812,
            longitude: 115.219442,
          },
        ],
        chatPoints: [],
      },
      SITE_POSTS,
    );
    // Same coordinates as Main Gate → 0 m (rounded).
    expect(result[0]!.distanceFromNearestPostMeters).toBe(0);
  });

  test('falls back to siteCenter distance when no posts exist', () => {
    const result = buildLocationTrail(
      {
        attendancePoint: null,
        checkinPoints: [
          {
            timestamp: new Date('2026-06-28T14:00:00Z'),
            latitude: -8.655812,
            longitude: 115.219442,
          },
        ],
        chatPoints: [],
      },
      [],
      {
        siteName: 'Lilu Rental',
        siteCenter: { latitude: -8.655812, longitude: 115.219442 },
      },
    );
    expect(result[0]!.distanceFromNearestPostMeters).toBe(0);
  });

  test('passes through the accuracy from the source point', () => {
    const result = buildLocationTrail(
      {
        attendancePoint: {
          timestamp: new Date('2026-06-28T14:00:00Z'),
          latitude: -8.655812,
          longitude: 115.219442,
          accuracyMeters: 5,
        },
        checkinPoints: [],
        chatPoints: [
          {
            timestamp: new Date('2026-06-28T14:30:00Z'),
            latitude: -8.655812,
            longitude: 115.219442,
          },
        ],
      },
      SITE_POSTS,
    );
    expect(result[0]!.accuracyMeters).toBe(5);
    expect(result[1]!.accuracyMeters).toBeNull();
  });
});

describe('findOutlierTrailIndices', () => {
  test('returns an empty set for fewer than 2 trail points', () => {
    expect(findOutlierTrailIndices([]).size).toBe(0);
    expect(findOutlierTrailIndices([{ latitude: 0, longitude: 0 }]).size).toBe(0);
  });

  test('returns an empty set when all points coincide (median = 0)', () => {
    const same = { latitude: 0, longitude: 0 };
    expect(findOutlierTrailIndices([same, same, same, same]).size).toBe(0);
  });

  test('flags both endpoints of a single outlier segment', () => {
    // 4 points → 3 segments: 10m, 10m, 1000m (outlier, > 5×10).
    // Median = 10m; the 1000m segment is 100× the median.
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.0001 };
    const p2 = { latitude: 0, longitude: 0.0002 };
    const p3 = { latitude: 0, longitude: 0.0102 };
    const out = findOutlierTrailIndices([p0, p1, p2, p3]);
    expect([...out].sort()).toEqual([2, 3]);
  });

  test('flags both endpoints of an outlier in the middle of the trail', () => {
    // 6 points → 5 segments: 10m, 10m, 1000m (outlier), 10m, 10m
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.0001 };
    const p2 = { latitude: 0, longitude: 0.0002 };
    const p3 = { latitude: 0, longitude: 0.0112 };
    const p4 = { latitude: 0, longitude: 0.0113 };
    const p5 = { latitude: 0, longitude: 0.0114 };
    const out = findOutlierTrailIndices([p0, p1, p2, p3, p4, p5]);
    expect([...out].sort()).toEqual([2, 3]);
  });

  test('a more aggressive threshold catches smaller jumps', () => {
    // Segments: 5m, 5m, 50m — median = 5m, 50m is 10× median.
    // With threshold=5 the 50m segment is an outlier.
    // With threshold=20 the 50m segment is NOT an outlier (only 2.5×).
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.00005 };
    const p2 = { latitude: 0, longitude: 0.0001 };
    const p3 = { latitude: 0, longitude: 0.0006 };
    expect(findOutlierTrailIndices([p0, p1, p2, p3], 5).size).toBe(2);
    expect(findOutlierTrailIndices([p0, p1, p2, p3], 20).size).toBe(0);
  });

  test('a conservative threshold ignores a moderately-larger jump', () => {
    // Segments: 10m, 10m, 30m — median = 10m, 30m is only 3× median.
    // With threshold=5 the 30m segment is NOT an outlier.
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.0001 };
    const p2 = { latitude: 0, longitude: 0.0002 };
    const p3 = { latitude: 0, longitude: 0.0005 };
    expect(findOutlierTrailIndices([p0, p1, p2, p3], 5).size).toBe(0);
  });

  test('flags two consecutive outlier segments and drops all 3 intermediate points', () => {
    // 7 points → 6 segments: 5m, 5m, 5m, 1000m, 1000m, 5m.
    // Sorted: [5, 5, 5, 5, 1000, 1000]. Median = 5. Limit = 25.
    // Both 1000m segments (indices 3 and 4) are outliers → {3, 4} and {4, 5} → {3, 4, 5}.
    // Kept trail: {0, 1, 2, 6} → 4 points.
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.00005 };
    const p2 = { latitude: 0, longitude: 0.0001 };
    const p3 = { latitude: 0, longitude: 0.00015 };
    const p4 = { latitude: 0, longitude: 0.00915 };
    const p5 = { latitude: 0, longitude: 0.01815 };
    const p6 = { latitude: 0, longitude: 0.0182 };
    const out = findOutlierTrailIndices([p0, p1, p2, p3, p4, p5, p6]);
    expect([...out].sort()).toEqual([3, 4, 5]);
  });

  test('flags two non-adjacent outlier segments independently', () => {
    // 7 points → 6 segments: 5m, 1000m, 5m, 5m, 1000m, 5m.
    // Both 1000m segments are outliers → indices {1, 2} and {4, 5} → {1, 2, 4, 5}.
    // Kept: {0, 3, 6} → 3 points.
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.00005 };
    const p2 = { latitude: 0, longitude: 0.01105 };
    const p3 = { latitude: 0, longitude: 0.0111 };
    const p4 = { latitude: 0, longitude: 0.01115 };
    const p5 = { latitude: 0, longitude: 0.02215 };
    const p6 = { latitude: 0, longitude: 0.0222 };
    const out = findOutlierTrailIndices([p0, p1, p2, p3, p4, p5, p6]);
    expect([...out].sort()).toEqual([1, 2, 4, 5]);
  });

  test('when most segments share a scale, the median is that scale and nothing is flagged', () => {
    // 6 points → 5 segments: 5m, 100m, 100m, 100m, 5m.
    // Sorted: [5, 5, 100, 100, 100]. Median = 100. Limit = 500.
    // 5m and 100m are both ≤ 500 → no outliers.
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.00005 };
    const p2 = { latitude: 0, longitude: 0.00105 };
    const p3 = { latitude: 0, longitude: 0.00205 };
    const p4 = { latitude: 0, longitude: 0.00305 };
    const p5 = { latitude: 0, longitude: 0.00310 };
    expect(findOutlierTrailIndices([p0, p1, p2, p3, p4, p5]).size).toBe(0);
  });
});

describe('computeTrailBoundingBox', () => {
  test('returns null when there are no trail points and no site posts', () => {
    expect(computeTrailBoundingBox({ trailPoints: [], sitePosts: [] })).toBeNull();
  });

  test('returns the bbox of all trail points when there are no outliers', () => {
    const bbox = computeTrailBoundingBox({
      trailPoints: [
        { latitude: 0, longitude: 0 },
        { latitude: 0.001, longitude: 0.001 },
      ],
      sitePosts: [],
    });
    expect(bbox).not.toBeNull();
    const raw = computeBoundingBox([
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0.001 },
    ])!;
    expect(bbox!.minLat).toBeCloseTo(raw.minLat, 6);
    expect(bbox!.maxLat).toBeCloseTo(raw.maxLat, 6);
  });

  test('drops both endpoints of an outlier trail segment from the bbox', () => {
    // 4 points → 3 segments: 10m, 10m, 1000m (outlier). Median = 10m.
    // Outlier endpoints (p2, p3) are both dropped — kept = [p0, p1].
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.0001 };
    const p2 = { latitude: 0, longitude: 0.0002 };
    const p3 = { latitude: 0, longitude: 0.0102 };
    const bbox = computeTrailBoundingBox({
      trailPoints: [p0, p1, p2, p3],
      sitePosts: [],
    })!;
    const expected = computeBoundingBox([p0, p1])!;
    expect(bbox.minLat).toBeCloseTo(expected.minLat, 6);
    expect(bbox.maxLat).toBeCloseTo(expected.maxLat, 6);
    expect(bbox.maxLng).toBeCloseTo(expected.maxLng, 6);
  });

  test('always includes site posts in the bbox even when the trail has outliers', () => {
    // 4 points → 3 segments: 10m, 10m, 1000m (outlier). Median = 10m.
    // Kept = [p0, p1] (p2, p3 dropped as outlier endpoints). Post always kept.
    const p0 = { latitude: 0, longitude: 0 };
    const p1 = { latitude: 0, longitude: 0.0001 };
    const p2 = { latitude: 0, longitude: 0.0002 };
    const p3 = { latitude: 0, longitude: 0.0102 };
    const post = { latitude: 0.00008, longitude: 0.00008 };
    const bbox = computeTrailBoundingBox({
      trailPoints: [p0, p1, p2, p3],
      sitePosts: [post],
    })!;
    const expected = computeBoundingBox([p0, p1, post])!;
    expect(bbox.minLat).toBeCloseTo(expected.minLat, 6);
    expect(bbox.maxLat).toBeCloseTo(expected.maxLat, 6);
    expect(bbox.maxLng).toBeCloseTo(expected.maxLng, 6);
  });

  test('returns the bbox of all site posts when the trail is empty', () => {
    const post1 = { latitude: 0, longitude: 0 };
    const post2 = { latitude: 0.001, longitude: 0.001 };
    const bbox = computeTrailBoundingBox({
      trailPoints: [],
      sitePosts: [post1, post2],
    })!;
    const expected = computeBoundingBox([post1, post2])!;
    expect(bbox.minLat).toBeCloseTo(expected.minLat, 6);
    expect(bbox.maxLng).toBeCloseTo(expected.maxLng, 6);
  });

  test('zooms in to the main cluster when multiple faraway updates are present', () => {
    // 7 points → 6 segments: 1000m, 5m, 5m, 5m, 1000m, 5m.
    // Two outlier jumps at the trail's extremes (p0 and p5). When both
    // endpoints of each are dropped, the bbox shrinks to the main cluster
    // in the middle (p2..p4 and p6).
    // Sorted: [5, 5, 5, 5, 1000, 1000]. Median = 5. Limit = 25.
    // Outlier segments at indices 0 and 4 → endpoints {0, 1, 4, 5}.
    // Kept: {p2, p3, p4, p6}.
    const p0 = { latitude: 0, longitude: 0 };             // far (dropped)
    const p1 = { latitude: 0, longitude: 0.009 };          // near p0 (dropped)
    const p2 = { latitude: 0, longitude: 0.00905 };
    const p3 = { latitude: 0, longitude: 0.00910 };
    const p4 = { latitude: 0, longitude: 0.00915 };
    const p5 = { latitude: 0, longitude: 0.01815 };        // far (dropped)
    const p6 = { latitude: 0, longitude: 0.01820 };
    const bbox = computeTrailBoundingBox({
      trailPoints: [p0, p1, p2, p3, p4, p5, p6],
      sitePosts: [],
    })!;
    const unfiltered = computeBoundingBox([p0, p1, p2, p3, p4, p5, p6])!;
    // The robust bbox should be tighter than the unfiltered one.
    const robustSpan = bbox.maxLng - bbox.minLng;
    const unfilteredSpan = unfiltered.maxLng - unfiltered.minLng;
    expect(robustSpan).toBeLessThan(unfilteredSpan);
    // The robust bbox should NOT include p0's longitude (0) — it sits in
    // the middle of the trail.
    expect(bbox.minLng).toBeGreaterThan(0.005);
  });
});
