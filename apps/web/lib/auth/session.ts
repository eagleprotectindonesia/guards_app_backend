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
  user?: unknown;
}

export async function verifySession(token: string, type: UserRole): Promise<SessionResult> {
  if (!token) {
    return { isValid: false, userId: null, role: null };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId?: string; guardId?: string; tokenVersion?: number };
    const userId = type === 'admin' ? decoded.adminId : decoded.guardId;
    const tokenVersion = decoded.tokenVersion;

    if (!userId) {
      return { isValid: false, userId: null, role: null };
    }

    const cacheKey = type === 'admin' ? `admin:token_version:${userId}` : `${type}:${userId}:token_version`;
    let currentVersion: number | null = null;

    const cachedVersion = await redis.get(cacheKey);
    if (cachedVersion !== null) {
      currentVersion = parseInt(cachedVersion, 10);
    } else {
      // Fallback to DB
      if (type === 'admin') {
        const admin = await prisma.admin.findUnique({
          where: { id: userId },
          select: { tokenVersion: true, deletedAt: true },
        });
        if (admin && admin.deletedAt === null) {
          currentVersion = admin.tokenVersion;
        }
      } else {
        const guard = await prisma.guard.findUnique({
          where: { id: userId },
          select: { tokenVersion: true, status: true, deletedAt: true },
        });
        if (guard && guard.status !== false && guard.deletedAt === null) {
          currentVersion = guard.tokenVersion;
        }
      }

      if (currentVersion !== null) {
        await redis.set(cacheKey, currentVersion.toString(), 'EX', SESSION_CACHE_TTL);
      }
    }

    // Version check
    // For admins, some older tokens might not have version, we allow them for now if currentVersion exists
    // For guards, version is mandatory in the current logic
    const versionMatch = (type === 'admin' && tokenVersion === undefined) || tokenVersion === currentVersion;

    if (currentVersion !== null && versionMatch) {
      return { isValid: true, userId, role: type };
    }

    return { isValid: false, userId: null, role: null };
  } catch (error) {
    console.warn(`[Auth] Session verification failed for ${type}:`, error);
    return { isValid: false, userId: null, role: null };
  }
}
