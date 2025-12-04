'use client';

import { useState, useTransition } from 'react';
import { Shift, Site, ShiftType, Guard } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteShift } from '../actions';
import ShiftFormDialog from './shift-form-dialog';
import ConfirmDialog from '../../components/confirm-dialog';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

type ShiftWithRelations = Shift & { site: Site; shiftType: ShiftType; guard: Guard | null };

export default function ShiftList({ 
  shifts, 
  sites, 
  shiftTypes, 
  guards 
}: { 
  shifts: Serialized<ShiftWithRelations>[], 
  sites: Serialized<Site>[],
  shiftTypes: Serialized<ShiftType>[],
  guards: Serialized<Guard>[]
}) {
  const [dialogKey, setDialogKey] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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

  const showDialog = isCreateOpen || !!editingShift;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'missed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="text-sm text-gray-500 mt-1">Manage guard schedules and assignments.</p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
        >
          <span className="mr-2 text-lg leading-none">+</span>
          Schedule Shift
        </button>
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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(shift.status)}`}>
                        {shift.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          onClick={() => handleEdit(shift)}
                          disabled={isPending}
                        />
                        <DeleteButton
                          onClick={() => handleDeleteClick(shift.id)}
                          disabled={isPending}
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

      {/* Dialogs */}
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
