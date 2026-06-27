import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ArrowRight, Upload } from 'lucide-react';
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
  getPendingLeaveRequestsCount,
  getLeaveApprovedTodayCount,
  getLeaveRejectedTodayCount,
  getUpcomingOfficeShiftsOverview,
  getTodayOfficeShiftsOverview,
  getHrLiveActivities,
} from '@repo/database';
import { HRMetrics } from './components/hr-metrics';
import { AttendanceTrendChart } from './components/attendance-trend-chart';
import { LeaveRequestOverview } from './components/leave-request-overview';
import { UpcomingShiftsOverview } from './components/upcoming-shifts-overview';
import { TodayShiftsOverview } from './components/today-shifts-overview';
import { HrLiveFeed } from './components/hr-live-feed';
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
    pendingLeaveCount,
    leaveApprovedTodayCount,
    leaveRejectedTodayCount,
    upcomingShifts,
    todayShifts,
    initialActivities,
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
    getPendingLeaveRequestsCount(),
    getLeaveApprovedTodayCount(),
    getLeaveRejectedTodayCount(),
    getUpcomingOfficeShiftsOverview(new Date()),
    getTodayOfficeShiftsOverview(new Date()),
    getHrLiveActivities(),
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

        {/* Schedule Management Card */}
        <Card className="border-border/60 bg-card shadow-md flex flex-col justify-between">
          <CardHeader className="border-b border-border/45 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-foreground">Schedule Management</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Quick actions for managing office shifts and scheduling.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex flex-col justify-center gap-4">
            <a
              href="/admin/office-shifts"
              className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border text-foreground transition-all duration-200 group"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">View Office Shifts</span>
                <span className="text-xs text-muted-foreground">View and edit schedules</span>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </a>
            <a
              href="/admin/office-shifts?bulk=true"
              className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border text-foreground transition-all duration-200 group"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">Bulk Create Office Shifts</span>
                <span className="text-xs text-muted-foreground">Upload shifts in bulk</span>
              </div>
              <Upload className="h-4 w-4 text-blue-400 group-hover:translate-y-[-1px] transition-transform shrink-0" />
            </a>
          </CardContent>
        </Card>

        {/* Live HR Feed */}
        <HrLiveFeed initialActivities={initialActivities} />
      </div>
    </div>
  );
}
