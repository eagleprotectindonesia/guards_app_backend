import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

type TrendBucket = {
  date: string;
  present: number;
  late: number;
  absent: number;
};

export type AttendanceTrendFilter = {
  startDate: Date;
  endDate: Date;
  departments?: string[];
  officeIds?: string[];
  siteIds?: string[];
  timezone?: string;
};

export type LocationOption =
  | { type: 'office'; id: string; name: string }
  | { type: 'site'; id: string; name: string };

export type FilterOptions = {
  departments: string[];
  locations: LocationOption[];
};

const FILTER_OPTIONS_CACHE_KEY = 'attendance-trend:filter-options';
const FILTER_OPTIONS_CACHE_TTL = 3600;

function buildCacheKey(filter: AttendanceTrendFilter, tz: string): string {
  const parts = [
    'attendance-trend',
    tz,
    filter.startDate.toISOString().slice(0, 10),
    filter.endDate.toISOString().slice(0, 10),
  ];
  if (filter.departments?.length) parts.push('dept', [...filter.departments].sort().join(','));
  if (filter.officeIds?.length) parts.push('off', [...filter.officeIds].sort().join(','));
  if (filter.siteIds?.length) parts.push('site', [...filter.siteIds].sort().join(','));
  return parts.join(':');
}

export async function getAttendanceFilterOptions(): Promise<FilterOptions> {
  const cached = await redis.get(FILTER_OPTIONS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as FilterOptions;
    } catch {
      // Fall through to DB
    }
  }

  const [offices, sites, departmentGroups] = await Promise.all([
    prisma.office.findMany({
      where: { status: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.site.findMany({
      where: { status: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employee.groupBy({
      by: ['department'],
      where: { department: { not: null } },
      orderBy: { department: 'asc' },
    }),
  ]);

  const result: FilterOptions = {
    departments: departmentGroups.map((g) => g.department!).filter(Boolean),
    locations: [
      ...offices.map((o) => ({ type: 'office' as const, id: o.id, name: o.name })),
      ...sites.map((s) => ({ type: 'site' as const, id: s.id, name: s.name })),
    ],
  };

  await redis.set(FILTER_OPTIONS_CACHE_KEY, JSON.stringify(result), 'EX', FILTER_OPTIONS_CACHE_TTL);
  return result;
}

export async function getCombinedAttendanceTrend(
  filter: AttendanceTrendFilter
): Promise<TrendBucket[]> {
  const tz = filter.timezone || BUSINESS_TIMEZONE;

  const totalDays =
    Math.round((filter.endDate.getTime() - filter.startDate.getTime()) / 86400000) + 1;
  const dayDates: Date[] = [];
  const bucketMap = new Map<string, TrendBucket>();

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(filter.startDate.getTime() + i * 86400000);
    dayDates.push(d);
    const { dateKey } = getBusinessDayRange(d, tz);
    const label = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
    });
    bucketMap.set(dateKey, { date: label, present: 0, late: 0, absent: 0 });
  }

  const cacheKey = buildCacheKey(filter, tz);
  const todayStr = new Date().toISOString().slice(0, 10);
  const rangeEndStr = filter.endDate.toISOString().slice(0, 10);
  const includesToday = rangeEndStr === todayStr;

  if (!includesToday) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as TrendBucket[];
      } catch {
        // Fall through
      }
    }
  }

  const { start: rangeStart } = getBusinessDayRange(filter.startDate, tz);
  const { end: rangeEnd } = getBusinessDayRange(filter.endDate, tz);

  const [officeRows, onsiteRows] = await Promise.all([
    prisma.officeAttendance.findMany({
      where: {
        recordedAt: { gte: rangeStart, lte: rangeEnd },
        status: { in: ['present', 'late', 'absent', 'clocked_out'] },
        ...(filter.departments?.length
          ? { employee: { department: { in: filter.departments } } }
          : {}),
        ...(filter.officeIds?.length
          ? {
              OR: [
                { officeId: { in: filter.officeIds } },
                { employee: { officeId: { in: filter.officeIds } } },
              ],
            }
          : {}),
      },
      select: { recordedAt: true, status: true },
    }),
    prisma.attendance.findMany({
      where: {
        recordedAt: { gte: rangeStart, lte: rangeEnd },
        status: { in: ['present', 'late', 'absent', 'clocked_out'] },
        employee: {
          role: 'on_site',
          ...(filter.departments?.length
            ? { department: { in: filter.departments } }
            : {}),
        },
        ...(filter.siteIds?.length ? { shift: { siteId: { in: filter.siteIds } } } : {}),
      },
      select: { recordedAt: true, status: true },
    }),
  ]);

  for (const row of officeRows) {
    const { dateKey } = getBusinessDayRange(row.recordedAt, tz);
    const bucket = bucketMap.get(dateKey);
    if (!bucket) continue;
    if (row.status === 'present' || row.status === 'clocked_out') bucket.present++;
    else if (row.status === 'late') bucket.late++;
    else if (row.status === 'absent') bucket.absent++;
  }

  for (const row of onsiteRows) {
    const { dateKey } = getBusinessDayRange(row.recordedAt, tz);
    const bucket = bucketMap.get(dateKey);
    if (!bucket) continue;
    if (row.status === 'present' || row.status === 'clocked_out') bucket.present++;
    else if (row.status === 'late') bucket.late++;
    else if (row.status === 'absent') bucket.absent++;
  }

  const result = dayDates.map((d) => {
    const { dateKey } = getBusinessDayRange(d, tz);
    return bucketMap.get(dateKey)!;
  });

  if (includesToday) {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
  } else {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 2592000);
  }

  return result;
}
