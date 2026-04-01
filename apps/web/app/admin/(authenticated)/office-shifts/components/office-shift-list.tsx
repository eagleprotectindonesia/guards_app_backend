'use client';

import { useState, useTransition } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { cancelOfficeShift, deleteOfficeShift } from '../actions';
import PaginationNav from '../../components/pagination-nav';
import OfficeBulkCreateModal from './office-bulk-create-modal';
import OfficeShiftFilterModal from './office-shift-filter-modal';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Upload, History } from 'lucide-react';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { OfficeShiftWithRelationsDto } from '@/types/office-shifts';
import type { EmployeeSummary } from '@repo/database';

type Props = {
  officeShifts: Serialized<OfficeShiftWithRelationsDto>[];
  employees: EmployeeSummary[];
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  sort?: string;
  page: number;
  perPage: number;
  totalCount: number;
};

export default function OfficeShiftList({
  officeShifts,
  employees,
  startDate,
  endDate,
  employeeId,
  sort = 'desc',
  page,
  perPage,
  totalCount,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isSuperAdmin } = useSession();

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [selectedOfficeShiftId, setSelectedOfficeShiftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.OFFICE_SHIFTS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.OFFICE_SHIFTS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.OFFICE_SHIFTS.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.OFFICE_SHIFTS.VIEW) && hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleDeleteClick = (id: string) => setSelectedOfficeShiftId(id);

  const handleConfirmAction = () => {
    const officeShift = officeShifts.find(item => item.id === selectedOfficeShiftId);
    if (!officeShift || !canDelete) return;

    startTransition(async () => {
      const result =
        officeShift.status === 'in_progress'
          ? await cancelOfficeShift(officeShift.id)
          : await deleteOfficeShift(officeShift.id);

      if (result.success) {
        toast.success(
          officeShift.status === 'in_progress'
            ? 'Office shift cancelled successfully!'
            : 'Office shift deleted successfully!'
        );
        setSelectedOfficeShiftId(null);
      } else {
        toast.error(result.message || 'Failed to update office shift.');
      }
    });
  };

  const handleApplyFilter = (filters: { startDate?: Date; endDate?: Date; employeeId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (filters.startDate) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.set('startDate', '');
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

    if (sort) {
      params.set('sort', sort);
    }

    params.set('page', '1');
    router.push(`/admin/office-shifts?${params.toString()}`);
  };

  const activeFiltersCount = [startDate, endDate, employeeId].filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Shifts</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage office shifts and day-specific availability for office employees.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm ${
              activeFiltersCount > 0
                ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400'
                : ''
            }`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {canCreate && (
            <button
              onClick={() => setIsBulkCreateOpen(true)}
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload CSV
            </button>
          )}
          {canViewAudit && (
            <Link
              href="/admin/office-shifts/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/office-shifts/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Schedule Office Shift
            </Link>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Shift Type
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Date / Time
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-blue-600 dark:text-blue-400">Created By</span>
                    <span className="text-muted-foreground/60">Last Updated By</span>
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {officeShifts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No office shifts found. Schedule one to get started.
                  </td>
                </tr>
              ) : (
                officeShifts.map(officeShift => (
                  <tr key={officeShift.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      {officeShift.officeShiftType.name}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{officeShift.employee.fullName}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">
                        {format(new Date(officeShift.startsAt), 'yyyy/MM/dd')}
                      </div>
                      <div className="text-xs text-muted-foreground/80">
                        {format(new Date(officeShift.startsAt), 'HH:mm')} -{' '}
                        {format(new Date(officeShift.endsAt), 'HH:mm')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words text-xs">
                        {officeShift.note || '-'}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            officeShift.createdBy?.name
                              ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                              : 'text-muted-foreground/40'
                          }`}
                          title="Created By"
                        >
                          {officeShift.createdBy?.name || '-'}
                        </div>
                        <div
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            officeShift.lastUpdatedBy?.name
                              ? 'bg-muted text-muted-foreground border border-border'
                              : 'text-muted-foreground/40'
                          }`}
                          title="Last Updated By"
                        >
                          {officeShift.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          href={`/admin/office-shifts/${officeShift.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => handleDeleteClick(officeShift.id)}
                          disabled={
                            isPending ||
                            !canDelete ||
                            (!isSuperAdmin &&
                              officeShift.status !== 'in_progress' &&
                              officeShift.status !== 'scheduled')
                          }
                          title={
                            !canDelete
                              ? 'Permission Denied'
                              : !isSuperAdmin &&
                                  officeShift.status !== 'in_progress' &&
                                  officeShift.status !== 'scheduled'
                                ? 'Only in-progress or scheduled shifts can be cancelled'
                                : 'Actions'
                          }
                        />
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

      {/* Dialogs */}
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

      <OfficeBulkCreateModal isOpen={isBulkCreateOpen} onClose={() => setIsBulkCreateOpen(false)} />

      {selectedOfficeShiftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-foreground">Confirm Action</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {officeShifts.find(item => item.id === selectedOfficeShiftId)?.status === 'in_progress'
                ? 'Cancel this in-progress office shift?'
                : 'Delete this office shift?'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedOfficeShiftId(null)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
