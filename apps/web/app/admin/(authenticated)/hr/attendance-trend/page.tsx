import { getCombinedAttendanceTrend, getMonthlyAttendanceHeatmap, getAttendanceFilterOptions } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { parseTrendSearchParams } from '@/lib/attendance-trend-params';
import AttendanceTrendFullscreen from './attendance-trend-fullscreen';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AttendanceTrendFullscreenPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission('dashboard-hr:view');

  const query = await searchParams;
  const parsed = parseTrendSearchParams(query);
  const { days, chart, heatmapYear, heatmapMonth } = parsed;

  const isHeatmap = chart === 'heatmap';

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (days - 1) * 86400000);

  const commonFilter = {
    departments: parsed.departments.length ? parsed.departments : undefined,
    officeIds: parsed.officeIds.length ? parsed.officeIds : undefined,
    siteIds: parsed.siteIds.length ? parsed.siteIds : undefined,
  };

  const [trend, filterOptions] = await Promise.all([
    isHeatmap
      ? getMonthlyAttendanceHeatmap({ year: heatmapYear, month: heatmapMonth, startDate, endDate, ...commonFilter })
      : getCombinedAttendanceTrend({ startDate, endDate, ...commonFilter }),
    getAttendanceFilterOptions(),
  ]);

  return (
    <AttendanceTrendFullscreen
      data={trend}
      currentDays={days}
      chart={chart}
      heatmapYear={heatmapYear}
      heatmapMonth={heatmapMonth}
      filterOptions={filterOptions}
      selectedDepartments={parsed.departments}
      selectedOfficeIds={parsed.officeIds}
      selectedSiteIds={parsed.siteIds}
    />
  );
}
