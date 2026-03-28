'use client';

import { Clock, Hotel } from 'lucide-react';
import { format } from 'date-fns';
import {
  AttendanceEmployeeSummary,
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceDisplayDto,
} from '@/types/attendance';
import PaginationNav from '../../../components/pagination-nav';

function buildLocationSummary(metadata: OfficeAttendanceMetadataDto | null) {
  if (!metadata?.location) return '-';
  return `Lat: ${metadata.location.lat.toFixed(3)}, Lng: ${metadata.location.lng.toFixed(3)}`;
}

type OfficeAttendanceListProps = {
  attendances: SerializedOfficeAttendanceDisplayDto[];
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

export default function OfficeAttendanceList({ attendances, page, perPage, totalCount }: OfficeAttendanceListProps) {
  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">View unified office attendance sessions.</p>
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Office</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Business Date</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Clock In</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Clock Out</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No office attendance records found.
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
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-xs font-bold">
                          {attendance.employee?.fullName.substring(0, 2).toUpperCase() || '??'}
                        </div>
                        {attendance.employee?.fullName || 'Unknown Employee'}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Hotel className="w-3 h-3 text-muted-foreground/60" />
                        {attendance.office?.name || 'N/A'}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      {attendance.businessDate}
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground/60" />
                        {format(new Date(attendance.clockInAt), 'HH:mm')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      {attendance.clockOutAt ? format(new Date(attendance.clockOutAt), 'HH:mm') : '-'}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {attendance.displayStatus === 'clocked_in' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Clocked In
                        </span>
                      )}
                      {attendance.displayStatus === 'completed' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Completed
                        </span>
                      )}
                      {attendance.displayStatus === 'late' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Late
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex flex-col text-xs gap-1">
                        <div>In: {buildLocationSummary(attendance.clockInMetadata)}</div>
                        <div>Out: {buildLocationSummary(attendance.clockOutMetadata)}</div>
                        {attendance.latenessMins != null && attendance.latenessMins > 0 ? (
                          <div>Late: {attendance.latenessMins} mins</div>
                        ) : null}
                      </div>
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
