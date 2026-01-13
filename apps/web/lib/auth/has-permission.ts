import { db as prisma } from '@/lib/prisma';
import { isValidPermissionCode, PermissionCode } from './permissions';

export interface UserSession {
  userId: string;
  roleName: string | null;
  permissions: string[];
}

/**
 * Core permission checking logic.
 * - Super Admin always has access.
 * - Automatically creates missing permissions in DB if they are valid in TS source of truth.
 */
export async function hasPermission(user: UserSession | null, permissionCode: PermissionCode): Promise<boolean> {
  if (!user) return false;

  // 1. Super Admin Bypass
  if (user.roleName === 'Super Admin') {
    return true;
  }

  // 2. Check if user has the permission in their session
  const hasPerm = user.permissions.includes(permissionCode);

  // 3. Auto-creation Logic (Background/Reactive)
  // If the code is valid according to TS but potentially missing in DB, we ensure it exists.
  // This helps dev experience so they don't have to manually seed every new permission.
  if (isValidPermissionCode(permissionCode)) {
    // We don't await this to keep the check fast,
    // though in a server-side context we might want to ensure it's there for future checks.
    // Use a non-blocking check or a simple upsert.
    ensurePermissionInDb(permissionCode).catch(err =>
      console.error(`[RBAC] Failed to auto-create permission ${permissionCode}:`, err)
    );
  }

  return hasPerm;
}

/**
 * Ensures the permission exists in the database.
 * Resource and Action are parsed from the code.
 */
async function ensurePermissionInDb(code: PermissionCode) {
  const [resource, action] = code.split(':');

  // Only upsert if it doesn't already exist to minimize DB load
  await prisma.permission.upsert({
    where: { code },
    update: {},
    create: {
      code,
      resource,
      action,
      description: `Auto-generated permission for ${action} ${resource}`,
    },
  });
}
