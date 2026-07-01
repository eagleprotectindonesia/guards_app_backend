import sharp from 'sharp';
import {
  fetchStaticMapPng,
  resolveGoogleMapsApiKey,
  buildSiteBoundaryPath,
  buildTrailPath,
  buildNumberedMarkers,
  buildTrailMapUrl,
  fetchTrailMapPng,
  projectTrailToPixels,
  buildArrowOverlaySvg,
  overlayDirectionArrows,
  planMarkerPlacement,
  buildNumberedMarkersSvg,
  overlayNumberedMarkers,
} from './static-map';

describe('resolveGoogleMapsApiKey', () => {
  const originalKey = process.env.GOOGLE_MAPS_STATIC_API_KEY;
  const originalPublicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_STATIC_API_KEY;
    else process.env.GOOGLE_MAPS_STATIC_API_KEY = originalKey;

    if (originalPublicKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalPublicKey;
  });

  test('prefers GOOGLE_MAPS_STATIC_API_KEY', () => {
    process.env.GOOGLE_MAPS_STATIC_API_KEY = 'static-key';
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'public-key';
    expect(resolveGoogleMapsApiKey()).toBe('static-key');
  });

  test('falls back to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', () => {
    delete process.env.GOOGLE_MAPS_STATIC_API_KEY;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'public-key';
    expect(resolveGoogleMapsApiKey()).toBe('public-key');
  });

  test('returns null when no key is set', () => {
    delete process.env.GOOGLE_MAPS_STATIC_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    expect(resolveGoogleMapsApiKey()).toBeNull();
  });

  test('ignores empty strings', () => {
    process.env.GOOGLE_MAPS_STATIC_API_KEY = '   ';
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    expect(resolveGoogleMapsApiKey()).toBeNull();
  });
});

describe('fetchStaticMapPng', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns null when no API key is configured', async () => {
    const saved = process.env.GOOGLE_MAPS_STATIC_API_KEY;
    const savedPublic = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_STATIC_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    try {
      const result = await fetchStaticMapPng({ lat: 0, lng: 0, width: 100, height: 100, apiKey: null });
      expect(result).toBeNull();
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_STATIC_API_KEY = saved;
      if (savedPublic !== undefined) process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = savedPublic;
    }
  });

  test('returns null for invalid coordinates', async () => {
    const result = await fetchStaticMapPng({ lat: NaN, lng: 0, width: 100, height: 100, apiKey: 'k' });
    expect(result).toBeNull();
  });

  test('returns null for non-positive dimensions', async () => {
    const result = await fetchStaticMapPng({ lat: 0, lng: 0, width: 0, height: 0, apiKey: 'k' });
    expect(result).toBeNull();
  });

  test('returns a buffer when the API responds OK', async () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    global.fetch = jest.fn(async () =>
      new Response(fakePng, { status: 200, headers: { 'content-type': 'image/png' } }),
    ) as unknown as typeof fetch;

    const result = await fetchStaticMapPng({ lat: 1, lng: 2, width: 100, height: 100, apiKey: 'k' });
    expect(result).not.toBeNull();
    expect(result!.equals(fakePng)).toBe(true);
  });

  test('returns null when the API returns a non-OK status', async () => {
    global.fetch = jest.fn(async () =>
      new Response('forbidden', { status: 403 }),
    ) as unknown as typeof fetch;

    const result = await fetchStaticMapPng({ lat: 1, lng: 2, width: 100, height: 100, apiKey: 'k' });
    expect(result).toBeNull();
  });

  test('returns null when the API throws', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await fetchStaticMapPng({ lat: 1, lng: 2, width: 100, height: 100, apiKey: 'k' });
    expect(result).toBeNull();
  });

  test('returns null when the response body is empty', async () => {
    global.fetch = jest.fn(async () =>
      new Response(new Uint8Array(0), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await fetchStaticMapPng({ lat: 1, lng: 2, width: 100, height: 100, apiKey: 'k' });
    expect(result).toBeNull();
  });
});

