'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Maximize, Maximize2, X } from 'lucide-react';
import { AttendanceTrendFilters } from './attendance-trend-filters';
import { AttendanceTrendControls } from './attendance-trend-controls';
import { AttendanceTrendRenderer, StatusFilterLegend } from './attendance-trend-renderer';
import { AttendanceTrendSummaryCards } from './attendance-trend-summary-cards';
import { AttendanceDayDrilldownModal } from './attendance-day-drilldown-modal';
import type { TrendData, ChartType } from './attendance-trend-renderer';
import type { DayStatsData } from './attendance-trend-summary-cards';
import type { LocationOption } from '@repo/database';

type Props = {
  data: TrendData[];
  currentDays: 1 | 7 | 15 | 30;
  chart: ChartType;
  heatmapYear: number;
  heatmapMonth: number;
  filterOptions: {
    departments: string[];
    locations: LocationOption[];
  };
  selectedDepartments: string[];
  selectedOfficeIds: string[];
  selectedSiteIds: string[];
  summaryStats?: {
    today: DayStatsData;
    yesterday: DayStatsData;
  };
};

export function AttendanceTrendChart({
  data,
  currentDays,
  chart,
  heatmapYear,
  heatmapMonth,
  filterOptions,
  selectedDepartments,
  selectedOfficeIds,
  selectedSiteIds,
  summaryStats,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [partialMaximized, setPartialMaximized] = useState(false);

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleChartChange = (newChart: ChartType) => {
    updateParams({ chart: newChart });
  };

  const handleDaysChange = (days: number) => {
    updateParams({ days: days.toString() });
  };

  const handleMonthChange = (year: number, month: number) => {
    updateParams({ heatmapYear: year.toString(), heatmapMonth: month.toString() });
  };

  const isHeatmap = chart === 'heatmap';
  const [drillDate, setDrillDate] = useState<string | null>(null);

  const handleDayClick = (isoDate: string) => {
    setDrillDate(isoDate);
  };

  const handleCloseDrilldown = () => setDrillDate(null);

  const renderChartContent = (fullHeight?: boolean) => (
    <>
        <AttendanceTrendRenderer
          data={data}
          days={currentDays}
          chart={chart}
          statusFilter={statusFilter}
          fullHeight={fullHeight}
          heatmapYear={heatmapYear}
          heatmapMonth={heatmapMonth}
          onDayClick={handleDayClick}
        />
      {!isHeatmap && (
        <StatusFilterLegend
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}
    </>
  );

  return (
    <>
      <Card className="border-border/60 bg-card shadow-md w-full h-full">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/45 pb-4 gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground">Attendance Overview</h3>
            <p className="text-xs text-muted-foreground">
              {isHeatmap
                ? 'Monthly attendance distribution overview.'
                : (currentDays === 1 ? "Today's" : `${currentDays}-day`) + ' status distribution and check-in trend analysis.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AttendanceTrendFilters
              departments={filterOptions.departments}
              locations={filterOptions.locations}
              selectedDepartments={selectedDepartments}
              selectedOfficeIds={selectedOfficeIds}
              selectedSiteIds={selectedSiteIds}
            />
            <AttendanceTrendControls
              chart={chart}
              onChartChange={handleChartChange}
              days={currentDays}
              onDaysChange={handleDaysChange}
              heatmapMonth={{ year: heatmapYear, month: heatmapMonth }}
              onMonthChange={handleMonthChange}
            />
            <span className="h-3.5 w-px bg-border" />
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPartialMaximized(true)}
                title="Maximize (75%)"
                aria-label="Maximize chart to 75%"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => window.open(`/admin/hr/attendance-trend?${searchParams.toString()}`, '_blank')}
                title="Maximize fullscreen"
                aria-label="Maximize chart fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {summaryStats && !isHeatmap && (
            <AttendanceTrendSummaryCards today={summaryStats.today} yesterday={summaryStats.yesterday} />
          )}
          {renderChartContent()}
        </CardContent>
      </Card>
      <Dialog open={partialMaximized} onOpenChange={setPartialMaximized}>
        <DialogContent
          showCloseButton={false}
          className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] max-w-[75vw] sm:max-w-[75vw] h-[75vh] max-h-[75vh] sm:max-h-[75vh] rounded-xl p-0 gap-0 border-border shadow-2xl flex flex-col"
        >
          <DialogClose asChild>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 left-4 z-10 h-10 w-10 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-md hover:bg-card"
              title="Close"
              aria-label="Close maximized chart"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogClose>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 pl-14 border-b border-border shrink-0">
            <h3 className="text-sm font-bold text-foreground">Attendance Overview</h3>
            <AttendanceTrendControls
              chart={chart}
              onChartChange={handleChartChange}
              days={currentDays}
              onDaysChange={handleDaysChange}
              heatmapMonth={{ year: heatmapYear, month: heatmapMonth }}
              onMonthChange={handleMonthChange}
            />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            {renderChartContent(true)}
          </div>
        </DialogContent>
      </Dialog>
      <AttendanceDayDrilldownModal
        isOpen={!!drillDate}
        onClose={handleCloseDrilldown}
        date={drillDate || ''}
        departments={selectedDepartments.length ? selectedDepartments : undefined}
        officeIds={selectedOfficeIds.length ? selectedOfficeIds : undefined}
        siteIds={selectedSiteIds.length ? selectedSiteIds : undefined}
      />
    </>
  );
}
