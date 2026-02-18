'use client';

import { useState, useTransition } from 'react';
import { Serialized } from '@/lib/utils';
import { deleteShift, cancelShift } from '../actions';
import ShiftFilterModal from './shift-filter-modal';
import BulkCreateModal from './bulk-create-modal';
import ShiftExport from './shift-export';
import ShiftActionModal from './shift-action-modal';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Upload, ArrowUpDown, ArrowUp, ArrowDown, History } from 'lucide-react';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ShiftWithRelationsDto } from '@/types/shifts';
import { EmployeeSummary } from '@repo/database';

type ShiftListProps = {
  shifts: Serialized<ShiftWithRelationsDto>[];
  sites: { id: string; name: string }[];
  shiftTypes: { id: string; name: string }[];
  employees: EmployeeSummary[];
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  siteId?: string;
  sort?: string;
  page: number;
  perPage: number;
  totalCount: number;
};

export default function ShiftList({
  shifts,
  sites,
  employees,
  startDate,
  endDate,
  employeeId,
  siteId,
  sort = 'desc',
  page,
  perPage,
  totalCount,
}: ShiftListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isSuperAdmin } = useSession();

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.SHIFTS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.SHIFTS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.SHIFTS.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleDeleteClick = (id: string) => {
    if (!canDelete) return;
    setSelectedShiftId(id);
  };

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    const newSort = sort === 'desc' ? 'asc' : 'desc';
    params.set('sort', newSort);
    params.set('page', '1');
    router.push(`/admin/shifts?${params.toString()}`);
  };

  const handleConfirmDelete = () => {
    if (!selectedShiftId || !canDelete) return;

    startTransition(async () => {
      const result = await deleteShift(selectedShiftId);
      if (result.success) {
        toast.success('Shift deleted successfully!');
        setSelectedShiftId(null);
      } else {
        toast.error(result.message || 'Failed to delete shift.');
      }
    });
  };

  const handleCancelShift = (note?: string) => {
    if (!selectedShiftId || !canDelete) return;

    startTransition(async () => {
      const result = await cancelShift(selectedShiftId, note);
      if (result.success) {
        toast.success('Shift cancelled successfully!');
        setSelectedShiftId(null);
      } else {
        toast.error(result.message || 'Failed to cancel shift.');
      }
    });
  };

  const handleApplyFilter = (filters: { startDate?: Date; endDate?: Date; siteId: string; employeeId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (filters.startDate) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      // If cleared, explicitly set to empty string so server doesn't fallback to default (today)
      params.set('startDate', '');
    }

    if (filters.endDate) {
      params.set('endDate', format(filters.endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    if (filters.siteId) {
      params.set('siteId', filters.siteId);
    } else {
      params.delete('siteId');
    }

    if (filters.employeeId) {
      params.set('employeeId', filters.employeeId);
    } else {
      params.delete('employeeId');
    }

    if (sort) {
      params.set('sort', sort);
    }

    params.set('page', '1'); // Reset to page 1 when filtering
    router.push(`/admin/shifts?${params.toString()}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'missed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'cancelled':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const activeFiltersCount = [startDate, endDate, employeeId, siteId].filter(Boolean).length;

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shifts</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage employee schedules and assignments.</p>
        </div>
        <div className="flex gap-2">
          <ShiftExport
            initialFilters={{
              startDate,
              endDate,
              employeeId,
              siteId,
            }}
          />
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
              href="/admin/shifts/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/shifts/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Schedule Shift
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Site</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Shift Type
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th
                  className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted transition-colors"
                  onClick={handleSort}
                >
                  <div className="flex items-center gap-1">
                    Date / Time
                    {sort === 'asc' ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : sort === 'desc' ? (
                      <ArrowDown className="w-4 h-4" />
                    ) : (
                      <ArrowUpDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
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
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No shifts found. Schedule one to get started.
                  </td>
                </tr>
              ) : (
                shifts.map(shift => {
                  return (
                    <tr key={shift.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-4 px-6 text-sm font-medium text-foreground">{shift.site.name}</td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">{shift.shiftType.name}</td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {shift.employee ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold border border-border">
                              {shift.employee.firstName.substring(0, 1).toUpperCase()}
                              {(shift.employee.lastName || '').substring(0, 1).toUpperCase()}
                            </div>
                            {shift.employee.fullName}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">
                          {format(new Date(shift.startsAt), 'yyyy/MM/dd')}
                        </div>
                        <div className="text-xs text-muted-foreground/80">
                          {format(new Date(shift.startsAt), 'HH:mm')} - {format(new Date(shift.endsAt), 'HH:mm')}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            shift.status
                          )}`}
                        >
                          {shift.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        <div className="max-w-[200px] whitespace-normal wrap-break-words text-xs">
                          {shift.note || '-'}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              shift.createdBy?.name
                                ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                                : 'text-muted-foreground/40'
                            }`}
                            title="Created By"
                          >
                            {shift.createdBy?.name || '-'}
                          </div>
                          <div
                            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              shift.lastUpdatedBy?.name
                                ? 'bg-muted text-muted-foreground border border-border'
                                : 'text-muted-foreground/40'
                            }`}
                            title="Last Updated By"
                          >
                            {shift.lastUpdatedBy?.name || '-'}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-100">
                          <EditButton
                            href={`/admin/shifts/${shift.id}/edit`}
                            disabled={!canEdit}
                            title={!canEdit ? 'Permission Denied' : 'Edit'}
                          />
                          <DeleteButton
                            onClick={() => handleDeleteClick(shift.id)}
                            disabled={
                              isPending ||
                              !canDelete ||
                              (!isSuperAdmin && shift.status !== 'in_progress' && shift.status !== 'scheduled')
                            }
                            title={
                              !canDelete
                                ? 'Permission Denied'
                                : !isSuperAdmin && shift.status !== 'in_progress' && shift.status !== 'scheduled'
                                  ? 'Only in-progress or scheduled shifts can be cancelled'
                                  : 'Actions'
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      {/* Dialogs */}
      {isFilterOpen && (
        <ShiftFilterModal
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          onApply={handleApplyFilter}
          initialFilters={{
            startDate,
            endDate,
            siteId,
            employeeId,
          }}
          sites={sites}
          employees={employees}
        />
      )}

      <BulkCreateModal isOpen={isBulkCreateOpen} onClose={() => setIsBulkCreateOpen(false)} />

      <ShiftActionModal
        isOpen={!!selectedShiftId}
        onClose={() => setSelectedShiftId(null)}
        onDelete={handleConfirmDelete}
        onCancelShift={handleCancelShift}
        isPending={isPending}
        isSuperAdmin={isSuperAdmin}
        status={shifts.find(s => s.id === selectedShiftId)?.status}
      />
    </div>
  );
}