describe('buildSiteBoundaryPath', () => {
  test('encodes a rectangle enclosing 2+ posts', () => {
    const out = buildSiteBoundaryPath({
      sitePosts: [
        { name: 'A', latitude: 0, longitude: 0 },
        { name: 'B', latitude: 1, longitude: 1 },
      ],
    });
    expect(out).toMatch(/^color:0x1e3a8a\|weight:2\|fillcolor:0x1e3a8a33\|/);
    // The rectangle should close (first == last corner)
    expect(out!.split('|').pop()).toBe('0,0');
  });

  test('encodes a single point for 1 post', () => {
    const out = buildSiteBoundaryPath({
      sitePosts: [{ name: 'A', latitude: -8.5, longitude: 115.2 }],
    });
    expect(out).toBe('color:0x1e3a8a|weight:2|fillcolor:0x1e3a8a33|-8.5,115.2');
  });

  test('encodes a circle around the site center when there are no posts', () => {
    const out = buildSiteBoundaryPath({
      sitePosts: [],
      siteCenter: { latitude: -8.5, longitude: 115.2 },
      siteRadius: 100,
    });
    expect(out).toBe('color:0x1e3a8a|weight:2|fillcolor:0x1e3a8a33|-8.5,115.2');
  });

  test('returns null when there are no posts and no center', () => {
    const out = buildSiteBoundaryPath({ sitePosts: [] });
    expect(out).toBeNull();
  });

  test('returns null when the radius is non-positive', () => {
    const out = buildSiteBoundaryPath({
      sitePosts: [],
      siteCenter: { latitude: 0, longitude: 0 },
      siteRadius: 0,
    });
    expect(out).toBeNull();
  });
});

describe('buildTrailPath', () => {
  test('encodes the polyline for 2+ points', () => {
    const out = buildTrailPath([
      { seq: 1, latitude: 0, longitude: 0 },
      { seq: 2, latitude: 1, longitude: 1 },
      { seq: 3, latitude: 2, longitude: 2 },
    ]);
    expect(out).toBe('color:0x2563eb|weight:5|0,0|1,1|2,2');
  });

  test('returns null for fewer than 2 points', () => {
    expect(buildTrailPath([])).toBeNull();
    expect(buildTrailPath([{ seq: 1, latitude: 0, longitude: 0 }])).toBeNull();
  });
});

describe('buildNumberedMarkers', () => {
  test('emits tiny markers without labels (numbers rendered in SVG overlay)', () => {
    const out = buildNumberedMarkers([
      { seq: 1, latitude: 0, longitude: 0 },
      { seq: 2, latitude: 1, longitude: 1 },
    ]);
    expect(out).toBe('markers=color:blue|size:tiny|0,0&markers=color:blue|size:tiny|1,1');
  });

  test('returns null for an empty input', () => {
    expect(buildNumberedMarkers([])).toBeNull();
  });
});

describe('buildTrailMapUrl', () => {
  test('combines boundary, trail, and numbered markers in the URL', () => {
    const url = buildTrailMapUrl({
      apiKey: 'k',
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
        { seq: 2, latitude: 0.001, longitude: 0.001 },
      ],
      sitePosts: [
        { name: 'A', latitude: 0, longitude: 0 },
        { name: 'B', latitude: 0.001, longitude: 0.001 },
      ],
      center: { latitude: 0.0005, longitude: 0.0005 },
      zoom: 18,
      width: 800,
      height: 600,
    });
    expect(url.searchParams.get('size')).toBe('800x600');
    expect(url.searchParams.get('center')).toBe('0.0005,0.0005');
    expect(url.searchParams.get('zoom')).toBe('18');
    expect(url.searchParams.get('key')).toBe('k');
    const paths = url.searchParams.getAll('path');
    expect(paths.length).toBe(2);
    expect(paths.some(p => p.startsWith('color:0x1e3a8a'))).toBe(true);
    expect(paths.some(p => p.startsWith('color:0x2563eb'))).toBe(true);
    const markers = url.searchParams.getAll('markers');
    expect(markers.length).toBe(2);
    expect(markers[0]).toMatch(/^color:blue\|size:tiny\|/);
  });
});

