import { redis } from '@repo/database/redis';
import {
  buildStaticMapCacheKey,
  buildTrailMapCacheKey,
  mapCacheGet,
  mapCacheSet,
} from './map-cache';

jest.mock('@repo/database/redis', () => ({
  redis: {
    getBuffer: jest.fn(),
    set: jest.fn(),
  },
}));

const mockGetBuffer = redis.getBuffer as jest.Mock;
const mockSet = redis.set as jest.Mock;

beforeEach(() => {
  mockGetBuffer.mockReset();
  mockSet.mockReset();
});

const SAVED_TTL = process.env.SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS;

afterEach(() => {
  if (SAVED_TTL === undefined) delete process.env.SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS;
  else process.env.SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS = SAVED_TTL;
});

describe('buildStaticMapCacheKey', () => {
  test('produces a stable key for identical params', () => {
    const key1 = buildStaticMapCacheKey(-8.655812, 115.219442, 17, 204, 320);
    const key2 = buildStaticMapCacheKey(-8.655812, 115.219442, 17, 204, 320);
    expect(key1).toBe(key2);
  });

  test('rounds coordinates to 5 decimal places', () => {
    const key = buildStaticMapCacheKey(-8.6558123, 115.2194427, 17, 204, 320);
    expect(key).toContain('-8.65581');
    expect(key).toContain('115.21944');
  });

  test('different coords produce different keys', () => {
    const keyA = buildStaticMapCacheKey(-8.65581, 115.21944, 17, 204, 320);
    const keyB = buildStaticMapCacheKey(-8.65582, 115.21944, 17, 204, 320);
    expect(keyA).not.toBe(keyB);
  });

  test('different zoom produces different key', () => {
    const key17 = buildStaticMapCacheKey(-8.65581, 115.21944, 17, 204, 320);
    const key18 = buildStaticMapCacheKey(-8.65581, 115.21944, 18, 204, 320);
    expect(key17).not.toBe(key18);
  });

  test('different size produces different key', () => {
    const keySmall = buildStaticMapCacheKey(-8.65581, 115.21944, 17, 200, 300);
    const keyBig = buildStaticMapCacheKey(-8.65581, 115.21944, 17, 400, 600);
    expect(keySmall).not.toBe(keyBig);
  });

  test('key format is as expected', () => {
    const key = buildStaticMapCacheKey(-8.65581, 115.21944, 17, 204, 320);
    expect(key).toMatch(/^shiftphoto:map:static:v2:-?[\d.]+:-?[\d.]+:z\d+:\d+x\d+$/);
    expect(key).toBe('shiftphoto:map:static:v2:-8.65581:115.21944:z17:204x320');
  });

  test('rounds width and height to integers', () => {
    const key = buildStaticMapCacheKey(-8.65581, 115.21944, 17, 203.82, 320.49);
    expect(key).toContain(':204x320');
  });
});

describe('buildTrailMapCacheKey', () => {
  test('includes shiftId, zoom, and size', () => {
    const key = buildTrailMapCacheKey('shift-abc-123', 17, 640, 480);
    expect(key).toBe('shiftphoto:map:trail:v2:shift-abc-123:z17:640x480');
  });

  test('uses "zauto" when zoom is null', () => {
    const key = buildTrailMapCacheKey('shift-abc-123', null, 640, 480);
    expect(key).toContain(':zauto:');
  });

  test('different shiftIds produce different keys', () => {
    const keyA = buildTrailMapCacheKey('shift-a', 17, 640, 480);
    const keyB = buildTrailMapCacheKey('shift-b', 17, 640, 480);
    expect(keyA).not.toBe(keyB);
  });
});

describe('mapCacheGet', () => {
  test('returns undefined on Redis miss (null)', async () => {
    mockGetBuffer.mockResolvedValue(null);
    const result = await mapCacheGet('some-key');
    expect(result).toBeUndefined();
  });

  test('returns null for a cached "no map" result (empty buffer)', async () => {
    mockGetBuffer.mockResolvedValue(Buffer.alloc(0));
    const result = await mapCacheGet('some-key');
    expect(result).toBeNull();
  });

  test('returns the buffer on cache hit', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockGetBuffer.mockResolvedValue(png);
    const result = await mapCacheGet('some-key');
    expect(result).toEqual(png);
  });

  test('returns undefined when Redis throws', async () => {
    mockGetBuffer.mockRejectedValue(new Error('connection lost'));
    const result = await mapCacheGet('some-key');
    expect(result).toBeUndefined();
  });
});

describe('mapCacheSet', () => {
  test('stores a buffer with EX and default static TTL (30 days)', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await mapCacheSet('some-key', png);
    expect(mockSet).toHaveBeenCalledWith('some-key', png, 'EX', 30 * 24 * 60 * 60);
  });

  test('stores a buffer with ttlOverride for trail maps', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await mapCacheSet('trail-key', png, 7 * 24 * 60 * 60);
    expect(mockSet).toHaveBeenCalledWith('trail-key', png, 'EX', 7 * 24 * 60 * 60);
  });

  test('stores an empty buffer for null (cached "no map") with shorter TTL', async () => {
    await mapCacheSet('some-key', null);
    expect(mockSet).toHaveBeenCalledWith('some-key', Buffer.alloc(0), 'EX', 60 * 60);
  });

  test('respects SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS env var for static maps', async () => {
    process.env.SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS = '3600';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await mapCacheSet('some-key', png);
    expect(mockSet).toHaveBeenCalledWith('some-key', png, 'EX', 3600);
  });

  test('respects SHIFT_PHOTO_TRAIL_MAP_CACHE_TTL_SECONDS env var via ttlOverride', async () => {
    process.env.SHIFT_PHOTO_TRAIL_MAP_CACHE_TTL_SECONDS = '86400';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await mapCacheSet('trail-key', png, 86400);
    expect(mockSet).toHaveBeenCalledWith('trail-key', png, 'EX', 86400);
  });

  test('skips write when TTL is 0 (cache disabled)', async () => {
    process.env.SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS = '0';
    await mapCacheSet('some-key', Buffer.from([1]));
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('logs a warning when Redis set fails (does not throw)', async () => {
    mockSet.mockRejectedValue(new Error('OOM'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    await mapCacheSet('some-key', Buffer.from([1]));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
