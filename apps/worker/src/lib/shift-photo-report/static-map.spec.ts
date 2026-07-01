import { fetchStaticMapPng, resolveGoogleMapsApiKey } from './static-map';

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
