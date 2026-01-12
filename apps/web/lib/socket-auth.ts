import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { redis } from '@/lib/redis';
import { db as prisma } from '@/lib/prisma';
import { SocketAuth } from '../types/socket';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

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
    adminToken = cookies.admin_token;
    guardToken = cookies.guard_token;
  }

  // Allow token to be passed via handshake.auth for mobile/cross-origin clients
  if (authPayload?.token) {
    try {
      const decoded = jwt.decode(authPayload.token) as { adminId?: string; guardId?: string };
      if (decoded?.adminId) adminToken = authPayload.token;
      if (decoded?.guardId) guardToken = authPayload.token;
    } catch {
      // Ignore decode error
    }
  }

  const preferredRole = authPayload?.role;

  const tryAdminAuth = async () => {
    if (!adminToken) return null;
    try {
      const decoded = jwt.verify(adminToken, JWT_SECRET) as { adminId: string; tokenVersion?: number };
      const cachedVersion = await redis.get(`admin:token_version:${decoded.adminId}`);
      let currentVersion: number | null = null;

      if (cachedVersion !== null) {
        currentVersion = parseInt(cachedVersion, 10);
      } else {
        const admin = await prisma.admin.findUnique({
          where: { id: decoded.adminId },
          select: { tokenVersion: true, name: true },
        });
        if (admin) {
          currentVersion = admin.tokenVersion;
          await redis.set(`admin:token_version:${decoded.adminId}`, currentVersion.toString(), 'EX', 3600);
        }
      }

      if (currentVersion !== null && (decoded.tokenVersion === undefined || decoded.tokenVersion === currentVersion)) {
        const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId }, select: { name: true } });
        return {
          type: 'admin' as const,
          id: decoded.adminId,
          name: admin?.name || 'Admin',
        };
      }
    } catch {
      console.warn('Socket Auth: Admin token verification failed');
    }
    return null;
  };

  const tryGuardAuth = async () => {
    if (!guardToken) return null;
    try {
      const decoded = jwt.verify(guardToken, JWT_SECRET) as { guardId: string; tokenVersion?: number };
      const cachedVersion = await redis.get(`guard:${decoded.guardId}:token_version`);
      let currentVersion: number | null = null;

      if (cachedVersion !== null) {
        currentVersion = parseInt(cachedVersion, 10);
      } else {
        const guard = await prisma.guard.findUnique({
          where: { id: decoded.guardId },
          select: { tokenVersion: true, name: true, status: true, deletedAt: true },
        });
        if (guard && guard.status !== false && guard.deletedAt === null) {
          currentVersion = guard.tokenVersion;
          await redis.set(`guard:${decoded.guardId}:token_version`, currentVersion.toString(), 'EX', 3600);
        }
      }

      if (currentVersion !== null && decoded.tokenVersion === currentVersion) {
        const guard = await prisma.guard.findUnique({ where: { id: decoded.guardId }, select: { name: true } });
        return {
          type: 'guard' as const,
          id: decoded.guardId,
          name: guard?.name || 'Guard',
        };
      }
    } catch {
      console.warn('Socket Auth: Guard token verification failed');
    }
    return null;
  };

  if (preferredRole === 'guard') {
    const guardAuth = await tryGuardAuth();
    if (guardAuth) return guardAuth;
    return tryAdminAuth();
  }

  // Default priority: Admin then Guard
  const adminAuth = await tryAdminAuth();
  if (adminAuth) return adminAuth;
  return tryGuardAuth();
}
