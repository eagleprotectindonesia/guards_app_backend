'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PaginationNav from '../../components/pagination-nav';
import { MapPin, Clock, Filter, Calendar } from 'lucide-react';
import AttendanceFilterModal from './attendance-filter-modal';
import AttendanceExport from './attendance-export';
import { format } from 'date-fns';
import {
  AttendanceEmployeeSummary,
  AttendanceMetadataDto,
  SerializedAttendanceWithRelationsDto,
} from '@/types/attendance';

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
    employeeId?: string;
  };
};

export default function AttendanceList({
  attendances,
  page,
  perPage,
  totalCount,
  employees,
  initialFilters,
}: AttendanceListProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApplyFilters = (filters: { startDate?: Date; endDate?: Date; employeeId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    // Reset pagination when filtering
    params.set('page', '1');

    if (filters.startDate) {
      params.set('from', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.delete('from');
    }

    if (filters.endDate) {
      params.set('to', format(filters.endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('to');
    }

    if (filters.employeeId) {
      params.set('employeeId', filters.employeeId);
    } else {
      params.delete('employeeId');
    }

    router.push(`?${params.toString()}`);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">View employee attendance records and status.</p>
        </div>
        <div className="flex items-center gap-2">
          <AttendanceExport initialFilters={initialFilters} employees={employees} />
          <button
            onClick={() => setIsFilterOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Employee ID
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Site</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Shift</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                attendances.map(attendance => (
                  <tr key={attendance.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-muted-foreground">
                      {attendance.employee?.id || '-'}
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

      <AttendanceFilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={handleApplyFilters}
        initialFilters={initialFilters}
        employees={employees}
      />
    </div>
  );
}
