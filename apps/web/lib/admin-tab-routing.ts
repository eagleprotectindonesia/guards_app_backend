export const ADMIN_TAB_SLUGS = ['dashboard', 'guard', 'ticket', 'workforce', 'client', 'system'] as const;
export const ADMIN_DASHBOARD_TAB_QUERY_KEY = 'dashboardTab';

export type AdminTabSlug = (typeof ADMIN_TAB_SLUGS)[number];

const ADMIN_TAB_SET = new Set<string>(ADMIN_TAB_SLUGS);

export function isAdminTabSlug(value: string): value is AdminTabSlug {
  return ADMIN_TAB_SET.has(value);
}

type SearchParamsLike = {
  get(name: string): string | null;
  has(name: string): boolean;
  toString(): string;
};

export function getDashboardTabFromSearchParams(searchParams: SearchParamsLike): AdminTabSlug | null {
  const rawValue = searchParams.get(ADMIN_DASHBOARD_TAB_QUERY_KEY);

  if (rawValue && isAdminTabSlug(rawValue)) {
    return rawValue;
  }

  return null;
}

export function getAdminTabFromPath(pathname: string): AdminTabSlug {
  const segments = pathname.split('/').filter(Boolean);
  const tabSegment = segments[1];

  if (tabSegment === 'hr') {
    return 'workforce';
  }

  if (tabSegment && isAdminTabSlug(tabSegment)) {
    return tabSegment;
  }

  return 'guard';
}

export function getSelectedAdminDashboardTab(pathname: string, searchParams: SearchParamsLike): AdminTabSlug {
  const queryTab = getDashboardTabFromSearchParams(searchParams);
  if (queryTab) {
    return queryTab;
  }

  if (searchParams.has(ADMIN_DASHBOARD_TAB_QUERY_KEY)) {
    return 'guard';
  }

  const pathTab = getAdminTabFromPath(pathname);
  if (pathTab !== 'guard') {
    return pathTab;
  }

  if (isDashboardPath(pathname)) {
    return pathTab;
  }

  return 'guard';
}

function parseHref(href: string) {
  const hashIndex = href.indexOf('#');
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';

  return {
    pathname,
    searchParams: new URLSearchParams(query),
    hash,
  };
}

export function appendDashboardTabToHref(href: string, tab: AdminTabSlug, force = false): string {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('#')) {
    return href;
  }

  const { pathname, searchParams, hash } = parseHref(href);

  if (force || !searchParams.has(ADMIN_DASHBOARD_TAB_QUERY_KEY)) {
    searchParams.set(ADMIN_DASHBOARD_TAB_QUERY_KEY, tab);
  }

  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

export function getAdminDashboardHref(tab: AdminTabSlug): string {
  if (tab === 'dashboard' || tab === 'guard') {
    return appendDashboardTabToHref('/admin/dashboard', tab, true);
  }
  if (tab === 'workforce') {
    return appendDashboardTabToHref('/admin/hr', tab, true);
  }

  return appendDashboardTabToHref(`/admin/${tab}/dashboard`, tab, true);
}

export function isDashboardPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard' || pathname === '/admin/new-dashboard') return true;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 3) return false;

  return segments[0] === 'admin' && isAdminTabSlug(segments[1]) && segments[2] === 'dashboard';
}
