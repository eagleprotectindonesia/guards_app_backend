'use client';

import { useTransition } from 'react';
import { Department } from '@repo/types';
import { deleteDepartmentAction } from '../actions';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type DepartmentListProps = {
  departments: Department[];
};

export default function DepartmentList({ departments }: DepartmentListProps) {
  const [isPending, startTransition] = useTransition();
  const { hasPermission } = useSession();

  const canCreate = hasPermission(PERMISSIONS.DEPARTMENTS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.DEPARTMENTS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.DEPARTMENTS.DELETE);

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    if (!window.confirm('Are you sure you want to delete this department? This action cannot be undone.')) {
      return;
    }

    startTransition(async () => {
      const result = await deleteDepartmentAction(id);
      if (result.success) {
        toast.success(result.message || 'Department deleted successfully!');
      } else {
        toast.error(result.message || 'Failed to delete department.');
      }
    });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Departments</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage company departments.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Link
              href="/admin/departments/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/20"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Create Department
            </Link>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-muted-foreground">
                    No departments found. Create one to get started.
                  </td>
                </tr>
              ) : (
                departments.map(dept => (
                  <tr key={dept.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{dept.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[400px] whitespace-normal wrap-break-words">{dept.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton
                          href={`/admin/departments/${dept.id}/edit`}
                          disabled={!canEdit}
                        />
                        <DeleteButton
                          onClick={() => handleDelete(dept.id)}
                          disabled={!canDelete || isPending}
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
    </div>
  );
}