describe('fetchTrailMapPng', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const baseParams = {
    trailPoints: [
      { seq: 1, latitude: 0, longitude: 0 },
      { seq: 2, latitude: 0.001, longitude: 0.001 },
    ],
    sitePosts: [
      { name: 'A', latitude: 0, longitude: 0 },
      { name: 'B', latitude: 0.001, longitude: 0.001 },
    ],
    width: 800,
    height: 600,
  };

  test('returns null when no API key is configured', async () => {
    const saved = process.env.GOOGLE_MAPS_STATIC_API_KEY;
    const savedPublic = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_STATIC_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    try {
      const result = await fetchTrailMapPng({ ...baseParams, apiKey: null });
      expect(result).toBeNull();
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_STATIC_API_KEY = saved;
      if (savedPublic !== undefined) process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = savedPublic;
    }
  });

  test('returns null for non-positive dimensions', async () => {
    const result = await fetchTrailMapPng({ ...baseParams, apiKey: 'k', width: 0, height: 0 });
    expect(result).toBeNull();
  });

  test('returns null for an empty trail', async () => {
    const result = await fetchTrailMapPng({ ...baseParams, apiKey: 'k', trailPoints: [] });
    expect(result).toBeNull();
  });

  test('returns the buffer on a 200 response', async () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = jest.fn(async () =>
      new Response(fakePng, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchTrailMapPng({ ...baseParams, apiKey: 'k' });
    expect(result).not.toBeNull();
    expect(result!.equals(fakePng)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('returns null on a non-OK response', async () => {
    global.fetch = jest.fn(async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    const result = await fetchTrailMapPng({ ...baseParams, apiKey: 'k' });
    expect(result).toBeNull();
  });
});

describe('projectTrailToPixels', () => {
  const center = { latitude: 0, longitude: 0 };

  test('returns the image center for a point at the map center', () => {
    const pixels = projectTrailToPixels({
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
      ],
      center,
      zoom: 18,
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(pixels[0]!.x).toBeCloseTo(400, 5);
    expect(pixels[0]!.y).toBeCloseTo(300, 5);
  });

  test('places an east-of-center point to the right of the center', () => {
    const pixels = projectTrailToPixels({
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0.001 },
      ],
      center,
      zoom: 18,
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(pixels[0]!.x).toBeGreaterThan(400);
  });

  test('returns an empty list for an empty input', () => {
    const pixels = projectTrailToPixels({
      trailPoints: [],
      center,
      zoom: 18,
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(pixels).toEqual([]);
  });
});

describe('buildArrowOverlaySvg', () => {
  test('emits one polygon per qualifying segment', () => {
    const svg = buildArrowOverlaySvg(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      400, 300,
    );
    const polygons = svg.match(/<polygon /g) ?? [];
    expect(polygons.length).toBe(2);
  });

  test('skips segments shorter than the min-segment threshold', () => {
    const svg = buildArrowOverlaySvg(
      [
        { x: 0, y: 0 },
        { x: 5, y: 0 }, // shorter than the default 18px threshold
        { x: 200, y: 0 },
      ],
      400, 300,
    );
    const polygons = svg.match(/<polygon /g) ?? [];
    expect(polygons.length).toBe(1);
  });

  test('produces an empty svg body for fewer than 2 points', () => {
    const svg = buildArrowOverlaySvg([{ x: 0, y: 0 }], 400, 300);
    expect(svg).not.toMatch(/<polygon /);
  });

  test('rotates the arrow to follow the segment direction', () => {
    // Horizontal segment (apex pointing right)
    const right = buildArrowOverlaySvg(
      [{ x: 0, y: 100 }, { x: 100, y: 100 }],
      400, 300,
    );
    // Vertical-down segment (apex pointing down)
    const down = buildArrowOverlaySvg(
      [{ x: 100, y: 0 }, { x: 100, y: 100 }],
      400, 300,
    );
    // The arrow has 3 vertices; the apex is the one in the direction of
    // travel. For a horizontal arrow the apex is the rightmost vertex
    // (largest x); for a vertical arrow it's the bottommost (largest y).
    const rightPts = extractPolygonPoints(right)[0]!;
    const downPts = extractPolygonPoints(down)[0]!;
    const rightApex = rightPts.reduce((acc, p) => (p.x > acc.x ? p : acc), rightPts[0]!);
    const downApex = downPts.reduce((acc, p) => (p.y > acc.y ? p : acc), downPts[0]!);
    // Arrow center sits 55% along the segment, apex is +size/2 (=7) in
    // travel direction. Horizontal segment midpoint x = 55 → apex.x ≈ 62.
    expect(rightApex.x).toBeCloseTo(62, 0);
    expect(downApex.y).toBeCloseTo(62, 0);
    // The base vertices sit symmetrically behind the apex.
    const rightBaseXs = rightPts.filter(p => p !== rightApex).map(p => p.x);
    expect(Math.max(...rightBaseXs)).toBeCloseTo(48, 0);
    const downBaseYs = downPts.filter(p => p !== downApex).map(p => p.y);
    expect(Math.max(...downBaseYs)).toBeCloseTo(48, 0);
  });
});

function extractPolygonPoints(svg: string): Array<Array<{ x: number; y: number }>> {
  const out: Array<Array<{ x: number; y: number }>> = [];
  for (const m of svg.matchAll(/points="([^"]+)"/g)) {
    const pts = m[1]!.split(/\s+/).map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x!, y: y! };
    });
    out.push(pts);
  }
  return out;
}

describe('overlayDirectionArrows', () => {
  async function makeMapBuffer(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 220, g: 220, b: 220 } },
    }).png().toBuffer();
  }

  const trailPoints = [
    { seq: 1, latitude: 0, longitude: 0 },
    { seq: 2, latitude: 0, longitude: 0.001 },
    { seq: 3, latitude: 0, longitude: 0.002 },
  ];
  const center = { latitude: 0, longitude: 0.001 };

  test('returns the original buffer when there are fewer than 2 trail points', async () => {
    const base = await makeMapBuffer(640, 480);
    const out = await overlayDirectionArrows({
      mapBuffer: base,
      trailPoints: [{ seq: 1, latitude: 0, longitude: 0 }],
      center,
      zoom: 18,
      imageWidth: 640,
      imageHeight: 480,
    });
    expect(out).toBe(base);
  });

  test('returns the original buffer when center or zoom is missing', async () => {
    const base = await makeMapBuffer(640, 480);
    const out = await overlayDirectionArrows({
      mapBuffer: base,
      trailPoints,
      center: null,
      zoom: 18,
      imageWidth: 640,
      imageHeight: 480,
    });
    expect(out).toBe(base);
  });

  test('composites an arrow layer onto the base map and preserves dimensions', async () => {
    const base = await makeMapBuffer(640, 480);
    const out = await overlayDirectionArrows({
      mapBuffer: base,
      trailPoints,
      center,
      zoom: 18,
      imageWidth: 640,
      imageHeight: 480,
    });
    expect(out).not.toBe(base);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  test('handles a base buffer smaller than the requested dimensions (Google clamp)', async () => {
    // Simulate requesting 800×600 but Google returning 640×480.
    const base = await makeMapBuffer(640, 480);
    const out = await overlayDirectionArrows({
      mapBuffer: base,
      trailPoints,
      center,
      zoom: 18,
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(out).not.toBe(base);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });
});

describe('fetchTrailMapPng with arrow overlay', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('clamps to 640 and composites successfully when the request exceeds Google limits', async () => {
    // Simulate requesting 1000×800 — the clamp reduces both axes to
    // 640×640 (Google's per-axis hard cap). The fake response returns a
    // 640×640 PNG, and the function must read the actual buffer size and
    // create the arrow overlay at that size, not the requested 1000×800.
    const fakePng = await sharp({
      create: { width: 640, height: 640, channels: 3, background: { r: 220, g: 220, b: 220 } },
    }).png().toBuffer();

    global.fetch = jest.fn(async () =>
      new Response(new Uint8Array(fakePng), { status: 200, headers: { 'content-type': 'image/png' } }),
    ) as unknown as typeof fetch;

    const result = await fetchTrailMapPng({
      apiKey: 'k',
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
        { seq: 2, latitude: 0, longitude: 0.001 },
        { seq: 3, latitude: 0, longitude: 0.002 },
      ],
      sitePosts: [
        { name: 'A', latitude: 0, longitude: 0 },
        { name: 'B', latitude: 0.001, longitude: 0.001 },
      ],
      center: { latitude: 0, longitude: 0.001 },
      zoom: 18,
      width: 1000,
      height: 800,
    });
    expect(result).not.toBeNull();
    // The output should match the actual buffer returned by Google,
    // not the oversize 1000×800 request.
    const meta = await sharp(result!).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(640);
  });

  test('applies arrows at the clamped size when the width is over 640 but height is under', async () => {
    // Request 900×500 → width clamped to 640, height stays at 500.
    const fakePng = await sharp({
      create: { width: 640, height: 500, channels: 3, background: { r: 220, g: 220, b: 220 } },
    }).png().toBuffer();

    global.fetch = jest.fn(async () =>
      new Response(new Uint8Array(fakePng), { status: 200, headers: { 'content-type': 'image/png' } }),
    ) as unknown as typeof fetch;

    const result = await fetchTrailMapPng({
      apiKey: 'k',
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
        { seq: 2, latitude: 0, longitude: 0.001 },
        { seq: 3, latitude: 0, longitude: 0.002 },
      ],
      sitePosts: [
        { name: 'A', latitude: 0, longitude: 0 },
        { name: 'B', latitude: 0.001, longitude: 0.001 },
      ],
      center: { latitude: 0, longitude: 0.001 },
      zoom: 18,
      width: 900,
      height: 500,
    });
    expect(result).not.toBeNull();
    const meta = await sharp(result!).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(500);
  });
});

