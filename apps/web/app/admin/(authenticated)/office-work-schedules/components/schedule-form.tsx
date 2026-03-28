'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ActionState } from '@/types/actions';
import { UpdateOfficeWorkScheduleInput } from '@repo/validations';
import OfficeWorkScheduleEditor, {
  OfficeWorkScheduleDayFormValue,
} from '../../components/office-work-schedule-editor';

type FormAction = (
  prevState: ActionState<UpdateOfficeWorkScheduleInput>,
  formData: FormData
) => Promise<ActionState<UpdateOfficeWorkScheduleInput>>;

type Props = {
  title: string;
  description: string;
  submitLabel: string;
  action: FormAction;
  schedule?: {
    id: string;
    name: string;
    days: OfficeWorkScheduleDayFormValue[];
  };
};

export default function ScheduleForm({ title, description, submitLabel, action, schedule }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<UpdateOfficeWorkScheduleInput>, FormData>(
    action,
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Office schedule saved successfully.');
      router.push('/admin/office-work-schedules');
      router.refresh();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [router, state]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <form action={formAction} className="space-y-6">
        <div>
          <label htmlFor="name" className="block font-medium text-foreground mb-1">
            Schedule Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={schedule?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
            placeholder="e.g. Finance Team Schedule"
          />
          {state.errors?.name?.[0] && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        <OfficeWorkScheduleEditor
          initialDays={
            schedule?.days || [
              { weekday: 0, isWorkingDay: false, startTime: null, endTime: null },
              { weekday: 1, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
              { weekday: 2, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
              { weekday: 3, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
              { weekday: 4, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
              { weekday: 5, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
              { weekday: 6, isWorkingDay: false, startTime: null, endTime: null },
            ]
          }
        />

        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/30">
            {state.message}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/office-work-schedules')}
            className="px-5 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-muted/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
