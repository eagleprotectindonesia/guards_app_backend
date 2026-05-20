/// <reference path="./jsonwebtoken.d.ts" />
import jwt from 'jsonwebtoken';
import { db as prisma } from '@repo/database';
import { redis } from '@repo/database/redis';
import { RolePolicy } from '@repo/validations';
import { getJwtSecret, SESSION_CACHE_TTL } from './constants';
import { normalizeRolePolicy } from './role-policy';

export type UserRole = 'admin' | 'employee';

export interface SessionPayload {
  userId: string;
  role: UserRole;
  sessionId?: string;
}

export interface SessionResult {
  isValid: boolean;
  reason?: 'missing_token' | 'invalid_token' | 'version_mismatch' | 'backend_error' | 'inactive_session';
  userId: string | null;
  role: UserRole | null;
  roleName: string | null;
  permissions: string[];
  rolePolicy: RolePolicy;
  name?: string | null;
  email?: string | null;
  profileImage?: string | null;
  user?: unknown;
}

function createInvalidSessionResult(reason: SessionResult['reason']): SessionResult {
  return {
    isValid: false,
    reason,
    userId: null,
    role: null,
    roleName: null,
    permissions: [],
    rolePolicy: normalizeRolePolicy(null),
  };
}

export async function verifySession(token: string, type: UserRole): Promise<SessionResult> {
  if (!token) {
    return createInvalidSessionResult('missing_token');
  }

  try {
    let decoded: {
      adminId?: string;
      employeeId?: string;
      guardId?: string;
      tokenVersion?: number;
      sessionId?: string;
    };

    try {
      decoded = jwt.verify(token, getJwtSecret()) as typeof decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        console.warn(`[Auth] Invalid session token for ${type}:`, error);
        return createInvalidSessionResult('invalid_token');
      }

      throw error;
    }

    const userId = type === 'admin' ? decoded.adminId : decoded.employeeId || decoded.guardId;
    const sessionId = decoded.sessionId;

    if (!userId) {
      return createInvalidSessionResult('invalid_token');
    }

    const versionCacheKey = type === 'admin' ? `admin:token_version:${userId}` : null;
    const permsCacheKey = `admin:permissions:${userId}`;

    let currentVersion: number | null = null;
    let roleName: string | null = null;
    let permissions: string[] = [];
    let rolePolicy = normalizeRolePolicy(null);
    let name: string | null = null;
    let email: string | null = null;
    let profileImage: string | null = null;

    let cachedVersion: string | null = null;
    let cachedPerms: string | null = null;

    try {
      cachedVersion = versionCacheKey ? await redis.get(versionCacheKey) : null;
      cachedPerms = type === 'admin' ? await redis.get(permsCacheKey) : null;
    } catch (error) {
      console.warn('[Auth] Redis read failed during session verification, falling back to database:', error);
    }

    if (cachedVersion !== null) {
      currentVersion = parseInt(cachedVersion, 10);
      if (type === 'admin' && cachedPerms) {
        try {
          const parsed = JSON.parse(cachedPerms);
          roleName = parsed.roleName;
          permissions = parsed.permissions;
          rolePolicy = normalizeRolePolicy(parsed.rolePolicy);
          name = parsed.name ?? null;
          email = parsed.email ?? null;
          profileImage = parsed.profileImage ?? null;
        } catch (e) {
          console.warn('[Auth] Failed to parse cached permissions', e);
        }
      }
    }

    const adminProfileMissing = type === 'admin' && (!name || !email);

    if ((type === 'admin' && currentVersion === null) || (type === 'admin' && !roleName) || adminProfileMissing || type === 'employee') {
      if (type === 'admin') {
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
          rolePolicy = normalizeRolePolicy(admin.roleRef?.policy);
          name = admin.name;
          email = admin.email;
          profileImage = admin.profileImage;

          try {
            if (versionCacheKey) {
              await redis.set(versionCacheKey, currentVersion.toString(), 'EX', SESSION_CACHE_TTL);
            }
            await redis.set(
              permsCacheKey,
              JSON.stringify({ roleName, permissions, rolePolicy, name, email, profileImage }),
              'EX',
              SESSION_CACHE_TTL
            );
          } catch (error) {
            console.warn('[Auth] Redis write failed during session verification:', error);
          }
        }
      } else {
        if (!sessionId) {
          return createInvalidSessionResult('invalid_token');
        }

        const employee = await prisma.employee.findUnique({
          where: { id: userId },
          select: {
            status: true,
            deletedAt: true,
            sessions: {
              where: { id: sessionId },
              select: {
                id: true,
                revokedAt: true,
                expiresAt: true,
              },
              take: 1,
            },
          },
        });

        const session = employee?.sessions[0];
        if (
          employee &&
          employee.status !== false &&
          employee.deletedAt === null &&
          session &&
          session.revokedAt === null &&
          session.expiresAt > new Date()
        ) {
          return {
            isValid: true,
            userId,
            role: type,
            roleName,
            permissions,
            rolePolicy,
          };
        }

        return {
          isValid: false,
          reason: 'inactive_session',
          userId: null,
          role: null,
          roleName: null,
          permissions: [],
          rolePolicy: normalizeRolePolicy(null),
        };
      }
    }

    const versionMatch = type === 'admin' && (decoded.tokenVersion === undefined || decoded.tokenVersion === currentVersion);

    if (type === 'admin' && currentVersion !== null && versionMatch) {
      return {
        isValid: true,
        userId,
        role: type,
        roleName,
        permissions,
        rolePolicy,
        name,
        email,
        profileImage,
      };
    }

    return {
      isValid: false,
      reason: 'version_mismatch',
      userId: null,
      role: null,
      roleName: null,
      permissions: [],
      rolePolicy: normalizeRolePolicy(null),
    };
  } catch (error) {
    console.warn(`[Auth] Session verification failed for ${type}:`, error);
    return {
      isValid: false,
      reason: 'backend_error',
      userId: null,
      role: null,
      roleName: null,
      permissions: [],
      rolePolicy: normalizeRolePolicy(null),
    };
  }
}
