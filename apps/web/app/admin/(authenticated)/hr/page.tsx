import React from 'react';
import {
  getTotalEmployeeCountByRole,
  getActiveLeavesCountForDate,
  getOfficePresentCountForDate,
  getOfficeLateCountForDate,
  getOfficeAbsentCountForDate,
  getOnsitePresentCountForDate,
  getOnsiteLateCountForDate,
  getOnsiteAbsentCountForDate,
  getCombinedAttendanceTrend,
  getMonthlyAttendanceHeatmap,
  getAttendanceFilterOptions,
  getTodayYesterdayAttendanceStats,
  getPendingLeaveRequestsCount,
  getLeaveApprovedTodayCount,
  getLeaveRejectedTodayCount,
  getUpcomingOfficeShiftsOverview,
  getTodayOfficeShiftsOverview,
  getLatestSystemChangelogs,
  getUpcomingBirthdays,
} from '@repo/database';
import { HRMetrics } from './components/hr-metrics';
import { AttendanceTrendChart } from './components/attendance-trend-chart';
import { LeaveRequestOverview } from './components/leave-request-overview';
import { UpcomingShiftsOverview } from './components/upcoming-shifts-overview';
import { TodayShiftsOverview } from './components/today-shifts-overview';
import { UpcomingBirthdays } from './components/upcoming-birthdays';
import { HrChangelogPanel } from './components/hr-live-feed';
import { requirePermission } from '@/lib/admin-auth';
import { parseTrendSearchParams } from '@/lib/attendance-trend-params';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function HRDashboardPage({ searchParams }: { searchParams: SearchParams }) {
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

  const [
    officeEmployeeCount,
    onsiteEmployeeCount,
    activeLeavesCount,
    officeOnLeaveCount,
    onsiteOnLeaveCount,
    officePresentCount,
    officeLateCount,
    officeAbsentCount,
    onsitePresentCount,
    onsiteLateCount,
    onsiteAbsentCount,
    attendanceData,
    filterOptions,
    dayStats,
    pendingLeaveCount,
    leaveApprovedTodayCount,
    leaveRejectedTodayCount,
    upcomingShifts,
    todayShifts,
    changelogs,
    upcomingBirthdays,
  ] = await Promise.all([
    getTotalEmployeeCountByRole('office'),
    getTotalEmployeeCountByRole('on_site'),
    getActiveLeavesCountForDate(),
    getActiveLeavesCountForDate(new Date(), 'office'),
    getActiveLeavesCountForDate(new Date(), 'on_site'),
    getOfficePresentCountForDate(),
    getOfficeLateCountForDate(),
    getOfficeAbsentCountForDate(),
    getOnsitePresentCountForDate(),
    getOnsiteLateCountForDate(),
    getOnsiteAbsentCountForDate(),
    isHeatmap
      ? getMonthlyAttendanceHeatmap({ year: heatmapYear, month: heatmapMonth, startDate, endDate, ...commonFilter })
      : getCombinedAttendanceTrend({ startDate, endDate, ...commonFilter }),
    getAttendanceFilterOptions(),
    getTodayYesterdayAttendanceStats(commonFilter),
    getPendingLeaveRequestsCount(),
    getLeaveApprovedTodayCount(),
    getLeaveRejectedTodayCount(),
    getUpcomingOfficeShiftsOverview(new Date()),
    getTodayOfficeShiftsOverview(new Date()),
    getLatestSystemChangelogs(10),
    getUpcomingBirthdays(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">HR Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor employee metrics, schedules, leave statuses, and upcoming events.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <HRMetrics
        officeEmployeeCount={officeEmployeeCount}
        onsiteEmployeeCount={onsiteEmployeeCount}
        officePresentCount={officePresentCount}
        onsitePresentCount={onsitePresentCount}
        officeLateCount={officeLateCount}
        onsiteLateCount={onsiteLateCount}
        officeAbsentCount={officeAbsentCount}
        onsiteAbsentCount={onsiteAbsentCount}
        officeOnLeaveCount={officeOnLeaveCount}
        onsiteOnLeaveCount={onsiteOnLeaveCount}
      />

      {/* Row 2: Attendance Overview and Placeholders */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* Column 1: Leave Request Overview */}
        <LeaveRequestOverview
          pendingCount={pendingLeaveCount}
          approvedTodayCount={leaveApprovedTodayCount}
          rejectedTodayCount={leaveRejectedTodayCount}
          onLeaveTodayCount={activeLeavesCount}
        />

        {/* Column 2-3: Attendance Overview Trend Chart */}
        <div className="md:col-span-2">
          <AttendanceTrendChart
            data={attendanceData}
            currentDays={days}
            chart={chart}
            heatmapYear={heatmapYear}
            heatmapMonth={heatmapMonth}
            filterOptions={filterOptions}
            selectedDepartments={parsed.departments}
            selectedOfficeIds={parsed.officeIds}
            selectedSiteIds={parsed.siteIds}
            summaryStats={dayStats}
          />
        </div>

        {/* Column 4: Upcoming Shifts Overview */}
        <UpcomingShiftsOverview
          todayUpcoming={upcomingShifts.todayUpcoming}
          tomorrow={upcomingShifts.tomorrow}
          next7Days={upcomingShifts.next7Days}
        />
      </div>

      {/* Main Grid Content */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Today's Shift Overview */}
        <TodayShiftsOverview
          completed={todayShifts.completed}
          ongoing={todayShifts.ongoing}
          upcoming={todayShifts.upcoming}
        />

        {/* Upcoming Birthdays */}
        <UpcomingBirthdays birthdays={upcomingBirthdays} />

        {/* Latest Changelog Panel */}
        <HrChangelogPanel changelogs={changelogs} />
      </div>
    </div>
  );
}
