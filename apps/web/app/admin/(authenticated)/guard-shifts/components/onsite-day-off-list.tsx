'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import type { EmployeeSummary } from '@repo/database';
import PaginationNav from '../../components/pagination-nav';
import OfficeShiftFilterModal from '../../office-shifts/components/office-shift-filter-modal';
import { useRouter, useSearchParams } from 'next/navigation';
import OfficeShiftExport from '../../office-shifts/components/office-shift-export';

type OnsiteDayOff = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  note: string | null;
};

type Props = {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  employees: EmployeeSummary[];
  page: number;
  perPage: number;
};

export default function OnsiteDayOffList({ startDate, endDate, employeeId, employees, page, perPage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dayOffs, setDayOffs] = useState<OnsiteDayOff[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    if (!startDate) return;

    const params = new URLSearchParams();
    params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (employeeId) params.set('employeeId', employeeId);

    fetch(`/api/admin/shifts/day-offs?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setDayOffs(data.dayOffs || []);
        setTotalCount(data.dayOffs?.length || 0);
      })
      .catch(() => {
        // Silently handle errors
      });
  }, [startDate, endDate, employeeId]);

  const handleApplyFilter = (filters: { startDate?: Date; endDate?: Date; employeeId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (filters.startDate) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.set('startDate', format(new Date(), 'yyyy-MM-dd'));
    }

    if (filters.endDate) {
      params.set('endDate', format(filters.endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    if (filters.employeeId) {
      params.set('employeeId', filters.employeeId);
    } else {
      params.delete('employeeId');
    }

    params.set('page', '1');
    router.push(`/admin/guard-shifts/day-offs?${params.toString()}`);
  };

  const activeFiltersCount = [startDate, endDate, employeeId].filter(Boolean).length;

  const dayOffsByDate = new Map<string, OnsiteDayOff[]>();
  dayOffs.forEach(dayOff => {
    const dateKey = format(new Date(dayOff.date), 'yyyy-MM-dd');
    if (!dayOffsByDate.has(dateKey)) {
      dayOffsByDate.set(dateKey, []);
    }
    dayOffsByDate.get(dateKey)!.push(dayOff);
  });

  const sortedDates = Array.from(dayOffsByDate.keys()).sort();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Onsite Employee Days Off</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Onsite employees scheduled for day off within the selected date range.
          </p>
        </div>
        <div className="flex gap-2">
          <OfficeShiftExport endpoint="/api/admin/shifts/day-offs/export" title="Export Employee Days Off" />
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm ${
              activeFiltersCount > 0
                ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400'
                : ''
            }`}
          >
            Filters
          </button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {dayOffs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <p>No onsite days off found for the selected date range.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedDates.map(dateKey => {
              const dateDayOffs = dayOffsByDate.get(dateKey)!;
              const displayDate = format(new Date(dateKey), 'EEEE, MMMM d, yyyy');

              return (
                <div key={dateKey}>
                  <div className="px-6 py-3 bg-muted/30 border-b border-border">
                    <h3 className="font-semibold text-foreground text-sm">{displayDate}</h3>
                    <p className="text-xs text-muted-foreground">
                      {dateDayOffs.length} employee{dateDayOffs.length !== 1 ? 's' : ''} off
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {dateDayOffs.map(dayOff => (
                      <div key={dayOff.id} className="px-6 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🌴</span>
                          <div>
                            <p className="font-medium text-foreground text-sm">
                              {dayOff.employeeCode} - {dayOff.employeeName}
                            </p>
                            {dayOff.note && <p className="text-xs text-muted-foreground mt-0.5">{dayOff.note}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      {isFilterOpen && (
        <OfficeShiftFilterModal
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          onApply={handleApplyFilter}
          initialFilters={{
            startDate,
            endDate,
            employeeId,
          }}
          employees={employees}
        />
      )}
    </div>
  );
}