describe('planMarkerPlacement', () => {
  const center = { latitude: 0, longitude: 0 };
  const dims = { imageWidth: 640, imageHeight: 480 };

  // At zoom=18, 640px wide: 1 degree longitude = 640 * 2^18 / 360 = 466,033 px
  // So 1 px ≈ 0.00000215 deg, the 28-px stagger threshold ≈ 0.00006 deg.

  test('returns empty for an empty trail', () => {
    const out = planMarkerPlacement({ trailPoints: [], center, zoom: 18, ...dims });
    expect(out).toEqual([]);
  });

  test('returns a single non-staggered placement', () => {
    const out = planMarkerPlacement({
      trailPoints: [{ seq: 7, latitude: 0, longitude: 0 }], center, zoom: 18, ...dims,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.seq).toBe(7);
    expect(out[0]!.isStaggered).toBe(false);
    expect(out[0]!.labelX).toBe(out[0]!.realX);
    expect(out[0]!.labelY).toBe(out[0]!.realY);
  });

  test('does not stagger points that are far apart (> 28 px)', () => {
    // ~466 px apart → well above the threshold
    const out = planMarkerPlacement({
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
        { seq: 2, latitude: 0, longitude: 0.001 },
      ],
      center, zoom: 18, ...dims,
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.isStaggered).toBe(false);
    expect(out[1]!.isStaggered).toBe(false);
  });

  test('staggers overlapping markers (< 28 px apart)', () => {
    // ~14 px apart → below threshold
    const out = planMarkerPlacement({
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
        { seq: 2, latitude: 0, longitude: 0.00003 },
      ],
      center, zoom: 18, ...dims,
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.isStaggered).toBe(true);
    expect(out[1]!.isStaggered).toBe(true);
    expect(out[0]!.labelX).not.toBe(out[0]!.realX);
    expect(out[1]!.labelX).not.toBe(out[1]!.realX);
  });

  test('radial stagger for 3+ points sharing nearly the same pixel', () => {
    const out = planMarkerPlacement({
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0 },
        { seq: 2, latitude: 0, longitude: 0.00001 },
        { seq: 3, latitude: 0, longitude: 0.00002 },
      ],
      center, zoom: 18, ...dims,
    });
    expect(out).toHaveLength(3);
    expect(out.every(p => p.isStaggered)).toBe(true);
    // All three should have a leader line (label differs from real)
    expect(out[0]!.labelX).not.toBe(out[0]!.realX);
    expect(out[1]!.labelX).not.toBe(out[1]!.realX);
    expect(out[2]!.labelX).not.toBe(out[2]!.realX);
    // The middle point (dist < 1 px from centroid) uses radial spread → has a Y offset
    expect(out[1]!.labelY).not.toBe(out[1]!.realY);
  });

  test('prevents label from clipping off the image edge', () => {
    // Two points near the right edge (within 28 px of each other).
    // The outbound (eastward) stagger would push the label off-screen,
    // so the edge flip should redirect it.
    const out = planMarkerPlacement({
      trailPoints: [
        { seq: 1, latitude: 0, longitude: 0.00068 },
        { seq: 2, latitude: 0, longitude: 0.00065 },
      ],
      center, zoom: 18, ...dims,
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.isStaggered).toBe(true);
    expect(out[1]!.isStaggered).toBe(true);
    // Neither label should clip (at least circle-radius away from edge)
    const margin = 12;
    for (const p of out) {
      expect(p.labelX).toBeGreaterThanOrEqual(margin);
      expect(p.labelX).toBeLessThanOrEqual(640 - margin);
      expect(p.labelY).toBeGreaterThanOrEqual(margin);
      expect(p.labelY).toBeLessThanOrEqual(480 - margin);
    }
    // Near-edge point: leader line present
    expect(out[0]!.realX).not.toBe(out[0]!.labelX);
  });
});

