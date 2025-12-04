'use client';

import { Serialized } from '@/lib/utils';
import Modal from '../../components/modal';
import { createShiftType, updateShiftType, ActionState } from '../actions';
import { useActionState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ShiftType } from '@prisma/client';

type Props = {
  shiftType?: Serialized<ShiftType>;
  isOpen: boolean;
  onClose: () => void;
};

export default function ShiftTypeFormDialog({ shiftType, isOpen, onClose }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    shiftType ? updateShiftType.bind(null, shiftType.id) : createShiftType,
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (shiftType ? 'Shift Type updated successfully!' : 'Shift Type created successfully!'));
      onClose();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, onClose, shiftType]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={shiftType ? 'Edit Shift Type' : 'Add New Shift Type'}>
      <form action={formAction} className="space-y-4 p-4">
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
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Saving...' : shiftType ? 'Save Changes' : 'Add Shift Type'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
