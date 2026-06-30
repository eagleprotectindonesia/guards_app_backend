'use client';

import { useState } from 'react';
import { Clock, Eye, Filter, Hotel } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import {
  AttendanceOfficeSummary,
  AttendanceEmployeeSummary,
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceDisplayDto,
} from '@/types/attendance';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PaginationNav from '../../../components/pagination-nav';
import OfficeAttendanceExport from './office-attendance-export';
import AttendanceFilterModal from '../../components/attendance-filter-modal';
import SortableHeader from '@/components/sortable-header';
import { useAdminRouter } from '../../../context/admin-router';

function buildLocationSummary(metadata: OfficeAttendanceMetadataDto | null) {
  if (!metadata?.location) return '-';
  return `Lat: ${metadata.location.lat.toFixed(3)}, Lng: ${metadata.location.lng.toFixed(3)}`;
}

function buildDistanceSummary(metadata: OfficeAttendanceMetadataDto | null) {
  if (metadata?.distanceMeters == null) return '-';
  return `${metadata.distanceMeters} m`;
}

type OfficeAttendanceListProps = {
  attendances: SerializedOfficeAttendanceDisplayDto[];
  page: number;
  perPage: number;
  totalCount: number;
  offices: AttendanceOfficeSummary[];
  employees: AttendanceEmployeeSummary[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    employeeNumber?: string;
  };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export default function OfficeAttendanceList({
  attendances,
  page,
  perPage,
  totalCount,
  offices,
  employees,
  initialFilters,
  sortBy = 'businessDate',
  sortOrder = 'asc',
}: OfficeAttendanceListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>('Attendance Photo');

  const openPreview = (url: string, label: string) => {
    setPreviewImageUrl(url);
    setPreviewLabel(label);
  };

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handleApplyFilters = (filters: { startDate?: Date; endDate?: Date; employeeNumber: string }) => {
    const params = new URLSearchParams(searchParams.toString());

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

    if (filters.employeeNumber) {
      params.set('employeeNumber', filters.employeeNumber);
    } else {
      params.delete('employeeNumber');
    }

    router.push(`?${params.toString()}`);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">View office employee attendance sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFilterOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
          <OfficeAttendanceExport offices={offices} />
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12 text-center">#</th>
                <SortableHeader label="Employee ID" field="employeeNumber" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <SortableHeader label="Office" field="office" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Business Date" field="businessDate" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Clock In</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Clock Out</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Paid hours</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Photo</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-muted-foreground">
                    No office attendance records found.
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
                      <div className="flex flex-col gap-1">
                        {attendance.displayStatus === 'absent' ||
                        attendance.displayStatus === 'leave' ||
                        attendance.displayStatus === 'pending_leave' ? (
                          <div>-</div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-muted-foreground/60" />
                              {format(new Date(attendance.clockInAt), 'HH:mm')}
                            </div>
                            <div className="text-xs font-normal text-muted-foreground">
                              {buildDistanceSummary(attendance.clockInMetadata)}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      <div className="flex flex-col gap-1">
                        <div>{attendance.clockOutAt ? format(new Date(attendance.clockOutAt), 'HH:mm') : '-'}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {attendance.clockOutAt ? buildDistanceSummary(attendance.clockOutMetadata) : '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-foreground font-medium">
                      {attendance.paidHours ?? '-'}
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
                      {attendance.displayStatus === 'absent' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                          Absent
                        </span>
                      )}
                      {attendance.displayStatus === 'leave' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          Leave
                        </span>
                      )}
                      {attendance.displayStatus === 'pending_leave' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400">
                          Pending Leave
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        {(() => {
                          const clockInPicture = attendance.clockInPicture;
                          if (!clockInPicture) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => openPreview(clockInPicture, 'Clock In Photo')}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
                              title="View clock-in photo"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              In
                            </button>
                          );
                        })()}
                        {!attendance.clockInPicture ? <span>-</span> : null}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="flex flex-col text-xs gap-1">
                        <div>
                          In:{' '}
                          {attendance.displayStatus === 'absent' ||
                          attendance.displayStatus === 'leave' ||
                          attendance.displayStatus === 'pending_leave'
                            ? '-'
                            : buildLocationSummary(attendance.clockInMetadata)}
                        </div>
                        <div>
                          Out:{' '}
                          {attendance.displayStatus === 'absent' ||
                          attendance.displayStatus === 'leave' ||
                          attendance.displayStatus === 'pending_leave'
                            ? '-'
                            : buildLocationSummary(attendance.clockOutMetadata)}
                        </div>
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

      <AttendanceFilterModal
        title="Filter Office Attendance"
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={handleApplyFilters}
        initialFilters={initialFilters}
        employees={employees}
      />

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
