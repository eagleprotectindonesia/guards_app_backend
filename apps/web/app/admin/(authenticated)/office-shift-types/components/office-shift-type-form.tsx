'use client';

import { SerializedOfficeShiftTypeWithAdminInfoDto } from '@/types/office-shift-types';
import { createOfficeShiftType, updateOfficeShiftType } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateOfficeShiftTypeInput } from '@repo/validations';
import { useActionState, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { TimePicker } from '@/components/ui/time-picker';
import { Clock } from 'lucide-react';

type Props = {
  officeShiftType?: Omit<SerializedOfficeShiftTypeWithAdminInfoDto, 'createdBy' | 'lastUpdatedBy'>;
};

const calculateDuration = (start: string | null, end: string | null) => {
  if (!start || !end) return null;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;
  if (endTotal < startTotal) endTotal += 24 * 60;
  const diff = endTotal - startTotal;
  return `${Math.floor(diff / 60)} hr ${diff % 60} min`;
};

export default function OfficeShiftTypeForm({ officeShiftType }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateOfficeShiftTypeInput>, FormData>(
    officeShiftType ? updateOfficeShiftType.bind(null, officeShiftType.id) : createOfficeShiftType,
    { success: false }
  );
  const [startTime, setStartTime] = useState<string | null>(officeShiftType?.startTime || null);
  const [endTime, setEndTime] = useState<string | null>(officeShiftType?.endTime || null);
  const duration = useMemo(() => calculateDuration(startTime, endTime), [startTime, endTime]);

  useEffect(() => {
    if (state.success) {
      toast.success(
        state.message ||
          (officeShiftType ? 'Office Shift Type updated successfully!' : 'Office Shift Type created successfully!')
      );
      router.push('/admin/office-shift-types');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, officeShiftType, router]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {officeShiftType ? 'Edit Office Shift Type' : 'Add Office Shift Type'}
      </h1>
      <form action={formAction} className="space-y-8">
        <div>
          <label htmlFor="name" className="block font-medium text-foreground mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={officeShiftType?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:text-muted-foreground/50"
            placeholder="e.g. Morning Office Shift"
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block font-medium text-foreground mb-1">
              Start Time
            </label>
            <TimePicker onChange={setStartTime} value={startTime} className="w-full h-10" use24h={true} />
            <input type="hidden" name="startTime" value={startTime || ''} />
            {state.errors?.startTime && <p className="text-red-500 text-xs mt-1">{state.errors.startTime[0]}</p>}
          </div>
          <div>
            <label htmlFor="endTime" className="block font-medium text-foreground mb-1">
              End Time
            </label>
            <TimePicker onChange={setEndTime} value={endTime} className="w-full h-10" use24h={true} />
            <input type="hidden" name="endTime" value={endTime || ''} />
            {state.errors?.endTime && <p className="text-red-500 text-xs mt-1">{state.errors.endTime[0]}</p>}
          </div>
        </div>

        {duration && (
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md w-fit border border-blue-100">
            <Clock className="w-4 h-4" />
            <span className="font-medium">Shift Duration: {duration}</span>
          </div>
        )}

        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm border border-red-100">{state.message}</div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/office-shift-types')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : officeShiftType ? 'Save Changes' : 'Add Office Shift Type'}
          </button>
        </div>
      </form>
    </div>
  );
}
