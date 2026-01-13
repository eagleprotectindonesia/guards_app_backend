import { cookies } from 'next/headers';
import { getGuardById } from '@/lib/data-access/guards';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';

export type GuardPayload = {
  guardId: string;
  tokenVersion?: number;
};

export async function getAuthenticatedGuard() {
  const tokenCookie = (await cookies()).get(AUTH_COOKIES.GUARD);

  if (!tokenCookie) {
    return null;
  }

  const { isValid, userId } = await verifySession(tokenCookie.value, 'guard');

  if (!isValid || !userId) {
    return null;
  }

  return getGuardById(userId);
}

/**
 * Lightweight session verification that favors Redis cache over DB.
 * Ideal for high-frequency polling.
 */
export async function verifyGuardSession() {
  const tokenCookie = (await cookies()).get(AUTH_COOKIES.GUARD);

  if (!tokenCookie) {
    return false;
  }

  const { isValid } = await verifySession(tokenCookie.value, 'guard');
  return isValid;
}
