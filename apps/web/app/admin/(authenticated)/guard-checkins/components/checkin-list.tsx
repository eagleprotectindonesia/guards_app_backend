'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Checkin, Shift, Site } from '@prisma/client';
import type { EmployeeSummary } from '@repo/database';
import type { Serialized } from '@/lib/server-utils';
import PaginationNav from '../../components/pagination-nav';
import { MapPin, Clock } from 'lucide-react';
import CheckinExport from './checkin-export';
import { format, parseISO } from 'date-fns';
import { JsonValue } from '@prisma/client/runtime/client';
import { useAdminRouter } from '../../context/admin-router';
import SortableHeader from '@/components/sortable-header';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';

// Define the type for a Checkin with its relations
// Define a type for the checkin metadata that includes location information
type CheckinMetadata = {
  lat: number;
  lng: number;
  latenessMins?: number;
};

// Type employee to check if an object has valid location data
function hasValidLocation(metadata: JsonValue): metadata is CheckinMetadata {
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    'lat' in metadata &&
    'lng' in metadata &&
    typeof metadata.lat === 'number' &&
    typeof metadata.lng === 'number'
  );
}

type CheckinWithRelations = Checkin & {
  employee: EmployeeSummary;
  shift: Shift & {
    site: Site;
  };
};

export type CheckinListProps = {
  checkins: Serialized<CheckinWithRelations>[];
  page: number;
  perPage: number;
  totalCount: number;
  employees: Serialized<EmployeeSummary>[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
  };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export default function CheckinList({
  checkins,
  page,
  perPage,
  totalCount,
  employees,
  initialFilters,
  sortBy = 'time',
  sortOrder = 'desc',
}: CheckinListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const { apply } = useFilterUrlSync('');

  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [filterEmployeeId, setFilterEmployeeId] = useState(initialFilters.employeeId || '');

  const handleApplyFilters = () => {
    apply({
      from: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : null,
      to: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : null,
      employeeId: filterEmployeeId || null,
    });
  };

  const handleClearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterEmployeeId('');
    apply({
      from: null,
      to: null,
      employeeId: null,
    });
  };

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'desc');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Guard Check-ins</h1>
          <p className="text-sm text-muted-foreground mt-1">View employee guard check-in history and status.</p>
        </div>
        <div className="flex items-center gap-2">
          <CheckinExport initialFilters={initialFilters} employees={employees} />
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

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12 text-center">#</th>
                <SortableHeader label="Employee" field="employee" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Site" field="site" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Time" field="time" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <SortableHeader label="Shift Date" field="shiftDate" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
                {/* New Column */}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {checkins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No guard check-ins found.
                  </td>
                </tr>
              ) : (
                checkins.map(checkin => (
                  <tr key={checkin.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">{checkins.indexOf(checkin) + 1 + (page - 1) * perPage}</td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                          {checkin.employee.fullName.substring(0, 2).toUpperCase()}
                        </div>
                        {checkin.employee.fullName}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-muted-foreground/60" />
                        {checkin.shift.site.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground/60" />
                        {new Date(checkin.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(checkin.at), 'yyyy/MM/dd')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {checkin.status === 'on_time' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          On Time
                        </span>
                      )}
                      {checkin.status === 'late' && (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 w-fit">
                            Late
                          </span>
                          {checkin.metadata &&
                            typeof checkin.metadata === 'object' &&
                            (checkin.metadata as CheckinMetadata).latenessMins !== undefined && (
                              <span className="text-[10px] text-muted-foreground font-medium ml-1">
                                {(checkin.metadata as CheckinMetadata).latenessMins} mins late
                              </span>
                            )}
                        </div>
                      )}
                      {checkin.status === 'invalid' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Invalid
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {format(new Date(checkin.shift.date), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {hasValidLocation(checkin.metadata) ? (
                        <div className="flex flex-col">
                          <div>Lat: {(checkin.metadata as CheckinMetadata).lat.toFixed(3)}</div>
                          <div>Lng: {(checkin.metadata as CheckinMetadata).lng.toFixed(3)}</div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />
    </div>
  );
}
