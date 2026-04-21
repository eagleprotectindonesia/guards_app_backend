'use client';

import {
  SerializedAdminOwnershipAssignmentDto,
  SerializedAdminOwnershipOptionDto,
  SerializedAdminWithRoleDto,
  SerializedRoleDto,
} from '@/types/admins';
import { createAdmin, updateAdmin, disableAdmin2FA } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateAdminInput } from '@repo/validations';
import { useActionState, useEffect, useTransition } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';
import { ShieldAlert } from 'lucide-react';

type Props = {
  admin?: SerializedAdminWithRoleDto;
  roles: SerializedRoleDto[];
  ownershipAssignments: SerializedAdminOwnershipAssignmentDto[];
  departmentOptions: SerializedAdminOwnershipOptionDto[];
  officeOptions: SerializedAdminOwnershipOptionDto[];
};

export default function AdminForm({ admin, roles, ownershipAssignments, departmentOptions, officeOptions }: Props) {
  const router = useRouter();
  const [isPending2FA, start2FATransition] = useTransition();
  const [state, formAction, isPending] = useActionState<ActionState<CreateAdminInput>, FormData>(
    admin ? updateAdmin.bind(null, admin.id) : createAdmin,
    { success: false }
  );
  const selectedDepartmentKeys = new Set(
    ownershipAssignments.map(assignment => assignment.departmentKey).filter((value): value is string => !!value)
  );
  const selectedOfficeIds = new Set(
    ownershipAssignments.map(assignment => assignment.officeId).filter((value): value is string => !!value)
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

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block font-medium text-foreground mb-2">Owned Departments</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-3 space-y-2">
              {departmentOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No departments available yet.</p>
              ) : (
                departmentOptions.map(option => (
                  <label key={option.id} className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="ownershipDepartmentKeys"
                      value={option.id}
                      defaultChecked={selectedDepartmentKeys.has(option.id)}
                      className="mt-0.5 rounded border-border"
                    />
                    <span className="break-all">{option.label}</span>
                  </label>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Department values are normalized (trimmed + lowercase) for stable matching.
            </p>
          </div>

          <div>
            <label className="block font-medium text-foreground mb-2">Owned Offices</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-3 space-y-2">
              {officeOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active offices available.</p>
              ) : (
                officeOptions.map(option => (
                  <label key={option.id} className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="ownershipOfficeIds"
                      value={option.id}
                      defaultChecked={selectedOfficeIds.has(option.id)}
                      className="mt-0.5 rounded border-border"
                    />
                    <span className="break-all">{option.label}</span>
                  </label>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Employees matching selected department or office scopes will be routed to this admin.
            </p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              name="includeFallbackLeaveQueue"
              defaultChecked={admin?.includeFallbackLeaveQueue ?? false}
              className="rounded border-border"
            />
            Include fallback queue (unassigned employees)
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            When enabled, this admin can review leave requests for employees without any ownership assignment.
          </p>
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
