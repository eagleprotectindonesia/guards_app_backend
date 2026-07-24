import { redis } from '@repo/database/redis';

/** Thrown when a rate-limit Redis call fails — routes map this to 503. */
export class RateLimitBackendError extends Error {
  constructor(cause: unknown) {
    super('Rate-limit backend unavailable');
    this.name = 'RateLimitBackendError';
    this.cause = cause;
  }
}

// --- Tunables -----------------------------------------------------------------
const WINDOW_SECONDS = 15 * 60; // 15 minutes
const MAX_PASSWORD_ATTEMPTS = 5; // per account per window
const MAX_IP_ATTEMPTS = 30; // per IP per window (credential stuffing defense)
const MAX_2FA_ATTEMPTS = 5; // per pending-2FA session (matches 5m cookie)
const MAX_BIOMETRIC_ATTEMPTS = 10; // per token per window
const LOCKOUT_SECONDS = WINDOW_SECONDS;
const TOTP_WINDOW_SECONDS = 5 * 60; // matches ADMIN_2FA_PENDING cookie lifetime

export interface ThrottleResult {
  allowed: boolean;
  retryAfter?: number; // seconds remaining in the window
}

const TRUSTED_PROXY_HOPS = (() => {
  const raw = process.env.RATE_LIMIT_TRUSTED_PROXIES;
  if (raw === undefined || raw === '') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
})();

/**
 * Extracts the client IP. Only trusts x-forwarded-for when RATE_LIMIT_TRUSTED_PROXIES
 * is set to the number of trusted reverse-proxy hops in front of the app (e.g. ALB +
 * nginx). The header is then walked from the right, skipping N hops, so a client cannot
 * spoof the IP by prepending their own value to the header.
 */
function clientIp(req: Request): string {
  if (TRUSTED_PROXY_HOPS > 0) {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) {
      const hops = fwd.split(',').map(s => s.trim()).filter(Boolean);
      const idx = hops.length - TRUSTED_PROXY_HOPS;
      if (idx >= 0 && hops[idx]) return hops[idx];
    }
    const real = req.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return 'unknown';
}

async function incrWindow(key: string, ttl: number): Promise<number> {
  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, ttl, 'NX');
    const results = await multi.exec();
    return (results?.[0]?.[1] as number) ?? 0;
  } catch (err) {
    throw new RateLimitBackendError(err);
  }
}

/**
 * Atomically increments `counterKey` (setting TTL on first write) and, if the
 * post-increment value >= `threshold`, sets `lockKey` with NX EX. Returns
 * [count, locked] where locked is 1 if THIS call claimed the lock.
 */
async function incrWithLock(
  counterKey: string,
  counterTtl: number,
  threshold: number,
  lockKey: string,
  lockTtl: number,
): Promise<{ count: number; locked: boolean }> {
  try {
    const client = redis as unknown as Record<string, unknown>;
    /* eslint-disable no-unused-vars */
    const command = client.rlIncrWithLock as (
      counterKey: string,
      lockKey: string,
      counterTtl: string,
      threshold: string,
      lockTtl: string,
    ) => Promise<[number, string | null]>;
    /* eslint-enable no-unused-vars */
    const result = await command(
      counterKey,
      lockKey,
      String(counterTtl),
      String(threshold),
      String(lockTtl),
    );
    return { count: result[0], locked: result[1] === '1' };
  } catch (err) {
    throw new RateLimitBackendError(err);
  }
}

async function ttlOf(key: string): Promise<number> {
  try {
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    throw new RateLimitBackendError(err);
  }
}

async function getWithFail(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    throw new RateLimitBackendError(err);
  }
}

async function delWithFail(...keys: string[]): Promise<void> {
  try {
    await redis.del(...keys);
  } catch (err) {
    throw new RateLimitBackendError(err);
  }
}

// --- Login (password) throttle ------------------------------------------------

export async function checkLoginThrottle(opts: {
  accountKey: string;
  ip: string;
}): Promise<ThrottleResult> {
  const accountKey = `login:fail:${opts.accountKey}`;
  const ipKey = `login:ip:${opts.ip}`;

  const [accountCount, ipCount] = await Promise.all([getWithFail(accountKey), getWithFail(ipKey)]);

  const accountHits = accountCount ? parseInt(accountCount, 10) : 0;
  const ipHits = ipCount ? parseInt(ipCount, 10) : 0;

  if (accountHits >= MAX_PASSWORD_ATTEMPTS) {
    return { allowed: false, retryAfter: await ttlOf(accountKey) };
  }
  if (ipHits >= MAX_IP_ATTEMPTS) {
    return { allowed: false, retryAfter: await ttlOf(ipKey) };
  }
  return { allowed: true };
}

export async function recordLoginFailure(opts: { accountKey: string; ip: string }): Promise<void> {
  await Promise.all([
    incrWindow(`login:fail:${opts.accountKey}`, LOCKOUT_SECONDS),
    incrWindow(`login:ip:${opts.ip}`, WINDOW_SECONDS),
  ]);
}

export async function clearLoginFailures(opts: { accountKey: string }): Promise<void> {
  await delWithFail(`login:fail:${opts.accountKey}`);
}

// --- 2FA (TOTP) attempt counter ----------------------------------------------

export async function check2faAttempts(adminId: string): Promise<ThrottleResult> {
  const lockKey = `2fa:locked:${adminId}`;
  if (await getWithFail(lockKey)) {
    return { allowed: false, retryAfter: await ttlOf(lockKey) };
  }
  return { allowed: true };
}

export async function record2faFailure(adminId: string): Promise<void> {
  await incrWithLock(
    `2fa:fail:${adminId}`,
    TOTP_WINDOW_SECONDS,
    MAX_2FA_ATTEMPTS,
    `2fa:locked:${adminId}`,
    TOTP_WINDOW_SECONDS,
  );
}

export async function clear2faAttempts(adminId: string): Promise<void> {
  await delWithFail(`2fa:fail:${adminId}`, `2fa:locked:${adminId}`);
}

// --- Biometric throttle -------------------------------------------------------

export async function checkBiometricThrottle(opts: {
  tokenHash: string;
  ip: string;
}): Promise<ThrottleResult> {
  const key = `biometric:fail:${opts.tokenHash}`;
  const hits = await getWithFail(key);
  const count = hits ? parseInt(hits, 10) : 0;
  if (count >= MAX_BIOMETRIC_ATTEMPTS) {
    return { allowed: false, retryAfter: await ttlOf(key) };
  }
  return { allowed: true };
}

export async function recordBiometricFailure(opts: {
  tokenHash: string;
  ip: string;
}): Promise<void> {
  await incrWindow(`biometric:fail:${opts.tokenHash}`, WINDOW_SECONDS);
}

export { clientIp };
