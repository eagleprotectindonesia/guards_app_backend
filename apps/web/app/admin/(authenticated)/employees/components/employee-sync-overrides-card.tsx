'use client';

import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionState } from '@/types/actions';
import { updateEmployeeRoleSyncOverride, updateEmployeeOfficeSyncOverride } from '../actions';

type OfficeOption = {
  id: string;
  name: string;
  source: 'external' | 'manual';
};

type Props = {
  employeeId: string;
  roleSyncOverride: boolean;
  role: 'on_site' | 'office';
  officeSyncOverride: boolean;
  officeId: string | null;
  offices: OfficeOption[];
};

export default function EmployeeSyncOverridesCard({
  employeeId,
  roleSyncOverride,
  role,
  officeSyncOverride,
  officeId,
  offices,
}: Props) {
  // Role Sync State
  const [roleOverrideEnabled, setRoleOverrideEnabled] = useState(roleSyncOverride);
  const [roleState, roleFormAction, isRolePending] = useActionState<
    ActionState<{ roleSyncOverride: boolean; role: 'on_site' | 'office' }>,
    FormData
  >(updateEmployeeRoleSyncOverride.bind(null, employeeId), { success: false });

  // Office Sync State
  const [officeOverrideEnabled, setOfficeOverrideEnabled] = useState(officeSyncOverride);
  const [officeState, officeFormAction, isOfficePending] = useActionState<
    ActionState<{ officeSyncOverride: boolean; officeId: string }>,
    FormData
  >(updateEmployeeOfficeSyncOverride.bind(null, employeeId), { success: false });

  // Notifications
  useEffect(() => {
    if (roleState.success) {
      toast.success(roleState.message || 'Role sync override updated successfully.');
    } else if (roleState.message && !roleState.success) {
      toast.error(roleState.message);
    }
  }, [roleState]);

  useEffect(() => {
    if (officeState.success) {
      toast.success(officeState.message || 'Office sync override updated successfully.');
    } else if (officeState.message && !officeState.success) {
      toast.error(officeState.message);
    }
  }, [officeState]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">External Sync Overrides</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Manage manual overrides for employee attributes that are typically managed by external sync.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Role Sync Override */}
        <div className="space-y-4">
          <div className="pb-2 border-b border-border">
            <h3 className="font-semibold text-foreground">Role Override</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Prevent external sync from auto-changing this employee&apos;s role.
            </p>
          </div>

          <form action={roleFormAction} className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
            <div className="space-y-1">
              <label htmlFor="role" className="block text-sm font-medium text-foreground">
                App Role
              </label>
              <select
                id="role"
                name="role"
                defaultValue={role}
                disabled={isRolePending || !roleOverrideEnabled}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:opacity-60"
              >
                <option value="on_site">On-Site Guard</option>
                <option value="office">Office Staff</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {roleOverrideEnabled ? 'Manual role selection is enabled.' : 'Role is managed by external sync.'}
              </p>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Override Enabled</p>
                <p className="text-xs text-muted-foreground">Role remains manual until disabled.</p>
              </div>
              <input
                type="checkbox"
                name="roleSyncOverride"
                value="true"
                defaultChecked={roleSyncOverride}
                onChange={event => setRoleOverrideEnabled(event.target.checked)}
                disabled={isRolePending}
                className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-600 disabled:opacity-60"
              />
            </label>
            <input type="hidden" name="roleSyncOverride" value="false" />

            <button
              type="submit"
              disabled={isRolePending}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRolePending ? 'Saving...' : 'Save Role Override'}
            </button>
          </form>
        </div>

        {/* Office Sync Override */}
        <div className="space-y-4">
          <div className="pb-2 border-b border-border">
            <h3 className="font-semibold text-foreground">Office Override</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Prevent external sync from auto-changing this employee&apos;s assigned office.
            </p>
          </div>

          <form action={officeFormAction} className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
            <div className="space-y-1">
              <label htmlFor="officeId" className="block text-sm font-medium text-foreground">
                Assigned Office
              </label>
              <select
                id="officeId"
                name="officeId"
                defaultValue={officeId ?? ''}
                disabled={isOfficePending || !officeOverrideEnabled}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:opacity-60"
              >
                <option value="">No office</option>
                {offices.map(office => (
                  <option key={office.id} value={office.id}>
                    {office.name} ({office.source === 'external' ? 'External' : 'Manual'})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {officeOverrideEnabled ? 'Manual office assignment is enabled.' : 'Office is managed by external sync.'}
              </p>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Override Enabled</p>
                <p className="text-xs text-muted-foreground">Office assignment remains manual until disabled.</p>
              </div>
              <input
                type="checkbox"
                name="officeSyncOverride"
                value="true"
                defaultChecked={officeSyncOverride}
                onChange={event => setOfficeOverrideEnabled(event.target.checked)}
                disabled={isOfficePending}
                className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-600 disabled:opacity-60"
              />
            </label>
            <input type="hidden" name="officeSyncOverride" value="false" />

            <button
              type="submit"
              disabled={isOfficePending}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOfficePending ? 'Saving...' : 'Save Office Override'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
