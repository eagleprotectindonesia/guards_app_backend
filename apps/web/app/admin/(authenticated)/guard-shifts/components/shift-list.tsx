'use client';

import { useState, useTransition } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { deleteShift, cancelShift } from '../actions';
import BulkCreateModal from './bulk-create-modal';
import ShiftExport from './shift-export';
import ShiftActionModal from './shift-action-modal';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Upload, History } from 'lucide-react';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ShiftWithRelationsDto } from '@/types/shifts';
import type { EmployeeSummary } from '@repo/database';
import { useAdminRouter } from '../../context/admin-router';
import SortableHeader from '@/components/sortable-header';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';

type ShiftListProps = {
  shifts: Serialized<ShiftWithRelationsDto>[];
  sites: { id: string; name: string }[];
  shiftTypes: { id: string; name: string }[];
  employees: EmployeeSummary[];
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  siteId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
  sortBy = 'startsAt',
  sortOrder = 'asc',
  page,
  perPage,
  totalCount,
}: ShiftListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isSuperAdmin } = useSession();

  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.SHIFTS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.SHIFTS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.SHIFTS.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);
  const { apply } = useFilterUrlSync('/admin/guard-shifts');

  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    startDate ? parseISO(startDate) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    endDate ? parseISO(endDate) : undefined
  );
  const [filterSiteId, setFilterSiteId] = useState(siteId || '');
  const [filterEmployeeId, setFilterEmployeeId] = useState(employeeId || '');

  const handleDeleteClick = (id: string) => {
    if (!canDelete) return;
    setSelectedShiftId(id);
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
    router.push(`/admin/guard-shifts?${params.toString()}`);
  };

  const handleConfirmDelete = () => {
    if (!selectedShiftId || !canDelete) return;

    startTransition(async () => {
      const result = await deleteShift(selectedShiftId);
      if (result.success) {
        toast.success('Guard shift deleted successfully!');
        setSelectedShiftId(null);
      } else {
        toast.error(result.message || 'Failed to delete guard shift.');
      }
    });
  };

  const handleCancelShift = (note?: string) => {
    if (!selectedShiftId || !canDelete) return;

    startTransition(async () => {
      const result = await cancelShift(selectedShiftId, note);
      if (result.success) {
        toast.success('Guard shift cancelled successfully!');
        setSelectedShiftId(null);
      } else {
        toast.error(result.message || 'Failed to cancel guard shift.');
      }
    });
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

  const handleApplyFilters = () => {
    apply({
      startDate: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : '',
      endDate: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : null,
      siteId: filterSiteId || null,
      employeeId: filterEmployeeId || null,
    });
  };

  const handleClearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterSiteId('');
    setFilterEmployeeId('');
    apply({
      startDate: '',
      endDate: null,
      siteId: null,
      employeeId: null,
    });
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Guard Shifts</h1>
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
              href="/admin/guard-shifts/audit"
              onClick={() => router.push('/admin/guard-shifts/audit')}
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/guard-shifts/create"
              onClick={() => router.push('/admin/guard-shifts/create')}
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Schedule Guard Shift
            </Link>
          )}
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
          label="Site"
          value={filterSiteId}
          options={sites.map(s => ({ value: s.id, label: s.name }))}
          onChange={setFilterSiteId}
          id="filter-site"
          instanceId="filter-site"
          allLabel="All Sites"
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
                <SortableHeader label="Site" field="site" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Shift Type" field="shiftType" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Employee" field="employee" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Date / Time" field="startsAt" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Status" field="status" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
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
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    No shifts found. Schedule one to get started.
                  </td>
                </tr>
              ) : (
                shifts.map(shift => {
                  return (
                    <tr key={shift.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-4 px-6 text-sm text-muted-foreground text-center">{shifts.indexOf(shift) + 1 + (page - 1) * perPage}</td>
                      <td className="py-4 px-6 text-sm font-medium text-foreground">{shift.site.name}</td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">{shift.shiftType.name}</td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {shift.employee ? (
                          <div className="flex items-center gap-2">{shift.employee.fullName}</div>
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
                            href={`/admin/guard-shifts/${shift.id}/edit`}
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
