'use client';

import { Role } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteRole } from '../actions';
import { useTransition } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Pencil, ShieldCheck } from 'lucide-react';
import { DeleteButton } from '../../../components/action-buttons';

type Props = {
  roles: Serialized<Role>[];
};

export default function RoleList({ roles }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this role? This action cannot be undone.')) return;

    startTransition(async () => {
      const result = await deleteRole(id);
      if (result.success) {
        toast.success(result.message || 'Role deleted successfully');
      } else {
        toast.error(result.message || 'Failed to delete role');
      }
    });
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Role Name</th>
              <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Description
              </th>
              <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Permissions
              </th>
              <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No roles found.
                </td>
              </tr>
            ) : (
              roles.map(role => (
                <tr key={role.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="py-4 px-6 text-sm font-medium text-foreground">{role.name}</td>
                  <td className="py-4 px-6 text-sm text-muted-foreground">
                    <div className="max-w-[300px] truncate" title={role.description || ''}>
                      {role.description || '-'}
                    </div>
                  </td>
                  {/* <td className="py-4 px-6 text-sm text-muted-foreground">
                    <div className="flex flex-wrap gap-1">
                      {role.permissions?.slice(0, 5).map(p => (
                        <span key={p.id} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                          {p.code}
                        </span>
                      ))}
                      {role.permissions?.length > 5 && (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                          +{role.permissions.length - 5} more
                        </span>
                      )}
                    </div>
                  </td> */}
                  <td className="py-4 px-6 text-sm">
                    {role.isSystem ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        System
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">Custom</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/system/roles/${role.id}/edit`}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Edit Roles"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                      {!role.isSystem && <DeleteButton onClick={() => handleDelete(role.id)} disabled={isPending} />}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
