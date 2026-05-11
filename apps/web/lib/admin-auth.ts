import { cookies } from 'next/headers';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';
import { PermissionCode } from './auth/permissions';
import { forbidden } from 'next/navigation';
import { RolePolicy } from '@repo/validations';
import { redis } from '@repo/database/redis';
import { SESSION_CACHE_TTL } from './auth/constants';

function isSuperAdminRole(roleName: string | null) {
  return roleName === 'Super Admin' || roleName === 'superadmin';
}
export interface AdminAuthSession {
  id: string;
  roleName: string | null;
  permissions: string[];
  rolePolicy: RolePolicy;
  isSuperAdmin: boolean;
}

export async function getAdminIdFromToken(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIES.ADMIN)?.value;

  if (!token) return '';

  const { isValid, userId } = await verifySession(token, 'admin');
  return isValid ? userId || '' : '';
}

export interface AdminSession {
  id: AdminAuthSession['id'];
  name: string;
  email: string;
  profileImage: string | null;
  roleName: AdminAuthSession['roleName'];
  permissions: AdminAuthSession['permissions'];
  rolePolicy: AdminAuthSession['rolePolicy'];
  isSuperAdmin: AdminAuthSession['isSuperAdmin'];
}

export async function getAdminAuthSession(): Promise<AdminAuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIES.ADMIN)?.value;

  if (!token) return null;

  const { isValid, userId, roleName, permissions, rolePolicy } = await verifySession(token, 'admin');

  if (!isValid || !userId) return null;

  return {
    id: userId,
    roleName,
    permissions,
    rolePolicy,
    isSuperAdmin: isSuperAdminRole(roleName),
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIES.ADMIN)?.value;

  if (!token) return null;

  const { isValid, userId, roleName, permissions, rolePolicy, name, email, profileImage } = await verifySession(token, 'admin');

  if (!isValid || !userId) return null;

  let profileName = name;
  let profileEmail = email;
  let profileImageValue = profileImage ?? null;

  if (!profileName || !profileEmail) {
    const { db } = await import('@repo/database');
    const admin = await db.admin.findUnique({
      where: { id: userId },
      select: { name: true, email: true, profileImage: true },
    });
    if (!admin) return null;

    profileName = admin.name;
    profileEmail = admin.email;
    profileImageValue = admin.profileImage;

    await redis.set(
      `admin:permissions:${userId}`,
      JSON.stringify({
        roleName,
        permissions,
        rolePolicy,
        name: profileName,
        email: profileEmail,
        profileImage: profileImageValue,
      }),
      'EX',
      SESSION_CACHE_TTL
    );
  }

  return {
    id: userId,
    name: profileName,
    email: profileEmail,
    profileImage: profileImageValue,
    roleName,
    permissions,
    rolePolicy,
    isSuperAdmin: isSuperAdminRole(roleName),
  };
}

export function adminHasPermission(session: Pick<AdminSession, 'permissions' | 'isSuperAdmin'>, permission: PermissionCode) {
  return session.isSuperAdmin || session.permissions.includes(permission);
}

/**
 * Server-side permission check. Throws a forbidden error if the user lacks permission.
 * Should be called at the top of Server Components or Server Actions.
 * Supports passing a single permission or an array of permissions (all must be satisfied).
 */
export async function requirePermission(permission: PermissionCode | PermissionCode[]): Promise<AdminAuthSession> {
  const permissionCodes = Array.isArray(permission) ? permission : [permission];
  const authSession = await getAdminAuthSession();

  if (!authSession) {
    const { redirect } = await import('next/navigation');
    redirect('/admin/login');
  }

  const session = authSession!;

  if (session.isSuperAdmin) {
    return session;
  }

  const hasAllPermissions = permissionCodes.every(p => adminHasPermission(session!, p));

  if (!hasAllPermissions) {
    forbidden();
  }

  return session;
}

/**
 * @deprecated Use getAdminSession for RBAC support
 */
export async function getCurrentAdmin() {
  const session = await getAdminAuthSession();
  if (!session) return null;
  return {
    ...session,
    role: session.isSuperAdmin ? 'superadmin' : 'admin', // Shim for legacy checks
  };
}

export async function checkSuperAdmin() {
  const session = await getAdminAuthSession();
  if (!session?.isSuperAdmin) {
    return null;
  }
  return session;
}
