'use client';

import { useState, useTransition } from 'react';
import { Guard } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteGuard } from '../actions';
import GuardFormDialog from './guard-form-dialog';
import ConfirmDialog from '../../components/confirm-dialog';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';

type GuardListProps = {
  guards: Serialized<Guard>[];
  page: number;
  perPage: number;
  totalCount: number;
};

export default function GuardList({ guards, page, perPage, totalCount }: GuardListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGuard, setEditingGuard] = useState<Serialized<Guard> | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId) return;

    startTransition(async () => {
      const result = await deleteGuard(deleteId);
      if (result.success) {
        toast.success('Guard deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete guard.');
      }
    });
  };

  const handleEdit = (guard: Serialized<Guard>) => {
    setEditingGuard(guard);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingGuard(undefined);
  };

  const showDialog = isCreateOpen || !!editingGuard;

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guards</h1>
          <p className="text-sm text-gray-500 mt-1">Manage security personnel and contact info.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
        >
          <span className="mr-2 text-lg leading-none">+</span>
          Add Guard
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Guard Code</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Joined Date</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Left Date</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {guards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No guards found. Add one to get started.
                  </td>
                </tr>
              ) : (
                guards.map(guard => (
                  <tr key={guard.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-3">
                        {/* Avatar Placeholder */}
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                          {guard.name.substring(0, 2).toUpperCase()}
                        </div>
                        {guard.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600 font-mono">{guard.phone}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{guard.guardCode || '-'}</td>
                    <td className="py-4 px-6 text-sm">
                      {guard.status !== false ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {new Date(guard.joinDate || guard.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {guard.leftDate ? new Date(guard.leftDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          onClick={() => handleEdit(guard)}
                          disabled={isPending}
                        />
                        <DeleteButton
                          onClick={() => handleDeleteClick(guard.id)}
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

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      {/* Dialogs */}
      {showDialog && (
        <GuardFormDialog
          key={editingGuard?.id || 'new-guard'}
          isOpen={true}
          onClose={closeDialog}
          guard={editingGuard}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Guard"
        description="Are you sure you want to delete this guard? This action cannot be undone and will remove all associated history."
        confirmText="Delete Guard"
        isPending={isPending}
      />
    </div>
  );
}