describe('buildNumberedMarkersSvg', () => {
  test('returns an empty SVG for an empty placement list', () => {
    const svg = buildNumberedMarkersSvg([], 640, 480);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<circle');
    expect(svg).not.toContain('<line');
  });

  test('draws one circle and one text for a non-staggered marker', () => {
    const svg = buildNumberedMarkersSvg([
      { seq: 3, realX: 100, realY: 200, labelX: 100, labelY: 200, isStaggered: false },
    ], 640, 480);
    expect(svg).toContain('<circle');
    expect(svg).toContain('>3<');
    // No leader line (non-staggered)
    expect(svg).not.toContain('<line');
  });

  test('draws a leader line and circle for each staggered marker', () => {
    const svg = buildNumberedMarkersSvg([
      { seq: 1, realX: 300, realY: 200, labelX: 314, labelY: 200, isStaggered: true },
      { seq: 2, realX: 305, realY: 200, labelX: 291, labelY: 200, isStaggered: true },
    ], 640, 480);
    expect(svg).toContain('<line');
    const lineCount = (svg.match(/<line/g) || []).length;
    expect(lineCount).toBe(2);
    const circleCount = (svg.match(/<circle/g) || []).length;
    expect(circleCount).toBe(2);
    expect(svg).toContain('>1<');
    expect(svg).toContain('>2<');
  });
});

