'use client';

import { useActionState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ActionState } from '@/types/actions';
import { UpdateEmployeeFieldModeInput } from '@repo/validations';
import { updateEmployeeFieldMode } from '../actions';

type Props = {
  employeeId: string;
  employeeName: string;
  role: string | null;
  officeName: string | null;
  jobTitle: string | null;
  jobTitleCategory: 'staff' | 'management' | null;
  fieldModeEnabled: boolean;
  isFieldModeEditable: boolean;
  fieldModeReasonCode:
    | 'non_office'
    | 'missing_office'
    | 'staff_with_office'
    | 'management_with_office'
    | 'uncategorized_with_office';
};

function getReasonLabel(reasonCode: Props['fieldModeReasonCode']) {
  switch (reasonCode) {
    case 'missing_office':
      return 'Field mode is forced on because this office employee has no assigned office.';
    case 'staff_with_office':
      return 'Field mode is forced off because staff with an assigned office must stay in office mode.';
    case 'management_with_office':
      return 'Management employees with an assigned office can toggle field mode.';
    case 'uncategorized_with_office':
      return 'Field mode is forced off until this employee job title is categorized in system settings.';
    case 'non_office':
    default:
      return 'Field mode applies only to office-role employees.';
  }
}

export default function EmployeeFieldModeCard({
  employeeId,
  employeeName,
  role,
  officeName,
  jobTitle,
  jobTitleCategory,
  fieldModeEnabled,
  isFieldModeEditable,
  fieldModeReasonCode,
}: Props) {
  const [state, formAction, isPending] = useActionState<ActionState<UpdateEmployeeFieldModeInput>, FormData>(
    updateEmployeeFieldMode.bind(null, employeeId),
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Field mode updated successfully.');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{employeeName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review job-title categorization and the field mode rule before managing office schedules.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</p>
              <p className="mt-2 text-sm font-medium text-foreground capitalize">{role?.replace('_', ' ') || '-'}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned Office</p>
              <p className="mt-2 text-sm font-medium text-foreground">{officeName || 'No office assigned'}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job Title</p>
              <p className="mt-2 text-sm font-medium text-foreground">{jobTitle || 'No job title'}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Derived Category</p>
              <p className="mt-2 text-sm font-medium text-foreground capitalize">{jobTitleCategory || 'Uncategorized'}</p>
            </div>
          </div>
        </div>

        <form action={formAction} className="lg:w-80 rounded-xl border border-border bg-muted/20 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Field Mode</h2>
            <p className="text-sm text-muted-foreground mt-1">{getReasonLabel(fieldModeReasonCode)}</p>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-muted-foreground">
                {isFieldModeEditable ? 'This employee can switch between on and off.' : 'This value is currently forced.'}
              </p>
            </div>
            <input
              type="checkbox"
              name="fieldModeEnabled"
              value="true"
              defaultChecked={fieldModeEnabled}
              disabled={!isFieldModeEditable || isPending}
              className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-600 disabled:opacity-60"
            />
          </label>
          <input type="hidden" name="fieldModeEnabled" value="false" />

          {isFieldModeEditable && (
            <button
              type="submit"
              disabled={isPending}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Saving...' : 'Save Field Mode'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
