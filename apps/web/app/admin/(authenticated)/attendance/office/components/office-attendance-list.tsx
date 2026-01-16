'use client';

import { Office, OfficeAttendance } from '@prisma/client';
import { ExtendedEmployee } from '@repo/database';
import { Serialized } from '@/lib/utils';
import PaginationNav from '../../../components/pagination-nav';
import { Clock, Hotel } from 'lucide-react';
import { format } from 'date-fns';

type AttendanceMetadata = {
  location?: {
    lat: number;
    lng: number;
  };
};

function hasValidLocation(metadata: unknown): metadata is { location: { lat: number; lng: number } } {
  if (!metadata || typeof metadata !== 'object') return false;

  const m = metadata as Record<string, unknown>;
  if (!('location' in m) || !m.location || typeof m.location !== 'object') return false;

  const loc = m.location as Record<string, unknown>;
  return typeof loc.lat === 'number' && typeof loc.lng === 'number';
}

export type OfficeAttendanceWithRelations = Omit<OfficeAttendance, 'metadata'> & {
  office: Office;
  employee: ExtendedEmployee;
  metadata: AttendanceMetadata;
};

type OfficeAttendanceListProps = {
  attendances: Serialized<OfficeAttendanceWithRelations>[];
  page: number;
  perPage: number;
  totalCount: number;
  employees: Serialized<ExtendedEmployee>[];
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
          <p className="text-sm text-muted-foreground mt-1">View office clock-in and clock-out records.</p>
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
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
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground/60" />
                        {format(new Date(attendance.recordedAt), 'yyyy/MM/dd HH:mm')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {attendance.status === 'present' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Clock In
                        </span>
                      )}
                      {attendance.status === 'clocked_out' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Clock Out
                        </span>
                      )}
                      {attendance.status === 'late' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Late
                        </span>
                      )}
                      {attendance.status === 'absent' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Absent
                        </span>
                      )}
                      {attendance.status === 'pending_verification' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {hasValidLocation(attendance.metadata) ? (
                        <div className="flex flex-col text-xs">
                          <div>Lat: {attendance.metadata.location!.lat.toFixed(3)}</div>
                          <div>Lng: {attendance.metadata.location!.lng.toFixed(3)}</div>
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
