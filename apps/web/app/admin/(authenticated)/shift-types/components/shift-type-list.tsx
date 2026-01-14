'use client';

import { useState, useTransition } from 'react';
import { ShiftType } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteShiftType } from '../actions';
import ConfirmDialog from '../../components/confirm-dialog';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import PaginationNav from '../../components/pagination-nav';
import Link from 'next/link';
import { History } from 'lucide-react';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type ShiftTypeWithAdminInfo = ShiftType & {
  lastUpdatedBy?: { name: string } | null;
  createdBy?: { name: string } | null;
};

type ShiftTypeListProps = {
  shiftTypes: Serialized<ShiftTypeWithAdminInfo>[];
  page: number;
  perPage: number;
  totalCount: number;
};

export default function ShiftTypeList({
  shiftTypes,
  page,
  perPage,
  totalCount,
}: ShiftTypeListProps) {
  const { hasPermission } = useSession();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.SHIFT_TYPES.CREATE);
  const canEdit = hasPermission(PERMISSIONS.SHIFT_TYPES.EDIT);
  const canDelete = hasPermission(PERMISSIONS.SHIFT_TYPES.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleDeleteClick = (id: string) => {
    if (!canDelete) return;
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId || !canDelete) return;

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
          <h1 className="text-2xl font-bold text-foreground">Shift Types</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage standard shift templates.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          {canViewAudit && (
            <Link
              href="/admin/shift-types/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/shift-types/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 w-full md:w-auto"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Add Shift Type
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Start Time
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  End Time
                </th>
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
              {shiftTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No shift types found. Add one to get started.
                  </td>
                </tr>
              ) : (
                shiftTypes.map(shiftType => (
                  <tr key={shiftType.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{shiftType.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono text-center">{shiftType.startTime}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono text-center">{shiftType.endTime}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            shiftType.createdBy?.name 
                              ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' 
                              : 'text-muted-foreground/40'
                          }`} 
                          title="Created By"
                        >
                          {shiftType.createdBy?.name || '-'}
                        </div>
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            shiftType.lastUpdatedBy?.name 
                              ? 'bg-muted text-muted-foreground border border-border' 
                              : 'text-muted-foreground/40'
                          }`} 
                          title="Last Updated By"
                        >
                          {shiftType.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          href={`/admin/shift-types/${shiftType.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => handleDeleteClick(shiftType.id)}
                          disabled={!canDelete || isPending}
                          title={!canDelete ? 'Permission Denied' : 'Delete'}
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
