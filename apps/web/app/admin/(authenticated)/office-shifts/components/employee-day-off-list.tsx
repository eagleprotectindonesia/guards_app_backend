'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import type { EmployeeSummary } from '@repo/database';
import PaginationNav from '../../components/pagination-nav';

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
  const [dayOffs, setDayOffs] = useState<EmployeeDayOff[]>([]);
  const [totalCount, setTotalCount] = useState(0);

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
      {/* Filters Info */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {startDate && endDate
            ? `Showing day offs from ${format(new Date(startDate), 'MMM d, yyyy')} to ${format(new Date(endDate), 'MMM d, yyyy')}`
            : startDate
              ? `Showing day offs from ${format(new Date(startDate), 'MMM d, yyyy')}`
              : 'Showing all day offs'}
          {employeeId &&
            (() => {
              const emp = employees.find(e => e.id === employeeId);
              return emp ? ` for ${emp.fullName}` : '';
            })()}
        </p>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/50">
          <h2 className="text-lg font-bold text-foreground">🌴 Employee Day Offs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Employees scheduled for day off within the selected date range.
          </p>
        </div>

        {dayOffs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <p>No employee day offs found for the selected date range.</p>
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
