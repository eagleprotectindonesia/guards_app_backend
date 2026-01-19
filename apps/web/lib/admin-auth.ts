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
  profileImage: string | null;
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
    select: { name: true, email: true, profileImage: true },
  });

  if (!admin) return null;

  return {
    id: userId,
    name: admin.name,
    email: admin.email,
    profileImage: admin.profileImage,
    roleName,
    permissions,
    isSuperAdmin: roleName === 'superadmin',
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

  const permissionCodes = Array.isArray(permission) ? permission : [permission];
  const uniqueResources = [...new Set(permissionCodes.map(code => code.split(':')[0]))];

  // Auto-create all CRUD permissions for the involved resources
  const { prisma } = await import('./prisma');
  const { ACTIONS } = await import('./auth/permissions');

  try {
    await Promise.all(
      uniqueResources.map(async (resource) => {
        if (!resource) return;

        // Ensure all standard CRUD actions exist for this resource
        await Promise.all(
          ACTIONS.map(async (action) => {
            const code = `${resource}:${action}`;
            await prisma.permission.upsert({
              where: { code },
              update: {}, // No update needed if it exists
              create: {
                code,
                resource,
                action,
                description: `Auto-generated permission for ${resource}:${action}`,
              },
            });
          })
        );
      })
    );
  } catch (error) {
    // We log but don't fail the request if auto-creation fails
    console.error('[Auth] Failed to auto-create CRUD permissions:', error);
  }

  if (session.isSuperAdmin) {
    return session;
  }

  const hasAllPermissions = permissionCodes.every(p => session.permissions.includes(p));

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
