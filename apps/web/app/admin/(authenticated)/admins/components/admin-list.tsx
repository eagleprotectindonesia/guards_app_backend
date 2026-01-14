'use client';

import { useState, useTransition } from 'react';
import { Admin } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteAdmin } from '../actions';
import ConfirmDialog from '../../components/confirm-dialog';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import PaginationNav from '../../components/pagination-nav';
import Link from 'next/link';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type AdminListProps = {
  admins: Serialized<Admin & { roleRef?: { name: string } | null }>[];
  page: number;
  perPage: number;
  totalCount: number;
};

export default function AdminList({ admins, page, perPage, totalCount }: AdminListProps) {
  const { hasPermission } = useSession();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.ADMINS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.ADMINS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.ADMINS.DELETE);

  const handleDeleteClick = (id: string) => {
    if (!canDelete) return;
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId || !canDelete) return;

    startTransition(async () => {
      const result = await deleteAdmin(deleteId);
      if (result.success) {
        toast.success('Admin deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete admin.');
      }
    });
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admins</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage system administrators.</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/admins/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/30"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Add Admin
          </Link>
        )}
      </div>

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No admins found. Add one to get started.
                  </td>
                </tr>
              ) : (
                admins.map(admin => {
                  const roleName = admin.roleRef?.name || 'Admin';
                  const isSuperAdmin = roleName === 'Super Admin';

                  return (
                    <tr key={admin.id} className="hover:bg-muted/50 transition-colors group">
                      <td className="py-4 px-6 text-sm font-medium text-foreground">{admin.name}</td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">{admin.email}</td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isSuperAdmin
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                              : 'bg-muted text-foreground border border-border'
                          }`}
                        >
                          {roleName}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        <div className="max-w-[200px] whitespace-normal wrap-break-words">{admin.note || '-'}</div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-100">
                          <EditButton
                            href={`/admin/admins/${admin.id}/edit`}
                            disabled={!canEdit}
                            title={isSuperAdmin ? 'Super Admin cannot be edited here' : (!canEdit ? 'Permission Denied' : 'Edit')}
                          />
                          <DeleteButton
                            onClick={() => handleDeleteClick(admin.id)}
                            disabled={isPending || !canDelete || isSuperAdmin}
                            title={isSuperAdmin ? 'Cannot delete a Super Admin' : (!canDelete ? 'Permission Denied' : 'Delete')}
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

      {/* Pagination */}
      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Admin"
        description="Are you sure you want to delete this admin?"
        confirmText="Delete Admin"
        isPending={isPending}
      />
    </div>
  );
}