describe('overlayNumberedMarkers', () => {
  async function makeBuffer(w: number, h: number): Promise<Buffer> {
    return sharp({
      create: { width: w, height: h, channels: 3, background: { r: 220, g: 220, b: 220 } },
    }).png().toBuffer();
  }

  test('returns the original buffer when placements are empty', async () => {
    const base = await makeBuffer(640, 480);
    const out = await overlayNumberedMarkers({ mapBuffer: base, placements: [], imageWidth: 640, imageHeight: 480 });
    expect(out).toBe(base);
  });

  test('composites a single marker and preserves dimensions', async () => {
    const base = await makeBuffer(640, 480);
    const placements = [
      { seq: 1, realX: 320, realY: 240, labelX: 320, labelY: 240, isStaggered: false },
    ];
    const out = await overlayNumberedMarkers({ mapBuffer: base, placements, imageWidth: 640, imageHeight: 480 });
    expect(out).not.toBe(base);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  test('composites staggered markers with leader lines', async () => {
    const base = await makeBuffer(640, 480);
    const placements = [
      { seq: 1, realX: 300, realY: 240, labelX: 314, labelY: 230, isStaggered: true },
      { seq: 2, realX: 300, realY: 240, labelX: 286, labelY: 250, isStaggered: true },
    ];
    const out = await overlayNumberedMarkers({ mapBuffer: base, placements, imageWidth: 640, imageHeight: 480 });
    expect(out).not.toBe(base);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  test('defensive — uses actual buffer dimensions when requested size differs', async () => {
    // Buffer is 640×480 but the caller still passes 800×600
    const base = await makeBuffer(640, 480);
    const placements = [
      { seq: 1, realX: 320, realY: 240, labelX: 320, labelY: 240, isStaggered: false },
    ];
    const out = await overlayNumberedMarkers({ mapBuffer: base, placements, imageWidth: 800, imageHeight: 600 });
    expect(out).not.toBe(base);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });
});
