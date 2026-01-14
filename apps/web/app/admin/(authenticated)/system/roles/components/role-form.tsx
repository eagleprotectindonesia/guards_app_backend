'use client';

import { Role, Permission } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { createRole, updateRole } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateRoleInput } from '@/lib/validations';
import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Shield, Check } from 'lucide-react';

type Props = {
  role?: Serialized<Role & { permissions: Permission[] }>;
  allPermissions: Serialized<Permission>[];
};

export default function RoleForm({ role, allPermissions }: Props) {
  const router = useRouter();
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(role?.permissions.map(p => p.id) || []);

  const [state, formAction, isPending] = useActionState<ActionState<CreateRoleInput>, FormData>(
    async (prevState, formData) => {
      const data: CreateRoleInput = {
        name: (formData.get('name') as string) || role?.name || 'Default Role',
        description: (formData.get('description') as string) || undefined,
        permissionIds: selectedPermissions,
      };

      if (role) {
        return updateRole(role.id, prevState, data);
      }
      return createRole(prevState, data);
    },
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (role ? 'Role updated' : 'Role created'));
      router.push('/admin/system/roles');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, role, router]);

  const togglePermission = (id: string) => {
    if (role?.isSystem && role.name === 'Super Admin') return; // Cannot modify Super Admin

    setSelectedPermissions(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  };

  const groupPermissions = () => {
    const groups: Record<string, Serialized<Permission>[]> = {};
    allPermissions.forEach(p => {
      if (!groups[p.resource]) groups[p.resource] = [];
      groups[p.resource].push(p);
    });
    return groups;
  };

  const permissionGroups = groupPermissions();

  return (
    <form action={formAction} className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Role Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={role?.name}
              disabled={role?.isSystem}
              className="w-full h-11 px-4 bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-60"
              placeholder="e.g. Site Manager"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
            >
              Description (Optional)
            </label>
            <input
              id="description"
              name="description"
              type="text"
              defaultValue={role?.description || ''}
              className="w-full h-11 px-4 bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="e.g. Can manage guards and shifts but not system settings"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Permissions Configuration</h2>
          </div>
          <p className="text-xs text-muted-foreground">{selectedPermissions.length} permissions selected</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(permissionGroups).map(([resource, perms]) => (
            <div key={resource} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="bg-muted px-4 py-2 border-b border-border">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-tight">{resource}</h3>
              </div>
              <div className="p-3 space-y-1">
                {perms.map(p => {
                  const isSelected = selectedPermissions.includes(p.id);
                  const isSuperAdminDisable = role?.isSystem && role.name === 'Super Admin';

                  return (
                    <div
                      key={p.id}
                      onClick={() => togglePermission(p.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all group ${
                        isSelected
                          ? 'bg-primary/5 text-primary'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      } ${isSuperAdminDisable ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      <span className="text-sm font-medium">{p.action}</span>
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-primary border-primary text-white' : 'bg-card border-border'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-border">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || (role?.isSystem && role.name === 'Super Admin')}
          className="px-8 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:shadow-none"
        >
          {isPending ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
        </button>
      </div>
    </form>
  );
}
