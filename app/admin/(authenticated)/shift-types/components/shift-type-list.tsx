'use client';

import { useState, useTransition } from 'react';
import { ShiftType } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteShiftType } from '../actions';
import ConfirmDialog from '../../components/confirm-dialog';
import { DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import PaginationNav from '../../components/pagination-nav';
import Link from 'next/link';
import { Pencil } from 'lucide-react';

type ShiftTypeOnly = ShiftType; // Renamed type, no longer includes Site

type ShiftTypeListProps = {
  shiftTypes: Serialized<ShiftTypeOnly>[];
  page: number;
  perPage: number;
  totalCount: number;
};

export default function ShiftTypeList({ shiftTypes, page, perPage, totalCount }: ShiftTypeListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId) return;

    startTransition(async () => {
      const result = await deleteShiftType(deleteId);
      if (result.success) {
        toast.success('Shift Type deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete shift type.');
      }
    });
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift Types</h1>
          <p className="text-sm text-gray-500 mt-1">Manage standard shift templates.</p>
        </div>
        <Link
          href="/admin/shift-types/create"
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
        >
          <span className="mr-2 text-lg leading-none">+</span>
          Add Shift Type
        </Link>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Start Time</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">End Time</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shiftTypes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No shift types found. Add one to get started.
                  </td>
                </tr>
              ) : (
                shiftTypes.map(shiftType => (
                  <tr key={shiftType.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">{shiftType.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600 font-mono">{shiftType.startTime}</td>
                    <td className="py-4 px-6 text-sm text-gray-600 font-mono">{shiftType.endTime}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <Link
                          href={`/admin/shift-types/${shiftType.id}/edit`}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="sr-only">Edit</span>
                        </Link>
                        <DeleteButton onClick={() => handleDeleteClick(shiftType.id)} disabled={isPending} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Shift Type"
        description="Are you sure you want to delete this shift type? This might affect existing shifts."
        confirmText="Delete Shift Type"
        isPending={isPending}
      />
    </div>
  );
}
