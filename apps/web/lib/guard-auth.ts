import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getGuardById } from '@/lib/data-access/guards';
import { redis } from '@/lib/redis';
import { db as prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export type GuardPayload = {
  guardId: string;
  tokenVersion?: number;
};

export async function getAuthenticatedGuard() {
  const tokenCookie = (await cookies()).get('guard_token');

  if (!tokenCookie) {
    return null;
  }

  try {
    const decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as GuardPayload;

    const guard = await getGuardById(decoded.guardId);

    if (!guard || guard.tokenVersion !== decoded.tokenVersion) {
      return null;
    }

    return guard;
  } catch (error) {
    console.error('Guard auth error:', error);
    return null;
  }
}

/**
 * Lightweight session verification that favors Redis cache over DB.
 * Ideal for high-frequency polling.
 */
export async function verifyGuardSession() {
  const tokenCookie = (await cookies()).get('guard_token');

  if (!tokenCookie) {
    return false;
  }

  try {
    const decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as GuardPayload;
    const { guardId, tokenVersion } = decoded;

    if (!guardId || tokenVersion === undefined) {
      return false;
    }

    // 1. Try Redis Cache
    const cachedVersion = await redis.get(`guard:${guardId}:token_version`);
    if (cachedVersion !== null) {
      return parseInt(cachedVersion, 10) === tokenVersion;
    }

    // 2. Fallback to DB - only select tokenVersion
    const guard = await prisma.guard.findUnique({
      where: { id: guardId },
      select: { tokenVersion: true, status: true, deletedAt: true },
    });

    if (!guard || guard.status === false || guard.deletedAt !== null) {
      return false;
    }

    // 3. Update Cache (valid for 1 hour)
    await redis.set(`guard:${guardId}:token_version`, guard.tokenVersion.toString(), 'EX', 3600);

    return guard.tokenVersion === tokenVersion;
  } catch (error) {
    console.error('Verify guard session error:', error);
    return false;
  }
}
