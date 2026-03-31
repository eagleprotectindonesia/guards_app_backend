'use client';

import { useState, useTransition } from 'react';
import { SerializedOfficeShiftTypeWithAdminInfoDto } from '@/types/office-shift-types';
import { deleteOfficeShiftType } from '../actions';
import ConfirmDialog from '../../components/confirm-dialog';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type Props = {
  officeShiftTypes: SerializedOfficeShiftTypeWithAdminInfoDto[];
  page: number;
  perPage: number;
  totalCount: number;
};

export default function OfficeShiftTypeList({ officeShiftTypes, page, perPage, totalCount }: Props) {
  const { hasPermission } = useSession();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.OFFICE_SHIFT_TYPES.CREATE);
  const canEdit = hasPermission(PERMISSIONS.OFFICE_SHIFT_TYPES.EDIT);
  const canDelete = hasPermission(PERMISSIONS.OFFICE_SHIFT_TYPES.DELETE);

  const handleConfirmDelete = () => {
    if (!deleteId || !canDelete) return;

    startTransition(async () => {
      const result = await deleteOfficeShiftType(deleteId);
      if (result.success) {
        toast.success('Office Shift Type deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete office shift type.');
      }
    });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Shift Types</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage standard office shift templates.</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/office-shift-types/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/30"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Add Office Shift Type
          </Link>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Start Time</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">End Time</th>
                <th className="py-3 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-blue-600">Created By</span>
                    <span className="text-muted-foreground/60">Last Updated By</span>
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {officeShiftTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No office shift types found. Add one to get started.
                  </td>
                </tr>
              ) : (
                officeShiftTypes.map(officeShiftType => (
                  <tr key={officeShiftType.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{officeShiftType.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono text-center">{officeShiftType.startTime}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono text-center">{officeShiftType.endTime}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                          {officeShiftType.createdBy?.name || '-'}
                        </div>
                        <div className="px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                          {officeShiftType.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton
                          href={`/admin/office-shift-types/${officeShiftType.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => canDelete && setDeleteId(officeShiftType.id)}
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

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Office Shift Type"
        description="Are you sure you want to delete this office shift type? This might affect existing office shifts."
        confirmText="Delete Office Shift Type"
        isPending={isPending}
      />
    </div>
  );
}
