'use client';

import { useState, useTransition } from 'react';
import type { Serialized } from '@/lib/server-utils';
import { cancelOfficeShift, deleteOfficeShift } from '../actions';
import PaginationNav from '../../components/pagination-nav';
import OfficeBulkCreateModal from './office-bulk-create-modal';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Upload } from 'lucide-react';
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
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [selectedOfficeShiftId, setSelectedOfficeShiftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.OFFICE_SHIFTS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.OFFICE_SHIFTS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.OFFICE_SHIFTS.DELETE);

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
        toast.success(officeShift.status === 'in_progress' ? 'Office shift cancelled successfully!' : 'Office shift deleted successfully!');
        setSelectedOfficeShiftId(null);
      } else {
        toast.error(result.message || 'Failed to update office shift.');
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'missed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const activeFiltersCount = [startDate, endDate, employeeId].filter(Boolean).length;

  const handleApplyFilter = (formData: FormData) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextStartDate = String(formData.get('startDate') || '');
    const nextEndDate = String(formData.get('endDate') || '');
    const nextEmployeeId = String(formData.get('employeeId') || '');

    if (nextStartDate) params.set('startDate', nextStartDate);
    else params.delete('startDate');

    if (nextEndDate) params.set('endDate', nextEndDate);
    else params.delete('endDate');

    if (nextEmployeeId) params.set('employeeId', nextEmployeeId);
    else params.delete('employeeId');

    params.set('page', '1');
    if (sort) params.set('sort', sort);
    router.push(`/admin/office-shifts?${params.toString()}`);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Shifts</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage office employee shift-based schedules.</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <button
              onClick={() => setIsBulkCreateOpen(true)}
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload CSV
            </button>
          )}
          {canCreate && (
            <Link
              href="/admin/office-shifts/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/30"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Schedule Office Shift
            </Link>
          )}
        </div>
      </div>

      <form
        action={handleApplyFilter}
        className="mb-6 grid grid-cols-1 md:grid-cols-[180px_180px_minmax(240px,1fr)_auto_auto] gap-3 items-end"
      >
        <div>
          <label htmlFor="office-shifts-start-date" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Start Date
          </label>
          <input
            id="office-shifts-start-date"
            name="startDate"
            type="date"
            defaultValue={startDate || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
          />
        </div>
        <div>
          <label htmlFor="office-shifts-end-date" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            End Date
          </label>
          <input
            id="office-shifts-end-date"
            name="endDate"
            type="date"
            defaultValue={endDate || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
          />
        </div>
        <div>
          <label htmlFor="office-shifts-employee-id" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Employee
          </label>
          <select
            id="office-shifts-employee-id"
            name="employeeId"
            defaultValue={employeeId || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
          >
            <option value="">All shift-based office employees</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
                {employee.employeeNumber ? ` (${employee.employeeNumber})` : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted transition-colors"
        >
          Apply Filters
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/office-shifts')}
          className="h-10 px-4 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted transition-colors"
        >
          Reset
          {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
        </button>
      </form>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Shift Type</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date / Time</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
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
                  <tr key={officeShift.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{officeShift.officeShiftType.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{officeShift.employee.fullName}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">{format(new Date(officeShift.startsAt), 'yyyy/MM/dd')}</div>
                      <div className="text-xs text-muted-foreground/80">
                        {format(new Date(officeShift.startsAt), 'HH:mm')} - {format(new Date(officeShift.endsAt), 'HH:mm')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(officeShift.status)}`}>
                        {officeShift.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground max-w-[220px] whitespace-normal break-words">
                      {officeShift.note || '-'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton
                          href={`/admin/office-shifts/${officeShift.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => handleDeleteClick(officeShift.id)}
                          disabled={!canDelete || isPending || (!isSuperAdmin && officeShift.status !== 'in_progress' && officeShift.status !== 'scheduled')}
                          title={!canDelete ? 'Permission Denied' : officeShift.status === 'in_progress' ? 'Cancel' : 'Delete'}
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
