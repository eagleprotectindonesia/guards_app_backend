'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttendanceTrendFilters } from '../components/attendance-trend-filters';
import { AttendanceTrendControls } from '../components/attendance-trend-controls';
import { AttendanceTrendRenderer, StatusFilterLegend } from '../components/attendance-trend-renderer';
import { AttendanceTrendSummaryCards } from '../components/attendance-trend-summary-cards';
import { AttendanceDayDrilldownModal } from '../components/attendance-day-drilldown-modal';
import type { TrendData, ChartType } from '../components/attendance-trend-renderer';
import type { DayStatsData } from '../components/attendance-trend-summary-cards';
import type { FilterOptions } from '@repo/database';

type Props = {
  data: TrendData[];
  currentDays: 7 | 15 | 30;
  chart: ChartType;
  heatmapYear: number;
  heatmapMonth: number;
  filterOptions: FilterOptions;
  selectedDepartments: string[];
  selectedOfficeIds: string[];
  selectedSiteIds: string[];
  summaryStats?: {
    today: DayStatsData;
    yesterday: DayStatsData;
  };
};

export default function AttendanceTrendFullscreen({
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">Attendance Overview</h3>
          <span className="h-3.5 w-px bg-border" />
          <div className="flex items-center gap-2">
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
          </div>
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => window.close()}
          title="Close tab"
          aria-label="Close tab"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        {summaryStats && !isHeatmap && (
          <div className="shrink-0 mb-4">
            <AttendanceTrendSummaryCards today={summaryStats.today} yesterday={summaryStats.yesterday} />
          </div>
        )}
        <div className="flex-1 min-h-0 flex flex-col">
          <AttendanceTrendRenderer
            data={data}
            days={currentDays}
            chart={chart}
            statusFilter={statusFilter}
            fullHeight
            heatmapYear={heatmapYear}
            heatmapMonth={heatmapMonth}
            onDayClick={handleDayClick}
          />
        </div>
        {!isHeatmap && (
          <StatusFilterLegend
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        )}
      </div>
      <AttendanceDayDrilldownModal
        isOpen={!!drillDate}
        onClose={() => setDrillDate(null)}
        date={drillDate || ''}
        departments={selectedDepartments.length ? selectedDepartments : undefined}
        officeIds={selectedOfficeIds.length ? selectedOfficeIds : undefined}
        siteIds={selectedSiteIds.length ? selectedSiteIds : undefined}
      />
    </div>
  );
}
