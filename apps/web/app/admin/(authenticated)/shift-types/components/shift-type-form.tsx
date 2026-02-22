'use client';

import { SerializedShiftTypeWithAdminInfoDto } from '@/types/shift-types';
import { createShiftType, updateShiftType } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateShiftTypeInput } from '@/lib/validations';
import { useActionState, useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { TimePicker } from '@/components/ui/time-picker';
import { Clock } from 'lucide-react';

type Props = {
  shiftType?: Omit<SerializedShiftTypeWithAdminInfoDto, 'createdBy' | 'lastUpdatedBy'>;
};

const calculateDuration = (start: string | null, end: string | null) => {
  if (!start || !end) return null;

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;

  if (endTotal < startTotal) {
    endTotal += 24 * 60; // Crosses midnight
  }

  const diff = endTotal - startTotal;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  return `${hours} hr ${minutes} min`;
};

export default function ShiftTypeForm({ shiftType }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateShiftTypeInput>, FormData>(
    shiftType ? updateShiftType.bind(null, shiftType.id) : createShiftType,
    { success: false }
  );

  const [startTime, setStartTime] = useState<string | null>(shiftType?.startTime || null);
  const [endTime, setEndTime] = useState<string | null>(shiftType?.endTime || null);

  const duration = useMemo(() => calculateDuration(startTime, endTime), [startTime, endTime]);

  useEffect(() => {
    if (state.success) {
      toast.success(
        state.message || (shiftType ? 'Shift Type updated successfully!' : 'Shift Type created successfully!')
      );
      router.push('/admin/shift-types');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, shiftType, router]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">{shiftType ? 'Edit Shift Type' : 'Add New Shift Type'}</h1>
      <form action={formAction} className="space-y-8">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block font-medium text-foreground mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={shiftType?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground/50"
            placeholder="e.g. Night Shift"
          />
          {state.errors?.name && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Start Time Field */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block font-medium text-foreground mb-1">
              Start Time
            </label>
            <TimePicker
              onChange={setStartTime}
              value={startTime}
              className="w-full h-10"
              use24h={true}
            />
            <input type="hidden" name="startTime" value={startTime || ''} />
            {state.errors?.startTime && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.startTime[0]}</p>}
          </div>

          {/* End Time Field */}
          <div>
            <label htmlFor="endTime" className="block font-medium text-foreground mb-1">
              End Time
            </label>
            <TimePicker
              onChange={setEndTime}
              value={endTime}
              className="w-full h-10"
              use24h={true}
            />
            <input type="hidden" name="endTime" value={endTime || ''} />
            {state.errors?.endTime && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.endTime[0]}</p>}
          </div>
        </div>

        {/* Duration Display */}
        {duration && (
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-md w-fit border border-blue-100 dark:border-blue-800">
            <Clock className="w-4 h-4" />
            <span className="font-medium">Shift Duration: {duration}</span>
          </div>
        )}

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/50">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/shift-types')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Saving...' : shiftType ? 'Save Changes' : 'Add Shift Type'}
          </button>
        </div>
      </form>
    </div>
  );
}
