'use client';

import { useActionState, useEffect } from 'react';
import { scheduleEmployeeOfficeWorkSchedule } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateEmployeeOfficeWorkScheduleAssignmentInput } from '@repo/validations';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

type TimelineItem = {
  id: string;
  scheduleName: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: 'Past' | 'Current' | 'Upcoming';
};

type ScheduleOption = {
  id: string;
  name: string;
};

type Props = {
  employeeId: string;
  employeeName: string;
  employeeCode?: string | null;
  employeeRole?: string | null;
  timeline: TimelineItem[];
  scheduleOptions: ScheduleOption[];
};

export default function EmployeeScheduleManager({
  employeeId,
  employeeName,
  employeeCode,
  employeeRole,
  timeline,
  scheduleOptions,
}: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>, FormData>(
    scheduleEmployeeOfficeWorkSchedule.bind(null, employeeId),
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Employee schedule updated successfully.');
      router.refresh();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [router, state]);

  if (employeeRole !== 'office') {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-xl font-bold text-foreground">Office Schedule</h2>
        <p className="text-sm text-muted-foreground mt-2">
          This section is available only for employees with the office role.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Office Schedule Timeline</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Future schedule changes only need a template and effective date. End date is managed automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-border bg-muted/20 p-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee Name</div>
          <div className="mt-1 text-sm font-medium text-foreground">{employeeName}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee Code</div>
          <div className="mt-1 text-sm font-medium text-foreground">{employeeCode || '-'}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Schedule</th>
              <th className="py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Effective From</th>
              <th className="py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Effective Until</th>
              <th className="py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {timeline.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 px-4 text-sm text-muted-foreground text-center">
                  No custom schedule assignments. The employee currently follows the default office schedule.
                </td>
              </tr>
            ) : (
              timeline.map(item => (
                <tr key={item.id}>
                  <td className="py-3 px-4 text-sm font-medium text-foreground">{item.scheduleName}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {format(new Date(item.effectiveFrom), 'yyyy/MM/dd')}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {item.effectiveUntil ? format(new Date(item.effectiveUntil), 'yyyy/MM/dd') : 'Ongoing'}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form action={formAction} className="space-y-4 rounded-lg border border-border bg-muted/20 p-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Schedule Future Change</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose an existing schedule template and the date when it should start.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="officeWorkScheduleId" className="block font-medium text-foreground mb-1">
              Schedule Template
            </label>
            <select
              id="officeWorkScheduleId"
              name="officeWorkScheduleId"
              defaultValue=""
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
            >
              <option value="" disabled>
                Select a schedule
              </option>
              {scheduleOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            {state.errors?.officeWorkScheduleId?.[0] && (
              <p className="text-red-500 text-xs mt-1">{state.errors.officeWorkScheduleId[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="effectiveFrom" className="block font-medium text-foreground mb-1">
              Effective From
            </label>
            <input
              type="date"
              id="effectiveFrom"
              name="effectiveFrom"
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
            />
            {state.errors?.effectiveFrom?.[0] && (
              <p className="text-red-500 text-xs mt-1">{state.errors.effectiveFrom[0]}</p>
            )}
          </div>
        </div>

        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
            {state.message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Queue Schedule Change'}
          </button>
        </div>
      </form>
    </div>
  );
}
