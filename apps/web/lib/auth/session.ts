import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { db as prisma } from '@/lib/prisma';
import { JWT_SECRET, SESSION_CACHE_TTL } from './constants';

export type UserRole = 'admin' | 'guard';

export interface SessionPayload {
  userId: string;
  role: UserRole;
  tokenVersion?: number;
}

export interface SessionResult {
  isValid: boolean;
  userId: string | null;
  role: UserRole | null;
  roleName: string | null;
  permissions: string[];
  user?: unknown;
}

export async function verifySession(token: string, type: UserRole): Promise<SessionResult> {
  if (!token) {
    return { isValid: false, userId: null, role: null, roleName: null, permissions: [] };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId?: string; guardId?: string; tokenVersion?: number };
    const userId = type === 'admin' ? decoded.adminId : decoded.guardId;
    const tokenVersion = decoded.tokenVersion;

    if (!userId) {
      return { isValid: false, userId: null, role: null, roleName: null, permissions: [] };
    }

    const versionCacheKey = type === 'admin' ? `admin:token_version:${userId}` : `${type}:${userId}:token_version`;
    const permsCacheKey = `admin:permissions:${userId}`;

    let currentVersion: number | null = null;
    let roleName: string | null = null;
    let permissions: string[] = [];

    const cachedVersion = await redis.get(versionCacheKey);
    const cachedPerms = type === 'admin' ? await redis.get(permsCacheKey) : null;

    if (cachedVersion !== null) {
      currentVersion = parseInt(cachedVersion, 10);
      if (type === 'admin' && cachedPerms) {
        try {
          const parsed = JSON.parse(cachedPerms);
          roleName = parsed.roleName;
          permissions = parsed.permissions;
        } catch (e) {
          console.warn('[Auth] Failed to parse cached permissions', e);
        }
      }
    }

    // Fallback to DB if version or permissions (for admin) are missing
    if (currentVersion === null || (type === 'admin' && !roleName)) {
      if (type === 'admin') {
        // Use any to bypass Prisma type sync issues during development
        const admin = await prisma.admin.findUnique({
          where: { id: userId },
          include: {
            roleRef: {
              include: {
                permissions: true,
              },
            },
          },
        });

        if (admin && admin.deletedAt === null) {
          currentVersion = admin.tokenVersion;
          roleName = admin.roleRef?.name || null;
          permissions = admin.roleRef?.permissions.map(p => p.code) || [];

          await redis.set(versionCacheKey, currentVersion.toString(), 'EX', SESSION_CACHE_TTL);
          await redis.set(permsCacheKey, JSON.stringify({ roleName, permissions }), 'EX', SESSION_CACHE_TTL);
        }
      } else {
        const guard = await prisma.guard.findUnique({
          where: { id: userId },
          select: { tokenVersion: true, status: true, deletedAt: true },
        });
        if (guard && guard.status !== false && guard.deletedAt === null) {
          currentVersion = guard.tokenVersion;
          await redis.set(versionCacheKey, currentVersion.toString(), 'EX', SESSION_CACHE_TTL);
        }
      }
    }

    // Version check
    const versionMatch = (type === 'admin' && tokenVersion === undefined) || tokenVersion === currentVersion;

    if (currentVersion !== null && versionMatch) {
      return {
        isValid: true,
        userId,
        role: type,
        roleName,
        permissions,
      };
    }

    return { isValid: false, userId: null, role: null, roleName: null, permissions: [] };
  } catch (error) {
    console.warn(`[Auth] Session verification failed for ${type}:`, error);
    return { isValid: false, userId: null, role: null, roleName: null, permissions: [] };
  }
}
