import { AlertReason } from '@prisma/client';
import { db as prisma } from '../prisma/client';

export type TopSiteActivityItem = {
  siteId: string;
  siteName: string;
  total: number;
  guard: number;
  onsite: number;
  lastAlertAt: string;
};

export type TopSitesActivityForDashboard = {
  windowStart: string;
  windowEnd: string;
  sites: TopSiteActivityItem[];
  lastUpdatedAt: string;
};

const INCIDENT_REASONS = [AlertReason.missed_attendance, AlertReason.missed_checkin] as const;

export async function getTopSitesByActivityForDashboard(
  now: Date,
  siteId?: string,
  options?: { limit?: number }
): Promise<TopSitesActivityForDashboard> {
  const limit = Math.max(1, options?.limit ?? 5);
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const grouped = await prisma.alert.groupBy({
    by: ['siteId', 'reason'],
    where: {
      severity: 'critical',
      reason: { in: INCIDENT_REASONS as unknown as AlertReason[] },
      createdAt: {
        gte: windowStart,
        lt: windowEnd,
      },
      ...(siteId ? { siteId } : {}),
    },
    _count: {
      _all: true,
    },
    _max: {
      createdAt: true,
    },
  });

  if (grouped.length === 0) {
    return {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      sites: [],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const siteIds = Array.from(new Set(grouped.map(row => row.siteId)));
  const siteRows = await prisma.site.findMany({
    where: {
      id: { in: siteIds },
    },
    select: {
      id: true,
      name: true,
    },
  });
  const siteNameById = new Map(siteRows.map(site => [site.id, site.name]));

  const bySite = new Map<string, { total: number; guard: number; onsite: number; lastAlertAtMs: number }>();

  for (const row of grouped) {
    const current = bySite.get(row.siteId) ?? { total: 0, guard: 0, onsite: 0, lastAlertAtMs: 0 };
    const count = row._count._all;

    current.total += count;
    if (row.reason === AlertReason.missed_attendance) current.guard += count;
    if (row.reason === AlertReason.missed_checkin) current.onsite += count;

    const maxAtMs = row._max.createdAt ? new Date(row._max.createdAt).getTime() : 0;
    current.lastAlertAtMs = Math.max(current.lastAlertAtMs, maxAtMs);

    bySite.set(row.siteId, current);
  }

  const sites = Array.from(bySite.entries())
    .map(([id, value]) => ({
      siteId: id,
      siteName: siteNameById.get(id) ?? 'Unknown Site',
      total: value.total,
      guard: value.guard,
      onsite: value.onsite,
      lastAlertAt: new Date(value.lastAlertAtMs || now.getTime()).toISOString(),
    }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const timeDiff = new Date(b.lastAlertAt).getTime() - new Date(a.lastAlertAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.siteName.localeCompare(b.siteName);
    })
    .slice(0, limit);

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    sites,
    lastUpdatedAt: new Date().toISOString(),
  };
}
