'use client';

import { Serialized } from '@/lib/utils';
import { createAdmin, updateAdmin, disableAdmin2FA } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateAdminInput } from '@/lib/validations';
import { useActionState, useEffect, useTransition } from 'react';
import toast from 'react-hot-toast';
import { Admin, Role } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';
import { ShieldAlert } from 'lucide-react';

type Props = {
  admin?: Serialized<Admin & { roleRef?: { id: string; name: string } | null }>;
  roles: Serialized<Role>[];
};

export default function AdminForm({ admin, roles }: Props) {
  const router = useRouter();
  const [isPending2FA, start2FATransition] = useTransition();
  const [state, formAction, isPending] = useActionState<ActionState<CreateAdminInput>, FormData>(
    admin ? updateAdmin.bind(null, admin.id) : createAdmin,
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (admin ? 'Admin updated successfully!' : 'Admin created successfully!'));
      router.push('/admin/admins');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, admin, router]);

  const handleDisable2FA = () => {
    if (!admin) return;
    if (!confirm(`Are you sure you want to disable 2FA for ${admin.name}?`)) return;

    start2FATransition(async () => {
      const result = await disableAdmin2FA(admin.id);
      if (result.success) {
        toast.success(result.message || '2FA disabled successfully');
        router.refresh();
      } else {
        toast.error(result.message || 'Failed to disable 2FA');
      }
    });
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">{admin ? 'Edit Admin' : 'Add New Admin'}</h1>
        
        {admin?.twoFactorEnabled && (
          <button
            type="button"
            onClick={handleDisable2FA}
            disabled={isPending2FA}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" />
            {isPending2FA ? 'Disabling...' : 'Disable 2FA'}
          </button>
        )}
      </div>

      <form action={formAction} className="space-y-6">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block font-medium text-foreground mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={admin?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-muted-foreground"
            placeholder="e.g. John Doe"
            minLength={6}
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block font-medium text-foreground mb-1">
            Email
          </label>
          <input
            type="email"
            name="email"
            id="email"
            defaultValue={admin?.email || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-muted-foreground"
            placeholder="e.g. admin@example.com"
            minLength={6}
          />
          {state.errors?.email && <p className="text-red-500 text-xs mt-1">{state.errors.email[0]}</p>}
        </div>

        {/* Role Field */}
        <div>
          <label htmlFor="roleId" className="block font-medium text-foreground mb-1">
            Role
          </label>
          <select
            name="roleId"
            id="roleId"
            defaultValue={admin?.roleRef?.id || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            required
          >
            <option value="" disabled>
              Select a role
            </option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {state.errors?.roleId && <p className="text-red-500 text-xs mt-1">{state.errors.roleId[0]}</p>}
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block font-medium text-foreground mb-1">
            {admin ? 'New Password (Optional)' : 'Password'}
          </label>
          <PasswordInput
            name="password"
            id="password"
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-muted-foreground"
            placeholder={admin ? 'Leave blank to keep current' : 'Enter password'}
          />
          {state.errors?.password && <p className="text-red-500 text-xs mt-1">{state.errors.password[0]}</p>}
        </div>

        {/* Note Field */}
        <div>
          <label htmlFor="note" className="block font-medium text-foreground mb-1">
            Note
          </label>
          <textarea
            name="note"
            id="note"
            defaultValue={admin?.note || ''}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none placeholder:text-muted-foreground"
            placeholder="Add any additional information..."
          />
          {state.errors?.note && <p className="text-red-500 text-xs mt-1">{state.errors.note[0]}</p>}
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
            {state.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/admins')}
            className="px-6 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-500/20"
          >
            {isPending ? 'Saving...' : admin ? 'Save Changes' : 'Add Admin'}
          </button>
        </div>
      </form>
    </div>
  );
}
