/**
 * Source of Truth for RBAC Permissions.
 * Used for TypeScript type safety and auto-creation of permissions in the database.
 */

export const RESOURCES = [
  'guards',
  'sites',
  'shifts',
  'shift-types',
  'attendance',
  'checkins',
  'alerts',
  'changelogs',
  'admins',
  'roles',
  'system-settings',
  'dashboard',
] as const;

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

export type PermissionCode = `${Resource}:${Action}`;

export const PERMISSIONS: Record<string, Record<string, PermissionCode>> = {
  GUARDS: {
    VIEW: 'guards:view',
    CREATE: 'guards:create',
    EDIT: 'guards:edit',
    DELETE: 'guards:delete',
  },
  SITES: {
    VIEW: 'sites:view',
    CREATE: 'sites:create',
    EDIT: 'sites:edit',
    DELETE: 'sites:delete',
  },
  SHIFTS: {
    VIEW: 'shifts:view',
    CREATE: 'shifts:create',
    EDIT: 'shifts:edit',
    DELETE: 'shifts:delete',
  },
  SHIFT_TYPES: {
    VIEW: 'shift-types:view',
    CREATE: 'shift-types:create',
    EDIT: 'shift-types:edit',
    DELETE: 'shift-types:delete',
  },
  ATTENDANCE: {
    VIEW: 'attendance:view',
    EDIT: 'attendance:edit',
  },
  CHECKINS: {
    VIEW: 'checkins:view',
  },
  ALERTS: {
    VIEW: 'alerts:view',
    EDIT: 'alerts:edit', // Ack/Resolve
  },
  CHANGELOGS: {
    VIEW: 'changelogs:view',
  },
  ADMINS: {
    VIEW: 'admins:view',
    CREATE: 'admins:create',
    EDIT: 'admins:edit',
    DELETE: 'admins:delete',
  },
  ROLES: {
    VIEW: 'roles:view',
    CREATE: 'roles:create',
    EDIT: 'roles:edit',
    DELETE: 'roles:delete',
  },
  SYSTEM: {
    VIEW_SETTINGS: 'system-settings:view',
    EDIT_SETTINGS: 'system-settings:edit',
  },
  DASHBOARD: {
    VIEW: 'dashboard:view',
  },
} as const;

/**
 * Validates if a string is a valid PermissionCode according to our TS source of truth.
 */
export function isValidPermissionCode(code: string): code is PermissionCode {
  const [resource, action] = code.split(':') as [Resource, Action];
  return RESOURCES.includes(resource) && ACTIONS.includes(action);
}
