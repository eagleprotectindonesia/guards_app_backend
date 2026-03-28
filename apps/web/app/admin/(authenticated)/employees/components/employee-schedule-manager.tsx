'use client';

import { Fragment, useActionState, useEffect, useState } from 'react';
import {
  deleteEmployeeOfficeWorkScheduleAssignment,
  scheduleEmployeeOfficeWorkSchedule,
  updateEmployeeOfficeWorkScheduleAssignment,
} from '../actions';
import { ActionState } from '@/types/actions';
import { CreateEmployeeOfficeWorkScheduleAssignmentInput } from '@repo/validations';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

type TimelineItem = {
  id: string;
  scheduleId: string;
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
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState<ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>, FormData>(
    scheduleEmployeeOfficeWorkSchedule.bind(null, employeeId),
    { success: false }
  );
  const [editState, editFormAction, isEditPending] = useActionState<
    ActionState<CreateEmployeeOfficeWorkScheduleAssignmentInput>,
    FormData
  >(
    async (_prevState, formData) => {
      const assignmentId = formData.get('assignmentId');

      if (typeof assignmentId !== 'string' || !assignmentId) {
        return { success: false, message: 'Assignment ID is required.' };
      }

      const result = await updateEmployeeOfficeWorkScheduleAssignment(employeeId, assignmentId, { success: false }, formData);

      if (result.success) {
        setEditingAssignmentId(null);
      }

      return result;
    },
    { success: false }
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState<{ success: boolean; message?: string }, FormData>(
    async (_prevState, formData) => {
      const assignmentId = formData.get('assignmentId');

      if (typeof assignmentId !== 'string' || !assignmentId) {
        return { success: false, message: 'Assignment ID is required.' };
      }

      const result = await deleteEmployeeOfficeWorkScheduleAssignment(employeeId, assignmentId);

      if (result.success) {
        setEditingAssignmentId(null);
      }

      return result;
    },
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

  useEffect(() => {
    if (editState.success) {
      toast.success(editState.message || 'Employee schedule updated successfully.');
      router.refresh();
    } else if (editState.message && !editState.success) {
      toast.error(editState.message);
    }
  }, [editState, router]);

  useEffect(() => {
    if (deleteState.success) {
      toast.success(deleteState.message || 'Employee schedule deleted successfully.');
      router.refresh();
    } else if (deleteState.message && !deleteState.success) {
      toast.error(deleteState.message);
    }
  }, [deleteState, router]);

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
          Add timeline entries with a template and effective date. End dates are managed automatically based on the next scheduled change.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Current assignments cannot be edited directly. If HR needs to change today&apos;s active schedule, create a new assignment starting tomorrow.
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
              <th className="py-3 px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {timeline.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 px-4 text-sm text-muted-foreground text-center">
                  No custom schedule assignments. The employee currently follows the default office schedule.
                </td>
              </tr>
            ) : (
              timeline.map(item => {
                const isUpcoming = item.status === 'Upcoming';
                const isEditing = editingAssignmentId === item.id;

                return (
                  <Fragment key={item.id}>
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
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {isUpcoming ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingAssignmentId(isEditing ? null : item.id)}
                              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
                            >
                              {isEditing ? 'Cancel' : 'Edit'}
                            </button>
                            <form
                              action={deleteFormAction}
                              onSubmit={event => {
                                if (
                                  !window.confirm(
                                    'Delete this future schedule entry? If there is a previous custom schedule, it will extend to cover this period.'
                                  )
                                ) {
                                  event.preventDefault();
                                }
                              }}
                            >
                              <input type="hidden" name="assignmentId" value={item.id} />
                              <button
                                type="submit"
                                disabled={isDeletePending}
                                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </form>
                          </div>
                        ) : (
                          'Add a new row from tomorrow to change the active schedule.'
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr key={`${item.id}-edit`} className="bg-muted/10">
                        <td colSpan={5} className="px-4 py-4">
                          <form action={editFormAction} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px_auto]">
                            <input type="hidden" name="assignmentId" value={item.id} />
                            <div>
                              <label htmlFor={`edit-officeWorkScheduleId-${item.id}`} className="block font-medium text-foreground mb-1">
                                Schedule Template
                              </label>
                              <select
                                id={`edit-officeWorkScheduleId-${item.id}`}
                                name="officeWorkScheduleId"
                                defaultValue={item.scheduleId}
                                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
                              >
                                {scheduleOptions.map(option => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`edit-effectiveFrom-${item.id}`} className="block font-medium text-foreground mb-1">
                                Effective From
                              </label>
                              <input
                                type="date"
                                id={`edit-effectiveFrom-${item.id}`}
                                name="effectiveFrom"
                                defaultValue={format(new Date(item.effectiveFrom), 'yyyy-MM-dd')}
                                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="submit"
                                disabled={isEditPending}
                                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                              >
                                {isEditPending ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </form>
                          {editState.message && !editState.success && (
                            <div className="mt-3 text-sm text-red-600">{editState.message}</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <form action={formAction} className="space-y-4 rounded-lg border border-border bg-muted/20 p-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Add Timeline Entry</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a schedule template and the date when it should start. If a later change already exists, this entry will end automatically when that later change begins.
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
            {isPending ? 'Saving...' : 'Save Timeline Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
