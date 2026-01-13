import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { db as prisma } from '@/lib/prisma';
import { SocketAuth } from '../types/socket';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';

export async function authenticateSocket(handshake: {
  headers: { cookie?: string };
  auth?: { token?: string; role?: 'admin' | 'guard' };
}): Promise<SocketAuth | null> {
  const cookieHeader = handshake.headers.cookie;
  const authPayload = handshake.auth;

  let adminToken: string | undefined;
  let guardToken: string | undefined;

  if (cookieHeader) {
    const cookies = cookie.parse(cookieHeader);
    adminToken = cookies[AUTH_COOKIES.ADMIN];
    guardToken = cookies[AUTH_COOKIES.GUARD];
  }

  const tryAdminAuth = async () => {
    if (!adminToken) return null;
    const { isValid, userId } = await verifySession(adminToken, 'admin');
    if (isValid && userId) {
      const admin = await prisma.admin.findUnique({ where: { id: userId }, select: { name: true } });
      return {
        type: 'admin' as const,
        id: userId,
        name: admin?.name || 'Admin',
      };
    }
    return null;
  };

  const tryGuardAuth = async () => {
    if (!guardToken) return null;
    const { isValid, userId } = await verifySession(guardToken, 'guard');
    if (isValid && userId) {
      const guard = await prisma.guard.findUnique({ where: { id: userId }, select: { name: true } });
      return {
        type: 'guard' as const,
        id: userId,
        name: guard?.name || 'Guard',
      };
    }
    return null;
  };

  const preferredRole = authPayload?.role;

  // Priority detection:
  // 1. If explicit token is provided in auth payload, prioritize the role it implies
  if (authPayload?.token) {
    try {
      const decoded = jwt.decode(authPayload.token) as { adminId?: string; guardId?: string };
      if (decoded?.adminId) {
        adminToken = authPayload.token;
        const auth = await tryAdminAuth();
        if (auth) return auth;
      } else if (decoded?.guardId) {
        guardToken = authPayload.token;
        const auth = await tryGuardAuth();
        if (auth) return auth;
      }
    } catch {
      // Ignore decode error
    }
  }

  // 2. If preferred role is specified, try that first
  if (preferredRole === 'guard') {
    const auth = await tryGuardAuth();
    if (auth) return auth;
    return tryAdminAuth();
  }

  // 3. Default priority: Admin cookie then Guard cookie
  const adminAuth = await tryAdminAuth();
  if (adminAuth) return adminAuth;
  return tryGuardAuth();
}
