import { cookies } from 'next/headers';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';
import { PermissionCode } from './auth/permissions';
import { forbidden } from 'next/navigation';

export async function getAdminIdFromToken(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIES.ADMIN)?.value;

  if (!token) return '';

  const { isValid, userId } = await verifySession(token, 'admin');
  return isValid ? userId || '' : '';
}

export interface AdminSession {
  id: string;
  name: string;
  email: string;
  roleName: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIES.ADMIN)?.value;

  if (!token) return null;

  const { isValid, userId, roleName, permissions } = await verifySession(token, 'admin');

  if (!isValid || !userId) return null;

  const { prisma } = await import('./prisma');
  const admin = await prisma.admin.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!admin) return null;

  return {
    id: userId,
    name: admin.name,
    email: admin.email,
    roleName,
    permissions,
    isSuperAdmin: roleName === 'Super Admin',
  };
}

/**
 * Server-side permission check. Throws a forbidden error if the user lacks permission.
 * Should be called at the top of Server Components or Server Actions.
 * Supports passing a single permission or an array of permissions (all must be satisfied).
 */
export async function requirePermission(permission: PermissionCode | PermissionCode[]): Promise<AdminSession> {
  let session = await getAdminSession();

  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/admin/login');
  }

  session = session!;
  if (session.isSuperAdmin) {
    return session;
  }

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAllPermissions = permissions.every(p => session.permissions.includes(p));

  if (!hasAllPermissions) {
    forbidden();
  }

  return session;
}

/**
 * @deprecated Use getAdminSession for RBAC support
 */
export async function getCurrentAdmin() {
  const session = await getAdminSession();
  if (!session) return null;
  return {
    ...session,
    role: session.isSuperAdmin ? 'superadmin' : 'admin', // Shim for legacy checks
  };
}

export async function checkSuperAdmin() {
  const session = await getAdminSession();
  if (!session?.isSuperAdmin) {
    return null;
  }
  return session;
}
