'use client';

import { Serialized } from '@/lib/utils';
import { createAdmin, updateAdmin } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateAdminInput } from '@/lib/validations';
import { useActionState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Admin } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';

type Props = {
  admin?: Serialized<Admin>;
};

export default function AdminForm({ admin }: Props) {
  const router = useRouter();
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{admin ? 'Edit Admin' : 'Add New Admin'}</h1>
      <form action={formAction} className="space-y-6">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={admin?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            placeholder="e.g. John Doe"
            minLength={6}
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            name="email"
            id="email"
            defaultValue={admin?.email || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            placeholder="e.g. admin@example.com"
            minLength={6}
          />
          {state.errors?.email && <p className="text-red-500 text-xs mt-1">{state.errors.email[0]}</p>}
        </div>

        {/* Role Field */}
        <div>
          <label htmlFor="role" className="block font-medium text-gray-700 mb-1">
            Role
          </label>
          <select
            name="role"
            id="role"
            defaultValue={admin?.role || 'admin'}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
          >
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
          </select>
          {state.errors?.role && <p className="text-red-500 text-xs mt-1">{state.errors.role[0]}</p>}
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block font-medium text-gray-700 mb-1">
            {admin ? 'New Password (Optional)' : 'Password'}
          </label>
          <PasswordInput
            name="password"
            id="password"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            placeholder={admin ? 'Leave blank to keep current' : 'Enter password'}
          />
          {state.errors?.password && <p className="text-red-500 text-xs mt-1">{state.errors.password[0]}</p>}
        </div>

        {/* Note Field */}
        <div>
          <label htmlFor="note" className="block font-medium text-gray-700 mb-1">
            Note
          </label>
          <textarea
            name="note"
            id="note"
            defaultValue={admin?.note || ''}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
            placeholder="Add any additional information..."
          />
          {state.errors?.note && <p className="text-red-500 text-xs mt-1">{state.errors.note[0]}</p>}
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
            className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-600/30"
          >
            {isPending ? 'Saving...' : admin ? 'Save Changes' : 'Add Admin'}
          </button>
        </div>
      </form>
    </div>
  );
}
