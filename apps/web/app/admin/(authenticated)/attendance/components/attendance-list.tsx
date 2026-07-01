'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PaginationNav from '../../components/pagination-nav';
import { MapPin, Clock, Calendar, Eye } from 'lucide-react';
import AttendanceExport from './attendance-export';
import { format, parseISO } from 'date-fns';
import { useAdminRouter } from '../../context/admin-router';
import SortableHeader from '@/components/sortable-header';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';
import {
  AttendanceEmployeeSummary,
  AttendanceMetadataDto,
  SerializedAttendanceWithRelationsDto,
} from '@/types/attendance';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Type guard to check if metadata has valid location data
function hasLocation(metadata: AttendanceMetadataDto | null): metadata is AttendanceMetadataDto & { location: { lat: number; lng: number } } {
  return (
    !!metadata?.location &&
    typeof metadata.location.lat === 'number' &&
    typeof metadata.location.lng === 'number'
  );
}

type AttendanceListProps = {
  attendances: SerializedAttendanceWithRelationsDto[];
  page: number;
  perPage: number;
  totalCount: number;
  employees: AttendanceEmployeeSummary[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    employeeNumber?: string;
  };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export default function AttendanceList({
  attendances,
  page,
  perPage,
  totalCount,
  employees,
  initialFilters,
  sortBy = 'date',
  sortOrder = 'desc',
}: AttendanceListProps) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>('Attendance Photo');
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const { apply } = useFilterUrlSync('');

  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [filterEmployeeNumber, setFilterEmployeeNumber] = useState(initialFilters.employeeNumber || '');

  const openPreview = (url: string, label: string) => {
    setPreviewImageUrl(url);
    setPreviewLabel(label);
  };

  const handleApplyFilters = () => {
    apply({
      from: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : null,
      to: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : null,
      employeeNumber: filterEmployeeNumber || null,
    });
  };

  const handleClearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterEmployeeNumber('');
    apply({
      from: null,
      to: null,
      employeeNumber: null,
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
          <h1 className="text-2xl font-bold text-foreground">Guard Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">View guard/on-site employee attendance records and status.</p>
        </div>
        <div className="flex items-center gap-2">
          <AttendanceExport initialFilters={initialFilters} employees={employees} />
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
          value={filterEmployeeNumber}
          options={employees.map(e => ({ value: e.employeeNumber || e.id, label: e.fullName }))}
          onChange={setFilterEmployeeNumber}
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
                <SortableHeader label="Employee ID" field="employeeNumber" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <SortableHeader label="Site" field="site" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Shift" field="shift" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Date" field="date" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Photo</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                attendances.map(attendance => (
                  <tr key={attendance.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">{attendances.indexOf(attendance) + 1 + (page - 1) * perPage}</td>
                    <td className="py-4 px-6 text-sm font-medium text-muted-foreground">
                      {attendance.employee?.employeeNumber || '-'}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                          {attendance.employee?.fullName.substring(0, 2).toUpperCase() || '??'}
                        </div>
                        {attendance.employee?.fullName || 'Unknown Employee'}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-muted-foreground/60" />
                        {attendance.shift.site.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <Calendar className="w-3 h-3 text-muted-foreground/60 inline mr-1" />
                      {attendance.shift.shiftType.name}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {format(new Date(attendance.shift.date), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground/60" />
                        {new Date(attendance.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(attendance.recordedAt), 'yyyy/MM/dd')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {attendance.status === 'present' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Present
                        </span>
                      )}
                      {attendance.status === 'absent' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Absent
                        </span>
                      )}
                      {attendance.status === 'late' && (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 w-fit">
                            Late
                          </span>
                          {attendance.metadata?.latenessMins && (
                            <span className="text-[10px] text-muted-foreground font-medium ml-1">
                              {attendance.metadata.latenessMins} mins late
                            </span>
                          )}
                        </div>
                      )}
                      {attendance.status === 'pending_verification' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                          Pending Verification
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        {attendance.picture ? (
                          <button
                            type="button"
                            onClick={() => openPreview(attendance.picture!, 'Attendance Photo')}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
                            title="View attendance photo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {hasLocation(attendance.metadata) ? (
                        <div className="flex flex-col">
                          <div>Lat: {attendance.metadata.location.lat.toFixed(3)}</div>
                          <div>Lng: {attendance.metadata.location.lng.toFixed(3)}</div>
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

      <Dialog open={Boolean(previewImageUrl)} onOpenChange={open => !open && setPreviewImageUrl(null)}>
        <DialogContent className="sm:max-w-4xl p-4">
          <DialogHeader>
            <DialogTitle>{previewLabel}</DialogTitle>
          </DialogHeader>
          {previewImageUrl ? (
            <div className="w-full flex items-center justify-center overflow-auto">
              <img src={previewImageUrl} alt={previewLabel} className="max-h-[75vh] w-auto max-w-full rounded-md" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
