'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/confirm-dialog';
import { DeleteButton, EditButton } from '../../components/action-buttons';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedOfficeMemoWithAdminInfoDto } from '@/types/office-memos';
import { deleteOfficeMemoAction } from '../actions';

type Props = {
  officeMemos: SerializedOfficeMemoWithAdminInfoDto[];
};

export default function OfficeMemoList({ officeMemos }: Props) {
  const { hasPermission } = useSession();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.OFFICE_MEMOS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.OFFICE_MEMOS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.OFFICE_MEMOS.DELETE);

  const handleConfirmDelete = () => {
    if (!deleteId || !canDelete) return;

    startTransition(async () => {
      const result = await deleteOfficeMemoAction(deleteId);
      if (result.success) {
        toast.success('Office memo deleted successfully.');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete office memo.');
      }
    });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Memos</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage office announcements by date range and department scope.</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/office-memos/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/30"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Add Office Memo
          </Link>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Period</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Scope</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Active</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {officeMemos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No office memos found. Add one to get started.
                  </td>
                </tr>
              ) : (
                officeMemos.map(memo => (
                  <tr key={memo.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="text-sm font-medium text-foreground">{memo.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{memo.message || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      {memo.startDate} - {memo.endDate}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      {memo.scope === 'all' ? 'All employees' : `Departments (${memo.departmentKeys.join(', ')})`}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`px-2 py-1 text-xs rounded border ${memo.isActive ? 'bg-green-100 text-green-700 border-green-200' : 'bg-muted text-muted-foreground border-border'}`}>
                        {memo.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton
                          href={`/admin/office-memos/${memo.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => canDelete && setDeleteId(memo.id)}
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

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Office Memo"
        description="Are you sure you want to delete this office memo?"
        confirmText="Delete Office Memo"
        isPending={isPending}
      />
    </div>
  );
}
