'use client';

import { useTransition } from 'react';
import { Designation, Department } from '@repo/types';
import { deleteDesignationAction } from '../actions';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type DesignationWithDepartment = Designation & {
  department: Department;
};

type DesignationListProps = {
  designations: DesignationWithDepartment[];
};

export default function DesignationList({ designations }: DesignationListProps) {
  const [isPending, startTransition] = useTransition();
  const { hasPermission } = useSession();

  const canCreate = hasPermission(PERMISSIONS.DESIGNATIONS.CREATE);
  const canEdit = hasPermission(PERMISSIONS.DESIGNATIONS.EDIT);
  const canDelete = hasPermission(PERMISSIONS.DESIGNATIONS.DELETE);

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    if (!window.confirm('Are you sure you want to delete this designation? This action cannot be undone.')) {
      return;
    }

    startTransition(async () => {
      const result = await deleteDesignationAction(id);
      if (result.success) {
        toast.success(result.message || 'Designation deleted successfully!');
      } else {
        toast.error(result.message || 'Failed to delete designation.');
      }
    });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Designations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage employee designations and job titles.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Link
              href="/admin/designations/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/20"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Create Designation
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {designations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No designations found. Create one to get started.
                  </td>
                </tr>
              ) : (
                designations.map(desig => (
                  <tr key={desig.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{desig.name}</td>
                    <td className="py-4 px-6 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                        {desig.department.name}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        desig.role === 'on_site' 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' 
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                      }`}>
                        {desig.role === 'on_site' ? 'On Site' : 'Office'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[300px] whitespace-normal wrap-break-words">{desig.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton
                          href={`/admin/designations/${desig.id}/edit`}
                          disabled={!canEdit}
                        />
                        <DeleteButton
                          onClick={() => handleDelete(desig.id)}
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
