'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { EmployeeSummary } from '@repo/database';
import PaginationNav from '../../components/pagination-nav';
import { useRouter, useSearchParams } from 'next/navigation';
import OfficeShiftExport from './office-shift-export';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';

type EmployeeDayOff = {
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

export default function EmployeeDayOffList({ startDate, endDate, employeeId, employees, page, perPage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dayOffs, setDayOffs] = useState<EmployeeDayOff[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const { apply } = useFilterUrlSync('/admin/office-shifts/day-offs');

  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    startDate ? parseISO(startDate) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    endDate ? parseISO(endDate) : undefined
  );
  const [filterEmployeeId, setFilterEmployeeId] = useState(employeeId || '');

  const handleApplyFilters = () => {
    apply({
      startDate: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      endDate: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : null,
      employeeId: filterEmployeeId || null,
    });
  };

  const handleClearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterEmployeeId('');
    apply({
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: null,
      employeeId: null,
    });
  };

  useEffect(() => {
    if (!startDate) return;

    const params = new URLSearchParams();
    params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (employeeId) params.set('employeeId', employeeId);

    fetch(`/admin/office-shifts/day-offs/api?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setDayOffs(data.dayOffs || []);
        setTotalCount(data.dayOffs?.length || 0);
      })
      .catch(() => {
        // Silently handle errors
      });
  }, [startDate, endDate, employeeId]);

  // Group day offs by date
  const dayOffsByDate = new Map<string, EmployeeDayOff[]>();
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
      {/* Header with filter button */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employee Days Off</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Employees scheduled for day off within the selected date range.
          </p>
        </div>
        <div className="flex gap-2">
          <OfficeShiftExport
            endpoint="/api/admin/office-shifts/day-offs/export"
            title="Export Employee Days Off"
          />
        </div>
      </div>

      {/* Filters */}
      <FilterBar onApply={handleApplyFilters} onClear={handleClearFilters}>
        <DateRangeFilter
          from={filterStartDate}
          to={filterEndDate}
          onChange={(from, to) => {
            setFilterStartDate(from);
            setFilterEndDate(to);
          }}
        />
        <SelectFilter
          label="Employee"
          value={filterEmployeeId}
          options={employees.map(e => ({ value: e.id, label: e.fullName }))}
          onChange={setFilterEmployeeId}
          id="filter-employee"
          instanceId="filter-employee"
          allLabel="All Employees"
        />
      </FilterBar>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {dayOffs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <p>No employee days off found for the selected date range.</p>
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
                      <div
                        key={dayOff.id}
                        className="px-6 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
                      >
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
    </div>
  );
}
