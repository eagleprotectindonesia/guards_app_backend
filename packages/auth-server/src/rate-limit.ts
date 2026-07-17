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

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
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

async function setExWithFail(key: string, ttl: number, value?: string): Promise<void> {
  try {
    await redis.set(key, value ?? '1', 'EX', ttl);
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

export async function clearLoginFailures(opts: { accountKey: string; ip: string }): Promise<void> {
  await Promise.all([
    delWithFail(`login:fail:${opts.accountKey}`, `login:ip:${opts.ip}`),
  ]);
}

// --- 2FA (TOTP) attempt counter ----------------------------------------------

export async function check2faAttempts(adminId: string): Promise<ThrottleResult> {
  if (await getWithFail(`2fa:locked:${adminId}`)) {
    return { allowed: false, retryAfter: await ttlOf(`2fa:locked:${adminId}`) };
  }
  const hits = await getWithFail(`2fa:fail:${adminId}`);
  const count = hits ? parseInt(hits, 10) : 0;
  if (count >= MAX_2FA_ATTEMPTS) {
    await setExWithFail(`2fa:locked:${adminId}`, TOTP_WINDOW_SECONDS);
    return { allowed: false, retryAfter: TOTP_WINDOW_SECONDS };
  }
  return { allowed: true };
}

export async function record2faFailure(adminId: string): Promise<void> {
  const count = await incrWindow(`2fa:fail:${adminId}`, TOTP_WINDOW_SECONDS);
  if (count >= MAX_2FA_ATTEMPTS) {
    await setExWithFail(`2fa:locked:${adminId}`, TOTP_WINDOW_SECONDS);
  }
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
