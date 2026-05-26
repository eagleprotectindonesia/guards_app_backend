export const ADMIN_TAB_SLUGS = ['live', 'ticket', 'workforce', 'client', 'system'] as const;

export type AdminTabSlug = (typeof ADMIN_TAB_SLUGS)[number];

const ADMIN_TAB_SET = new Set<string>(ADMIN_TAB_SLUGS);

export function isAdminTabSlug(value: string): value is AdminTabSlug {
  return ADMIN_TAB_SET.has(value);
}

export function getAdminTabFromPath(pathname: string): AdminTabSlug {
  const segments = pathname.split('/').filter(Boolean);
  const tabSegment = segments[1];

  if (tabSegment && isAdminTabSlug(tabSegment)) {
    return tabSegment;
  }

  return 'live';
}

export function getAdminDashboardHref(tab: AdminTabSlug): string {
  return `/admin/${tab}/dashboard`;
}

export function isDashboardPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard') return true;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 3) return false;

  return segments[0] === 'admin' && isAdminTabSlug(segments[1]) && segments[2] === 'dashboard';
}
