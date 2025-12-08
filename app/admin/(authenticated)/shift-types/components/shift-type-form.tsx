'use client';

import { Serialized } from '@/lib/utils';
import { createShiftType, updateShiftType, ActionState } from '../actions';
import { useActionState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ShiftType } from '@prisma/client';
import { useRouter } from 'next/navigation';

type Props = {
  shiftType?: Serialized<ShiftType>;
};

export default function ShiftTypeForm({ shiftType }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    shiftType ? updateShiftType.bind(null, shiftType.id) : createShiftType,
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (shiftType ? 'Shift Type updated successfully!' : 'Shift Type created successfully!'));
      router.push('/admin/shift-types');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, shiftType, router]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{shiftType ? 'Edit Shift Type' : 'Add New Shift Type'}</h1>
      <form action={formAction} className="space-y-6">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            defaultValue={shiftType?.name || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. Night Shift"
          />
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Start Time Field */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
              Start Time
            </label>
            <input
              type="time"
              name="startTime"
              id="startTime"
              defaultValue={shiftType?.startTime || ''}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
            {state.errors?.startTime && <p className="text-red-500 text-xs mt-1">{state.errors.startTime[0]}</p>}
          </div>

          {/* End Time Field */}
          <div>
            <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
              End Time
            </label>
            <input
              type="time"
              name="endTime"
              id="endTime"
              defaultValue={shiftType?.endTime || ''}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
            {state.errors?.endTime && <p className="text-red-500 text-xs mt-1">{state.errors.endTime[0]}</p>}
          </div>
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => router.push('/admin/shift-types')}
            className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Saving...' : shiftType ? 'Save Changes' : 'Add Shift Type'}
          </button>
        </div>
      </form>
    </div>
  );
}
