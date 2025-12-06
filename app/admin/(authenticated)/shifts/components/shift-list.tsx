'use client';

import { useState, useTransition } from 'react';
import { Shift, Site, ShiftType, Guard } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteShift } from '../actions';
import ShiftFormDialog from './shift-form-dialog';
import ShiftFilterModal from './shift-filter-modal';
import ConfirmDialog from '../../components/confirm-dialog';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';

export type ShiftWithRelations = Shift & { site: Site; shiftType: ShiftType; guard: Guard | null };

type ShiftListProps = {
  shifts: Serialized<ShiftWithRelations>[];
  sites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  guards: Serialized<Guard>[];
  startDate?: string;
  endDate?: string;
  guardId?: string;
  siteId?: string;
  page: number;
  perPage: number;
  totalCount: number;
};

export default function ShiftList({
  shifts,
  sites,
  shiftTypes,
  guards,
  startDate,
  endDate,
  guardId,
  siteId,
  page,
  perPage,
  totalCount,
}: ShiftListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dialogKey, setDialogKey] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Serialized<ShiftWithRelations> | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId) return;

    startTransition(async () => {
      const result = await deleteShift(deleteId);
      if (result.success) {
        toast.success('Shift deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete shift.');
      }
    });
  };

  const handleEdit = (shift: Serialized<ShiftWithRelations>) => {
    setEditingShift(shift);
    setDialogKey(prev => prev + 1);
  };

  const handleCreate = () => {
    setIsCreateOpen(true);
    setDialogKey(prev => prev + 1);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingShift(undefined);
  };

  const handleApplyFilter = (filters: { startDate?: Date; endDate?: Date; siteId: string; guardId: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (filters.startDate) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.delete('startDate');
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

    if (filters.guardId) {
      params.set('guardId', filters.guardId);
    } else {
      params.delete('guardId');
    }

    params.set('page', '1'); // Reset to page 1 when filtering
    router.push(`/admin/shifts?${params.toString()}`);
  };

  const showDialog = isCreateOpen || !!editingShift;

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
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const activeFiltersCount = [startDate, endDate, guardId, siteId].filter(Boolean).length;

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage guard schedules and assignments.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm ${
              activeFiltersCount > 0 ? 'text-red-600 border-red-200 bg-red-50' : ''
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
              <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Schedule Shift
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Site</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Shift Type</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Guard</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Date / Time</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No shifts found. Schedule one to get started.
                  </td>
                </tr>
              ) : (
                shifts.map(shift => (
                  <tr key={shift.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">{shift.site.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{shift.shiftType.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {shift.guard ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold">
                            {shift.guard.name.substring(0, 2).toUpperCase()}
                          </div>
                          {shift.guard.name}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      <div className="font-medium">{format(new Date(shift.startsAt), 'MMM d, yyyy')}</div>
                      <div className="text-xs text-gray-500">
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
                    <td className="py-4 px-6 text-right">
                      {(() => {
                        const now = new Date();
                        const shiftEndsAt = new Date(shift.endsAt);
                        const shiftStartsAt = new Date(shift.startsAt);
                        const isPastOrOngoing = shiftEndsAt < now || (shiftStartsAt < now && shiftEndsAt > now);
                        return (
                          <div className="flex items-center justify-end gap-2 opacity-100">
                            <EditButton onClick={() => handleEdit(shift)} disabled={isPending || isPastOrOngoing} />
                            <DeleteButton onClick={() => handleDeleteClick(shift.id)} />
                          </div>
                        );
                      })()}
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
        <ShiftFilterModal
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          onApply={handleApplyFilter}
          initialFilters={{
            startDate,
            endDate,
            siteId,
            guardId,
          }}
          sites={sites}
          guards={guards}
        />
      )}

      {showDialog && (
        <ShiftFormDialog
          key={`${editingShift?.id || 'new-shift'}-${dialogKey}`}
          isOpen={true}
          onClose={closeDialog}
          shift={editingShift}
          sites={sites}
          shiftTypes={shiftTypes}
          guards={guards}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Shift"
        description="Are you sure you want to delete this shift? This action cannot be undone."
        confirmText="Delete Shift"
        isPending={isPending}
      />
    </div>
  );
}
