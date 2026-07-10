import { redis } from '@repo/database/redis';

const DEFAULT_STATIC_TTL = 30 * 24 * 60 * 60;
const DEFAULT_TRAIL_TTL = 7 * 24 * 60 * 60;
const NULL_CACHE_TTL_SECONDS = 60 * 60;

function resolveTtl(envKey: string, fallback: number): number {
  const env = process.env[envKey];
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function getStaticTtl(): number {
  return resolveTtl('SHIFT_PHOTO_MAP_CACHE_TTL_SECONDS', DEFAULT_STATIC_TTL);
}

function getTrailTtl(): number {
  return resolveTtl('SHIFT_PHOTO_TRAIL_MAP_CACHE_TTL_SECONDS', DEFAULT_TRAIL_TTL);
}

export function buildStaticMapCacheKey(lat: number, lng: number, zoom: number, width: number, height: number): string {
  return `shiftphoto:map:static:v2:${lat.toFixed(5)}:${lng.toFixed(5)}:z${zoom}:${Math.round(width)}x${Math.round(height)}`;
}

export function buildTrailMapCacheKey(shiftId: string, zoom: number | null, width: number, height: number): string {
  const z = zoom != null && Number.isFinite(zoom) ? `z${zoom}` : 'zauto';
  return `shiftphoto:map:trail:v2:${shiftId}:${z}:${Math.round(width)}x${Math.round(height)}`;
}

/** Returns the cached buffer, null for a cached "no map" result, or undefined on miss. */
export async function mapCacheGet(key: string): Promise<Buffer | null | undefined> {
  try {
    const val = await redis.getBuffer(key);
    if (val === null) return undefined;
    if (val.length === 0) return null;
    return val;
  } catch (err) {
    console.warn(`[MapCache] Redis read error for ${key}:`, err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * Stores a buffer in the cache.
 * `buffer = null` caches "no map" for a shorter TTL.
 * `ttlOverride` overrides the default TTL (used by trail maps which default to 7 days).
 */
export async function mapCacheSet(key: string, buffer: Buffer | null, ttlOverride?: number): Promise<void> {
  try {
    const ttl = ttlOverride ?? getStaticTtl();
    if (ttl === 0) return;
    const effectiveTtl = buffer === null ? Math.min(NULL_CACHE_TTL_SECONDS, ttl) : ttl;
    await redis.set(key, buffer ?? Buffer.alloc(0), 'EX', effectiveTtl);
  } catch (err) {
    console.warn(`[MapCache] Redis write error for ${key}:`, err instanceof Error ? err.message : String(err));
  }
}

export { getStaticTtl, getTrailTtl };
